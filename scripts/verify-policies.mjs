#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/verify-policies.mjs — 권한 정책(lib/db/auth/policies.ts) **런타임** 검증
 * ============================================================================
 *
 * 무엇을 하는가
 * -------------
 * 정책 코드를 읽고 추론하는 대신, **실제로 돌고 있는 개발 서버에 HTTP 로 때려서**
 * 각 테이블 × 각 행위자(admin / 인사권한자 / 일반직원) × 각 동작(select/update/
 * insert/delete) 의 결과를 기대치와 비교한다.
 *
 * 정적 분석으로는 못 잡는 것:
 *   - `filterByPolicy` 가 403 대신 빈 배열을 돌려주는 "조용한 deny"
 *   - **403 을 받았는데 sqlite 에는 실제로 변경이 남는 경우**(정책 검사 순서 버그)
 *   - POLICY_REGISTRY 미등록/오등록으로 admin 조차 막히는 회귀
 *
 * 그래서 이 하네스는 매 쓰기 시도마다 HTTP status 뿐 아니라 **로컬 sqlite 를 직접
 * 다시 읽어** 실제 변경 여부까지 확인한다.
 *
 * 전제
 * ----
 *   1. `npm run test:e2e:seed` 로 로컬 D1 이 시드되어 있을 것
 *   2. `npm run dev` 가 127.0.0.1:3000 에 떠 있을 것
 *
 * 사용법
 * ------
 *   node scripts/verify-policies.mjs
 *   node scripts/verify-policies.mjs --tables=todos,staff_licenses
 *   node scripts/verify-policies.mjs --only-fail
 *   node scripts/verify-policies.mjs --help
 *
 * 안전장치 (설계상 로컬 전용)
 * --------------------------
 *   - `--remote` 류 플래그는 즉시 거부. Cloudflare API 토큰을 쓰지 않는다.
 *   - base URL 은 127.0.0.1 / localhost 만 허용.
 *   - 대상 sqlite 는 **추측하지 않는다**. scripts/seed-e2e-d1.mjs 와 동일하게
 *     getPlatformProxy(= dev 서버와 같은 경로)로 마커 토큰을 써 넣고, 그 토큰이
 *     들어 있는 파일 하나만 대상으로 삼는다. 같은 디렉터리의 62MB 실데이터
 *     sqlite 는 readonly 로 토큰 확인만 하고 절대 쓰지 않는다.
 *   - 추가로 실데이터 가드: 대상 DB 의 staff_members 에 시드 외 행이 임계치를
 *     넘으면 중단한다.
 *   - 모든 INSERT/UPDATE/DELETE 는 id 가 `zz-verify-` 로 시작하는 행에만 적용된다.
 *     정리(cleanup)도 `id LIKE 'zz-verify-%'` 로만 지운다. 실패해도 finally 에서 돈다.
 *
 * 종료 코드
 * --------
 *   0 = 전부 기대와 일치, 1 = 불일치 있음 / 사전 조건 미충족
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const D1_STATE_DIR = path.join(ROOT, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const PERSIST_PATH = path.join(ROOT, '.wrangler', 'state', 'v3');

/** 이 스크립트 전용 마커 테이블 — 시드 스크립트의 `_e2e_seed_marker` 를 건드리지 않는다. */
const MARKER_TABLE = '_zz_verify_marker';
/** 모든 픽스처 행의 id 접두사. 정리 조건이자 "이 행만 만진다"는 계약. */
const FIXTURE_PREFIX = 'zz-verify-';
const REAL_DATA_STAFF_THRESHOLD = 20;

// ---------------------------------------------------------------------------
// 0) 인자
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`
사용법: node scripts/verify-policies.mjs [옵션]

  --tables=a,b,c   대상 테이블 한정 (기본: 아래 TARGETS 전체)
  --only-fail      실패한 판정만 출력
  --list           대상 테이블/그룹 목록만 출력하고 종료
  --help           이 도움말

전제: 로컬 D1 시드(npm run test:e2e:seed) + dev 서버(127.0.0.1:3000) 기동.
`);
  process.exit(0);
}

if (argv.some((a) => /^--remote\b/.test(a))) {
  console.error('[verify-policies] --remote 는 지원하지 않습니다. 이 스크립트는 로컬 전용입니다.');
  process.exit(1);
}

const FLAG = {
  onlyFail: argv.includes('--only-fail'),
  list: argv.includes('--list'),
  tables: (() => {
    const hit = argv.find((a) => a.startsWith('--tables='));
    if (!hit) return null;
    return hit
      .slice('--tables='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  })(),
};

const BASE_URL = (process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
{
  const host = new URL(BASE_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    console.error(`[verify-policies] localhost 외 대상은 거부합니다: ${BASE_URL}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1) 시드 계정 — scripts/seed-e2e-d1.mjs 상단 상수와 동일해야 한다
// ---------------------------------------------------------------------------

const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2ePassw0rd!';

const STAFF_HR_ID = '11111111-1111-1111-1111-111111111111';   // E2E-001 manager, permissions.hr=true
const STAFF_ADMIN_ID = '10000000-0000-0000-0000-000000000001'; // E2E-ADMIN  admin+mso
const STAFF_USER_ID = '10000000-0000-0000-0000-000000000002';  // E2E-002    일반 직원
const STAFF_USER2_ID = '10000000-0000-0000-0000-000000000003'; // E2E-003    일반 직원
const SEED_STAFF_IDS = [STAFF_HR_ID, STAFF_ADMIN_ID, STAFF_USER_ID, STAFF_USER2_ID];

const COMPANY_MAIN_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_MAIN_NAME = 'E2E Clinic';
const TEAM_ROOM_ID = '66666666-6666-6666-6666-666666666666';
const DEPARTMENT = '간호부';

/**
 * 행위자 3인. `key` 는 기대치 테이블의 컬럼명이기도 하다.
 * admin 은 회사 관리 권한 + erp_is_admin, hr 은 erp_can_manage_company 만,
 * user 는 둘 다 없음 — buildClaimsFromSession() 기준(lib/d1-api-helpers.ts).
 */
const ACTORS = [
  { key: 'admin', label: 'admin', loginId: 'E2E-ADMIN', staffId: STAFF_ADMIN_ID },
  { key: 'hr', label: 'hr(001)', loginId: 'E2E-001', staffId: STAFF_HR_ID },
  { key: 'user', label: 'user(002)', loginId: 'E2E-002', staffId: STAFF_USER_ID },
];

/** 어떤 행을 "타인 행"으로 쓸지 — 행위자별 상대. */
const OTHER_OF = { admin: 'user', hr: 'user', user: 'hr' };

// ---------------------------------------------------------------------------
// 2) 기대치 — 선언형. 정책 재설계의 **목표 상태**를 여기에 적는다.
//
//    지금의 policies.ts 구현이 아니라 "이래야 한다"를 적는 것이 요점이다.
//    따라서 재설계 도중에는 불일치(FAIL)가 많이 나오는 것이 정상이며,
//    설계가 끝났을 때 0 이 되는 것이 목표다.
// ---------------------------------------------------------------------------

const A = 'allow';
const D = 'deny';

const ACTIONS = ['select_self', 'select_other', 'update_self', 'update_other', 'insert', 'delete_other'];

const ACTION_LABEL = {
  select_self: '본인 select',
  select_other: '타인 select',
  update_self: '본인 update',
  update_other: '타인 update',
  insert: 'insert',
  delete_other: '타인 delete',
};

const all = (v) => Object.fromEntries(ACTIONS.map((a) => [a, v]));

const EXPECT = {
  /**
   * 개인 데이터 — 본인만 전부 가능.
   * 근거: todos/chat_room_prefs/room_notification_settings 는 전적으로 개인 UI 상태다.
   * 타인 것은 "존재조차 보이면 안 되는" 부류라 select 도 deny(=403 또는 빈 배열).
   * 인사 권한(hr)이라고 해서 남의 할 일 목록·알림 설정을 볼 이유가 없다.
   * admin 은 운영/디버깅상 전부 허용(감사로그로 커버되는 영역).
   */
  PERSONAL: {
    admin: all(A),
    hr: { select_self: A, select_other: D, update_self: A, update_other: D, insert: A, delete_other: D },
    user: { select_self: A, select_other: D, update_self: A, update_other: D, insert: A, delete_other: D },
  },

  /**
   * 본인 + 인사(HR) 데이터 — 본인은 읽기만, 쓰기는 인사/관리자.
   * 근거: 면허·건강검진·증명서·교육이수·근태정정·인사발령·문서보관함은 직원 본인이
   * 자기 것을 조회해야 하는(마이페이지) 동시에, 값을 고칠 권한은 인사팀에 있다.
   * 일반직원이 자기 자격증 만료일이나 인사발령 이력을 스스로 고칠 수 있으면
   * 기록으로서 의미가 없다. 타인 조회는 hr/admin 만.
   * (attendance_corrections 의 "본인 신청" 같은 워크플로우는 전용 API 로 분리하는
   *  것을 전제로 한다 — 범용 d1/mutate 경로에서는 막는 것이 맞다.)
   */
  SELF_HR: {
    admin: all(A),
    hr: all(A),
    user: { select_self: A, select_other: D, update_self: D, update_other: D, insert: D, delete_other: D },
  },

  /**
   * 마스터/참조 데이터 — 전원 읽기, 쓰기는 인사/관리자.
   * 근거: 직종·공급사·조직팀·수술템플릿·결재양식은 화면 곳곳에서 드롭다운 소스로
   * 쓰이므로 전 직원이 읽어야 한다. 반면 아무나 고치면 전사 데이터가 오염된다.
   */
  MASTER_REF: {
    admin: all(A),
    hr: all(A),
    user: { select_self: A, select_other: A, update_self: D, update_other: D, insert: D, delete_other: D },
  },

  /**
   * 관리자 전용 — 일반직원·인사 모두 read 조차 불가.
   * 근거: 접근감사로그(access_logs)는 열람 자체가 감시 회피 단서가 되고,
   * 예산·회사비용은 경영 정보, 메시지템플릿·외부연동은 시스템 설정이다.
   * 인사 권한(hr)은 "직원 데이터" 권한이지 "경영/시스템" 권한이 아니다.
   */
  ADMIN_ONLY: {
    admin: all(A),
    hr: all(D),
    user: all(D),
  },

  /**
   * 본인 + 인사 — 단, **본인이 직접 만드는 것**이 실제 제품 흐름인 테이블.
   *
   * SELF_HR 과 같지만 `user.insert = 허용`이다. 아래 화면들이 범용 d1/mutate 로
   * 본인 소유 행을 직접 생성하며, 이걸 막으면 기능이 그대로 죽는다:
   *   - document_repository   : 근로계약 전자서명 선저장 (마이페이지/index.tsx:280,
   *                             모바일/셸/MobileShell.tsx:184) — 실패하면 계약이 영구 '서명대기'
   *   - certificate_issuances : 본인 증명서 발급 (모바일/내정보/cert-issue.ts:158)
   *   - attendance_corrections: 본인 출결정정 신청 (전자결재서브/출결정정양식.tsx:401)
   *   - education_records     : 본인 교육이수 upsert (교육내역/education-utils.ts:192)
   *
   * 보안상 핵심은 "insert 를 허용하되 **타인 소유로는 못 만든다**"이다.
   * 정책이 SELF_OR_SAME_COMPANY / STAFF_IN_SCOPE 라 비관리자는 rowStaff === 본인 일 때만
   * 통과한다(타인 id 로 insert 하면 403). 전용 API 로 분리하면 이 그룹은 SELF_HR 로 되돌릴 것.
   */
  SELF_HR_SELF_INSERT: {
    admin: all(A),
    hr: all(A),
    user: { select_self: A, select_other: D, update_self: D, update_other: D, insert: A, delete_other: D },
  },

  /**
   * 위와 같지만 **본인 행 수정까지** 허용해야 하는 경우(upsert 경로).
   * education_records / education_completions 는 이수 기록을 upsert 로 갱신하므로
   * insert 만 열면 두 번째 호출부터 실패한다.
   */
  SELF_HR_SELF_UPSERT: {
    admin: all(A),
    hr: all(A),
    user: { select_self: A, select_other: D, update_self: A, update_other: D, insert: A, delete_other: D },
  },

  /**
   * 마스터/참조 — 전원 읽기, 쓰기는 **관리자만**(인사도 불가).
   * 근거: 결재 양식 정의·수술/검사 템플릿은 관리자 전용 화면에서만 관리된다
   * (관리자전용서브/전자결재양식관리.tsx, 수술검사템플릿관리.tsx — admin_운영설정 게이트).
   * 전사 문서 양식과 임상 템플릿이라 인사 권한만으로 바꿀 수 있으면 안 된다.
   */
  MASTER_REF_ADMIN_WRITE: {
    admin: all(A),
    hr: { select_self: A, select_other: A, update_self: D, update_other: D, insert: D, delete_other: D },
    user: { select_self: A, select_other: A, update_self: D, update_other: D, insert: D, delete_other: D },
  },

  /**
   * 본인 + 인사 — 단, **삭제는 관리자만**.
   * 발급된 증명서와 인사발령 이력은 감사 대상 기록이라 인사팀이라도 지울 수 없어야 한다.
   */
  SELF_HR_ADMIN_DELETE: {
    admin: all(A),
    hr: { select_self: A, select_other: A, update_self: A, update_other: A, insert: A, delete_other: D },
    user: { select_self: A, select_other: D, update_self: D, update_other: D, insert: D, delete_other: D },
  },

  /** 본인 발급(insert) 은 허용 + 삭제는 관리자만 — 증명서 발급 이력. */
  SELF_HR_SELF_INSERT_ADMIN_DELETE: {
    admin: all(A),
    hr: { select_self: A, select_other: A, update_self: A, update_other: A, insert: A, delete_other: D },
    user: { select_self: A, select_other: D, update_self: D, update_other: D, insert: A, delete_other: D },
  },

  /**
   * 본인 열람 + 인사가 작성 — 수정·삭제는 관리자만 (인사평가).
   * 평가는 평가 대상 본인과 인사·관리자만 봐야 하고, 확정된 평가를 인사팀이라도
   * 임의로 고치거나 지울 수 없어야 감사 기록으로서 의미가 있다.
   * 예전에는 select/insert 가 AUTHENTICATED 라 로그인만 하면 누구나 타인의 평가를
   * 열람하고 임의 staff_id 로 평가를 써 넣을 수 있었다(8차 D03-D09).
   */
  SELF_HR_READ_HR_INSERT_ADMIN_WRITE: {
    admin: all(A),
    hr: { select_self: A, select_other: A, update_self: D, update_other: D, insert: A, delete_other: D },
    user: { select_self: A, select_other: D, update_self: D, update_other: D, insert: D, delete_other: D },
  },

  /**
   * 전 직원 열람·작성, 수정·삭제는 작성자 본인 또는 관리 권한 (게시판).
   * PUBLIC_ALL 이던 시절에는 로그인만 하면 누구나 타인 글과 공지를
   * 수정·삭제할 수 있었다(8차 D07-010).
   * hr 이 update_other/delete_other 에서 허용인 것은 erpCanManageCompany 가
   * admin/mso/hr 을 포함하기 때문이다 — 게시판 운영 권한으로 의도된 것이다.
   */
  BOARD_OWNER_WRITE: {
    admin: all(A),
    hr: { select_self: A, select_other: A, update_self: A, update_other: A, insert: A, delete_other: A },
    user: { select_self: A, select_other: A, update_self: A, update_other: D, insert: A, delete_other: D },
  },
};

/** 검증 대상 테이블 → 기대치 그룹. */
const TARGETS = [
  ['todos', 'PERSONAL'],
  ['chat_room_prefs', 'PERSONAL'],
  ['room_notification_settings', 'PERSONAL'],

  ['staff_licenses', 'SELF_HR'],
  ['health_checkups', 'SELF_HR'],
  ['certificate_issuances', 'SELF_HR_SELF_INSERT_ADMIN_DELETE'],
  ['education_records', 'SELF_HR_SELF_UPSERT'],
  ['attendance_corrections', 'SELF_HR_SELF_INSERT'],
  ['personnel_appointments', 'SELF_HR_ADMIN_DELETE'],
  ['document_repository', 'SELF_HR_SELF_INSERT'],

  ['job_categories', 'MASTER_REF'],
  ['suppliers', 'MASTER_REF'],
  ['org_teams', 'MASTER_REF'],
  ['surgery_templates', 'MASTER_REF_ADMIN_WRITE'],
  ['approval_form_types', 'MASTER_REF_ADMIN_WRITE'],

  // 8차 FB2 에서 정책을 조인 테이블 — 오차단·과다개방 양쪽을 여기서 잡는다.
  //
  // staff_evaluations 는 admin/hr 의 insert·update 가 이 하네스에서 ERR 500 으로 뜬다.
  // 정책 문제가 아니라 픽스처 한계다 — 정책을 예전(AUTHENTICATED)으로 되돌려도
  // 같은 4건이 똑같이 500 이고, 그 상태에서는 'user 타인 select' 가 추가로 실패한다
  // (일반 직원이 남의 인사평가를 실제로 읽는다). 즉 이 표의 관심사인 접근 통제는
  // 정상 판정되며, 500 은 그와 무관한 기존 환경 이슈다.
  ['staff_evaluations', 'SELF_HR_READ_HR_INSERT_ADMIN_WRITE'],
  ['board_posts', 'BOARD_OWNER_WRITE'],

  ['access_logs', 'ADMIN_ONLY'],
  ['budget_settings', 'ADMIN_ONLY'],
  ['message_templates', 'ADMIN_ONLY'],
  ['external_integrations', 'ADMIN_ONLY'],
  ['company_expenses', 'ADMIN_ONLY'],
];

// ---------------------------------------------------------------------------
// 3) 픽스처 생성 규칙
// ---------------------------------------------------------------------------

/** 행 소유자를 나타낼 수 있는 컬럼(존재하는 것만 채운다). */
const OWNER_COLUMNS = [
  'staff_id',
  'user_id',
  'created_by',
  'author_id',
  'target_staff_id',
  'reviewer_id',
  'requested_by',
  'delegator_id',
  'sender_id',
  'issued_by',
  'employee_id',
];

/** 회사/부서 스코프 컬럼 — 시드 회사와 일치시켜 회사 스코프 정책이 유의미하게 평가되도록. */
const SCOPE_VALUES = {
  company_id: COMPANY_MAIN_ID,
  company: COMPANY_MAIN_NAME,
  company_name: COMPANY_MAIN_NAME,
  department: DEPARTMENT,
  dept: DEPARTMENT,
  room_id: TEAM_ROOM_ID,
};

/** 프로브(변경 감지) 컬럼 후보 우선순위 — 의미가 없고 제약도 없는 자유 텍스트 우선. */
const PROBE_PREFERENCE = [
  'memo',
  'notes',
  'note',
  'remark',
  'reason',
  'description',
  'purpose',
  'content',
  'result',
  'item',
  'body_part',
  'user_agent',
  'sub',
  'last_sent_label',
  'last_synced_label',
  'status',
  'updated_at',
];

const PROBE_INIT_TEXT = 'zz-verify-init';

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

const log = (...a) => console.log('[verify-policies]', ...a);
const warn = (...a) => console.warn('[verify-policies]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** CJK 를 2칸으로 세는 표시폭 — 표 정렬용. */
function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch)
      ? 2
      : 1;
  }
  return w;
}
const padEndW = (s, w) => String(s) + ' '.repeat(Math.max(0, w - displayWidth(s)));

// ---------------------------------------------------------------------------
// 4) 바인딩된 로컬 D1 sqlite 탐지 (scripts/seed-e2e-d1.mjs 와 동일한 방식)
//
//    miniflare 의 sqlite 파일명은 Durable Object id(HMAC) 라 계산으로 알 수 없다.
//    "추측" 대신 "표식": dev 서버와 같은 경로(getPlatformProxy)로 랜덤 토큰을 써
//    넣고, 그 토큰이 들어 있는 파일 하나만 대상으로 확정한다.
// ---------------------------------------------------------------------------

async function resolveBoundLocalD1() {
  if (!fs.existsSync(D1_STATE_DIR)) {
    throw new Error(
      `로컬 D1 상태 디렉터리가 없습니다: ${D1_STATE_DIR}\n` +
        `먼저 \`npm run test:e2e:seed\` 로 로컬 D1 을 시드하세요.`,
    );
  }

  const token = `zz-verify-${crypto.randomUUID()}`;

  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy({ persist: { path: PERSIST_PATH } });
  try {
    if (!proxy.env?.DB) throw new Error('wrangler.toml 의 DB 바인딩을 찾을 수 없습니다.');
    await proxy.env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (token TEXT PRIMARY KEY, marked_at TEXT)`,
    ).run();
    await proxy.env.DB.prepare(`INSERT INTO ${MARKER_TABLE} (token, marked_at) VALUES (?, ?)`)
      .bind(token, new Date().toISOString())
      .run();
  } finally {
    await proxy.dispose().catch(() => {});
  }

  const candidates = fs
    .readdirSync(D1_STATE_DIR)
    .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
    .map((f) => path.join(D1_STATE_DIR, f));

  const matched = [];
  for (const file of candidates) {
    let db;
    try {
      // readonly — 실데이터 sqlite 후보는 열어서 토큰만 확인하고 절대 쓰지 않는다.
      db = new Database(file, { readonly: true, fileMustExist: true });
      const row = db.prepare(`SELECT token FROM ${MARKER_TABLE} WHERE token = ?`).get(token);
      if (row) matched.push(file);
    } catch {
      // 마커 테이블이 없는 DB — 대상 아님(과거 database_id 잔재 실데이터 등)
    } finally {
      db?.close();
    }
  }

  if (matched.length !== 1) {
    throw new Error(
      `바인딩된 로컬 D1 파일을 확정하지 못했습니다 (matched=${matched.length}). ` +
        `후보=${candidates.map((f) => path.basename(f)).join(', ') || '없음'}.`,
    );
  }
  return { dbPath: matched[0], token };
}

function assertNotRealData(db, dbPath) {
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_members'").get();
  if (!has) throw new Error('대상 DB 에 staff_members 가 없습니다. 시드가 필요합니다.');
  const placeholders = SEED_STAFF_IDS.map(() => '?').join(',');
  const foreign = db
    .prepare(`SELECT COUNT(*) c FROM staff_members WHERE id NOT IN (${placeholders})`)
    .get(...SEED_STAFF_IDS).c;
  if (foreign > REAL_DATA_STAFF_THRESHOLD) {
    throw new Error(
      `대상 DB(${path.basename(dbPath)}) 의 staff_members 에 시드 외 행이 ${foreign}건 있습니다. ` +
        `실데이터일 가능성이 높아 중단합니다.`,
    );
  }
  const seeded = db.prepare(`SELECT COUNT(*) c FROM staff_members WHERE id IN (${placeholders})`).get(...SEED_STAFF_IDS).c;
  if (seeded < SEED_STAFF_IDS.length) {
    throw new Error(
      `시드 계정이 ${seeded}/${SEED_STAFF_IDS.length} 건만 있습니다. \`npm run test:e2e:seed\` 를 먼저 실행하세요.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5) 테이블 인트로스펙션 → 픽스처 계획
// ---------------------------------------------------------------------------

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

/** UNIQUE 인덱스에 걸린 컬럼들 — 프로브/플레이스홀더 충돌을 피하려고 제외한다. */
function uniqueColumns(db, table) {
  const out = new Set();
  for (const idx of db.prepare(`PRAGMA index_list(${JSON.stringify(table)})`).all()) {
    if (!idx.unique) continue;
    for (const c of db.prepare(`PRAGMA index_info(${JSON.stringify(idx.name)})`).all()) {
      if (c.name) out.add(c.name);
    }
  }
  return out;
}

function isTextType(t) {
  return /char|clob|text/i.test(t || '') || (t || '').trim() === '';
}
function isNumericType(t) {
  return /int|real|floa|doub|num|dec/i.test(t || '');
}

/**
 * 테이블 하나에 대한 픽스처 계획을 세운다.
 *  - id 는 TEXT PK 여야 한다(접두사 기반 정리·식별의 전제). 아니면 skip.
 *  - 소유자 컬럼은 존재하는 것만 채운다.
 *  - NOT NULL & 기본값 없는 컬럼은 자리값으로 채운다(TEXT 는 행 id — 유니크 보장).
 *  - 프로브 컬럼: 쓰기 시도 후 "실제로 바뀌었는가"를 볼 컬럼.
 */
function planTable(db, table) {
  const cols = db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
  if (cols.length === 0) return { skip: '컬럼 정보를 읽을 수 없음' };

  const idCol = cols.find((c) => c.name === 'id');
  if (!idCol) return { skip: 'id 컬럼 없음' };
  if (!isTextType(idCol.type)) return { skip: `id 가 TEXT 가 아님(${idCol.type})` };

  const byName = new Map(cols.map((c) => [c.name, c]));
  const uniques = uniqueColumns(db, table);
  const ownerCols = OWNER_COLUMNS.filter((c) => byName.has(c));

  // ── 프로브 컬럼 선정 ─────────────────────────────────────────────
  const excluded = new Set([
    'id',
    ...ownerCols,
    ...Object.keys(SCOPE_VALUES),
    'created_at',
    ...uniques,
  ]);
  const candidates = cols.filter((c) => !excluded.has(c.name) && !c.pk);

  const pick = (fn) => {
    const pool = candidates.filter(fn);
    for (const pref of PROBE_PREFERENCE) {
      const hit = pool.find((c) => c.name === pref);
      if (hit) return hit;
    }
    return pool[0] ?? null;
  };

  // 자유 텍스트(nullable) → 기본값 있는 텍스트 → 숫자 → NOT NULL 텍스트 순.
  const probeCol =
    pick((c) => isTextType(c.type) && !c.notnull) ||
    pick((c) => isTextType(c.type) && c.dflt_value != null) ||
    pick((c) => isNumericType(c.type)) ||
    pick((c) => isTextType(c.type));

  if (!probeCol) return { skip: '변경 감지에 쓸 컬럼이 없음' };
  const probeKind = isTextType(probeCol.type) ? 'text' : 'num';

  return {
    table,
    cols,
    ownerCols,
    probe: probeCol.name,
    probeKind,
    probeInit: probeKind === 'text' ? PROBE_INIT_TEXT : 0,
  };
}

/** 픽스처 한 행의 값 객체. `rowId` 는 항상 zz-verify- 접두사. */
function buildRow(plan, rowId, ownerId) {
  const row = { id: rowId };

  for (const c of plan.ownerCols) row[c] = ownerId;
  for (const [name, value] of Object.entries(SCOPE_VALUES)) {
    if (plan.cols.some((c) => c.name === name)) row[name] = value;
  }
  row[plan.probe] = plan.probeInit;

  // NOT NULL & 기본값 없는 나머지 컬럼 채우기.
  for (const c of plan.cols) {
    if (c.name in row) continue;
    if (!c.notnull || c.dflt_value != null) continue;
    row[c.name] = isNumericType(c.type) ? 0 : rowId; // TEXT 자리값은 행 id — 유니크 제약 회피
  }
  return row;
}

const rowIdFor = (table, who) => `${FIXTURE_PREFIX}${table}-${who}`;
const insertIdFor = (table, actorKey) => `${FIXTURE_PREFIX}${table}-ins-${actorKey}`;

/** 픽스처 3행(admin/hr/user 소유)을 멱등하게 다시 심는다. */
function reseedFixtures(db, plan) {
  const rows = [
    buildRow(plan, rowIdFor(plan.table, 'admin'), STAFF_ADMIN_ID),
    buildRow(plan, rowIdFor(plan.table, 'hr'), STAFF_HR_ID),
    buildRow(plan, rowIdFor(plan.table, 'user'), STAFF_USER_ID),
  ];
  for (const row of rows) {
    const keys = Object.keys(row);
    db.prepare(
      `INSERT OR REPLACE INTO ${JSON.stringify(plan.table)} (${keys.map((k) => JSON.stringify(k)).join(',')}) ` +
        `VALUES (${keys.map(() => '?').join(',')})`,
    ).run(keys.map((k) => row[k]));
  }
}

function readProbe(db, plan, rowId) {
  const r = db
    .prepare(`SELECT ${JSON.stringify(plan.probe)} AS v FROM ${JSON.stringify(plan.table)} WHERE id = ?`)
    .get(rowId);
  return r ? r.v : undefined; // undefined = 행 없음
}

function rowExists(db, table, rowId) {
  return !!db.prepare(`SELECT 1 FROM ${JSON.stringify(table)} WHERE id = ?`).get(rowId);
}

/** 정리 — 접두사에 걸리는 행만. 다른 행은 절대 건드리지 않는다. */
function cleanupFixtures(db, tables, markerToken) {
  let removed = 0;
  for (const t of tables) {
    try {
      removed += db.prepare(`DELETE FROM ${JSON.stringify(t)} WHERE id LIKE ?`).run(`${FIXTURE_PREFIX}%`).changes;
    } catch (err) {
      warn(`정리 실패(무시) ${t}: ${err.message}`);
    }
  }
  try {
    db.prepare(`DELETE FROM ${MARKER_TABLE} WHERE token = ?`).run(markerToken);
  } catch {
    // 마커 테이블이 없으면 무시
  }
  return removed;
}

// ---------------------------------------------------------------------------
// 6) HTTP — 로그인 / query / mutate
// ---------------------------------------------------------------------------

function setCookiesOf(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

async function assertDevServerUp() {
  try {
    const res = await fetch(`${BASE_URL}/`, { method: 'GET', redirect: 'manual' });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(
      `\n[verify-policies] 개발 서버(${BASE_URL})에 접속할 수 없습니다: ${err.message}\n` +
        `  1) 다른 터미널에서 \`npm run dev\` 를 먼저 띄우세요.\n` +
        `  2) 로컬 D1 이 비어 있다면 \`npm run test:e2e:seed\` 도 먼저 실행하세요.\n`,
    );
    process.exit(1);
  }
}

async function login(actor) {
  const res = await fetch(`${BASE_URL}/api/auth/master-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginId: actor.loginId, password: PASSWORD }),
  });
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    throw new Error(`로그인 실패 (${actor.loginId}): ${json?.error ?? `HTTP ${res.status}`}`);
  }
  const cookie = setCookiesOf(res)
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookie) throw new Error(`로그인 응답에 set-cookie 가 없습니다 (${actor.loginId})`);
  return { ...actor, cookie, user: json.user };
}

/** 429(rate limit) 는 Retry-After 만큼 쉬고 한 번 재시도. */
async function apiPost(pathname, cookie, body) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${BASE_URL}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 2) {
      const wait = Number(res.headers.get('retry-after') || 5);
      warn(`429 rate limit — ${wait}s 대기 후 재시도`);
      await sleep(Math.min(wait, 65) * 1000);
      continue;
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }
  return { status: 429, json: null };
}

// columns 는 '*' 를 받지 못하므로 항상 생략한다(전체 컬럼).
const apiSelect = (cookie, table, id) =>
  apiPost('/api/d1/query', cookie, { table, where: [{ field: 'id', op: 'eq', value: id }], limit: 5 });

const apiUpdate = (cookie, table, id, set) =>
  apiPost('/api/d1/mutate', cookie, { op: 'update', table, set, where: [{ field: 'id', op: 'eq', value: id }] });

const apiInsert = (cookie, table, values) =>
  apiPost('/api/d1/mutate', cookie, { op: 'insert', table, values: [values] });

const apiDelete = (cookie, table, id) =>
  apiPost('/api/d1/mutate', cookie, { op: 'delete', table, where: [{ field: 'id', op: 'eq', value: id }] });

// ---------------------------------------------------------------------------
// 7) 판정
//
//    실제 결과(actual)는 status 와 **sqlite 재조회 결과**를 합쳐 만든다.
//    핵심: 403 을 받았는데 데이터가 바뀌었다면 그것이 바로 찾으려는 "구멍"이다.
// ---------------------------------------------------------------------------

function judgeSelect(expected, status, rowCount) {
  const actual =
    status === 403 ? `403` : status === 200 ? (rowCount > 0 ? `보임(${rowCount})` : '빈배열') : `ERR ${status}`;
  if (status !== 200 && status !== 403) return { actual, pass: false, hole: false };
  if (expected === A) return { actual, pass: status === 200 && rowCount > 0, hole: false };
  return { actual, pass: status === 403 || rowCount === 0, hole: false };
}

function judgeWrite(expected, status, changed) {
  const ok = status >= 200 && status < 300;
  let actual;
  if (ok) actual = changed ? '200 변경됨' : '200 무변화';
  else if (status === 403) actual = changed ? '403 인데 변경됨' : '403';
  else actual = `ERR ${status}${changed ? ' 변경됨' : ''}`;

  // 403(또는 어떤 거부든) 인데 데이터가 실제로 바뀌면 정책 우회 구멍이다.
  const hole = !ok && changed;
  if (hole) return { actual, pass: false, hole: true };

  if (expected === A) return { actual, pass: ok && changed, hole: false };
  // deny 기대: 데이터가 바뀌지 않았으면 통과. 200 무변화는 "조용한 deny" 로 통과시키되 표기가 남는다.
  return { actual, pass: !changed, hole: false };
}

// ---------------------------------------------------------------------------
// 8) 메인
// ---------------------------------------------------------------------------

async function main() {
  // 대상 테이블 확정
  let targets = TARGETS;
  if (FLAG.tables) {
    const known = new Map(TARGETS);
    const unknown = FLAG.tables.filter((t) => !known.has(t));
    if (unknown.length) {
      console.error(`[verify-policies] 기대치가 정의되지 않은 테이블: ${unknown.join(', ')}`);
      console.error(`  가능한 값: ${TARGETS.map(([t]) => t).join(', ')}`);
      process.exit(1);
    }
    targets = FLAG.tables.map((t) => [t, known.get(t)]);
  }

  if (FLAG.list) {
    for (const [t, g] of targets) console.log(`${padEndW(t, 30)} ${g}`);
    return 0;
  }

  await assertDevServerUp();

  const { dbPath, token } = await resolveBoundLocalD1();
  log(`대상 로컬 D1: ${path.basename(dbPath)} (${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(2)} MB)`);

  const db = new Database(dbPath);
  db.pragma('busy_timeout = 8000');
  db.pragma('foreign_keys = OFF');

  const touchedTables = [];
  const results = [];
  let sessions = [];

  try {
    assertNotRealData(db, dbPath);

    // ── 픽스처 준비 ────────────────────────────────────────────────
    const plans = [];
    for (const [table, group] of targets) {
      if (!tableExists(db, table)) {
        results.push({ table, group, actor: '-', action: '-', expected: '-', actual: '테이블 없음', pass: false, hole: false });
        continue;
      }
      const plan = planTable(db, table);
      if (plan.skip) {
        results.push({ table, group, actor: '-', action: '-', expected: '-', actual: `skip: ${plan.skip}`, pass: false, hole: false });
        continue;
      }
      plan.group = group;
      plans.push(plan);
      touchedTables.push(table);
      reseedFixtures(db, plan);
    }
    log(`픽스처 준비: ${plans.length}개 테이블 × 3행 (${FIXTURE_PREFIX}*)`);

    // ── 로그인 ────────────────────────────────────────────────────
    sessions = [];
    for (const actor of ACTORS) sessions.push(await login(actor));
    log(`로그인: ${sessions.map((s) => `${s.label}=${s.user?.name ?? '?'}`).join(', ')}`);

    // ── 매트릭스 ──────────────────────────────────────────────────
    for (const plan of plans) {
      const expectGroup = EXPECT[plan.group];
      for (const session of sessions) {
        const exp = expectGroup[session.key];
        const selfId = rowIdFor(plan.table, session.key);
        const otherId = rowIdFor(plan.table, OTHER_OF[session.key]);

        const record = (action, expected, judged) =>
          results.push({
            table: plan.table,
            group: plan.group,
            actor: session.label,
            action,
            expected,
            actual: judged.actual,
            pass: judged.pass,
            hole: judged.hole,
          });

        reseedFixtures(db, plan);

        // 1) select
        for (const [action, targetId] of [['select_self', selfId], ['select_other', otherId]]) {
          const res = await apiSelect(session.cookie, plan.table, targetId);
          const rows = Array.isArray(res.json?.data) ? res.json.data.length : 0;
          record(action, exp[action], judgeSelect(exp[action], res.status, rows));
        }

        // 2) update — 프로브 컬럼을 바꿔 보고 sqlite 로 실제 변경을 확인
        for (const [action, targetId] of [['update_self', selfId], ['update_other', otherId]]) {
          const newValue =
            plan.probeKind === 'text' ? `${FIXTURE_PREFIX}upd-${session.key}-${Date.now()}` : 1;
          const res = await apiUpdate(session.cookie, plan.table, targetId, { [plan.probe]: newValue });
          const after = readProbe(db, plan, targetId);
          const changed = after !== undefined && String(after) !== String(plan.probeInit);
          record(action, exp[action], judgeWrite(exp[action], res.status, changed));
          reseedFixtures(db, plan);
        }

        // 3) insert — 본인 소유 새 행
        {
          const newId = insertIdFor(plan.table, session.key);
          try {
            db.prepare(`DELETE FROM ${JSON.stringify(plan.table)} WHERE id = ?`).run(newId);
          } catch {
            /* 무시 */
          }
          const values = buildRow(plan, newId, session.staffId);
          const res = await apiInsert(session.cookie, plan.table, values);
          const created = rowExists(db, plan.table, newId);
          record('insert', exp.insert, judgeWrite(exp.insert, res.status, created));
          try {
            db.prepare(`DELETE FROM ${JSON.stringify(plan.table)} WHERE id = ?`).run(newId);
          } catch {
            /* 무시 */
          }
        }

        // 4) delete — 타인 행
        {
          const res = await apiDelete(session.cookie, plan.table, otherId);
          const gone = !rowExists(db, plan.table, otherId);
          record('delete_other', exp.delete_other, judgeWrite(exp.delete_other, res.status, gone));
          reseedFixtures(db, plan);
        }
      }
    }
  } finally {
    // 실패해도 반드시 정리
    const removed = cleanupFixtures(db, [...new Set([...touchedTables, ...targets.map(([t]) => t)])], token);
    log(`정리 완료: ${FIXTURE_PREFIX}* 행 ${removed}건 삭제`);
    db.close();
  }

  return report(results);
}

// ---------------------------------------------------------------------------
// 9) 출력
// ---------------------------------------------------------------------------

function report(results) {
  const shown = FLAG.onlyFail ? results.filter((r) => !r.pass) : results;

  const header = ['테이블', '행위자', '동작', '기대', '실제', '판정'];
  const rows = shown.map((r) => [
    r.table,
    r.actor,
    ACTION_LABEL[r.action] ?? r.action,
    r.expected === A ? '허용' : r.expected === D ? '거부' : r.expected,
    r.actual,
    r.hole ? 'FAIL ⚠구멍' : r.pass ? 'PASS' : 'FAIL',
  ]);

  const widths = header.map((h, i) =>
    Math.max(displayWidth(h), ...rows.map((row) => displayWidth(row[i])), 0),
  );

  console.log('');
  console.log(header.map((h, i) => padEndW(h, widths[i])).join(' | '));
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
  for (const row of rows) {
    console.log(row.map((c, i) => padEndW(c, widths[i])).join(' | '));
  }
  if (rows.length === 0) console.log('(출력할 행 없음)');

  const total = results.length;
  const failed = results.filter((r) => !r.pass);
  const holes = results.filter((r) => r.hole);

  console.log('');
  console.log('='.repeat(72));
  console.log(`총 ${total}건 · 통과 ${total - failed.length}건 · 실패 ${failed.length}건`);

  if (holes.length) {
    console.log('');
    console.log(`⚠ 정책 우회 의심(거부 응답인데 실제 데이터가 변경됨) ${holes.length}건:`);
    for (const h of holes) {
      console.log(`   - ${h.table} / ${h.actor} / ${ACTION_LABEL[h.action] ?? h.action} → ${h.actual}`);
    }
  }

  if (failed.length) {
    // 테이블별 실패 요약 — 재설계 중 어디부터 손댈지 보기 위함
    const byTable = new Map();
    for (const f of failed) byTable.set(f.table, (byTable.get(f.table) ?? 0) + 1);
    console.log('');
    console.log('테이블별 실패 수:');
    for (const [t, n] of [...byTable.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${padEndW(t, 30)} ${n}`);
    }
  }
  console.log('='.repeat(72));

  return failed.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[verify-policies] 실패:', err?.stack || err?.message || err);
    process.exit(1);
  });

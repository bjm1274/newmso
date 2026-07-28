#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/seed-e2e-d1.mjs — Playwright E2E 용 **로컬 전용** Cloudflare D1 시드
 * ============================================================================
 *
 * ⚠️  이 스크립트는 오직 로컬(miniflare/`--local`) D1 만 다룹니다.
 *     - 원격(프로덕션) D1 에 절대 접근하지 않습니다. wrangler `--remote` 를
 *       쓰지 않으며, Cloudflare API 토큰도 사용하지 않습니다.
 *     - 대상 파일은 `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`
 *       중 **현재 wrangler.toml 의 DB 바인딩이 실제로 가리키는 파일 하나**뿐입니다.
 *
 * 왜 필요한가
 * -----------
 * `npm run test:e2e` 는 `next dev` 를 띄우고, dev 서버는
 * `initOpenNextCloudflareForDev()` → miniflare 를 통해 로컬 D1 에 붙습니다.
 * 그런데 로컬 D1 은 비어 있었기 때문에(`lib/db/migrations/0000_lovely_alice.sql`
 * 이 통째로 블록 주석으로 감싸인 introspect 덤프라 `wrangler d1 migrations
 * apply --local` 이 테이블을 하나도 만들지 못함) 개발 서버 로그에
 * `no such table: staff_members / approvals / notifications /
 * rate_limit_attempts` 가 수천 번 찍히고, 로그인조차 되지 않았습니다.
 *
 * 이 스크립트는
 *   1) 바인딩이 실제로 가리키는 로컬 sqlite 파일을 **탐지**하고(추측 금지),
 *   2) 0000 의 주석을 벗겨 스키마를 만들고 0001~ 마이그레이션을 적용한 뒤,
 *   3) E2E 가 기대하는 최소 데이터를 **멱등하게** 넣습니다.
 *
 * 시드 데이터는 `tests/e2e/helpers.ts` 의 `fakeUser` / `buildFixtures()` 와
 * 동일한 ID 체계를 씁니다. 따라서 mock 을 쓰는 스펙과 실제 D1 을 때리는
 * 라우트가 같은 세계관을 보게 됩니다.
 *
 * 사용법
 * ------
 *   node scripts/seed-e2e-d1.mjs             # 스키마 + 시드 (멱등)
 *   node scripts/seed-e2e-d1.mjs --if-local  # CI 에서는 조용히 skip
 *   node scripts/seed-e2e-d1.mjs --verify    # 쓰지 않고 현황만 출력
 *   node scripts/seed-e2e-d1.mjs --cleanup   # 시드 행만 삭제
 *   node scripts/seed-e2e-d1.mjs --force     # 실데이터 안전장치 무시(비권장)
 *
 * 안전장치
 * --------
 *   - 바인딩 탐지: 랜덤 토큰을 `_e2e_seed_marker` 테이블에 wrangler
 *     getPlatformProxy(=dev 서버와 동일 경로)로 써 넣고, 그 토큰이 들어 있는
 *     sqlite 파일만 대상으로 삼습니다. 정확히 1개가 아니면 중단합니다.
 *     (같은 디렉터리에 과거 database_id 잔재인 대용량 실데이터 sqlite 가 있어도
 *      토큰 확인은 `readonly` 커넥션으로만 하고, 쓰기는 절대 하지 않습니다.)
 *   - 실데이터 가드: 대상 DB 의 staff_members 에 시드 ID 가 아닌 행이
 *     REAL_DATA_STAFF_THRESHOLD 개를 넘으면 `--force` 없이는 중단합니다.
 *   - 모든 DELETE 는 아래 상수에 하드코딩된 시드 ID 집합으로만 한정됩니다.
 *     (예외: rate_limit_attempts 는 인프라/휘발성 테이블이라 전체 비웁니다 —
 *      로그인 실패 카운터가 남아 429 로 막히는 것을 방지)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'lib', 'db', 'migrations');
const D1_STATE_DIR = path.join(ROOT, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const PERSIST_PATH = path.join(ROOT, '.wrangler', 'state', 'v3');

const MARKER_TABLE = '_e2e_seed_marker';
const REAL_DATA_STAFF_THRESHOLD = 20;

const argv = process.argv.slice(2);
const FLAG = {
  ifLocal: argv.includes('--if-local'),
  verifyOnly: argv.includes('--verify') || argv.includes('--verify-only'),
  cleanup: argv.includes('--cleanup'),
  force: argv.includes('--force'),
};

if (argv.some((a) => a === '--remote')) {
  console.error('[seed-e2e-d1] --remote 는 지원하지 않습니다. 이 스크립트는 로컬 전용입니다.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 시드 상수 — tests/e2e/helpers.ts 의 fakeUser / buildFixtures 와 동일 ID
// ---------------------------------------------------------------------------

const COMPANY_MAIN_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_MAIN_NAME = 'E2E Clinic';
const COMPANY_SECOND_ID = '88888888-8888-8888-8888-888888888888';
const COMPANY_SECOND_NAME = 'E2E Second Clinic';

const STAFF_TESTER_ID = '11111111-1111-1111-1111-111111111111'; // = fakeUser.id
const STAFF_ADMIN_ID = '10000000-0000-0000-0000-000000000001';
const STAFF_B_ID = '10000000-0000-0000-0000-000000000002';
const STAFF_C_ID = '10000000-0000-0000-0000-000000000003';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000'; // helpers.ts noticeRoomId
const TEAM_ROOM_ID = '66666666-6666-6666-6666-666666666666';
const APPROVAL_ID = '33333333-3333-3333-3333-333333333333';
const PAYROLL_ID = '44444444-4444-4444-4444-444444444444';

const TESTER_PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2ePassw0rd!';
const TESTER_LOGIN_ID = process.env.E2E_TEST_USER_ID || 'E2E-001';

const COMPANY_IDS = [COMPANY_MAIN_ID, COMPANY_SECOND_ID];
const STAFF_IDS = [STAFF_TESTER_ID, STAFF_ADMIN_ID, STAFF_B_ID, STAFF_C_ID];
const ROOM_IDS = [NOTICE_ROOM_ID, TEAM_ROOM_ID];
const MESSAGE_IDS = ['e2e-msg-0001', 'e2e-msg-0002', 'e2e-msg-0003'];
const BOARD_POST_IDS = ['e2e-post-notice-1', 'e2e-post-free-1', 'e2e-post-guide-1'];
const NOTIFICATION_IDS = ['e2e-notif-0001', 'e2e-notif-0002'];
const INVENTORY_IDS = ['e2e-inv-0001', 'e2e-inv-0002'];
const SUPPLIER_IDS = ['e2e-supplier-0001'];
const CATEGORY_IDS = ['e2e-invcat-0001'];
const WORK_SHIFT_IDS = ['e2e-shift-day', 'e2e-shift-night'];
const FORM_TYPE_IDS = ['e2e-formtype-general', 'e2e-formtype-leave'];
const TAX_RATE_IDS = ['e2e-tax-rate-company', 'e2e-tax-rate-all'];
const TODO_IDS = ['e2e-todo-0001'];
const ORG_TEAM_IDS = ['e2e-team-0001', 'e2e-team-0002'];

const PERMISSIONS_MANAGER = {
  hr: true,
  inventory: true,
  approval: true,
  admin: false,
  mso: false,
  menu_추가기능: true,
  menu_게시판: true,
  menu_전자결재: true,
  menu_인사관리: true,
  menu_재고관리: true,
  board_공지사항_read: true,
  board_공지사항_write: true,
  board_자유게시판_read: true,
  board_자유게시판_write: true,
  board_경조사_read: true,
  board_경조사_write: true,
  board_MRI일정_read: true,
  board_MRI일정_write: true,
  board_수술일정_read: true,
  board_수술일정_write: true,
  board_업무가이드_read: true,
  board_업무가이드_write: true,
  approval_기안함: true,
  approval_결재함: true,
  approval_참조문서함: true,
  approval_작성하기: true,
  hr_직원등록: true,
  hr_구성원: true,
  hr_근태: true,
  hr_연차휴가: true,
  hr_급여: true,
  hr_계약: true,
  hr_문서보관함: true,
  hr_증명서: true,
  inventory_현황: true,
  inventory_이력: true,
  inventory_등록: true,
  inventory_발주: true,
  inventory_재고실사: true,
  inventory_이관: true,
};

const PERMISSIONS_ADMIN = {
  ...PERMISSIONS_MANAGER,
  admin: true,
  mso: true,
  hr_교대근무: true,
};

const PERMISSIONS_BASIC = {
  hr: false,
  inventory: true,
  approval: true,
  admin: false,
  mso: false,
  menu_게시판: true,
  menu_전자결재: true,
  menu_재고관리: true,
  board_공지사항_read: true,
  board_자유게시판_read: true,
  board_자유게시판_write: true,
  approval_기안함: true,
  approval_작성하기: true,
  inventory_현황: true,
};

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

const log = (...args) => console.log('[seed-e2e-d1]', ...args);
const warn = (...args) => console.warn('[seed-e2e-d1]', ...args);

function nowIso() {
  return new Date().toISOString();
}

function ymd(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function currentYearMonth() {
  return new Date().toISOString().slice(0, 7);
}

function inList(ids) {
  return ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
}

/** 테이블 존재 여부 */
function hasTable(db, name) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
}

/** 테이블의 실제 컬럼 집합 (스키마 드리프트에 강한 INSERT 를 위해) */
function columnsOf(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

/**
 * 존재하는 컬럼만 골라 INSERT OR REPLACE.
 * 테이블/컬럼이 없으면 조용히 건너뛴다 (스키마가 계속 진화 중인 프로젝트라 방어적).
 */
function upsertRows(db, table, rows) {
  if (!rows.length) return 0;
  if (!hasTable(db, table)) {
    warn(`skip ${table} — 테이블 없음`);
    return 0;
  }
  const cols = columnsOf(db, table);
  let count = 0;
  for (const row of rows) {
    const keys = Object.keys(row).filter((k) => cols.has(k));
    if (!keys.length) continue;
    const sql =
      `INSERT OR REPLACE INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}) ` +
      `VALUES (${keys.map(() => '?').join(',')})`;
    db.prepare(sql).run(keys.map((k) => row[k]));
    count += 1;
  }
  return count;
}

function deleteWhere(db, table, where, params = []) {
  if (!hasTable(db, table)) return 0;
  try {
    return db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...params).changes;
  } catch (err) {
    warn(`delete ${table} 실패(무시): ${err.message}`);
    return 0;
  }
}

function countOf(db, table, where = '') {
  if (!hasTable(db, table)) return -1;
  try {
    return db.prepare(`SELECT COUNT(*) c FROM ${table}${where ? ' WHERE ' + where : ''}`).get().c;
  } catch {
    return -1;
  }
}

// ---------------------------------------------------------------------------
// 1) 바인딩이 실제로 가리키는 로컬 sqlite 파일 탐지
// ---------------------------------------------------------------------------

/**
 * dev 서버(`initOpenNextCloudflareForDev` → getPlatformProxy)와 **동일한 경로**로
 * 로컬 D1 에 붙어 랜덤 토큰을 남기고, 그 토큰이 들어 있는 sqlite 파일을 찾는다.
 *
 * miniflare 의 sqlite 파일명은 Durable Object id(HMAC 기반)라 계산으로 알아낼 수
 * 없다. 따라서 "추측" 대신 "표식"으로 확정한다.
 */
async function resolveBoundLocalD1() {
  if (!fs.existsSync(D1_STATE_DIR)) {
    fs.mkdirSync(D1_STATE_DIR, { recursive: true });
  }

  const token = `e2e-seed-${crypto.randomUUID()}`;

  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy({ persist: { path: PERSIST_PATH } });
  try {
    if (!proxy.env?.DB) {
      throw new Error('wrangler.toml 의 DB 바인딩을 찾을 수 없습니다.');
    }
    await proxy.env.DB.prepare(`DROP TABLE IF EXISTS ${MARKER_TABLE}`).run();
    await proxy.env.DB.prepare(
      `CREATE TABLE ${MARKER_TABLE} (token TEXT PRIMARY KEY, seeded_at TEXT)`
    ).run();
    await proxy.env.DB.prepare(
      `INSERT INTO ${MARKER_TABLE} (token, seeded_at) VALUES (?, ?)`
    )
      .bind(token, nowIso())
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
      db = new Database(file, { readonly: true, fileMustExist: true });
      const row = db.prepare(`SELECT token FROM ${MARKER_TABLE} WHERE token = ?`).get(token);
      if (row) matched.push(file);
    } catch {
      // 마커 테이블이 없는 DB — 대상 아님 (예: 과거 database_id 잔재 실데이터)
    } finally {
      db?.close();
    }
  }

  if (matched.length !== 1) {
    throw new Error(
      `바인딩된 로컬 D1 파일을 확정하지 못했습니다 (matched=${matched.length}). ` +
        `후보=${candidates.map((f) => path.basename(f)).join(', ') || '없음'}. ` +
        `dev 서버를 끄고 다시 실행해 보세요.`
    );
  }

  return matched[0];
}

// ---------------------------------------------------------------------------
// 2) 스키마/마이그레이션
// ---------------------------------------------------------------------------

/**
 * 0000_lovely_alice.sql 은 drizzle introspect 덤프가 통째로 블록 주석 처리되어
 * 있다(= wrangler 가 적용해도 아무 테이블도 안 생김). 로컬 E2E 용으로는 그
 * 주석을 벗겨 스키마를 세운다. 프로덕션 D1 은 이미 이 스키마로 만들어져 있고,
 * 이 스크립트는 로컬 파일에만 쓰므로 영향이 없다.
 */
function readBaseSchemaStatements() {
  const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, '0000_lovely_alice.sql'), 'utf8');
  const start = raw.indexOf('/*');
  const end = raw.lastIndexOf('*/');
  const body = start >= 0 && end > start ? raw.slice(start + 2, end) : raw;

  return body
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
    // drizzle introspect 가 표현식 인덱스를 `(``)` 로 잘못 덤프한 5건 — 스킵
    .filter((s) => !/\(``\)/.test(s))
    .map((s) =>
      s
        .replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ')
        .replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        .replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS ')
        .replace(/^CREATE VIEW /i, 'CREATE VIEW IF NOT EXISTS ')
    );
}

const TOLERABLE_MIGRATION_ERROR =
  /duplicate column name|already exists|table .* already exists|index .* already exists/i;

function applySchema(db) {
  // --- base schema (0000) ---
  let created = 0;
  for (const stmt of readBaseSchemaStatements()) {
    try {
      db.exec(stmt);
      created += 1;
    } catch (err) {
      if (!TOLERABLE_MIGRATION_ERROR.test(err.message)) {
        warn(`base schema 문장 실패(계속): ${err.message}`);
      }
    }
  }

  // --- d1_migrations 원장 (wrangler `d1 migrations list --local` 과 호환) ---
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);

  const applied = new Set(db.prepare('SELECT name FROM d1_migrations').all().map((r) => r.name));
  const record = db.prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)');

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (file.startsWith('0000_')) {
      record.run(file);
      continue;
    }
    if (applied.has(file)) continue;

    const statements = fs
      .readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (err) {
        if (!TOLERABLE_MIGRATION_ERROR.test(err.message)) {
          warn(`${file} 문장 실패(계속): ${err.message}`);
        }
      }
    }
    record.run(file);
    appliedCount += 1;
  }

  return { baseStatements: created, migrationsApplied: appliedCount };
}

// ---------------------------------------------------------------------------
// 3) 실데이터 가드
// ---------------------------------------------------------------------------

function assertNotRealData(db, dbPath) {
  if (!hasTable(db, 'staff_members')) return;
  const foreign = db
    .prepare(`SELECT COUNT(*) c FROM staff_members WHERE id NOT IN (${inList(STAFF_IDS)})`)
    .get().c;
  if (foreign > REAL_DATA_STAFF_THRESHOLD && !FLAG.force) {
    throw new Error(
      `대상 DB(${path.basename(dbPath)}) 의 staff_members 에 시드 외 행이 ${foreign}건 있습니다. ` +
        `실데이터일 가능성이 높아 중단합니다. 의도한 것이라면 --force 를 주세요.`
    );
  }
  if (foreign > 0) {
    warn(`대상 DB 에 시드 외 staff_members 행 ${foreign}건이 있습니다(유지됨).`);
  }
}

// ---------------------------------------------------------------------------
// 4) 시드 데이터
// ---------------------------------------------------------------------------

function cleanupSeedRows(db) {
  const stats = {};
  const del = (table, where, params) => {
    stats[table] = (stats[table] || 0) + deleteWhere(db, table, where, params);
  };

  // 자식 → 부모 순
  del('message_reads', `message_id IN (${inList(MESSAGE_IDS)})`);
  del('message_reactions', `message_id IN (${inList(MESSAGE_IDS)})`);
  del('pinned_messages', `message_id IN (${inList(MESSAGE_IDS)})`);
  del('messages', `id IN (${inList(MESSAGE_IDS)}) OR room_id IN (${inList(ROOM_IDS)})`);
  del('chat_messages', `id IN (${inList(MESSAGE_IDS)}) OR room_id IN (${inList(ROOM_IDS)})`);
  del('room_read_cursors', `room_id IN (${inList(ROOM_IDS)})`);
  del('chat_room_prefs', `room_id IN (${inList(ROOM_IDS)})`);
  del('chat_rooms', `id IN (${inList(ROOM_IDS)})`);

  del('board_post_comments', `post_id IN (${inList(BOARD_POST_IDS)})`);
  del('board_post_reads', `post_id IN (${inList(BOARD_POST_IDS)})`);
  del('board_post_likes', `post_id IN (${inList(BOARD_POST_IDS)})`);
  del('board_posts', `id IN (${inList(BOARD_POST_IDS)})`);
  del('posts', `id IN (${inList(BOARD_POST_IDS)})`);

  del('approval_history', `approval_id = ?`, [APPROVAL_ID]);
  del('approvals', `id = ?`, [APPROVAL_ID]);
  del('approval_form_types', `id IN (${inList(FORM_TYPE_IDS)})`);

  del('payroll_records', `id = ? OR staff_id IN (${inList(STAFF_IDS)})`, [PAYROLL_ID]);
  del('attendances', `staff_id IN (${inList(STAFF_IDS)})`);
  del('attendance', `staff_id IN (${inList(STAFF_IDS)})`);
  del('leave_balances', `staff_id IN (${inList(STAFF_IDS)})`);
  del('leave_requests', `staff_id IN (${inList(STAFF_IDS)})`);
  del('notifications', `id IN (${inList(NOTIFICATION_IDS)}) OR user_id IN (${inList(STAFF_IDS)})`);
  del('todos', `id IN (${inList(TODO_IDS)}) OR user_id IN (${inList(STAFF_IDS)})`);

  del('inventory', `id IN (${inList(INVENTORY_IDS)})`);
  del('inventory_categories', `id IN (${inList(CATEGORY_IDS)})`);
  del('suppliers', `id IN (${inList(SUPPLIER_IDS)})`);
  del('work_shifts', `id IN (${inList(WORK_SHIFT_IDS)})`);
  del('org_teams', `id IN (${inList(ORG_TEAM_IDS)})`);
  del('tax_insurance_rates', `id IN (${inList(TAX_RATE_IDS)})`);

  del('staff_members', `id IN (${inList(STAFF_IDS)})`);
  del('companies', `id IN (${inList(COMPANY_IDS)})`);
  del('system_settings', `key = 'e2e_seeded_at'`);

  // 인프라/휘발성 — 로그인 실패 카운터가 남아 429 로 막히는 것 방지
  del('rate_limit_attempts', '1=1');

  return stats;
}

function seedRows(db) {
  const now = nowIso();
  const ym = currentYearMonth();
  const year = Number(ym.slice(0, 4));
  const hash = (plain) => bcrypt.hashSync(plain, 10);

  const stats = {};
  const put = (table, rows) => {
    stats[table] = upsertRows(db, table, rows);
  };

  put('companies', [
    {
      id: COMPANY_MAIN_ID,
      name: COMPANY_MAIN_NAME,
      type: 'hospital',
      is_active: 1,
      ceo_name: 'E2E 대표',
      business_no: '000-00-00000',
      business_number: '000-00-00000',
      address: '서울시 테스트구 테스트로 1',
      phone: '02-0000-0000',
      payment_day: 10,
      leave_policy: '입사일',
      unused_leave_compensation: 0,
      fiscal_year_start_month: 1,
      created_at: now,
    },
    {
      id: COMPANY_SECOND_ID,
      name: COMPANY_SECOND_NAME,
      type: 'clinic',
      is_active: 1,
      ceo_name: 'E2E 대표2',
      payment_day: 25,
      leave_policy: '회계연도',
      fiscal_year_start_month: 1,
      created_at: now,
    },
  ]);

  const staffBase = {
    company: COMPANY_MAIN_NAME,
    company_id: COMPANY_MAIN_ID,
    status: '재직',
    join_date: '2024-01-02',
    joined_at: '2024-01-02',
    hire_date: '2024-01-02',
    annual_leave_total: 15,
    annual_leave_used: 0,
    working_hours_per_week: 40,
    working_days_per_week: 5,
    password_reset_required: 0,
    is_system_master: 0,
    presence_status: 'away',
    employment_type: '정규직',
    created_at: now,
    updated_at: now,
  };

  put('staff_members', [
    {
      ...staffBase,
      id: STAFF_TESTER_ID,
      employee_no: TESTER_LOGIN_ID,
      name: 'E2E Tester',
      department: '간호부',
      position: '부서장',
      role: 'manager',
      email: 'e2e.tester@example.test',
      phone: '010-0000-0001',
      permissions: JSON.stringify(PERMISSIONS_MANAGER),
      password: hash(TESTER_PASSWORD),
      base_salary: 3_000_000,
      meal_allowance: 200_000,
      vehicle_allowance: 200_000,
      position_allowance: 100_000,
    },
    {
      ...staffBase,
      id: STAFF_ADMIN_ID,
      employee_no: 'E2E-ADMIN',
      name: 'E2E 관리자',
      department: '경영지원팀',
      position: '원장',
      role: 'admin',
      email: 'e2e.admin@example.test',
      phone: '010-0000-0002',
      permissions: JSON.stringify(PERMISSIONS_ADMIN),
      password: hash(TESTER_PASSWORD),
      base_salary: 5_000_000,
    },
    {
      ...staffBase,
      id: STAFF_B_ID,
      employee_no: 'E2E-002',
      name: 'E2E 직원B',
      department: '간호부',
      position: '간호사',
      role: 'user',
      email: 'e2e.b@example.test',
      phone: '010-0000-0003',
      permissions: JSON.stringify(PERMISSIONS_BASIC),
      password: hash(TESTER_PASSWORD),
      base_salary: 2_500_000,
      meal_allowance: 200_000,
    },
    {
      ...staffBase,
      id: STAFF_C_ID,
      employee_no: 'E2E-003',
      name: 'E2E 직원C',
      department: '원무과',
      position: '주임',
      role: 'user',
      email: 'e2e.c@example.test',
      phone: '010-0000-0004',
      permissions: JSON.stringify(PERMISSIONS_BASIC),
      password: hash(TESTER_PASSWORD),
      base_salary: 2_300_000,
    },
  ]);

  put('org_teams', [
    { id: ORG_TEAM_IDS[0], company_name: COMPANY_MAIN_NAME, division: '진료부', team_name: '간호부', sort_order: 1, created_at: now },
    { id: ORG_TEAM_IDS[1], company_name: COMPANY_MAIN_NAME, division: '경영지원', team_name: '원무과', sort_order: 2, created_at: now },
  ]);

  // --- 게시판 ---
  const boardRows = [
    {
      id: BOARD_POST_IDS[0],
      company_id: COMPANY_MAIN_ID,
      company: COMPANY_MAIN_NAME,
      board_type: '공지사항',
      title: 'E2E 공지사항',
      content: 'E2E 시드가 만든 공지사항 본문입니다.',
      author_id: STAFF_ADMIN_ID,
      author_name: 'E2E 관리자',
      views: 3,
      is_pinned: 1,
      status: 'published',
      created_at: now,
      updated_at: now,
    },
    {
      id: BOARD_POST_IDS[1],
      company_id: COMPANY_MAIN_ID,
      company: COMPANY_MAIN_NAME,
      board_type: '자유게시판',
      title: 'E2E 자유게시판 글',
      content: 'E2E 시드가 만든 자유게시판 본문입니다.',
      author_id: STAFF_TESTER_ID,
      author_name: 'E2E Tester',
      views: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: BOARD_POST_IDS[2],
      company_id: COMPANY_MAIN_ID,
      company: COMPANY_MAIN_NAME,
      board_type: '업무가이드',
      title: 'E2E 업무가이드',
      content: 'E2E 시드가 만든 업무가이드 본문입니다.',
      author_id: STAFF_ADMIN_ID,
      author_name: 'E2E 관리자',
      created_at: now,
      updated_at: now,
    },
  ];
  put('board_posts', boardRows);
  put('posts', boardRows.map((r) => ({
    id: r.id,
    board_type: r.board_type,
    title: r.title,
    content: r.content,
    author_id: r.author_id,
    author_name: r.author_name,
    company: r.company,
    company_id: r.company_id,
    views: r.views ?? 0,
    created_at: r.created_at,
  })));
  put('board_post_comments', [
    {
      id: 'e2e-comment-0001',
      post_id: BOARD_POST_IDS[1],
      author_id: STAFF_B_ID,
      author_name: 'E2E 직원B',
      content: 'E2E 시드 댓글',
      created_at: now,
    },
  ]);

  // --- 전자결재 ---
  put('approval_form_types', [
    { id: FORM_TYPE_IDS[0], name: '일반기안', slug: 'general', base_slug: 'general', description: 'E2E 기본 양식', sort_order: 1, is_active: 1, company_name: COMPANY_MAIN_NAME, created_at: now, updated_at: now },
    { id: FORM_TYPE_IDS[1], name: '휴가신청서', slug: 'leave', base_slug: 'leave', description: 'E2E 휴가 양식', sort_order: 2, is_active: 1, company_name: COMPANY_MAIN_NAME, created_at: now, updated_at: now },
  ]);
  put('approvals', [
    {
      id: APPROVAL_ID,
      company_id: COMPANY_MAIN_ID,
      sender_id: STAFF_TESTER_ID,
      sender_name: 'E2E Tester',
      sender_company: COMPANY_MAIN_NAME,
      sender_department: '간호부',
      type: '일반기안',
      doc_type: '일반기안',
      title: 'E2E 결재 문서',
      content: '테스트용 결재 문서입니다.',
      status: '대기',
      current_approver_id: STAFF_ADMIN_ID,
      approver_line: JSON.stringify([STAFF_ADMIN_ID]),
      approval_line: JSON.stringify([{ id: STAFF_ADMIN_ID, name: 'E2E 관리자', status: '대기' }]),
      meta_data: JSON.stringify({}),
      doc_number: 'E2E-2026-0001',
      created_at: now,
      updated_at: now,
    },
  ]);

  // --- 채팅 ---
  put('chat_rooms', [
    {
      id: NOTICE_ROOM_ID,
      name: '공지메시지',
      type: 'notice',
      is_announcement: 1,
      members: JSON.stringify(STAFF_IDS),
      member_ids: JSON.stringify(STAFF_IDS),
      created_by: STAFF_ADMIN_ID,
      created_at: now,
      last_message_at: now,
      last_message: 'E2E 공지 메시지',
      last_message_preview: 'E2E 공지 메시지',
    },
    {
      id: TEAM_ROOM_ID,
      name: 'E2E 팀 채팅방',
      type: 'group',
      is_announcement: 0,
      members: JSON.stringify([STAFF_TESTER_ID, STAFF_B_ID, STAFF_C_ID]),
      member_ids: JSON.stringify([STAFF_TESTER_ID, STAFF_B_ID, STAFF_C_ID]),
      created_by: STAFF_TESTER_ID,
      created_at: now,
      last_message_at: now,
      last_message: '안녕하세요 (E2E)',
      last_message_preview: '안녕하세요 (E2E)',
    },
  ]);
  const messageRows = [
    { id: MESSAGE_IDS[0], room_id: NOTICE_ROOM_ID, sender_id: STAFF_ADMIN_ID, sender_name: 'E2E 관리자', content: 'E2E 공지 메시지', message_type: 'text', is_deleted: 0, created_at: now },
    { id: MESSAGE_IDS[1], room_id: TEAM_ROOM_ID, sender_id: STAFF_TESTER_ID, sender_name: 'E2E Tester', content: '안녕하세요 (E2E)', message_type: 'text', is_deleted: 0, created_at: now },
    { id: MESSAGE_IDS[2], room_id: TEAM_ROOM_ID, sender_id: STAFF_B_ID, sender_name: 'E2E 직원B', content: '반갑습니다 (E2E)', message_type: 'text', is_deleted: 0, created_at: now },
  ];
  put('messages', messageRows);
  put('room_read_cursors', [
    { id: 'e2e-cursor-0001', user_id: STAFF_TESTER_ID, room_id: TEAM_ROOM_ID, last_read_at: now },
    { id: 'e2e-cursor-0002', user_id: STAFF_TESTER_ID, room_id: NOTICE_ROOM_ID, last_read_at: now },
  ]);

  // --- 알림 ---
  put('notifications', [
    { id: NOTIFICATION_IDS[0], user_id: STAFF_TESTER_ID, type: 'approval', title: 'E2E 결재 알림', body: '결재 문서가 도착했습니다.', metadata: JSON.stringify({ approval_id: APPROVAL_ID }), read_at: null, created_at: now },
    { id: NOTIFICATION_IDS[1], user_id: STAFF_TESTER_ID, type: 'board', title: 'E2E 게시판 알림', body: '새 공지사항이 등록되었습니다.', metadata: JSON.stringify({ post_id: BOARD_POST_IDS[0] }), read_at: null, created_at: now },
  ]);

  // --- 근태 / 연차 / 급여 ---
  put('attendances', [
    { id: 'e2e-att-0001', staff_id: STAFF_TESTER_ID, company_id: COMPANY_MAIN_ID, company_name: COMPANY_MAIN_NAME, work_date: ymd(-1), check_in_time: `${ymd(-1)}T00:00:00.000Z`, check_out_time: `${ymd(-1)}T09:00:00.000Z`, status: 'present', work_hours_minutes: 480, created_at: now },
    { id: 'e2e-att-0002', staff_id: STAFF_B_ID, company_id: COMPANY_MAIN_ID, company_name: COMPANY_MAIN_NAME, work_date: ymd(-1), check_in_time: `${ymd(-1)}T00:10:00.000Z`, check_out_time: `${ymd(-1)}T09:00:00.000Z`, status: 'present', work_hours_minutes: 470, created_at: now },
  ]);
  put('leave_balances', STAFF_IDS.map((id, i) => ({
    id: `e2e-leave-bal-${i + 1}`,
    staff_id: id,
    year,
    total_days: 15,
    used_days: 1,
    remaining_days: 14,
    created_at: now,
    updated_at: now,
  })));
  put('leave_requests', [
    { id: 'e2e-leave-req-0001', staff_id: STAFF_B_ID, company_id: COMPANY_MAIN_ID, leave_type: '연차', start_date: ymd(7), end_date: ymd(7), days: 1, reason: 'E2E 시드 휴가', status: '대기', created_at: now },
  ]);
  put('payroll_records', [
    { id: PAYROLL_ID, staff_id: STAFF_TESTER_ID, year_month: ym, record_type: 'regular', base_salary: 3_000_000, meal_allowance: 200_000, gross_pay: 3_200_000, net_pay: 2_800_000, total_taxable: 3_000_000, total_taxfree: 200_000, total_deduction: 400_000, status: '확정', created_at: now },
  ]);
  put('tax_insurance_rates', [
    { id: TAX_RATE_IDS[0], effective_year: year, company_name: COMPANY_MAIN_NAME, national_pension_rate: 0.0475, health_insurance_rate: 0.03595, long_term_care_rate: 0.004724, employment_insurance_rate: 0.009, income_tax_bracket: '[]', created_at: now },
    { id: TAX_RATE_IDS[1], effective_year: year, company_name: '전체', national_pension_rate: 0.0475, health_insurance_rate: 0.03595, long_term_care_rate: 0.004724, employment_insurance_rate: 0.009, income_tax_bracket: '[]', created_at: now },
  ]);
  put('work_shifts', [
    { id: WORK_SHIFT_IDS[0], name: 'E2E 주간', start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00', company_name: COMPANY_MAIN_NAME, shift_type: 'day', weekly_work_days: 5, is_active: 1, created_at: now },
    { id: WORK_SHIFT_IDS[1], name: 'E2E 야간', start_time: '22:00', end_time: '07:00', company_name: COMPANY_MAIN_NAME, shift_type: 'night', weekly_work_days: 5, is_shift: 1, is_active: 1, created_at: now },
  ]);

  // --- 재고 ---
  put('inventory_categories', [
    { id: CATEGORY_IDS[0], name: 'E2E 소모품', description: 'E2E 시드 카테고리', created_at: now, updated_at: now },
  ]);
  put('suppliers', [
    { id: SUPPLIER_IDS[0], name: 'E2E 공급사', contact: '담당자', contact_name: '담당자', phone: '02-1111-2222', email: 'supplier@example.test', category: '소모품', created_at: now, updated_at: now, created_by: STAFF_ADMIN_ID },
  ]);
  put('inventory', [
    { id: INVENTORY_IDS[0], company_id: COMPANY_MAIN_ID, company: COMPANY_MAIN_NAME, category: 'E2E 소모품', item_name: 'E2E 거즈', name: 'E2E 거즈', quantity: 50, stock: 50, min_quantity: 10, min_stock: 10, safety_stock: 10, unit_price: 1000, price: 1000, supplier_id: SUPPLIER_IDS[0], supplier_name: 'E2E 공급사', supplier: 'E2E 공급사', department: '간호부', location: 'A-1', last_updated: now },
    { id: INVENTORY_IDS[1], company_id: COMPANY_MAIN_ID, company: COMPANY_MAIN_NAME, category: 'E2E 소모품', item_name: 'E2E 주사기', name: 'E2E 주사기', quantity: 3, stock: 3, min_quantity: 10, min_stock: 10, safety_stock: 10, unit_price: 500, price: 500, supplier_id: SUPPLIER_IDS[0], supplier_name: 'E2E 공급사', supplier: 'E2E 공급사', department: '간호부', location: 'A-2', last_updated: now },
  ]);

  // --- 기타 ---
  put('todos', [
    { id: TODO_IDS[0], user_id: STAFF_TESTER_ID, content: 'E2E 할 일', is_complete: 0, task_date: ymd(0), priority: 'medium', repeat_type: 'none', assignee_kind: 'self', created_at: now },
  ]);
  put('system_configs', [
    { key: 'min_auth_time', value: '1970-01-01T00:00:00.000Z', description: 'E2E seed', updated_at: now },
  ]);
  put('system_settings', [
    { key: 'e2e_seeded_at', value: now, updated_at: now },
  ]);

  return stats;
}

// ---------------------------------------------------------------------------
// 5) 검증 출력
// ---------------------------------------------------------------------------

const VERIFY_TABLES = [
  'companies',
  'staff_members',
  'approvals',
  'notifications',
  'rate_limit_attempts',
  'board_posts',
  'posts',
  'chat_rooms',
  'messages',
  'inventory',
  'attendances',
  'leave_balances',
  'payroll_records',
  'todos',
  'work_shifts',
];

function verify(db, dbPath) {
  const tableCount = db
    .prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table'")
    .get().c;
  log(`대상: ${path.basename(dbPath)}  (${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(2)} MB)`);
  log(`테이블 수: ${tableCount}`);
  for (const t of VERIFY_TABLES) {
    const c = countOf(db, t);
    log(`  ${t.padEnd(22)} ${c < 0 ? '(없음)' : c}`);
  }
  const missing = ['staff_members', 'approvals', 'notifications', 'rate_limit_attempts'].filter(
    (t) => !hasTable(db, t)
  );
  if (missing.length) {
    throw new Error(`필수 테이블 누락: ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  if (FLAG.ifLocal && (process.env.CI || process.env.E2E_SKIP_SEED)) {
    log('CI/E2E_SKIP_SEED 환경 — 로컬 D1 시드를 건너뜁니다.');
    return;
  }

  const dbPath = await resolveBoundLocalD1();
  log(`바인딩된 로컬 D1 확정: ${path.basename(dbPath)}`);

  const db = new Database(dbPath);
  try {
    db.pragma('foreign_keys = OFF');

    if (FLAG.verifyOnly) {
      verify(db, dbPath);
      return;
    }

    assertNotRealData(db, dbPath);

    const schemaStats = applySchema(db);
    log(`스키마: base 문장 ${schemaStats.baseStatements}건, 신규 마이그레이션 ${schemaStats.migrationsApplied}건`);

    const run = db.transaction(() => {
      const removed = cleanupSeedRows(db);
      if (FLAG.cleanup) return { removed, inserted: null };
      const inserted = seedRows(db);
      return { removed, inserted };
    });
    const { inserted } = run();

    if (FLAG.cleanup) {
      log('시드 행 삭제 완료 (--cleanup)');
    } else {
      const total = Object.values(inserted).reduce((a, b) => a + b, 0);
      log(`시드 삽입 완료: ${total} 행 / ${Object.keys(inserted).length} 테이블`);
    }

    verify(db, dbPath);

    if (!FLAG.cleanup) {
      log('');
      log(`로그인 계정: ${TESTER_LOGIN_ID} / ${TESTER_PASSWORD}  (관리자: E2E-ADMIN)`);
      log('dev 서버가 이미 떠 있었다면 재시작해야 반영될 수 있습니다.');
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[seed-e2e-d1] 실패:', err.message);
  process.exit(1);
});

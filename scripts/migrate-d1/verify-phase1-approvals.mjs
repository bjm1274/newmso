// ============================================================
// verify-phase1-approvals.mjs
// Phase 1(승인 도메인) D1 전환 런타임 검증.
// d1 모드(DATA_BACKEND=d1)에서 승인 전이가 "Approval is not pending"
// 없이 동작하는지 확인. erp_session 쿠키 위조로 인증 통과.
//
// 실행: node scripts/migrate-d1/verify-phase1-approvals.mjs [BASE_URL]
// ============================================================
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3000';

const env = {};
try {
  const raw = readFileSync(join(import.meta.dirname, '../../.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
} catch {}
const SECRET = env.SESSION_SECRET;
if (!SECRET) { console.error('SESSION_SECRET 없음'); process.exit(1); }

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
function forge(user) {
  const now = Math.floor(Date.now() / 1000);
  const full = {
    id: null, employee_no: null, name: '검증', role: null, department: null,
    company: null, company_id: null, position: null, photo_url: null, avatar_url: null,
    profile_photo_path: null, profile_photo_updated_at: null, email: null, phone: null,
    auth_user_id: null, is_system_master: false, login_id: null, permissions: {}, ...user,
  };
  const body = b64url(Buffer.from(JSON.stringify({ ver: 1, iat: now, exp: now + 3600, user: full }), 'utf8'));
  const sig = b64url(createHmac('sha256', SECRET).update(body).digest());
  return `erp_session=${body}.${sig}`;
}
const ADMIN = forge({ id: 'verify-admin', name: '검증관리자', role: 'admin', is_system_master: true, permissions: { admin: true, mso: true } });

async function post(path, payload, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let fail = 0;

// 1. 대기 승인 1건 조회 (D1 경유)
const q = await post('/api/d1/query', {
  table: 'approvals', where: [{ field: 'status', op: 'eq', value: '대기' }], limit: 1,
}, ADMIN);
console.log(`[1] approvals(대기) 조회: HTTP ${q.status} ${q.json?.ok ? 'ok' : (q.json?.error ?? '')}`);
if (q.status !== 200 || !q.json?.ok) { console.log('✗ 조회 실패'); process.exit(1); }
const appr = q.json.data?.[0];
if (!appr) { console.log('대기 승인 없음 — 전이 테스트 생략'); process.exit(0); }
console.log(`    대상 id=${appr.id} status=${appr.status} current_approver_id=${appr.current_approver_id}`);
console.log(`    meta_data 타입=${appr.meta_data === null ? 'null' : typeof appr.meta_data} (객체여야 정상)`);
if (typeof appr.meta_data === 'string') { console.log('✗ meta_data가 문자열 — JSON 역직렬화 실패'); fail += 1; }

// 2. 현재 결재자로 세션 위조 → 승인 전이
const approverId = String(appr.current_approver_id || '').trim();
if (!approverId) { console.log('current_approver_id 없음 — 전이 테스트 불가'); process.exit(1); }
const t = await post('/api/approvals/transition',
  { approvalId: appr.id, action: 'approve' },
  forge({ id: approverId, name: '검증결재자', permissions: {} }));
const blob = JSON.stringify(t.json ?? {});
console.log(`[2] 승인 전이(approve): HTTP ${t.status}`);
console.log(`    응답: ${blob.slice(0, 350)}`);
if (t.status === 500) { console.log('✗ 전이 라우트 500 — d1 경로 오류'); fail += 1; }
else if (blob.includes('not pending')) { console.log('✗ "Approval is not pending" 재발 — d1/Supabase 불일치 미해결'); fail += 1; }
else if (t.status === 200) { console.log('✓ 전이 호출 정상 — "not pending" 없음'); }
else { console.log(`✗ 예기치 못한 status ${t.status}`); fail += 1; }

console.log('─'.repeat(52));
console.log(fail === 0 ? '✓ Phase 1 승인 전이 — d1 모드 런타임 검증 통과' : `✗ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);

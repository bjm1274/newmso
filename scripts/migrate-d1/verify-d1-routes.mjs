// ============================================================
// verify-d1-routes.mjs
// 로컬 dev 서버의 /api/d1/query·/api/d1/mutate를 실제 호출해
// 컷오버 회귀 수정이 런타임에서 동작하는지 검증.
// SESSION_SECRET으로 erp_session 쿠키를 위조해 인증 통과.
//
// 실행: node scripts/migrate-d1/verify-d1-routes.mjs <BASE_URL>
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
const SECRET = env.SESSION_SECRET || process.env.SESSION_SECRET;
if (!SECRET) { console.error('SESSION_SECRET 없음'); process.exit(1); }

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function forgeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const full = {
    id: null, employee_no: null, name: '검증', role: null, department: null,
    company: null, company_id: null, position: null, photo_url: null, avatar_url: null,
    profile_photo_path: null, profile_photo_updated_at: null, email: null, phone: null,
    auth_user_id: null, is_system_master: false, login_id: null, permissions: {},
    ...user,
  };
  const payload = { ver: 1, iat: now, exp: now + 3600, user: full };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(createHmac('sha256', SECRET).update(body).digest());
  return `erp_session=${body}.${sig}`;
}

const ADMIN = forgeSession({ id: 'verify-admin', employee_no: '0', name: '검증관리자', role: 'admin', is_system_master: true, permissions: { admin: true, mso: true } });
const STAFF = forgeSession({ id: '420a6c33-1c5e-4e6e-806a-fc5db10e6ca9', employee_no: '3', name: '김지오', role: 'manager', company_id: 'f5748ca5-919b-44ec-8cb6-54ee56852437', permissions: {} });

async function call(path, payload, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const q = (payload, cookie = ADMIN) => call('/api/d1/query', payload, cookie);
const m = (payload, cookie = ADMIN) => call('/api/d1/mutate', payload, cookie);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`✓ ${name}`); }
  else { fail += 1; console.log(`✗ ${name} — ${detail ?? ''}`); }
}
const unparsed = (v) => typeof v === 'string' && /^\s*[[{]/.test(v);

console.log(`검증 대상: ${BASE}\n[관리자 세션 — JSON 역직렬화·테이블·orFilters]`);

{
  const { status, json } = await q({ table: 'approvals', limit: 5 });
  check('approvals 200/ok', status === 200 && json?.ok, `status=${status}`);
  const bad = (json?.data ?? []).filter((r) => unparsed(r.meta_data) || unparsed(r.approver_line));
  check('approvals.meta_data/approver_line 객체 복원', bad.length === 0, `${bad.length}행 문자열`);
}
{
  const { status, json } = await q({ table: 'chat_rooms', limit: 5 });
  check('chat_rooms 200/ok', status === 200 && json?.ok, `status=${status}`);
  const bad = (json?.data ?? []).filter((r) => unparsed(r.members) || unparsed(r.member_ids));
  check('chat_rooms.members 배열 복원', bad.length === 0, `${bad.length}행 문자열`);
}
{
  const { status, json } = await q({ table: 'staff_members', limit: 5 });
  check('staff_members 200/ok', status === 200 && json?.ok, `status=${status}`);
  check('staff_members.permissions 객체 복원', (json?.data ?? []).every((r) => !unparsed(r.permissions)), '문자열 잔존');
}
{
  const { status, json } = await q({ table: 'certificate_issuances', limit: 3 });
  check('certificate_issuances 403 아님', status === 200 && json?.ok, `status=${status} ${json?.error ?? ''}`);
}
{
  const orNode = { kind: 'or', children: [
    { kind: 'cond', field: 'id', op: 'isNot', value: null },
    { kind: 'cond', field: 'content', op: 'ilike', value: '%a%' },
  ] };
  const { status, json } = await q({ table: 'messages', limit: 3, orFilters: [orNode] });
  check('messages + orFilters 200/ok', status === 200 && json?.ok, `status=${status} ${json?.error ?? ''}`);
}

console.log('\n[비관리자 세션 — 정책 필터가 데이터를 과도하게 비우지 않는가]');
{
  const { status, json } = await q({ table: 'messages', limit: 5 }, STAFF);
  check('비관리자 messages(PUBLIC) 데이터 반환', status === 200 && json?.ok && (json?.data?.length ?? 0) > 0,
    `status=${status} rows=${json?.data?.length}`);
}
{
  const { status, json } = await q({ table: 'staff_members', limit: 5 }, STAFF);
  check('비관리자 staff_members(PUBLIC) 데이터 반환', status === 200 && json?.ok && (json?.data?.length ?? 0) > 0,
    `status=${status} rows=${json?.data?.length}`);
}
{
  const { status, json } = await q({ table: 'notifications', limit: 5 }, STAFF);
  check('비관리자 notifications(정책 테이블) 에러 없음', status === 200 && json?.ok, `status=${status} ${json?.error ?? ''}`);
}

console.log('\n[쓰기 라운드트립 — /api/d1/mutate insert→select→delete]');
{
  const key = `__d1_verify_${Date.now()}`;
  const ins = await m({ op: 'insert', table: 'system_settings', values: [{ key, value: 'verify-test' }] });
  check('mutate insert 200/ok', ins.status === 200 && ins.json?.ok, `status=${ins.status} ${ins.json?.error ?? ''}`);
  const sel = await q({ table: 'system_settings', where: [{ field: 'key', op: 'eq', value: key }] });
  check('insert한 행 select 확인', sel.json?.ok && (sel.json?.data?.length ?? 0) === 1 && sel.json.data[0]?.value === 'verify-test',
    `rows=${sel.json?.data?.length}`);
  const del = await m({ op: 'delete', table: 'system_settings', where: [{ field: 'key', op: 'eq', value: key }] });
  check('mutate delete 200/ok', del.status === 200 && del.json?.ok, `status=${del.status} ${del.json?.error ?? ''}`);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(fail === 0 ? `✓ 전체 통과 (${pass})` : `통과 ${pass} / 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

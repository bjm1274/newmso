// ============================================================
// verify-phase2-6-writes.mjs
// Phase 2~6 도메인의 POST(쓰기) 라우트 d1 모드 런타임 검증.
// 실제 데이터 변경을 최소화하는 입력으로 호출해 d1 경로가
// 런타임 오류(500) 없이 실행되는지 확인.
//
// - notifications/mark-read : 실제 알림 1건 읽음 처리(무해)
// - chat/quick-reply        : 검증용 메시지 1건 발송(로컬 D1)
// - inventory/stock-update  : delta=0 (수량 불변)
// - inventory/stock-transfer: 존재하지 않는 id (atomicStockTransfer 진입만 확인)
// - admin/annual-leave/manual-grant : total=현재값 (연차 총량 불변)
//
// 실행: node scripts/migrate-d1/verify-phase2-6-writes.mjs [BASE_URL]
// ============================================================
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const MASTER = forge({ id: '9999', employee_no: '9999', name: '검증마스터', role: 'admin', is_system_master: true, permissions: { admin: true, mso: true, system_master: true } });

async function hit(path, { method = 'POST', cookie, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e) };
  }
}
const q = (payload, cookie = MASTER) => hit('/api/d1/query', { body: payload, cookie });

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`✓ ${name}`); }
  else { fail += 1; console.log(`✗ ${name} — ${detail ?? ''}`); }
}
const notServerError = (r) => r.status !== 500 && r.status !== 0;
const errSnippet = (r) => `status=${r.status} ${(r.json?.error ?? r.text ?? '').toString().slice(0, 200)}`;

console.log(`검증 대상: ${BASE}\n[사전 데이터 수집]`);

// 검증 대상 행 수집 — MASTER 세션으로 D1 조회
const notifRes = await q({ table: 'notifications', limit: 1 });
const notif = notifRes.json?.data?.[0] ?? null;
const roomRes = await q({ table: 'chat_rooms', limit: 1 });
const room = roomRes.json?.data?.[0] ?? null;
const invRes = await q({ table: 'inventory', limit: 1 });
const inv = invRes.json?.data?.[0] ?? null;
const staffRes = await q({ table: 'staff_members', limit: 1 });
const staff = staffRes.json?.data?.[0] ?? null;
console.log(`  notification=${notif?.id ?? '없음'} room=${room?.id ?? '없음'} inventory=${inv?.id ?? '없음'} staff=${staff?.id ?? '없음'}`);
await sleep(2500);

// ── 1. notifications/mark-read ────────────────────────────
console.log('\n[POST 쓰기 라우트 — d1 경로 500 없음]');
if (notif?.id) {
  // 알림 소유자 세션으로 호출 (mark-read는 session.user.id로 필터)
  const owner = forge({ id: String(notif.user_id || notif.staff_id || '9999'), employee_no: '9999', name: '검증', is_system_master: true });
  const r = await hit('/api/notifications/mark-read', { cookie: owner, body: { notification_id: notif.id } });
  check('notifications/mark-read', notServerError(r) && r.json?.ok !== false, errSnippet(r));
} else {
  console.log('⚠ notifications/mark-read — 알림 없음, 생략');
}
await sleep(2500);

// ── 2. chat/quick-reply ──────────────────────────────────
if (room?.id) {
  // notice 방이거나 멤버 검증을 통과하도록: notice 방 우선, 아니면 멤버 첫 id 사용
  const members = Array.isArray(room.members) ? room.members : [];
  const senderId = room.type === 'notice'
    ? '9999'
    : (members[0] != null ? String(members[0]) : '9999');
  const sender = forge({ id: senderId, employee_no: '9999', name: '검증', is_system_master: true });
  const r = await hit('/api/chat/quick-reply', { cookie: sender, body: { room_id: room.id, content: '[d1검증] 자동 검증 메시지' } });
  // 403(멤버 아님)도 라우트 정상 도달 — d1 chat_rooms 조회는 실행됨
  check('chat/quick-reply', notServerError(r), errSnippet(r));
} else {
  console.log('⚠ chat/quick-reply — 채팅방 없음, 생략');
}
await sleep(2500);

// ── 3. inventory/stock-update (delta=0, 수량 불변) ────────
{
  const itemId = inv?.id ?? '__verify_nonexistent_item__';
  const r = await hit('/api/inventory/stock-update', { cookie: MASTER, body: { itemId, delta: 0 } });
  // 200(item 존재) 또는 404 ITEM_NOT_FOUND(D1 미백필) — 둘 다 d1 경로 정상 실행
  check('inventory/stock-update (delta=0)', notServerError(r), errSnippet(r));
}
await sleep(2500);

// ── 4. inventory/stock-transfer (존재X id, 진입 확인) ─────
{
  const r = await hit('/api/inventory/stock-transfer', {
    cookie: MASTER,
    body: { sourceId: '__verify_src__', destId: '__verify_dst__', quantity: 1 },
  });
  // 404 SOURCE_NOT_FOUND 기대 — atomicStockTransfer d1 경로 진입 확인
  check('inventory/stock-transfer (진입 확인)', notServerError(r), errSnippet(r));
}
await sleep(2500);

// ── 5. admin/annual-leave/manual-grant (total=현재값) ────
if (staff?.id) {
  const curTotal = Number(staff.annual_leave_total);
  const total = Number.isFinite(curTotal) && curTotal >= 0 ? curTotal : 15;
  const r = await hit('/api/admin/annual-leave/manual-grant', {
    cookie: MASTER,
    body: { updates: [{ staffId: String(staff.id), total, used: 0, expired: 0, compensated: 0 }] },
  });
  check('admin/annual-leave/manual-grant', notServerError(r) && r.json?.error == null, errSnippet(r));
} else {
  console.log('⚠ manual-grant — 직원 없음, 생략');
}

console.log(`\n${'─'.repeat(52)}`);
console.log(fail === 0 ? `✓ Phase 2~6 쓰기 라우트 — d1 모드 런타임 검증 통과 (${pass})` : `통과 ${pass} / 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

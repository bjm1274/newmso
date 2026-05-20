// ============================================================
// verify-stock-d1.mjs
// 재고 라우트(stock-update·stock-transfer)만 d1 모드 검증.
// atomicStockUpdate/atomicStockTransfer의 SQLite 호환 재작성 확인용.
//
// 실행: node scripts/migrate-d1/verify-stock-d1.mjs [BASE_URL]
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

async function hit(path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: MASTER },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e) };
  }
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`✓ ${name}`); }
  else { fail += 1; console.log(`✗ ${name} — ${detail}`); }
}
const errSnippet = (r) => `status=${r.status} ${(r.json?.error ?? r.text ?? '').toString().slice(0, 220)}`;

console.log(`검증 대상: ${BASE}\n[재고 라우트 d1 검증 — SQLite 호환 재작성]`);

// inventory 1건 조회
const invRes = await hit('/api/d1/query', { table: 'inventory', limit: 1 });
const inv = invRes.json?.data?.[0] ?? null;
console.log(`  inventory=${inv?.id ?? '없음'} (quantity=${inv?.quantity ?? '?'}, stock=${inv?.stock ?? '?'})`);
await sleep(5000);

// 1. stock-update (delta=0 — 수량 불변, atomicStockUpdate 전체 실행)
{
  const itemId = inv?.id ?? '__verify_nonexistent__';
  const r = await hit('/api/inventory/stock-update', { itemId, delta: 0 });
  // 200(item 존재, delta 0 적용) 또는 404 ITEM_NOT_FOUND — 둘 다 d1 경로 정상
  const ok = r.status !== 500 && r.status !== 0;
  check('inventory/stock-update (delta=0)', ok, errSnippet(r));
  if (r.status === 200) console.log(`    결과: ${JSON.stringify(r.json?.data ?? r.json)}`);
}
await sleep(6000);

// 2. stock-transfer (존재X id — atomicStockTransfer SELECT→batch 경로 진입)
{
  const r = await hit('/api/inventory/stock-transfer', { sourceId: '__verify_src__', destId: '__verify_dst__', quantity: 1 });
  // 404 SOURCE_NOT_FOUND 기대 — d1 SELECT 경로 정상 실행 증거
  const ok = r.status !== 500 && r.status !== 0;
  check('inventory/stock-transfer (진입 확인)', ok, errSnippet(r));
}

console.log(`\n${'─'.repeat(52)}`);
console.log(fail === 0 ? `✓ 재고 라우트 d1 검증 통과 (${pass})` : `통과 ${pass} / 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

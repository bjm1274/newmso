// ============================================================
// verify-phase2-6-routes.mjs
// Phase 2~6 도메인 서버 라우트의 d1 모드 런타임 검증.
// cron 라우트(Bearer CRON_SECRET)와 읽기 라우트(erp_session)를
// 실제 호출해 500(=d1 경로 런타임 오류)이 없는지 확인.
//
// Windows webpack dev는 빠른 연속 요청 시 .next 캐시가 손상되므로
// 각 요청 사이에 지연을 둔다.
//
// 실행: node scripts/migrate-d1/verify-phase2-6-routes.mjs [BASE_URL]
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
const CRON = env.CRON_SECRET;
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
const ADMIN = forge({ id: 'verify-admin', employee_no: '0', name: '검증관리자', role: 'admin', is_system_master: true, permissions: { admin: true, mso: true } });
// system-master 라우트는 isNamedSystemMasterAccount() — employee_no/id가 '9999'여야 통과
const MASTER = forge({ id: '9999', employee_no: '9999', name: '검증마스터', role: 'admin', is_system_master: true, permissions: { admin: true, mso: true, system_master: true } });

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`✓ ${name}`); }
  else { fail += 1; console.log(`✗ ${name} — ${detail ?? ''}`); }
}

async function hit(path, { method = 'GET', cookie, bearer, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (body) headers['Content-Type'] = 'application/json';
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

// 500/0 = d1 경로 런타임 오류 또는 서버 다운. 그 외(200·400·401·403·404)는 라우트 정상 도달.
const notServerError = (r) => r.status !== 500 && r.status !== 0;
const errSnippet = (r) => `status=${r.status} ${(r.json?.error ?? r.text ?? '').toString().slice(0, 160)}`;

console.log(`검증 대상: ${BASE}`);

// ── cron 라우트 (Bearer CRON_SECRET) ──────────────────────
console.log('\n[cron 라우트 — d1 경로 500 없음]');
if (!CRON) {
  console.log('⚠ CRON_SECRET 없음 — cron 검증 생략');
} else {
  const crons = [
    '/api/cron/inapp-notifications',         // Phase 2
    '/api/cron/push-subscription-cleanup',   // Phase 2
    '/api/cron/annual-leave-expiry',         // Phase 4
    '/api/cron/chat-retention',              // Phase 5
    '/api/cron/auto-report',                 // Phase 6
    '/api/cron/license-expiry-check',        // Phase 6
  ];
  for (const path of crons) {
    const r = await hit(path, { bearer: CRON });
    check(path, notServerError(r), errSnippet(r));
    await sleep(2500);
  }
}

// ── 읽기 라우트 (erp_session) ─────────────────────────────
console.log('\n[읽기 라우트 — d1 경로 500 없음]');
const gets = [
  { path: '/api/license-ce', cookie: ADMIN },
  { path: '/api/admin/system-master?scope=overview', cookie: MASTER },
  { path: '/api/admin/system-master?scope=audit', cookie: MASTER },
  { path: '/api/realtime/tail?tables=notifications,approvals', cookie: ADMIN },
];
for (const g of gets) {
  const r = await hit(g.path, { cookie: g.cookie });
  check(g.path, notServerError(r), errSnippet(r));
  await sleep(2500);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(fail === 0 ? `✓ Phase 2~6 라우트 — d1 모드 런타임 검증 통과 (${pass})` : `통과 ${pass} / 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

// ============================================================
// probe-missing-tables.mjs
// 08_extract_all_schema.sql CSV(public BASE TABLE 125개)에 없는
// 15개 테이블이 Supabase에 실제로 존재하는지 read-only 확인.
//
// 실행: node scripts/migrate-d1/probe-missing-tables.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// .env.local 로드 (Node 버전 무관)
try {
  const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch (err) {
  console.error('.env.local 로드 실패:', err.message);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const tables = [
  // 08_extract_all_schema.sql CSV(125개 base table)에 없던 11개 — 실제 존재 여부 확인
  'approval_delegation', 'approval_form_types', 'asset_loan_item_settings', 'company_seals',
  'insurance_records', 'license_continuing_education', 'login_logs', 'meeting_bookings',
  'roster_approval_requests', 'roster_policy_settings', 'roster_swap_requests',
];

// 연결 sanity check
const sanity = await sb.from('staff_members').select('*', { count: 'exact' }).limit(1);
console.log(`[sanity] staff_members: status=${sanity.status} count=${sanity.count} err=${sanity.error?.message ?? 'none'}`);
console.log('---');

for (const t of tables) {
  const { data, error, status, count } = await sb.from(t).select('*', { count: 'exact' }).limit(1);
  if (error) {
    console.log(`${t}: ERROR [${error.code ?? '?'}] status=${status} ${error.message}`);
  } else {
    const cols = data && data[0] ? Object.keys(data[0]) : [];
    console.log(`${t}: OK status=${status} count=${count} sampleCols=[${cols.join(', ')}]`);
  }
}

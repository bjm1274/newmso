// ============================================================
// check-passwordless-accounts.mjs
// production Supabase staff_members에서 비밀번호 미설정 계정을 조사.
// (비밀번호 미설정 계정은 master-login의 first-login 경로로 무단 선점 가능)
//
// 비밀번호 "값"은 출력하지 않는다 — 설정 여부(boolean)만.
//
// 실행: node scripts/check-passwordless-accounts.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = {};
try {
  const raw = readFileSync(join(import.meta.dirname, '../.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
} catch (e) {
  console.error('.env.local 읽기 실패:', e.message);
  process.exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Supabase 설정 없음'); process.exit(1); }

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from('staff_members')
  .select('id, employee_no, name, status, password, passwd');

if (error) { console.error('조회 실패:', error.message); process.exit(1); }

const hasPw = (r) =>
  Boolean((r.password && String(r.password).trim()) || (r.passwd && String(r.passwd).trim()));

const noPw = (data || []).filter((r) => !hasPw(r));
const narim = (data || []).filter((r) => String(r.name).trim() === '이나림');

console.log(`전체 직원: ${data?.length ?? 0}명`);
console.log(`비밀번호 미설정: ${noPw.length}명`);
console.log('─'.repeat(52));
for (const r of noPw) {
  console.log(`  미설정: ${r.name} (사번 ${r.employee_no ?? '-'}, status=${r.status ?? '-'}, id=${r.id})`);
}
console.log('─'.repeat(52));
console.log(`이나림 계정 ${narim.length}건:`);
for (const r of narim) {
  console.log(`  - 사번 ${r.employee_no ?? '-'}, status=${r.status ?? '-'}, 비번설정=${hasPw(r)}, id=${r.id}`);
}

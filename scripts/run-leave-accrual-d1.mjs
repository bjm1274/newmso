/**
 * 연차 자동부여 소급 실행 (원격 D1, CRON_SECRET 불필요)
 *
 * processAnnualLeaveAccrual 과 동일 규칙:
 * - 1년 미만: 경과 월 구간 만근(+결근 0) 시 monthly +1 (최대 11)
 * - 만 N년: annual:N 미부여분이 있으면 소급 부여
 * - leave_balances 재계산 (total/used/remaining)
 *
 * Usage: node scripts/run-leave-accrual-d1.mjs [--dry-run] [--date=YYYY-MM-DD]
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dateArg = args.find((a) => a.startsWith('--date='));
// 운영 DB 이름. wrangler.toml 의 database_name 과 일치해야 한다.
// 예전에는 구 DB 'pchos-d1' 로 굳어 있었다. 운영이 pchos-d1-v2 로 바뀐 뒤에도
// 그대로여서, 실행해도 사실상 빈 구 DB 에 아무 일도 없이 "성공"으로 끝났다.
const DB = 'pchos-d1-v2';

// 이 스크립트는 운영 데이터를 직접 수정한다. 위 DB 이름을 바로잡은 이상
// 실수로 실행하면 진짜 데이터가 바뀌므로 명시적 확인을 요구한다.
if (!process.argv.includes('--dry-run') && !process.argv.includes('--yes')) {
  console.error(
    `[${DB}] 운영 데이터베이스를 수정합니다. 확인했으면 --yes 를 붙여 다시 실행하세요. (먼저 --dry-run 으로 확인하세요)`,
  );
  process.exit(1);
}
const WORK = mkdtempSync(join(tmpdir(), 'leave-accrual-'));

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const TODAY = dateArg ? dateArg.split('=')[1] : kstToday();
const YEAR = Number(TODAY.slice(0, 4));

function extractJson(out) {
  const start = out.indexOf('[');
  const startObj = out.indexOf('{');
  let jsonStr = out;
  if (start >= 0 && (startObj < 0 || start <= startObj)) jsonStr = out.slice(start);
  else if (startObj >= 0) jsonStr = out.slice(startObj);
  return JSON.parse(jsonStr);
}

function d1Query(commandSql) {
  const escaped = commandSql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute ${DB} --remote --json --command "${escaped}"`;
  const out = execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    cwd: process.cwd(),
    shell: true,
  });
  const parsed = extractJson(out);
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      const rows = block?.results;
      if (Array.isArray(rows) && rows.length > 0) {
        const k = Object.keys(rows[0] || {});
        if (!k.includes('Total queries executed')) return rows;
      }
      if (Array.isArray(rows)) return rows;
    }
    return parsed[0]?.results ?? [];
  }
  return parsed?.results ?? [];
}

function d1File(sql) {
  const path = join(WORK, `w-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(path, sql, 'utf8');
  try {
    const cmd = `npx wrangler d1 execute ${DB} --remote --json --file "${path}"`;
    return execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      cwd: process.cwd(),
      shell: true,
    });
  } finally {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}

function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function toKey(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addMonthsKey(hireKey, months) {
  const p = parseKey(hireKey);
  if (!p) return null;
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(p.d, daysInMonth(y, m));
  return toKey(y, m, d);
}

function tenureYears(hireKey, todayKey) {
  const h = parseKey(hireKey);
  const t = parseKey(todayKey);
  if (!h || !t) return 0;
  let years = t.y - h.y;
  if (t.m < h.m || (t.m === h.m && t.d < h.d)) years -= 1;
  return Math.max(0, years);
}

function annualLeaveDaysForTenure(years) {
  if (years < 1) return 0;
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

function isActiveStatus(status) {
  const s = String(status ?? '').trim();
  if (!s) return true;
  if (s === '재직' || s === '재직중' || s.toLowerCase() === 'active') return true;
  return false;
}

function sqlStr(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

console.log(`[accrual-d1] today=${TODAY} dry=${DRY}`);

const staffs = d1Query(
  `SELECT id, name, company_id, status, annual_leave_total, hire_date, join_date, joined_at FROM staff_members WHERE id IS NOT NULL`,
);

const accruals = d1Query(`SELECT staff_id, kind, period_key, days FROM leave_accruals`);

const absences = d1Query(
  `SELECT staff_id, work_date FROM attendances WHERE status IN ('absent','결근')`,
);

const accrualByStaff = new Map();
for (const a of accruals) {
  const sid = a.staff_id;
  if (!accrualByStaff.has(sid)) accrualByStaff.set(sid, []);
  accrualByStaff.get(sid).push(a);
}

const absentByStaff = new Map();
for (const a of absences) {
  const sid = a.staff_id;
  if (!absentByStaff.has(sid)) absentByStaff.set(sid, []);
  absentByStaff.get(sid).push(String(a.work_date).slice(0, 10));
}

function hasAbsence(staffId, startKey, endKey) {
  const list = absentByStaff.get(staffId) || [];
  return list.some((d) => d >= startKey && d < endKey);
}

const inserts = [];
const granted = [];
let scanned = 0;
let skipped = 0;

for (const s of staffs) {
  scanned += 1;
  if (!isActiveStatus(s.status)) {
    skipped += 1;
    continue;
  }
  const hireKey = String(s.hire_date ?? s.join_date ?? s.joined_at ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireKey) || hireKey > TODAY) {
    skipped += 1;
    continue;
  }

  const existing = accrualByStaff.get(s.id) || [];
  const annualKeys = new Set(
    existing.filter((a) => a.kind === 'annual').map((a) => a.period_key),
  );
  const monthlyKeys = new Set(
    existing.filter((a) => a.kind === 'monthly').map((a) => a.period_key),
  );

  const maxYears = tenureYears(hireKey, TODAY);
  let didGrant = false;

  if (maxYears >= 1) {
    for (let n = 1; n <= maxYears; n += 1) {
      const periodKey = `annual:${n}`;
      if (annualKeys.has(periodKey)) continue;
      const days = annualLeaveDaysForTenure(n);
      inserts.push({
        id: randomUUID(),
        staff_id: s.id,
        company_id: s.company_id,
        kind: 'annual',
        period_key: periodKey,
        days,
        year: YEAR,
        source_date: TODAY,
        note: `만 ${n}년차 연차 ${days}일 자동부여(백필)`,
      });
      granted.push({ name: s.name, kind: 'annual', periodKey, days });
      annualKeys.add(periodKey);
      didGrant = true;
    }
    if (!didGrant) skipped += 1;
    continue;
  }

  // 1년 미만 월차
  let monthlyGranted = 0;
  for (let k = 1; k <= 11; k += 1) {
    const startKey = addMonthsKey(hireKey, k - 1);
    const endKey = addMonthsKey(hireKey, k);
    if (!startKey || !endKey) continue;
    if (endKey > TODAY) break;
    const periodKey = startKey.slice(0, 7);
    if (monthlyKeys.has(periodKey)) continue;
    if (hasAbsence(s.id, startKey, endKey)) continue;
    inserts.push({
      id: randomUUID(),
      staff_id: s.id,
      company_id: s.company_id,
      kind: 'monthly',
      period_key: periodKey,
      days: 1,
      year: YEAR,
      source_date: TODAY,
      note: `${k}개월차 만근 +1일(백필)`,
    });
    granted.push({ name: s.name, kind: 'monthly', periodKey, days: 1 });
    monthlyKeys.add(periodKey);
    monthlyGranted += 1;
    didGrant = true;
  }
  if (monthlyGranted === 0) skipped += 1;
}

console.log(`[accrual-d1] scanned=${scanned} granted=${granted.length} skipped=${skipped}`);
for (const g of granted) {
  console.log(`  + ${g.name} ${g.kind} ${g.periodKey} +${g.days}`);
}

if (inserts.length === 0) {
  console.log('[accrual-d1] 신규 부여 없음');
  process.exit(0);
}

if (DRY) {
  console.log(`[accrual-d1] dry-run: would insert ${inserts.length} rows`);
  process.exit(0);
}

// batch insert
const batchSize = 40;
for (let i = 0; i < inserts.length; i += batchSize) {
  const chunk = inserts.slice(i, i + batchSize);
  const values = chunk
    .map(
      (r) =>
        `(${sqlStr(r.id)}, ${sqlStr(r.staff_id)}, ${sqlStr(r.company_id)}, ${sqlStr(r.kind)}, ${sqlStr(r.period_key)}, ${r.days}, ${r.year}, ${sqlStr(r.source_date)}, ${sqlStr(r.note)}, datetime('now'))`,
    )
    .join(',\n');
  const sql = `INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at) VALUES\n${values};`;
  d1File(sql);
  console.log(`[accrual-d1] inserted batch ${i + 1}-${i + chunk.length}`);
}

// affected staff balance recompute via rebalance script
console.log('[accrual-d1] rebalance leave_balances…');
try {
  execSync('node scripts/rebalance-leave-balances.mjs --active-only', {
    encoding: 'utf8',
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
  });
} catch (e) {
  console.error('[accrual-d1] rebalance failed:', e.message);
  process.exit(1);
}

console.log('[accrual-d1] done');

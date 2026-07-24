/**
 * 연차 사용내역 전부 초기화 + 잔액을 "현재 입사 응당일 사이클 부여분만"으로 재동기화
 *
 * - leave_ledger: use / manual_used_adjustment 삭제
 * - leave_requests: 전부 삭제 (사용·신청 이력)
 * - leave_balances.used_days = 0, remaining = 사이클 부여분
 * - staff_members.annual_leave_used = 0
 * - 1년 이상: 당해 사이클(최근 기념일 부여분)만 total/remaining
 * - 1년 미만: 월차 누적분만 total/remaining
 *
 * Usage: node scripts/reset-leave-usage.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const DB = 'pchos-d1';
const WORK = mkdtempSync(join(tmpdir(), 'leave-usage-reset-'));
const wranglerJs = join(ROOT, 'node_modules/wrangler/bin/wrangler.js');

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const TODAY = kstToday();
const YEAR = Number(TODAY.slice(0, 4));

function d1Query(sql) {
  const out = execFileSync(
    process.execPath,
    [wranglerJs, 'd1', 'execute', DB, '--remote', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      const rows = block?.results;
      if (Array.isArray(rows) && rows.length > 0) {
        const keys = Object.keys(rows[0] || {});
        if (!keys.includes('Total queries executed')) return rows;
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
    return execFileSync(
      process.execPath,
      [wranglerJs, 'd1', 'execute', DB, '--remote', '--json', '--file', path],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
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

function addYearsKey(hireKey, years) {
  const p = parseKey(hireKey);
  if (!p) return null;
  const y = p.y + years;
  const d = Math.min(p.d, daysInMonth(y, p.m));
  return toKey(y, p.m, d);
}

function tenureYears(hireKey, todayKey) {
  const h = parseKey(hireKey);
  const t = parseKey(todayKey);
  if (!h || !t) return 0;
  let years = t.y - h.y;
  if (t.m < h.m || (t.m === h.m && t.d < h.d)) years -= 1;
  return Math.max(0, years);
}

function getLeaveCycle(hireDate, asOfDate) {
  const hire = String(hireDate).slice(0, 10);
  const asOf = String(asOfDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hire) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  if (hire > asOf) {
    return {
      start: hire,
      end: addYearsKey(hire, 1) ?? `${asOf.slice(0, 4)}-12-31`,
      completedYears: 0,
    };
  }
  const completedYears = tenureYears(hire, asOf);
  const start = completedYears === 0 ? hire : addYearsKey(hire, completedYears);
  const end = addYearsKey(hire, completedYears + 1);
  if (!start || !end) return null;
  return { start, end, completedYears };
}

function isWithinCycle(dateKey, cycle) {
  return dateKey >= cycle.start && dateKey < cycle.end;
}

function isActiveStatus(status) {
  const s = String(status ?? '').trim();
  if (!s) return true;
  return s === '재직' || s === '재직중' || s.toLowerCase() === 'active';
}

function isGroupAccount(staff) {
  try {
    const perms =
      typeof staff.permissions === 'string' ? JSON.parse(staff.permissions) : staff.permissions;
    if (perms?.is_group_account === 1 || perms?.is_group_account === true) return true;
    if (perms?.account_type === 'team_group' || perms?.account_type === 'group') return true;
  } catch {
    /* ignore */
  }
  const name = String(staff.name ?? '');
  if (/^(병동|외래|수술|간호|원무|관리)팀\d*$/.test(name)) return true;
  if (/팀\d+$/.test(name)) return true;
  return false;
}

function sqlStr(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function roundDays(v) {
  return Math.round(Number(v) * 100) / 100;
}

console.log(`=== reset leave usage today=${TODAY} dry=${DRY} ===`);

const beforeLedger = d1Query(
  `SELECT entry_type, COUNT(1) AS c, ROUND(SUM(days),2) AS s FROM leave_ledger GROUP BY entry_type`,
);
const beforeReq = d1Query(`SELECT COUNT(1) AS c FROM leave_requests`);
const beforeUsed = d1Query(
  `SELECT COUNT(1) AS c FROM leave_balances WHERE year = ${YEAR} AND IFNULL(used_days,0) > 0`,
);
console.log('[before] ledger', beforeLedger);
console.log('[before] leave_requests', beforeReq);
console.log('[before] balances with used>0', beforeUsed);

if (DRY) {
  console.log('[dry-run] would delete use rows, clear leave_requests, zero used, resync remaining');
} else {
  d1File(`
DELETE FROM leave_ledger WHERE entry_type IN ('use', 'manual_used_adjustment');
DELETE FROM leave_requests;
UPDATE leave_balances SET used_days = 0, updated_at = datetime('now') WHERE year = ${YEAR};
UPDATE staff_members SET annual_leave_used = 0;
`);
  console.log('[wipe] use ledger + leave_requests + used_days cleared');
}

// Reload ledger grants (no uses)
const ledgerRows = DRY
  ? d1Query(
      `SELECT staff_id, entry_type, days, occurred_on, period_key FROM leave_ledger WHERE entry_type NOT IN ('use','manual_used_adjustment')`,
    )
  : d1Query(`SELECT staff_id, entry_type, days, occurred_on, period_key FROM leave_ledger`);

const ledgerByStaff = new Map();
for (const row of ledgerRows) {
  const sid = String(row.staff_id);
  if (!ledgerByStaff.has(sid)) ledgerByStaff.set(sid, []);
  ledgerByStaff.get(sid).push(row);
}

const staffs = d1Query(
  `SELECT id, name, company, department, status, permissions, hire_date, join_date, joined_at FROM staff_members`,
);
const balances = d1Query(
  `SELECT id, staff_id, year, total_days, used_days, remaining_days, expired_days, compensated_days FROM leave_balances WHERE year = ${YEAR}`,
);
const balByStaff = new Map(balances.map((b) => [String(b.staff_id), b]));

const stmts = [];
const report = [];

for (const s of staffs) {
  if (!isActiveStatus(s.status)) continue;
  if (String(s.name || '').startsWith('TEST_')) continue;

  const bal = balByStaff.get(String(s.id));

  if (isGroupAccount(s)) {
    if (bal?.id) {
      stmts.push(
        `UPDATE leave_balances SET total_days=0, used_days=0, remaining_days=0, expired_days=0, compensated_days=0, updated_at=datetime('now') WHERE id=${sqlStr(bal.id)};`,
      );
    }
    stmts.push(`UPDATE staff_members SET annual_leave_total=0, annual_leave_used=0 WHERE id=${sqlStr(s.id)};`);
    report.push({ name: s.name, hire: '(group)', cycle: '-', total: 0, used: 0, remaining: 0 });
    continue;
  }

  const hireKey = String(s.hire_date ?? s.join_date ?? s.joined_at ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireKey)) {
    if (bal?.id) {
      stmts.push(
        `UPDATE leave_balances SET total_days=0, used_days=0, remaining_days=0, updated_at=datetime('now') WHERE id=${sqlStr(bal.id)};`,
      );
    }
    stmts.push(`UPDATE staff_members SET annual_leave_total=0, annual_leave_used=0 WHERE id=${sqlStr(s.id)};`);
    continue;
  }

  const cycle = getLeaveCycle(hireKey, TODAY);
  if (!cycle) continue;

  const rows = ledgerByStaff.get(String(s.id)) || [];
  let total = 0;
  let expired = 0;
  let compensated = 0;
  let remainingRaw = 0;
  const grantNotes = [];

  for (const entry of rows) {
    const periodKey = String(entry.period_key || '');
    if (periodKey.startsWith('auto-seed:')) continue;
    const occurredOn = String(entry.occurred_on || '').slice(0, 10);
    const entryType = String(entry.entry_type || '');
    const isManualKeep =
      entryType === 'manual_adjustment' ||
      entryType === 'manual_expire_adjustment' ||
      entryType === 'manual_compensate_adjustment' ||
      entryType === 'initial_grant' ||
      entryType === 'substitute';

    // 사용 가능 범위 = 현재 입사 응당일 사이클만
    // (예: 23.8 입사 → 24.8 부여분은 25.8 전까지만, 25.8 이후는 25.8 신규 부여분만)
    if (!isManualKeep && occurredOn && !isWithinCycle(occurredOn, cycle)) {
      continue;
    }

    const days = Number(entry.days) || 0;
    remainingRaw += days;
    if (entryType === 'expire' || entryType === 'manual_expire_adjustment') expired += -days;
    else if (entryType === 'compensate' || entryType === 'manual_compensate_adjustment') compensated += -days;
    else if (entryType === 'use' || entryType === 'manual_used_adjustment') {
      // usage wiped — ignore
    } else {
      total += days;
      grantNotes.push(`${entryType}:${periodKey}=${days}`);
    }
  }

  const finalTotal = roundDays(Math.max(0, total));
  const finalUsed = 0;
  const finalExpired = roundDays(Math.max(0, expired));
  const finalCompensated = roundDays(Math.max(0, compensated));
  const finalRemaining = roundDays(Math.max(0, remainingRaw));

  if (bal?.id) {
    stmts.push(
      `UPDATE leave_balances SET total_days=${finalTotal}, used_days=${finalUsed}, remaining_days=${finalRemaining}, expired_days=${finalExpired}, compensated_days=${finalCompensated}, updated_at=datetime('now') WHERE id=${sqlStr(bal.id)};`,
    );
  } else {
    stmts.push(
      `INSERT INTO leave_balances (id, staff_id, year, total_days, used_days, remaining_days, expired_days, compensated_days, created_at, updated_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(s.id)}, ${YEAR}, ${finalTotal}, 0, ${finalRemaining}, ${finalExpired}, ${finalCompensated}, datetime('now'), datetime('now'));`,
    );
  }
  stmts.push(
    `UPDATE staff_members SET annual_leave_total=${finalTotal}, annual_leave_used=0 WHERE id=${sqlStr(s.id)};`,
  );

  report.push({
    name: s.name,
    department: s.department,
    hire: hireKey,
    cycle: `${cycle.start}~${cycle.end}`,
    years: cycle.completedYears,
    total: finalTotal,
    used: 0,
    remaining: finalRemaining,
    grants: grantNotes.join(','),
  });
}

report.sort((a, b) => String(a.hire).localeCompare(String(b.hire)));
console.log('\n[cycle balances after usage reset]');
for (const r of report) {
  console.log(
    `  ${r.name} | hire=${r.hire} | cycle=${r.cycle} | y=${r.years ?? '-'} | 부여=${r.total} 사용=0 잔여=${r.remaining}${r.grants ? ` [${r.grants}]` : ''}`,
  );
}

if (DRY) {
  console.log(`[dry-run] would write ${stmts.length} statements`);
} else {
  const batch = 25;
  for (let i = 0; i < stmts.length; i += batch) {
    d1File(stmts.slice(i, i + batch).join('\n'));
    console.log(`[write] ${i + 1}-${Math.min(i + batch, stmts.length)}/${stmts.length}`);
  }
  const after = d1Query(
    `SELECT entry_type, COUNT(1) AS c, ROUND(SUM(days),2) AS s FROM leave_ledger GROUP BY entry_type`,
  );
  const sample = d1Query(
    `SELECT name, hire_date, join_date, annual_leave_total, annual_leave_used FROM staff_members WHERE name IN ('백정민','박철홍','김수지','김이지','박은수','이미영','박은빈') ORDER BY name`,
  );
  console.log('\n[after] ledger', after);
  console.log('[after] leave_requests', d1Query(`SELECT COUNT(1) AS c FROM leave_requests`));
  console.log('[after] sample', sample);
}

console.log(DRY ? '=== DRY RUN done ===' : '=== USAGE RESET done ===');

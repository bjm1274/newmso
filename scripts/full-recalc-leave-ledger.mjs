/**
 * 연차 전체 재계산 (입사일 기준, leave_ledger SSOT)
 *
 * 1) auto_monthly / auto_annual / auto-seed 원장 삭제
 * 2) 입사일 기준 월차·연차 재부여 (leave_ledger + leave_accruals)
 * 3) 승인된 leave_requests 사용분 → leave_ledger use 동기화
 * 4) 현재 연차 사이클 기준으로 leave_balances / staff_members 동기화
 *
 * Usage:
 *   node scripts/full-recalc-leave-ledger.mjs --dry-run
 *   node scripts/full-recalc-leave-ledger.mjs
 *   node scripts/full-recalc-leave-ledger.mjs --date=2026-07-24
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, writeFileSync as writeFs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dateArg = args.find((a) => a.startsWith('--date='));
const DB = 'pchos-d1';
const WORK = mkdtempSync(join(tmpdir(), 'leave-full-recalc-'));
const wranglerJs = join(ROOT, 'node_modules/wrangler/bin/wrangler.js');

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

function addMonthsKey(hireKey, months) {
  const p = parseKey(hireKey);
  if (!p) return null;
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(p.d, daysInMonth(y, m));
  return toKey(y, m, d);
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

function annualLeaveDaysForTenure(years) {
  if (years < 1) return 0;
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

function getLeaveCycle(hireDate, asOfDate) {
  const hire = String(hireDate).slice(0, 10);
  const asOf = String(asOfDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hire) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  if (hire > asOf) {
    return {
      key: `first-year:${hire}`,
      start: hire,
      end: addYearsKey(hire, 1) ?? `${asOf.slice(0, 4)}-12-31`,
      completedYears: 0,
    };
  }
  const completedYears = tenureYears(hire, asOf);
  const start = completedYears === 0 ? hire : addYearsKey(hire, completedYears);
  const end = addYearsKey(hire, completedYears + 1);
  if (!start || !end) return null;
  return {
    key: completedYears === 0 ? `first-year:${hire}` : `annual:${completedYears}:${start}`,
    start,
    end,
    completedYears,
  };
}

function isWithinCycle(dateKey, cycle) {
  return dateKey >= cycle.start && dateKey < cycle.end;
}

function isActiveStatus(status) {
  const s = String(status ?? '').trim();
  if (!s) return true;
  if (s === '재직' || s === '재직중' || s.toLowerCase() === 'active') return true;
  return false;
}

function isGroupAccount(staff) {
  if (!staff) return false;
  try {
    const perms =
      typeof staff.permissions === 'string'
        ? JSON.parse(staff.permissions)
        : staff.permissions;
    if (perms?.is_group_account === 1 || perms?.is_group_account === true) return true;
    if (perms?.account_type === 'team_group' || perms?.account_type === 'group') return true;
  } catch {
    /* ignore */
  }
  // 팀 공용 계정 휴리스틱 (병동팀1, 외래팀1, 수술팀1 등)
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

function isHalf(leaveType) {
  const n = String(leaveType ?? '').trim().toLowerCase();
  return n.includes('반차') || n === 'half_leave' || n === 'half-day' || n.includes('0.5');
}

function isAnnualUse(leaveType) {
  const n = String(leaveType ?? '').trim();
  if (!n) return false;
  if (n.includes('부여') || n.includes('신규') || n.includes('소급')) return false;
  return n.includes('연차') || n.includes('반차') || n === 'annual_leave' || n === 'annual';
}

function isApproved(status) {
  const n = String(status ?? '').trim().toLowerCase();
  return n === '승인' || n === 'approved';
}

function leaveDays(row) {
  if (isHalf(row.leave_type)) {
    const d = Number(row.days);
    return Number.isFinite(d) && d > 0 ? d : 0.5;
  }
  const stored = Number(row.days);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const start = String(row.start_date || '').slice(0, 10);
  const end = String(row.end_date || row.start_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return 1;
  const from = new Date(`${start}T00:00:00Z`).getTime();
  const to = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((to - from) / 86_400_000) + 1);
}

console.log(`=== full leave recalc today=${TODAY} dry=${DRY} ===`);

// ── load ──────────────────────────────────────────────────────────
const staffs = d1Query(
  `SELECT id, name, company_id, company, department, status, permissions, hire_date, join_date, joined_at, annual_leave_total, annual_leave_used FROM staff_members`,
);

const absences = d1Query(
  `SELECT staff_id, work_date FROM attendances WHERE status IN ('absent','결근')`,
);
const absentByStaff = new Map();
for (const a of absences) {
  const sid = String(a.staff_id);
  if (!absentByStaff.has(sid)) absentByStaff.set(sid, []);
  absentByStaff.get(sid).push(String(a.work_date).slice(0, 10));
}
function hasAbsence(staffId, startKey, endKey) {
  return (absentByStaff.get(String(staffId)) || []).some((d) => d >= startKey && d < endKey);
}

const requests = d1Query(
  `SELECT id, staff_id, company_id, leave_type, start_date, end_date, days, status, created_at FROM leave_requests`,
);

const beforeLedger = d1Query(
  `SELECT entry_type, COUNT(1) as cnt, ROUND(SUM(days),2) as sum_days FROM leave_ledger GROUP BY entry_type`,
);
console.log('[before] leave_ledger', beforeLedger);

// ── Phase 1: wipe auto grants / seed ──────────────────────────────
const wipeSql = `
DELETE FROM leave_ledger WHERE entry_type IN ('auto_monthly', 'auto_annual');
DELETE FROM leave_ledger WHERE period_key LIKE 'auto-seed%';
DELETE FROM leave_accruals;
`;
if (DRY) {
  console.log('[dry-run] would wipe auto_monthly/auto_annual/auto-seed and leave_accruals');
} else {
  d1File(wipeSql);
  console.log('[wipe] auto grants + leave_accruals cleared');
}

// ── Phase 2: re-grant by hire date ────────────────────────────────
const grantInserts = []; // leave_ledger
const accrualInserts = []; // leave_accruals mirror
const grantReport = [];

for (const s of staffs) {
  if (!isActiveStatus(s.status)) continue;
  if (isGroupAccount(s)) continue;
  if (String(s.name || '').startsWith('TEST_')) continue;

  const hireKey = String(s.hire_date ?? s.join_date ?? s.joined_at ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireKey) || hireKey > TODAY) continue;

  const maxYears = tenureYears(hireKey, TODAY);

  if (maxYears >= 1) {
    for (let n = 1; n <= maxYears; n += 1) {
      const periodKey = `annual:${n}`;
      const days = annualLeaveDaysForTenure(n);
      const occurredOn = addYearsKey(hireKey, n) ?? TODAY;
      const id = randomUUID();
      const note = `만 ${n}년차 입사 응당일 연차 신규 부여 (${days}일)`;
      grantInserts.push({
        id,
        staff_id: s.id,
        company_id: s.company_id,
        entry_type: 'auto_annual',
        days,
        occurred_on: occurredOn,
        period_key: periodKey,
        source_id: periodKey,
        note,
      });
      accrualInserts.push({
        id: randomUUID(),
        staff_id: s.id,
        company_id: s.company_id,
        kind: 'annual',
        period_key: periodKey,
        days,
        year: Number(String(occurredOn).slice(0, 4)) || YEAR,
        source_date: occurredOn,
        note,
      });
      grantReport.push({ name: s.name, hire: hireKey, kind: 'annual', periodKey, days, occurredOn });
    }
    continue;
  }

  // 1년 미만: 경과 월 만근 +1 (결근 있으면 스킵)
  for (let k = 1; k <= 11; k += 1) {
    const startKey = addMonthsKey(hireKey, k - 1);
    const endKey = addMonthsKey(hireKey, k);
    if (!startKey || !endKey) continue;
    if (endKey > TODAY) break;
    if (hasAbsence(s.id, startKey, endKey)) continue;
    const periodKey = startKey.slice(0, 7);
    const id = randomUUID();
    const note = `입사 ${k}개월차 만근에 따른 월차 발생`;
    grantInserts.push({
      id,
      staff_id: s.id,
      company_id: s.company_id,
      entry_type: 'auto_monthly',
      days: 1,
      occurred_on: endKey,
      period_key: periodKey,
      source_id: periodKey,
      note,
    });
    accrualInserts.push({
      id: randomUUID(),
      staff_id: s.id,
      company_id: s.company_id,
      kind: 'monthly',
      period_key: periodKey,
      days: 1,
      year: Number(startKey.slice(0, 4)) || YEAR,
      source_date: endKey,
      note,
    });
    grantReport.push({ name: s.name, hire: hireKey, kind: 'monthly', periodKey, days: 1, occurredOn: endKey });
  }
}

console.log(`[grants] planned ${grantInserts.length} ledger rows for ${new Set(grantReport.map((g) => g.name)).size} staff`);
const byName = new Map();
for (const g of grantReport) {
  if (!byName.has(g.name)) byName.set(g.name, { name: g.name, hire: g.hire, days: 0, kinds: [] });
  const row = byName.get(g.name);
  row.days += g.days;
  row.kinds.push(`${g.kind}:${g.periodKey}=${g.days}`);
}
const summaryLines = [...byName.values()].sort((a, b) => a.hire.localeCompare(b.hire));
for (const row of summaryLines) {
  console.log(`  ${row.name} hire=${row.hire} total_grant=${row.days} [${row.kinds.join(', ')}]`);
}

// ── Phase 3: use sync from leave_requests ─────────────────────────
// leave_requests 가 비어 있으면 기존 use 원장을 보존한다 (삭제 금지).
const useInserts = [];
const useReport = [];
for (const r of requests) {
  if (!isApproved(r.status)) continue;
  if (!isAnnualUse(r.leave_type)) continue;
  const days = leaveDays(r);
  if (!(days > 0)) continue;
  const occurredOn =
    String(r.start_date || '').slice(0, 10) ||
    String(r.created_at || '').slice(0, 10) ||
    TODAY;
  const periodKey = `request:${r.id}`;
  useInserts.push({
    id: randomUUID(),
    staff_id: r.staff_id,
    company_id: r.company_id,
    entry_type: 'use',
    days: -Math.abs(days),
    occurred_on: occurredOn,
    period_key: periodKey,
    source_id: r.id,
    note: `휴가 사용 승인 (${r.leave_type})`,
  });
  useReport.push({ staff_id: r.staff_id, days, leave_type: r.leave_type, occurredOn });
}
const canResyncUses = useInserts.length > 0;
console.log(
  `[uses] planned ${useInserts.length} use rows from leave_requests` +
    (canResyncUses ? ' (will replace request:* uses)' : ' (preserve existing use rows)'),
);

// ── apply writes ──────────────────────────────────────────────────
if (DRY) {
  console.log(`[dry-run] skip writes. grants=${grantInserts.length} uses=${useInserts.length}`);
} else {
  const batchSize = 30;
  for (let i = 0; i < grantInserts.length; i += batchSize) {
    const chunk = grantInserts.slice(i, i + batchSize);
    const values = chunk
      .map(
        (r) =>
          `(${sqlStr(r.id)}, ${sqlStr(r.staff_id)}, ${sqlStr(r.company_id)}, ${sqlStr(r.entry_type)}, ${r.days}, ${sqlStr(r.occurred_on)}, ${sqlStr(r.period_key)}, ${sqlStr(r.source_id)}, ${sqlStr(r.note)}, datetime('now'))`,
      )
      .join(',\n');
    d1File(
      `INSERT INTO leave_ledger (id, staff_id, company_id, entry_type, days, occurred_on, period_key, source_id, note, created_at) VALUES\n${values};`,
    );
    console.log(`[ledger grants] ${i + 1}-${i + chunk.length}/${grantInserts.length}`);
  }

  for (let i = 0; i < accrualInserts.length; i += batchSize) {
    const chunk = accrualInserts.slice(i, i + batchSize);
    const values = chunk
      .map(
        (r) =>
          `(${sqlStr(r.id)}, ${sqlStr(r.staff_id)}, ${sqlStr(r.company_id)}, ${sqlStr(r.kind)}, ${sqlStr(r.period_key)}, ${r.days}, ${r.year}, ${sqlStr(r.source_date)}, ${sqlStr(r.note)}, datetime('now'))`,
      )
      .join(',\n');
    d1File(
      `INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at) VALUES\n${values};`,
    );
    console.log(`[accruals] ${i + 1}-${i + chunk.length}/${accrualInserts.length}`);
  }

  if (canResyncUses) {
    d1File(`DELETE FROM leave_ledger WHERE entry_type = 'use' AND period_key LIKE 'request:%';`);
    for (let i = 0; i < useInserts.length; i += batchSize) {
      const chunk = useInserts.slice(i, i + batchSize);
      const values = chunk
        .map(
          (r) =>
            `(${sqlStr(r.id)}, ${sqlStr(r.staff_id)}, ${sqlStr(r.company_id)}, ${sqlStr(r.entry_type)}, ${r.days}, ${sqlStr(r.occurred_on)}, ${sqlStr(r.period_key)}, ${sqlStr(r.source_id)}, ${sqlStr(r.note)}, datetime('now'))`,
        )
        .join(',\n');
      d1File(
        `INSERT INTO leave_ledger (id, staff_id, company_id, entry_type, days, occurred_on, period_key, source_id, note, created_at) VALUES\n${values};`,
      );
      console.log(`[ledger uses] ${i + 1}-${i + chunk.length}/${useInserts.length}`);
    }
  } else {
    console.log('[uses] leave_requests empty/unusable — keeping existing use ledger rows');
  }
}

// ── Phase 4: balance recompute (current cycle) ────────────────────
// Reload ledger after writes (or simulate from planned for dry-run)
let ledgerRows;
if (DRY) {
  // simulate: existing non-auto + planned grants (+ planned uses if resync)
  const existing = d1Query(
    `SELECT staff_id, entry_type, days, occurred_on, period_key, note FROM leave_ledger WHERE entry_type NOT IN ('auto_monthly','auto_annual') AND period_key NOT LIKE 'auto-seed%'`,
  );
  let kept = existing;
  if (canResyncUses) {
    kept = existing.filter(
      (r) => !(r.entry_type === 'use' && String(r.period_key).startsWith('request:')),
    );
  }
  ledgerRows = [
    ...kept,
    ...grantInserts.map((r) => ({
      staff_id: r.staff_id,
      entry_type: r.entry_type,
      days: r.days,
      occurred_on: r.occurred_on,
      period_key: r.period_key,
      note: r.note,
    })),
    ...(canResyncUses
      ? useInserts.map((r) => ({
          staff_id: r.staff_id,
          entry_type: r.entry_type,
          days: r.days,
          occurred_on: r.occurred_on,
          period_key: r.period_key,
          note: r.note,
        }))
      : []),
  ];
} else {
  ledgerRows = d1Query(
    `SELECT staff_id, entry_type, days, occurred_on, period_key, note FROM leave_ledger`,
  );
}

const ledgerByStaff = new Map();
for (const row of ledgerRows) {
  const sid = String(row.staff_id);
  if (!ledgerByStaff.has(sid)) ledgerByStaff.set(sid, []);
  ledgerByStaff.get(sid).push(row);
}

const existingBalances = d1Query(
  `SELECT id, staff_id, year, total_days, used_days, remaining_days FROM leave_balances WHERE year = ${YEAR}`,
);
const balByStaff = new Map(existingBalances.map((b) => [String(b.staff_id), b]));

const balUpdates = [];
const balInserts = [];
const staffUpdates = [];
const balanceReport = [];

for (const s of staffs) {
  if (!isActiveStatus(s.status)) continue;
  if (String(s.name || '').startsWith('TEST_')) continue;

  // 공용/그룹 계정·입사일 없음 → 잔액 0
  if (isGroupAccount(s)) {
    const bal = balByStaff.get(String(s.id));
    if (bal?.id) {
      balUpdates.push(
        `UPDATE leave_balances SET total_days=0, used_days=0, remaining_days=0, expired_days=0, compensated_days=0, updated_at=datetime('now') WHERE id=${sqlStr(bal.id)};`,
      );
    } else {
      balInserts.push(
        `INSERT INTO leave_balances (id, staff_id, year, total_days, used_days, remaining_days, expired_days, compensated_days, created_at, updated_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(s.id)}, ${YEAR}, 0, 0, 0, 0, 0, datetime('now'), datetime('now'));`,
      );
    }
    staffUpdates.push(
      `UPDATE staff_members SET annual_leave_total=0, annual_leave_used=0 WHERE id=${sqlStr(s.id)};`,
    );
    balanceReport.push({
      name: s.name,
      department: s.department,
      company: s.company,
      hire: '(group)',
      cycleYears: 0,
      total: 0,
      used: 0,
      remaining: 0,
    });
    continue;
  }

  const hireKey = String(s.hire_date ?? s.join_date ?? s.joined_at ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireKey)) {
    // no hire → zero out balances
    const bal = balByStaff.get(String(s.id));
    if (bal?.id) {
      balUpdates.push(
        `UPDATE leave_balances SET total_days=0, used_days=0, remaining_days=0, expired_days=0, compensated_days=0, updated_at=datetime('now') WHERE id=${sqlStr(bal.id)};`,
      );
    }
    staffUpdates.push(
      `UPDATE staff_members SET annual_leave_total=0, annual_leave_used=0 WHERE id=${sqlStr(s.id)};`,
    );
    continue;
  }

  const cycle = getLeaveCycle(hireKey, TODAY);
  if (!cycle) continue;

  const rows = ledgerByStaff.get(String(s.id)) || [];
  let total = 0;
  let used = 0;
  let expired = 0;
  let compensated = 0;
  let remainingRaw = 0;

  for (const entry of rows) {
    const periodKey = String(entry.period_key || '');
    if (periodKey.startsWith('auto-seed:')) continue;
    const occurredOn = String(entry.occurred_on || '').slice(0, 10);
    const entryType = String(entry.entry_type || '');
    const isManual =
      entryType === 'manual_adjustment' ||
      entryType === 'manual_used_adjustment' ||
      entryType === 'manual_expire_adjustment' ||
      entryType === 'manual_compensate_adjustment' ||
      entryType === 'initial_grant';
    if (!isManual && occurredOn && !isWithinCycle(occurredOn, cycle)) continue;

    const days = Number(entry.days) || 0;
    remainingRaw += days;
    if (entryType === 'use' || entryType === 'manual_used_adjustment') used += -days;
    else if (entryType === 'expire' || entryType === 'manual_expire_adjustment') expired += -days;
    else if (entryType === 'compensate' || entryType === 'manual_compensate_adjustment') compensated += -days;
    else total += days;
  }

  const finalTotal = roundDays(Math.max(0, total));
  const finalUsed = roundDays(Math.max(0, used));
  const finalExpired = roundDays(Math.max(0, expired));
  const finalCompensated = roundDays(Math.max(0, compensated));
  const finalRemaining = roundDays(Math.max(0, remainingRaw));

  const bal = balByStaff.get(String(s.id));
  if (bal?.id) {
    balUpdates.push(
      `UPDATE leave_balances SET total_days=${finalTotal}, used_days=${finalUsed}, remaining_days=${finalRemaining}, expired_days=${finalExpired}, compensated_days=${finalCompensated}, updated_at=datetime('now') WHERE id=${sqlStr(bal.id)};`,
    );
  } else {
    balInserts.push(
      `INSERT INTO leave_balances (id, staff_id, year, total_days, used_days, remaining_days, expired_days, compensated_days, created_at, updated_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(s.id)}, ${YEAR}, ${finalTotal}, ${finalUsed}, ${finalRemaining}, ${finalExpired}, ${finalCompensated}, datetime('now'), datetime('now'));`,
    );
  }
  staffUpdates.push(
    `UPDATE staff_members SET annual_leave_total=${finalTotal}, annual_leave_used=${finalUsed} WHERE id=${sqlStr(s.id)};`,
  );

  balanceReport.push({
    name: s.name,
    department: s.department,
    company: s.company,
    hire: hireKey,
    cycleYears: cycle.completedYears,
    total: finalTotal,
    used: finalUsed,
    remaining: finalRemaining,
  });
}

balanceReport.sort((a, b) => a.hire.localeCompare(b.hire));
console.log('\n[balances] staff cycle totals:');
for (const r of balanceReport) {
  console.log(
    `  ${r.name} | ${r.department || '-'} | hire=${r.hire} | y=${r.cycleYears} | 부여=${r.total} 사용=${r.used} 잔여=${r.remaining}`,
  );
}

if (DRY) {
  console.log(`[dry-run] would update balances=${balUpdates.length + balInserts.length} staff_fields=${staffUpdates.length}`);
} else {
  const statements = [...balUpdates, ...balInserts, ...staffUpdates];
  const batchSize = 25;
  for (let i = 0; i < statements.length; i += batchSize) {
    const chunk = statements.slice(i, i + batchSize);
    d1File(chunk.join('\n'));
    console.log(`[balances write] ${i + 1}-${Math.min(i + batchSize, statements.length)}/${statements.length}`);
  }
}

// ── final verify ──────────────────────────────────────────────────
if (!DRY) {
  const afterLedger = d1Query(
    `SELECT entry_type, COUNT(1) as cnt, ROUND(SUM(days),2) as sum_days FROM leave_ledger GROUP BY entry_type ORDER BY cnt DESC`,
  );
  const afterAccruals = d1Query(
    `SELECT kind, COUNT(1) as cnt, ROUND(SUM(days),2) as sum_days FROM leave_accruals GROUP BY kind`,
  );
  const sample = d1Query(
    `SELECT name, hire_date, join_date, joined_at, annual_leave_total, annual_leave_used FROM staff_members WHERE name IN ('박은수','이미영','박은빈','백민','이나림','백정민','김이지') ORDER BY name`,
  );
  console.log('\n[after] leave_ledger', afterLedger);
  console.log('[after] leave_accruals', afterAccruals);
  console.log('[after] sample staff', sample);
}

const reportPath = join(ROOT, 'tmp/_full_leave_recalc_report.json');
writeFs(
  reportPath,
  JSON.stringify(
    {
      today: TODAY,
      dry: DRY,
      grantCount: grantInserts.length,
      useCount: useInserts.length,
      balances: balanceReport,
      grants: grantReport,
    },
    null,
    2,
  ),
  'utf8',
);
console.log(`\nReport: ${reportPath}`);
console.log(DRY ? '=== DRY RUN complete ===' : '=== FULL RECALC complete ===');

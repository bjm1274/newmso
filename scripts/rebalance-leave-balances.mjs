/**
 * leave_balances 당해 연도 재계산 (원격 D1)
 * - total: leave_accruals (annual 최신 N년차 days, 없으면 monthly 합, 없으면 staff fallback)
 * - used: leave_requests 당해 승인 연차/반차 (연차(부여) 제외)
 * - remaining: max(0, total - used - expired - compensated)
 * - staff_members 필드는 수정하지 않음
 *
 * Usage: node scripts/rebalance-leave-balances.mjs [--year=2026] [--dry-run]
 */
import { execSync } from 'node:child_process';
// 전역 crypto 에 기대지 않고 명시 임포트 — Node 19 미만에서는 노출되지 않는다.
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { d1Query as sharedD1Query, extractJson } from './_lib/d1.mjs';

const args = process.argv.slice(2);
const yearArg = args.find((a) => a.startsWith('--year='));
const YEAR = yearArg ? Number(yearArg.split('=')[1]) : new Date().getFullYear();
const DRY = args.includes('--dry-run');
/** 퇴사자 포함 전 직원 leave_balances 재계산 */
const ALL = args.includes('--all') || !args.includes('--active-only');
/** 재직자 staff_members.annual_leave_* 를 당해 leave_balances 와 동기화 */
const SYNC_STAFF = args.includes('--sync-staff');
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
const WORK = mkdtempSync(join(tmpdir(), 'leave-rebalance-'));

/**
 * SELECT 결과는 --command 로 받아야 행 데이터가 옴 (--file 은 요약만 반환).
 * 공통 헬퍼는 셸을 거치지 않는다 — 예전 방식은 SQL 의 `%VAR%` 가 cmd.exe 에서
 * 환경변수로 치환돼 조건이 조용히 바뀌었다. 자세한 내용은 scripts/_lib/d1.mjs 참고.
 */
function d1Query(commandSql) {
  return sharedD1Query(commandSql, { db: DB });
}

function d1File(sql) {
  const path = join(WORK, `w-${Date.now()}.sql`);
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

function isHalf(leaveType) {
  const n = String(leaveType ?? '').trim().toLowerCase();
  return (
    n === 'half_leave' ||
    n === 'half-day' ||
    n === '반차' ||
    n === '오전반차' ||
    n === '오후반차' ||
    n.startsWith('반차') ||
    n.endsWith('반차') ||
    n.includes('반차')
  );
}

function isAnnual(leaveType) {
  const n = String(leaveType ?? '').trim().toLowerCase();
  if (!n || n.includes('부여')) return false;
  return (
    n === 'annual_leave' ||
    n === 'annual' ||
    n === '연차' ||
    n === '연차/휴가' ||
    n.includes('연차')
  );
}

function isApproved(status) {
  const n = String(status ?? '').trim().toLowerCase();
  return n === '승인' || n === 'approved';
}

function leaveDays(startDate, endDate) {
  if (!startDate) return 0;
  const start = new Date(String(startDate).slice(0, 10) + 'T00:00:00');
  const end = new Date(String(endDate || startDate).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end.getTime() < start.getTime()) return 1;
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
}

function clipToYear(startDate, endDate, year) {
  if (!startDate) return null;
  const start = new Date(String(startDate).slice(0, 10) + 'T00:00:00');
  const end = new Date(String(endDate || startDate).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const yStart = new Date(`${year}-01-01T00:00:00`);
  const yEnd = new Date(`${year}-12-31T23:59:59`);
  const rangeStart = new Date(Math.max(start.getTime(), yStart.getTime()));
  const rangeEnd = new Date(Math.min(end.getTime(), yEnd.getTime()));
  if (rangeStart.getTime() > rangeEnd.getTime()) return null;
  return { start: rangeStart, end: rangeEnd };
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeUsed(rows, year) {
  return rows.reduce((sum, row) => {
    if (!isApproved(row.status)) return sum;
    if (String(row.leave_type) === '연차(부여)') return sum;
    const half = isHalf(row.leave_type);
    if (!half && !isAnnual(row.leave_type)) return sum;
    const clipped = clipToYear(row.start_date, row.end_date, year);
    if (!clipped) return sum;
    if (half) return sum + 0.5;
    const startY = String(row.start_date || '').slice(0, 4);
    const endY = String(row.end_date || row.start_date || '').slice(0, 4);
    const dbDays = row.days != null ? Number(row.days) : null;
    if (
      startY === String(year) &&
      endY === String(year) &&
      dbDays != null &&
      !Number.isNaN(dbDays)
    ) {
      return sum + dbDays;
    }
    return sum + leaveDays(fmtDate(clipped.start), fmtDate(clipped.end));
  }, 0);
}

function resolveGranted(accruals, staffTotal) {
  const annuals = accruals
    .filter((r) => r.kind === 'annual')
    .map((r) => ({
      n: Number(String(r.period_key || '').replace('annual:', '')) || 0,
      days: Number(r.days) || 0,
    }))
    .filter((r) => r.n >= 1)
    .sort((a, b) => b.n - a.n);
  if (annuals.length > 0) {
    return { totalDays: annuals[0].days, source: 'annual' };
  }
  const monthlySum = accruals
    .filter((r) => r.kind === 'monthly')
    .reduce((s, r) => s + (Number(r.days) || 0), 0);
  if (monthlySum > 0) return { totalDays: monthlySum, source: 'monthly' };
  if (staffTotal > 0) return { totalDays: staffTotal, source: 'staff_fallback' };
  return { totalDays: 0, source: 'zero' };
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

console.log(
  `=== leave_balances rebalance year=${YEAR} dry=${DRY} all=${ALL} syncStaff=${SYNC_STAFF} ===`,
);

// status filter in JS (avoid UTF-8 Korean in --command)
const allStaffs = d1Query(
  `SELECT id, name, annual_leave_total, annual_leave_used, status FROM staff_members`,
);
function isActiveStatus(st) {
  const s = String(st ?? '').trim();
  return !s || s === '재직' || s === 'active';
}
const staffs = ALL
  ? allStaffs
  : allStaffs.filter((s) => isActiveStatus(s.status));
const balances = d1Query(
  `SELECT id, staff_id, year, total_days, used_days, remaining_days, expired_days, compensated_days FROM leave_balances WHERE year = ${YEAR}`,
);
const accruals = d1Query(
  `SELECT staff_id, kind, period_key, days FROM leave_accruals`,
);
const requests = d1Query(
  `SELECT staff_id, leave_type, start_date, end_date, status, days FROM leave_requests`,
);

const balByStaff = new Map(balances.map((b) => [String(b.staff_id), b]));
const accrualsByStaff = new Map();
for (const a of accruals) {
  const k = String(a.staff_id);
  if (!accrualsByStaff.has(k)) accrualsByStaff.set(k, []);
  accrualsByStaff.get(k).push(a);
}
const reqByStaff = new Map();
for (const r of requests) {
  const k = String(r.staff_id);
  if (!reqByStaff.has(k)) reqByStaff.set(k, []);
  reqByStaff.get(k).push(r);
}

const updates = [];
const inserts = [];
const staffUpdates = [];
const report = [];

for (const s of staffs) {
  const sid = String(s.id);
  const granted = resolveGranted(
    accrualsByStaff.get(sid) || [],
    Number(s.annual_leave_total) || 0,
  );
  const totalDays = granted.totalDays;
  const usedDays = computeUsed(reqByStaff.get(sid) || [], YEAR);
  const bal = balByStaff.get(sid);
  const expired = Number(bal?.expired_days) || 0;
  const compensated = Number(bal?.compensated_days) || 0;
  const remaining = Math.max(0, totalDays - usedDays - expired - compensated);

  const prevTotal = bal ? Number(bal.total_days) || 0 : null;
  const prevUsed = bal ? Number(bal.used_days) || 0 : null;
  const prevRem = bal ? Number(bal.remaining_days) || 0 : null;

  const balChanged =
    !bal ||
    Math.abs(prevTotal - totalDays) > 0.01 ||
    Math.abs(prevUsed - usedDays) > 0.01 ||
    Math.abs(prevRem - remaining) > 0.01;

  if (balChanged) {
    report.push({
      name: s.name,
      status: s.status,
      prev: { total: prevTotal, used: prevUsed, remaining: prevRem },
      next: { total: totalDays, used: usedDays, remaining, expired, source: granted.source },
    });
    // 시각은 datetime('now') — leave_balances.created_at/updated_at 은 앱 쪽에서
    // 아무도 값을 넣지 않아 전 행이 DEFAULT (CURRENT_TIMESTAMP) 의 공백형(UTC)이다.
    // 예전에는 이 스크립트만 toISOString() 의 ISO 를 넣어 같은 컬럼에 두 형식이
    // 섞였고, TEXT 사전순 비교에서 ' '(0x20) < 'T'(0x54) 라 정렬이 어긋났다(8차 D11-017).
    if (bal?.id) {
      updates.push(
        `UPDATE leave_balances SET total_days=${totalDays}, used_days=${usedDays}, remaining_days=${remaining}, expired_days=${expired}, compensated_days=${compensated}, updated_at=datetime('now') WHERE id='${esc(bal.id)}';`,
      );
    } else {
      const id = randomUUID();
      inserts.push(
        `INSERT INTO leave_balances (id, staff_id, year, total_days, used_days, remaining_days, expired_days, compensated_days, created_at, updated_at) VALUES ('${id}', '${esc(sid)}', ${YEAR}, ${totalDays}, ${usedDays}, ${remaining}, ${expired}, ${compensated}, datetime('now'), datetime('now'));`,
      );
    }
  }

  // 재직자 명단 필드를 당해 잔액과 맞춤 (구성원현황 등 레거시 화면 정합)
  if (SYNC_STAFF && isActiveStatus(s.status)) {
    const stTotal = Number(s.annual_leave_total) || 0;
    const stUsed = Number(s.annual_leave_used) || 0;
    if (Math.abs(stTotal - totalDays) > 0.01 || Math.abs(stUsed - usedDays) > 0.01) {
      staffUpdates.push(
        `UPDATE staff_members SET annual_leave_total=${totalDays}, annual_leave_used=${usedDays} WHERE id='${esc(sid)}';`,
      );
    }
  }
}

console.log(`Staff scope: ${staffs.length}`);
console.log(`leave_balances changed: ${report.length}`);
console.log(`staff_members sync pending: ${staffUpdates.length}`);
for (const r of report.slice(0, 50)) {
  console.log(
    `  ${r.name}(${r.status || '재직'}): total ${r.prev.total}→${r.next.total} used ${r.prev.used}→${r.next.used} remain ${r.prev.remaining}→${r.next.remaining} (${r.next.source})`,
  );
}
if (report.length > 50) console.log(`  ... +${report.length - 50} more`);

if (DRY) {
  console.log('[dry-run] no writes');
  process.exit(0);
}

const statements = [...updates, ...inserts, ...staffUpdates];
if (statements.length === 0) {
  console.log('Nothing to update.');
  process.exit(0);
}

// batch in chunks of 20
const CHUNK = 20;
for (let i = 0; i < statements.length; i += CHUNK) {
  const chunk = statements.slice(i, i + CHUNK);
  console.log(`Writing ${i + 1}–${Math.min(i + CHUNK, statements.length)} / ${statements.length}...`);
  d1File(chunk.join('\n'));
}

console.log(
  `Done. leave_balances: ${updates.length + inserts.length}, staff_members: ${staffUpdates.length}.`,
);

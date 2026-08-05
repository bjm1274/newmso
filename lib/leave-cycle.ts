/**
 * 연차 주기(입사일 기준) 계산과 원장 집계 — **순수 함수만** 모은 모듈.
 *
 * 이 파일이 따로 생긴 이유:
 * 예전에는 주기 계산과 원장 집계가 lib/unified-leave-ledger.ts 안에만 있었다.
 * 그 파일은 최상단에서 `@/lib/db`(D1 바인딩)를 import 하므로 클라이언트에서
 * 불러올 수 없었고, 그래서 PC 연차 워크센터는 **자기만의 집계 로직**을 다시
 * 짜서 역년(1/1~12/31) 기준으로 계산했다. 같은 직원의 잔여연차가 PC 화면과
 * 모바일/개인 화면에서 서로 다르게 보인 원인이 이 중복 구현이다.
 *
 * 순수 계산을 여기로 내려 서버·클라이언트가 **같은 함수**를 쓰게 한다.
 * DB 접근이 필요한 함수는 계속 unified-leave-ledger.ts 에 둔다.
 */

export const LEAVE_LEDGER_ENTRY_TYPE = {
  AUTO_MONTHLY: 'auto_monthly',
  AUTO_ANNUAL: 'auto_annual',
  MANUAL_ADJUSTMENT: 'manual_adjustment',
  MANUAL_USED_ADJUSTMENT: 'manual_used_adjustment',
  MANUAL_EXPIRE_ADJUSTMENT: 'manual_expire_adjustment',
  MANUAL_COMPENSATE_ADJUSTMENT: 'manual_compensate_adjustment',
  USE: 'use',
  SUBSTITUTE: 'substitute',
  EXPIRE: 'expire',
  COMPENSATE: 'compensate',
} as const;

export type LeaveLedgerEntryType = (typeof LEAVE_LEDGER_ENTRY_TYPE)[keyof typeof LEAVE_LEDGER_ENTRY_TYPE];

export type LeaveCycle = {
  key: string;
  start: string;
  end: string;
  completedYears: number;
};

export type UnifiedLeaveLedgerEntry = {
  id: string;
  entryType: string;
  days: number;
  occurredOn: string;
  periodKey: string;
  sourceId: string | null;
  note: string | null;
};

type Ymd = { year: number; month: number; day: number };

export function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toDateKey(value: string | null | undefined): string | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!matched) return null;
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

function parseDateKey(value: string): Ymd | null {
  const key = toDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function addYearsToDateKey(value: string, years: number): string | null {
  const parsed = parseDateKey(value);
  if (!parsed) return null;
  const targetYear = parsed.year + years;
  const targetDay = Math.min(parsed.day, daysInMonth(targetYear, parsed.month));
  return `${targetYear}-${String(parsed.month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function completedLeaveYears(hireDate: string, asOfDate: string): number {
  const hire = parseDateKey(hireDate);
  const asOf = parseDateKey(asOfDate);
  if (!hire || !asOf) return 0;
  let years = asOf.year - hire.year;
  if (asOf.month < hire.month || (asOf.month === hire.month && asOf.day < hire.day)) years -= 1;
  return Math.max(0, years);
}

export function getLeaveCycle(hireDate: string, asOfDate: string): LeaveCycle | null {
  const hire = toDateKey(hireDate);
  const asOf = toDateKey(asOfDate);
  if (!hire || !asOf) return null;

  if (hire > asOf) {
    const end = addYearsToDateKey(hire, 1) ?? `${asOf.slice(0, 4)}-12-31`;
    return {
      key: `first-year:${hire}`,
      start: hire,
      end,
      completedYears: 0,
    };
  }

  const completedYears = completedLeaveYears(hire, asOf);
  const start = completedYears === 0 ? hire : addYearsToDateKey(hire, completedYears);
  const end = addYearsToDateKey(hire, completedYears + 1);
  if (!start || !end) return null;

  return {
    key: completedYears === 0 ? `first-year:${hire}` : `annual:${completedYears}:${start}`,
    start,
    end,
    completedYears,
  };
}

export function isWithinCycle(dateKey: string, cycle: LeaveCycle): boolean {
  return dateKey >= cycle.start && dateKey < cycle.end;
}

const MANUAL_ENTRY_TYPES: readonly string[] = [
  LEAVE_LEDGER_ENTRY_TYPE.MANUAL_ADJUSTMENT,
  LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT,
  LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT,
  LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT,
];

/** `manual:<cycle.key>:<필드>` 형태의 period_key 에서 주기 키를 뽑는다. 아니면 null. */
export function parseManualPeriodCycleKey(periodKey: string): string | null {
  if (!periodKey.startsWith('manual:')) return null;
  const rest = periodKey.slice('manual:'.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon <= 0) return null;
  return rest.slice(0, lastColon);
}

/**
 * 원장 행 하나가 주어진 주기의 집계에 포함되는지.
 *
 * 예전에는 `manual_*` 4종과 `initial_grant` 를 **주기 검사 없이 무조건** 통과시켰다.
 * 그런데 기록 쪽(setManualAnnualLeaveTarget)은 period_key 를
 * `manual:<주기키>:total` 처럼 주기별로 분리해 적는다 — 기록은 주기별, 집계는
 * 전주기라는 모순이었다. 그 결과 작년 주기에 넣은 +N 수동부여가 올해 총연차에
 * 계속 더해지고, 작년의 사용일수 보정이 올해 '사용일수'에 섞였다. 주기가 바뀔
 * 때마다 왜곡이 누적된다.
 *
 * 이제 수동조정은 period_key 의 주기 키로 판정한다. 주기 키가 없는 레거시/요청
 * 기반(`request:<id>`) 수동조정은 occurred_on 으로 주기를 판정한다.
 * `initial_grant`(마이그레이션 시드)만 주기와 무관하게 유지한다 — 이 값이 빠지면
 * 이관 이전 이력이 통째로 사라지기 때문이다.
 */
export function isLedgerEntryInCycle(
  entry: { entryType: string; periodKey: string; occurredOn: string },
  cycle: LeaveCycle,
): boolean {
  // 법정 자동 발생은 processAnnualLeaveAccrual / 백필 스크립트만 기록한다.
  // 조회 경로에서 1년 미만 11일 시드 등 write side-effect 를 두지 않는다.
  // (과거 auto-seed 잔존분은 집계에서 제외)
  if (entry.periodKey.startsWith('auto-seed:')) return false;
  if (entry.entryType === 'initial_grant') return true;
  if (MANUAL_ENTRY_TYPES.includes(entry.entryType)) {
    const manualCycleKey = parseManualPeriodCycleKey(entry.periodKey);
    if (manualCycleKey) return manualCycleKey === cycle.key;
    return isWithinCycle(entry.occurredOn, cycle);
  }
  return isWithinCycle(entry.occurredOn, cycle);
}

export type LedgerRowLike = {
  id: unknown;
  entry_type: unknown;
  days: unknown;
  occurred_on: string | null;
  period_key: unknown;
  source_id?: string | null;
  note?: string | null;
};

export type LedgerCycleTotals = {
  entries: UnifiedLeaveLedgerEntry[];
  total: number;
  used: number;
  expired: number;
  compensated: number;
  remaining: number;
};

/**
 * 원장 행을 한 주기 기준으로 집계한다.
 *
 * 요약 조회와 소멸 배치가 **같은 계산을 써야** 한다. 화면에 15일 남았다고
 * 보여주고 배치는 다른 수치로 소멸시키면 근거가 어긋나므로, 집계는 여기 한 곳에만 둔다.
 */
export function aggregateLedgerEntries(rows: LedgerRowLike[], cycle: LeaveCycle): LedgerCycleTotals {
  const entries = rows
    .map((row) => ({
      id: String(row.id),
      entryType: String(row.entry_type),
      days: Number(row.days) || 0,
      occurredOn: toDateKey(row.occurred_on) ?? '',
      periodKey: String(row.period_key),
      sourceId: row.source_id ?? null,
      note: row.note ?? null,
    }))
    .filter((row) => {
      if (!row.occurredOn) return false;
      return isLedgerEntryInCycle(row, cycle);
    });

  let total = 0;
  let used = 0;
  let expired = 0;
  let compensated = 0;
  let remainingRaw = 0;

  for (const entry of entries) {
    const days = Number(entry.days) || 0;
    remainingRaw += days;
    switch (entry.entryType) {
      case LEAVE_LEDGER_ENTRY_TYPE.USE:
      case LEAVE_LEDGER_ENTRY_TYPE.MANUAL_USED_ADJUSTMENT:
        used += -days;
        break;
      case LEAVE_LEDGER_ENTRY_TYPE.EXPIRE:
      case LEAVE_LEDGER_ENTRY_TYPE.MANUAL_EXPIRE_ADJUSTMENT:
        expired += -days;
        break;
      case LEAVE_LEDGER_ENTRY_TYPE.COMPENSATE:
      case LEAVE_LEDGER_ENTRY_TYPE.MANUAL_COMPENSATE_ADJUSTMENT:
        compensated += -days;
        break;
      default:
        total += days;
        break;
    }
  }

  return {
    entries,
    total: roundDays(total),
    used: roundDays(Math.max(0, used)),
    expired: roundDays(Math.max(0, expired)),
    compensated: roundDays(Math.max(0, compensated)),
    remaining: roundDays(Math.max(0, remainingRaw)),
  };
}

/** 입사일 후보(hire_date / join_date / joined_at) 중 첫 유효값의 날짜 키. */
export function resolveHireDateKey(staff: {
  hire_date?: unknown;
  join_date?: unknown;
  joined_at?: unknown;
}): string | null {
  return (
    toDateKey(staff.hire_date as string | null | undefined) ??
    toDateKey(staff.join_date as string | null | undefined) ??
    toDateKey(staff.joined_at as string | null | undefined)
  );
}

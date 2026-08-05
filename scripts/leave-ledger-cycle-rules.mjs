/**
 * 원장 집계에서 "어떤 행이 현재 주기에 들어가는가" 규칙 — 운영 스크립트 공용.
 *
 * 이 파일이 생긴 이유:
 * reset-leave-usage.mjs 와 full-recalc-leave-ledger.mjs 가 각자 "사이클과 무관하게
 * 보존할 entry_type" 목록을 들고 있었고, 그 목록이 서로 달랐다. reset 쪽은
 * `substitute` 를 무조건 보존했고 full-recalc 쪽은 보존 목록에 넣지 않아 사이클
 * 밖의 대체휴무를 총계에서 떨궜다. **어느 스크립트를 마지막에 돌렸는지에 따라
 * 같은 원장에서 다른 잔액이 나왔다.**
 *
 * 규칙의 SSOT 는 lib/leave-cycle.ts 의 isLedgerEntryInCycle 이다. 스크립트는
 * .mjs 라 TS 를 직접 import 할 수 없어 같은 규칙을 여기 한 곳에 옮겨 둔다.
 * 한쪽을 고치면 다른 쪽도 함께 고칠 것.
 */

const MANUAL_ENTRY_TYPES = [
  'manual_adjustment',
  'manual_used_adjustment',
  'manual_expire_adjustment',
  'manual_compensate_adjustment',
];

/** `manual:<주기키>:<필드>` 에서 주기 키를 뽑는다. 아니면 null. */
export function parseManualPeriodCycleKey(periodKey) {
  const key = String(periodKey || '');
  if (!key.startsWith('manual:')) return null;
  const rest = key.slice('manual:'.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon <= 0) return null;
  return rest.slice(0, lastColon);
}

export function isWithinCycle(dateKey, cycle) {
  return dateKey >= cycle.start && dateKey < cycle.end;
}

/**
 * 원장 행 하나가 주어진 주기 집계에 포함되는지.
 * lib/leave-cycle.ts 의 isLedgerEntryInCycle 과 동일한 판정이어야 한다.
 */
export function isLedgerEntryInCycle(entry, cycle) {
  const periodKey = String(entry.period_key || entry.periodKey || '');
  const entryType = String(entry.entry_type || entry.entryType || '');
  const occurredOn = String(entry.occurred_on || entry.occurredOn || '').slice(0, 10);

  if (periodKey.startsWith('auto-seed:')) return false;
  // 마이그레이션 시드는 주기와 무관하게 유지한다(빠지면 이관 이전 이력이 사라진다).
  if (entryType === 'initial_grant') return true;
  if (MANUAL_ENTRY_TYPES.includes(entryType)) {
    const manualCycleKey = parseManualPeriodCycleKey(periodKey);
    if (manualCycleKey) return manualCycleKey === cycle.key;
    return !occurredOn || isWithinCycle(occurredOn, cycle);
  }
  return !occurredOn || isWithinCycle(occurredOn, cycle);
}

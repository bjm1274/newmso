/**
 * Compatibility facade for the unified leave ledger.
 *
 * No annual leave number is written to staff_members or leave_balances here.
 * The only source of truth is leave_ledger.
 */

import {
  getUnifiedAnnualLeaveSummary,
  syncApprovedLeaveRequestsToLedger,
  type UnifiedLeaveSummary,
} from '@/lib/unified-leave-ledger';
import { formatKoreanDateKey } from '@/lib/seoul-time';

export type RecalcOverrides = {
  totalDays?: number;
  usedDays?: number;
  expiredDays?: number;
  compensatedDays?: number;
};

export async function resolveGrantedDaysFromAccruals(
  staffId: string,
  _fallbackTotal = 0,
): Promise<{ totalDays: number; source: 'ledger' | 'zero' }> {
  const summary = await getUnifiedAnnualLeaveSummary(staffId);
  return {
    totalDays: summary.total,
    source: summary.total > 0 ? 'ledger' : 'zero',
  };
}

/**
 * Historical name retained for callers. It synchronizes approved requests into
 * the unified ledger and returns the ledger-derived current-cycle summary.
 */
export async function recalculateLeaveBalance(
  staffId: string,
  year?: number,
  overrides?: RecalcOverrides,
): Promise<UnifiedLeaveSummary> {
  if (overrides && Object.values(overrides).some((value) => value !== undefined)) {
    throw new Error('Use setManualAnnualLeaveTarget for manual leave changes.');
  }
  // 기준일은 **오늘을 넘지 않는다.**
  //
  // 예전에는 year 가 오면 무조건 `${year}-12-31` 을 기준일로 썼다. 주기는 기준일의
  // 근속 완료 연수로 잡히므로, 입사기념일이 오늘 이후·연말 이전인 직원은
  // completedYears 가 1 커져 **아직 시작하지 않은 미래 주기**가 선택됐다. 그 창에는
  // auto_annual 원장이 아직 없어 total 이 0 으로 나왔고, 요약이 그 0 으로
  // staff_members·leave_balances 미러를 덮어썼다. 이 라우트는 관리자 배치가 아니라
  // 마이페이지·휴가관리·워크센터가 일상적으로 부르는 경로라 매번 밟혔다.
  const todayKey = formatKoreanDateKey(new Date());
  const requestedKey = year === undefined ? todayKey : `${year}-12-31`;
  const asOfDate = requestedKey > todayKey ? todayKey : requestedKey;
  await syncApprovedLeaveRequestsToLedger(staffId, asOfDate);
  return getUnifiedAnnualLeaveSummary(staffId, asOfDate);
}

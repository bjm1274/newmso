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
  const asOfDate = year === undefined
    ? formatKoreanDateKey(new Date())
    : `${year}-12-31`;
  await syncApprovedLeaveRequestsToLedger(staffId, asOfDate);
  return getUnifiedAnnualLeaveSummary(staffId, asOfDate);
}

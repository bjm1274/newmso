'use client';

import {
  buildBlockedDatesByStaff,
  buildPreferredOffDateMap,
  countBlockedDateEntries,
  mergeBlockedDateMaps,
  type PreferredOffSelectionMap,
} from '@/lib/roster-date-utils';
import { supabase } from '@/lib/supabase';

export async function loadRosterBlockedDateContext({
  monthDates,
  preferredOffSelections,
  targetStaffIds,
}: {
  monthDates: string[];
  preferredOffSelections: PreferredOffSelectionMap;
  targetStaffIds: string[];
}) {
  const monthDateSet = new Set(monthDates);
  const targetStaffIdSet = new Set(targetStaffIds);
  let approvedLeaveRequestCount = 0;
  let approvedLeaveDayCount = 0;
  let approvedLeaveBlockedDatesByStaff = new Map<string, Set<string>>();

  if (targetStaffIds.length > 0 && monthDates.length > 0) {
    const { data: approvedLeaves, error: approvedLeavesError } = await supabase
      .from('leave_requests')
      .select('staff_id, start_date, end_date')
      .eq('status', '승인')
      .in('staff_id', targetStaffIds)
      .lte('start_date', monthDates[monthDates.length - 1])
      .gte('end_date', monthDates[0]);

    if (approvedLeavesError) {
      console.error('승인 휴가 반영 데이터 로드 실패:', approvedLeavesError);
    } else {
      approvedLeaveBlockedDatesByStaff = buildBlockedDatesByStaff(
        (approvedLeaves || []) as Array<{
          end_date: string;
          staff_id: string;
          start_date: string;
        }>,
        monthDateSet
      );
      approvedLeaveRequestCount = (approvedLeaves || []).length;
      approvedLeaveDayCount = countBlockedDateEntries(
        approvedLeaveBlockedDatesByStaff
      );
    }
  }

  const preferredOffBlockedDatesByStaff = buildPreferredOffDateMap(
    preferredOffSelections,
    targetStaffIdSet,
    monthDateSet
  );
  const preferredOffDateCount = countBlockedDateEntries(
    preferredOffBlockedDatesByStaff
  );
  const blockedDatesByStaff = mergeBlockedDateMaps(
    approvedLeaveBlockedDatesByStaff,
    preferredOffBlockedDatesByStaff
  );

  return {
    approvedLeaveBlockedDatesByStaff,
    approvedLeaveDayCount,
    approvedLeaveRequestCount,
    blockedDatesByStaff,
    monthDateSet,
    preferredOffBlockedDatesByStaff,
    preferredOffDateCount,
    targetStaffIdSet,
  };
}

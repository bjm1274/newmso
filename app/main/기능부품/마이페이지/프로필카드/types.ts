import type { StaffMember } from '@/types';

export type ProfileCardUser = Partial<StaffMember> &
  Record<string, unknown> & {
    permissions?: Record<string, unknown> | null;
  };

export type ProfileCardProps = {
  user?: ProfileCardUser | null;
  onOpenApproval?: (options?: Record<string, unknown>) => void;
  hideHeader?: boolean;
  hideActionBar?: boolean;
  showSecret?: boolean;
  setShowSecret?: (nextValue: boolean) => void;
  isEditing?: boolean;
  setIsEditing?: (nextValue: boolean) => void;
};

export type AnnualLeaveStaffRow = {
  id?: string;
  annual_leave_total?: number | null;
  annual_leave_used?: number | null;
};

export type ApprovedLeaveRow = {
  leave_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
};

export type CommuteStatusRow = {
  date?: string | null;
  status?: string | null;
};

export type TodayAttendanceStatusRow = {
  status?: string | null;
};

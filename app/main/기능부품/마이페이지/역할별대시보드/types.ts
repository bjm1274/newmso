export interface Props {
  user: Record<string, unknown>;
  setMainMenu?: (menu: string) => void;
  onOpenApproval?: (options?: Record<string, unknown>) => void;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
}

export type ApprovalRow = Record<string, unknown>;

export type PendingApprovalItem = {
  id: string;
  title: string;
  department: string;
  created_at: string;
};

export type TodayAttendance = {
  in: string | null;
  out: string | null;
  status: string | null;
};

export type AnnualLeaveSummary = {
  remaining: number;
  total: number;
};

export type BirthdayStaffItem = {
  name: string;
  daysUntil: number;
};

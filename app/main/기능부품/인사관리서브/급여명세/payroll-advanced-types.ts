import type { PayrollPolicySnapshot } from '@/lib/payroll-governance';

export type BonusItem = {
  id: string;
  staffId: string;
  companyName: string;
  yearMonth: string;
  category: string;
  amount: number;
  note: string;
};

export type RetroItem = {
  id: string;
  staffId: string;
  companyName: string;
  startMonth: string;
  endMonth: string;
  beforeBase: number;
  afterBase: number;
  retroTotal: number;
  reason: string;
};

export type DeductionItem = {
  id: string;
  staffId: string;
  companyName: string;
  type: string;
  monthlyAmount: number;
  balance: number;
  note: string;
  active: boolean;
};

export type FreelancerItem = {
  id: string;
  companyName: string;
  yearMonth: string;
  vendorName: string;
  workType: string;
  paymentDate: string;
  supplyAmount: number;
  taxRate: number;
  withholdingTax: number;
  note: string;
};

export type CalendarItem = {
  id: string;
  companyName: string;
  yearMonth: string;
  title: string;
  dueDate: string;
  owner: string;
  status: '대기' | '진행' | '완료';
  sortOrder: number;
};

export type ApprovalState = {
  id?: string;
  step1Status: '대기' | '승인' | '보류';
  step2Status: '대기' | '승인' | '보류';
  step1Comment: string;
  step2Comment: string;
  step1ActorId?: string | null;
  step2ActorId?: string | null;
  step1UpdatedAt?: string | null;
  step2UpdatedAt?: string | null;
  updatedAt?: string | null;
};

export type ApprovalLog = {
  id: string;
  yearMonth: string;
  company: string;
  actor: string;
  action: string;
  comment: string;
  createdAt: string;
};

export type PayrollPolicyVersionRow = {
  id: string;
  company_name: string;
  effective_year: number;
  version_label: string;
  note: string | null;
  created_at: string;
  snapshot: PayrollPolicySnapshot | null;
};

export type BonusItemRow = {
  id?: string | null;
  staff_id?: string | null;
  company_name?: string | null;
  year_month?: string | null;
  category?: string | null;
  amount?: number | null;
  note?: string | null;
};

export type RetroItemRow = {
  id?: string | null;
  staff_id?: string | null;
  company_name?: string | null;
  start_month?: string | null;
  end_month?: string | null;
  before_base?: number | null;
  after_base?: number | null;
  retro_total?: number | null;
  reason?: string | null;
};

export type DeductionItemRow = {
  id?: string | null;
  staff_id?: string | null;
  company_name?: string | null;
  deduction_type?: string | null;
  monthly_amount?: number | null;
  balance?: number | null;
  note?: string | null;
  is_active?: boolean | null;
};

export type FreelancerItemRow = {
  id?: string | null;
  company_name?: string | null;
  year_month?: string | null;
  vendor_name?: string | null;
  work_type?: string | null;
  payment_date?: string | null;
  supply_amount?: number | null;
  tax_rate?: number | null;
  withholding_tax?: number | null;
  note?: string | null;
};

export type CalendarItemRow = {
  id?: string | null;
  company_name?: string | null;
  year_month?: string | null;
  title?: string | null;
  due_date?: string | null;
  owner_label?: string | null;
  status?: CalendarItem['status'] | null;
  sort_order?: number | null;
};

export type ApprovalWorkflowRow = {
  id?: string | null;
  step1_status?: ApprovalState['step1Status'] | null;
  step2_status?: ApprovalState['step2Status'] | null;
  step1_comment?: string | null;
  step2_comment?: string | null;
  step1_actor_id?: string | null;
  step2_actor_id?: string | null;
  step1_updated_at?: string | null;
  step2_updated_at?: string | null;
  updated_at?: string | null;
};

export type ApprovalLogRow = {
  id?: string | null;
  year_month?: string | null;
  company_name?: string | null;
  actor_name?: string | null;
  action?: string | null;
  comment?: string | null;
  created_at?: string | null;
};

export type PayrollRecordSummaryRow = {
  staff_id?: string | null;
  total_taxable?: number | null;
  total_taxfree?: number | null;
  total_deduction?: number | null;
  net_pay?: number | null;
  deduction_detail?: Record<string, unknown> | null;
};

export const PAYROLL_BONUS_ITEM_SELECT = 'id, staff_id, company_name, year_month, category, amount, note';
export const PAYROLL_RETRO_ADJUSTMENT_SELECT =
  'id, staff_id, company_name, start_month, end_month, before_base, after_base, retro_total, reason';
export const PAYROLL_DEDUCTION_CONTROL_SELECT =
  'id, staff_id, company_name, deduction_type, monthly_amount, balance, note, is_active';
export const FREELANCER_PAYMENT_SELECT =
  'id, company_name, year_month, vendor_name, work_type, payment_date, supply_amount, tax_rate, withholding_tax, note';
export const PAYROLL_CALENDAR_ITEM_SELECT =
  'id, company_name, year_month, title, due_date, owner_label, status, sort_order';
export const PAYROLL_APPROVAL_WORKFLOW_SELECT =
  'id, step1_status, step2_status, step1_comment, step2_comment, step1_actor_id, step2_actor_id, step1_updated_at, step2_updated_at, updated_at';
export const PAYROLL_APPROVAL_LOG_SELECT =
  'id, year_month, company_name, actor_name, action, comment, created_at';
export const PAYROLL_RECORD_SUMMARY_SELECT =
  'staff_id, total_taxable, total_taxfree, total_deduction, net_pay, deduction_detail';
export const PAYROLL_POLICY_VERSION_SELECT =
  'id, company_name, effective_year, version_label, note, created_at, snapshot';

export const EMPTY_APPROVAL_STATE: ApprovalState = {
  step1Status: '대기',
  step2Status: '대기',
  step1Comment: '',
  step2Comment: '',
};

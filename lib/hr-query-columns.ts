import { buildSelectClause } from '@/lib/query-columns-utils';

const STAFF_LICENSE_COLUMNS = [
  'id',
  'staff_id',
  'license_name',
  'license_number',
  'issuing_body',
  'issued_date',
  'expiry_date',
  'memo',
  'created_at',
  'updated_at',
  'file_url',
  'attachment_url',
  'copy_url',
  'document_url',
  'document_file_url',
  'license_file_url',
];

export const STAFF_LICENSE_OPTIONAL_COLUMNS = [
  'updated_at',
  'file_url',
  'attachment_url',
  'copy_url',
  'document_url',
  'document_file_url',
  'license_file_url',
];

export function buildStaffLicenseSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(STAFF_LICENSE_COLUMNS, omittedColumns);
}

export const STAFF_LICENSE_SELECT = buildStaffLicenseSelect();

const EMPLOYMENT_CONTRACT_LIST_COLUMNS = [
  'id',
  'staff_id',
  'status',
  'contract_type',
  'requested_at',
  'signed_at',
  'signature_data',
  'base_salary',
  'meal_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'position_allowance',
  'research_allowance',
  'other_taxfree',
  'effective_date',
  'created_at',
  'updated_at',
  'conditions_applied_at',
  'contract_start_date',
  'shift_id',
  'shift_start_time',
  'shift_end_time',
  'break_start_time',
  'break_end_time',
  'probation_months',
  'working_hours_per_week',
  'working_days_per_week',
];

export const EMPLOYMENT_CONTRACT_OPTIONAL_COLUMNS = [
  'signature_data',
  'signed_at',
  'updated_at',
  'conditions_applied_at',
  'contract_start_date',
  'shift_id',
  'shift_start_time',
  'shift_end_time',
  'break_start_time',
  'break_end_time',
  'probation_months',
  'working_hours_per_week',
  'working_days_per_week',
];

export function buildEmploymentContractListSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return buildSelectClause(EMPLOYMENT_CONTRACT_LIST_COLUMNS, omittedColumns);
}

export const EMPLOYMENT_CONTRACT_LIST_SELECT = buildEmploymentContractListSelect();

export const HEALTH_CHECKUP_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'company',
  'department',
  'checkup_type',
  'scheduled_date',
  'completed_date',
  'status',
  'hospital',
  'result',
  'memo',
  'created_at',
].join(', ');

export const CONGRATULATION_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'company',
  'department',
  'event_type',
  'event_date',
  'amount',
  'relation',
  'recipient',
  'memo',
  'wreath_sent',
  'status',
  'created_at',
].join(', ');

export const STAFF_CERTIFICATION_SELECT = [
  'id',
  'staff_id',
  'name',
  'issuer',
  'issue_date',
  'expiry_date',
  'created_at',
].join(', ');

export const STAFF_TRANSFER_SELECT = [
  'id',
  'staff_id',
  'transfer_type',
  'before_value',
  'after_value',
  'effective_date',
  'created_at',
].join(', ');

export const INSURANCE_RECORD_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'company',
  'department',
  'type',
  'insurance_type',
  'reason',
  'effective_date',
  'reported_at',
  'status',
  'resident_no',
  'memo',
  'created_at',
].join(', ');

export const UNPAID_ABSENCE_RECORD_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'year_month',
  'absent_days',
  'monthly_salary',
  'working_days',
  'daily_wage',
  'deduction_amount',
  'note',
].join(', ');

export const INCIDENT_REPORT_SELECT = [
  'id',
  'incident_date',
  'incident_time',
  'location',
  'type',
  'severity',
  'description',
  'involved_persons',
  'immediate_action',
  'root_cause',
  'preventive_measures',
  'reporter_id',
  'reporter_name',
  'status',
  'created_at',
].join(', ');

export const LEAVE_BALANCE_SELECT = [
  'staff_id',
  'remaining_days',
  'balance',
  'expiry_date',
].join(', ');

export const PERSONNEL_APPOINTMENT_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'company',
  'order_type',
  'effective_date',
  'before_dept',
  'after_dept',
  'before_position',
  'after_position',
  'before_role',
  'after_role',
  'reason',
  'memo',
  'status',
  'issued_by',
  'issued_at',
].join(', ');

export const EARLY_LEAVE_RECORD_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'dept',
  'work_date',
  'scheduled_end',
  'actual_end',
  'early_minutes',
  'is_approved',
  'note',
  'company',
].join(', ');

export const LEAVE_REQUEST_SELECT = [
  'id',
  'staff_id',
  'leave_type',
  'start_date',
  'end_date',
  'reason',
  'status',
  'company_name',
  'approved_at',
  'created_at',
].join(', ');

export const LEAVE_CALENDAR_SELECT = [
  'id',
  'staff_id',
  'leave_type',
  'start_date',
  'end_date',
  'reason',
  'status',
  'staff_members(name)',
].join(', ');

export const WORK_TYPE_CHANGE_HISTORY_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'changed_date',
  'prev_type',
  'new_type',
  'reason',
  'approver',
  'company',
  'created_at',
].join(', ');

export const COMPANY_PROFILE_SELECT = [
  'name',
  'business_no',
  'ceo_name',
  'address',
  'phone',
].join(', ');

export const ASSET_LOAN_WITH_STAFF_SELECT = [
  'id',
  'staff_id',
  'asset_type',
  'asset_name',
  'loaned_at',
  'returned_at',
  'staff_members(name, company)',
].join(', ');

export const CERTIFICATE_ISSUANCE_HISTORY_SELECT = [
  'id',
  'staff_id',
  'cert_type',
  'serial_no',
  'purpose',
  'issued_at',
  'staff_members(name, company)',
].join(', ');

export const APPLICANT_PIPELINE_SELECT = [
  'id',
  'job_posting_id',
  'name',
  'email',
  'phone',
  'status',
  'applied_at',
  'notes',
  'job_postings(title)',
].join(', ');

export const INTERVIEW_SCHEDULE_SELECT = [
  'id',
  'applicant_id',
  'scheduled_at',
  'type',
  'status',
  'notes',
  'applicants(name)',
].join(', ');

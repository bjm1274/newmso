export const COMPANY_EXPENSE_SELECT = [
  'id',
  'company',
  'year_month',
  'rent',
  'materials',
  'utilities',
  'others',
].join(', ');

export const TEMPLATE_CATALOG_SELECT = [
  'id',
  'name',
  'sort_order',
  'is_active',
  'body_part',
].join(', ');

export const DAILY_CLOSURE_LIST_SELECT = [
  'id',
  'date',
  'total_amount',
  'petty_cash_start',
  'petty_cash_end',
  'status',
  'memo',
  'created_by',
  'company_id',
  'created_by_name',
  'created_at',
].join(', ');

export const DAILY_CLOSURE_ITEM_SELECT = [
  'id',
  'closure_id',
  'patient_name',
  'amount',
  'payment_method',
  'receipt_type',
  'memo',
  'created_at',
].join(', ');

export const DAILY_CHECK_SELECT = [
  'id',
  'closure_id',
  'check_number',
  'amount',
  'bank_name',
  'created_at',
].join(', ');

export const JOB_POSTING_LIST_SELECT = [
  'id',
  'title',
  'department',
  'position',
  'status',
  'created_at',
].join(', ');

export const REWARD_DISCIPLINE_SELECT = [
  'id',
  'staff_id',
  'staff_name',
  'category',
  'type',
  'date',
  'reason',
  'detail',
  'amount',
  'committee_date',
  'committee_members',
  'committee_result',
  'memo',
  'company',
  'department',
  'issued_by',
].join(', ');

export const DISCHARGE_TEMPLATE_SELECT = [
  'id',
  'title',
  'items',
].join(', ');

export const DISCHARGE_REVIEW_LIST_SELECT = [
  'id',
  'patient_name',
  'birth_date',
  'gender',
  'department',
  'admission_date',
  'discharge_date',
  'diagnosis',
  'template_id',
  'insurance_type',
  'surgery_name',
  'surgery_date',
  'room_grade',
  'doctor_name',
  'comorbidities',
  'disease_codes',
  'admission_route',
  'discharge_type',
  'drg_code',
  'items',
  'chart_data',
  'status',
  'reviewer_name',
  'reviewer_id',
  'ai_analysis',
  'created_at',
].join(', ');

export const AUDIT_LOG_VIEWER_SELECT = [
  'created_at',
  'action',
  'target_type',
  'target_id',
  'user_name',
].join(', ');

export const ACCESS_LOG_SELECT = [
  'id',
  'user_id',
  'user_name',
  'company',
  'menu',
  'action',
  'ip_address',
  'user_agent',
  'created_at',
].join(', ');

export const POPUP_LIST_SELECT = [
  'id',
  'title',
  'media_url',
  'media_type',
  'width',
  'height',
  'created_at',
].join(', ');

export const OFFICIAL_DOCUMENT_LOG_SELECT = [
  'id',
  'sent_date',
  'doc_number',
  'title',
  'recipient',
  'manager',
  'is_received',
  'note',
  'company',
].join(', ');

export const ORG_TEAM_LIST_SELECT = [
  'id',
  'company_name',
  'division',
  'team_name',
  'sort_order',
].join(', ');

export const ANNUAL_LEAVE_PROMOTION_LOG_SELECT = [
  'staff_id',
  'step',
].join(', ');

export const DAILY_CLOSURE_SUMMARY_SELECT = [
  'id',
  'date',
  'total_amount',
].join(', ');

export const APPROVAL_FORM_TYPE_SELECT = [
  'id',
  'name',
  'slug',
  'base_slug',
  'sort_order',
  'is_active',
  'created_at',
  'updated_at',
].join(', ');

export const CORPORATE_CARD_ACTIVE_SELECT = [
  'id',
  'company_name',
  'card_nickname',
  'last_four',
  'issuer',
  'holder_id',
  'status',
  'staff_members(name)',
].join(', ');

export const CORPORATE_CARD_TRANSACTION_SELECT = [
  'id',
  'card_id',
  'card_holder_id',
  'transaction_date',
  'merchant',
  'category',
  'amount',
  'description',
  'company_name',
  'staff_members(name)',
  'corporate_cards(card_nickname, last_four, company_name)',
].join(', ');

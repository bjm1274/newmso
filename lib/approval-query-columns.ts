
const APPROVAL_LIST_COLUMNS = [
  'id',
  'doc_number',
  'title',
  'content',
  'type',
  'status',
  'sender_id',
  'sender_name',
  'sender_department',
  'sender_company',
  'company_id',
  'current_approver_id',
  'approver_line',
  'meta_data',
  'created_at',
  'updated_at',
];

export const APPROVAL_OPTIONAL_COLUMNS = [
  'doc_number',
  'sender_department',
  'company_id',
  'approver_line',
  'updated_at',
];

export function buildApprovalSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return APPROVAL_LIST_COLUMNS.filter((column) => !omittedColumns.has(column)).join(', ');
}

export const APPROVAL_LIST_SELECT = buildApprovalSelect();

export const APPROVAL_DASHBOARD_SELECT = [
  'id',
  'title',
  'status',
  'sender_department',
  'sender_company',
  'current_approver_id',
  'approver_line',
  'meta_data',
  'created_at',
].join(', ');

export const APPROVAL_WORKFLOW_SELECT = [
  'id',
  'title',
  'status',
  'sender_id',
  'sender_company',
  'company_id',
  'meta_data',
  'created_at',
].join(', ');

export const APPROVAL_PURCHASE_ORDER_SELECT = [
  'id',
  'created_at',
  'status',
  'content',
  'meta_data',
].join(', ');

export const CUSTOM_FORM_TEMPLATE_SELECT = [
  'id',
  'name',
  'fields',
  'created_by',
  'created_at',
].join(', ');

export const COMPANY_SEAL_SELECT = [
  'id',
  'company',
  'type',
  'image_url',
  'is_active',
  'created_at',
].join(', ');

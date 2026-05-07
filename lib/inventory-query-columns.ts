const INVENTORY_LIST_COLUMNS = [
  'id',
  'item_name',
  'category',
  'barcode',
  'quantity',
  'stock',
  'min_quantity',
  'price',
  'unit_price',
  'supplier_id',
  'supplier_name',
  'supplier',
  'location',
  'expiry_date',
  'expiration_date',
  'company',
  'company_id',
  'department',
  'spec',
  'lot_number',
  'is_udi',
  'insurance_code',
  'udi_code',
];

export const INVENTORY_OPTIONAL_COLUMNS = [
  'code',
  'barcode',
  'serial_number',
  'unit',
  'stock',
  'min_stock',
  'unit_price',
  'supplier_id',
  'supplier_name',
  'location',
  'expiry_date',
  'expiration_date',
  'company_id',
  'spec',
  'lot_number',
  'is_udi',
  'insurance_code',
  'udi_code',
  'status',
  'notes',
  'updated_at',
];

export function buildInventorySelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return INVENTORY_LIST_COLUMNS.filter((column) => !omittedColumns.has(column)).join(', ');
}

export const INVENTORY_LIST_SELECT = buildInventorySelect();

export const PURCHASE_ORDER_LIST_SELECT = [
  'id',
  'created_at',
  'items',
  'status',
  'total_amount',
  'notes',
  'created_by',
].join(', ');

export const SUPPLIER_LIST_SELECT = [
  'id',
  'name',
  'contact',
  'phone',
  'email',
  'address',
  'business_number',
  'category',
  'contract_start',
  'contract_end',
  'payment_terms',
  'notes',
  'created_at',
  'updated_at',
  'contact_name',
].join(', ');

export const INVENTORY_LOG_LIST_SELECT = [
  'id',
  'item_id',
  'inventory_id',
  'type',
  'change_type',
  'quantity',
  'prev_quantity',
  'next_quantity',
  'actor_name',
  'company',
  'company_id',
  'serial_number',
  'lot_number',
  'expiry_date',
  'location',
  'unit_price',
  'supplier_name',
  'notes',
  'created_at',
].join(', ');

export const DELIVERY_CONFIRMATION_SELECT = [
  'id',
  'doc_number',
  'issue_date',
  'supplier_name',
  'supplier_rep',
  'receiver_company',
  'receiver_rep',
  'delivery_date',
  'notes',
  'items',
  'total_amount',
  'created_at',
].join(', ');

export const INVENTORY_CATEGORY_SELECT = [
  'id',
  'name',
  'parent_id',
  'description',
  'color',
].join(', ');

export const MEDICAL_DEVICE_SELECT = [
  'id',
  'name',
  'model',
  'serial',
  'category',
  'location',
  'cycle',
  'next_inspection_date',
  'last_inspection_date',
  'memo',
].join(', ');

export const DEVICE_INSPECTION_SELECT = [
  'id',
  'device_id',
  'device_name',
  'inspected_at',
  'inspector',
  'result',
  'notes',
  'next_inspection_date',
].join(', ');

export const INVENTORY_EXPIRY_SELECT = [
  'id',
  'item_id',
  'item_name',
  'quantity',
  'stock',
  'supplier',
  'supplier_name',
  'barcode',
  'expiration_date',
  'expiry_date',
].join(', ');

export const INVENTORY_LOG_DETAIL_SELECT = [
  'id',
  'item_id',
  'inventory_id',
  'type',
  'change_type',
  'quantity',
  'prev_quantity',
  'next_quantity',
  'actor_name',
  'company',
  'company_id',
  'serial_number',
  'lot_number',
  'expiry_date',
  'location',
  'unit_price',
  'supplier_name',
  'notes',
  'created_at',
].join(', ');

export const CONSUMABLE_STATS_LOG_SELECT = [
  'id',
  'item_id',
  'type',
  'change_type',
  'quantity',
  'company',
  'actor_name',
  'created_at',
].join(', ');

export const INVENTORY_TRANSFER_SELECT = [
  'id',
  'item_id',
  'item_name',
  'quantity',
  'from_company',
  'from_department',
  'to_company',
  'to_department',
  'reason',
  'transferred_by',
  'transferred_by_id',
  'status',
  'created_at',
].join(', ');

export const INVENTORY_TRANSFER_MATCH_SELECT = [
  'id',
  'item_name',
  'category',
  'spec',
  'lot_number',
  'company',
  'department',
  'quantity',
  'stock',
].join(', ');

export const INVENTORY_PRICE_HISTORY_SELECT = [
  'id',
  'inventory_item_id',
  'supplier_id',
  'unit_price',
  'quantity',
  'source_type',
  'recorded_at',
  'recorded_by',
  'supplier_name',
  'total_amount',
  'purchase_order_id',
  'notes',
].join(', ');

export const AS_REPAIR_RECORD_SELECT = [
  'id',
  'device_name',
  'model_name',
  'received_date',
  'problem_description',
  'company_name',
  'manager_name',
  'status',
  'created_at',
].join(', ');

export const RETURN_RECORD_SELECT = [
  'id',
  'item_name',
  'quantity',
  'return_reason',
  'company_name',
  'return_date',
  'status',
  'created_at',
].join(', ');

export const PATIENT_PRESCRIPTION_SELECT = [
  'patient_name',
  'patient_id',
  'item_name',
  'quantity',
  'unit_price',
  'total_amount',
  'date',
  'prescription_date',
  'status',
].join(', ');

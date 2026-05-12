// OP체크 상수 정의

export const SCHEDULE_META_PREFIX = '[[SCHEDULE_META]]';
export const SCHEDULE_META_SUFFIX = '[[/SCHEDULE_META]]';
export const WARD_MESSAGE_META_PREFIX = '[[WARD_MESSAGE_META]]';
export const WARD_MESSAGE_META_SUFFIX = '[[/WARD_MESSAGE_META]]';

export const STATUS_OPTIONS = ['준비중', '준비완료', '수술중', '완료'] as const;
export const ANESTHESIA_OPTIONS = ['전신마취', '척추마취', '국소마취', '수면마취', '부위마취', '기타'] as const;

export const ITEM_SUGGESTION_ID = 'op-check-item-suggestions';
export const MIGRATION_FILE = 'supabase_migrations/20260331_op_check_foundation.sql';

export const OP_CHECK_BOARD_POST_REQUIRED_COLUMNS = ['id', 'title', 'content', 'company', 'created_at'] as const;
export const OP_CHECK_BOARD_POST_OPTIONAL_COLUMNS = [
  'company_id',
  'schedule_date',
  'schedule_time',
  'schedule_room',
  'patient_name',
  'surgery_fasting',
  'surgery_inpatient',
  'surgery_guardian',
  'surgery_caregiver',
  'surgery_transfusion',
] as const;

export const OP_CHECK_TEMPLATE_SELECT = [
  'id',
  'company_id',
  'company_name',
  'template_scope',
  'template_name',
  'surgery_template_id',
  'surgery_name',
  'anesthesia_type',
  'prep_items',
  'consumable_items',
  'notes',
  'is_active',
  'created_by',
  'created_by_name',
  'created_at',
  'updated_at',
].join(', ');

export const OP_PATIENT_CHECK_REQUIRED_COLUMNS = [
  'id',
  'schedule_post_id',
  'company_id',
  'company_name',
  'patient_name',
  'chart_no',
  'surgery_name',
  'surgery_template_id',
  'anesthesia_type',
  'schedule_date',
  'schedule_time',
  'schedule_room',
  'prep_items',
  'consumable_items',
  'notes',
  'status',
  'applied_template_ids',
  'created_by',
  'created_by_name',
  'updated_by',
  'updated_by_name',
  'created_at',
  'updated_at',
] as const;

export const OP_PATIENT_CHECK_OPTIONAL_COLUMNS = [
  'surgery_started_at',
  'surgery_ended_at',
  'ward_message_sent_at',
] as const;

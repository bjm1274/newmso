import type { OpCheckItem, StaffMember } from '@/types';

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

export type ScheduleStatus = (typeof STATUS_OPTIONS)[number];
export type TemplateScope = 'surgery' | 'anesthesia';
export type OpCheckViewMode = 'patients' | 'templates';
export type WorkspaceSortKey = 'time' | 'status' | 'room' | 'name';
export type WorkspaceSectionKey = 'prep' | 'consumable' | 'notes';

export type LinkedSchedulePost = {
  id: string;
  patient_name: string;
  surgery_name: string;
  chart_no: string;
  schedule_date: string;
  schedule_time: string;
  schedule_room: string;
  company: string;
  company_id: string;
  surgery_fasting: boolean;
  surgery_inpatient: boolean;
  surgery_guardian: boolean;
  surgery_caregiver: boolean;
  surgery_transfusion: boolean;
};

export type SurgeryTemplateRow = {
  id: string;
  name: string;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type WardStaffRow = {
  id: string;
  name: string;
  department?: string | null;
  position?: string | null;
  company?: string | null;
  company_id?: string | null;
};

export type ChatRoomMemberLookupRow = {
  id: string;
  members?: string[] | null;
  member_ids?: string[] | null;
};

export type ChecklistItemDraft = OpCheckItem & {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  note?: string | null;
  checked?: boolean | null;
  source_label?: string | null;
};

export type TemplateEditorState = {
  id: string | null;
  template_scope: TemplateScope;
  template_name: string;
  surgery_template_id: string;
  surgery_name: string;
  anesthesia_type: string;
  prep_items: ChecklistItemDraft[];
  consumable_items: ChecklistItemDraft[];
  notes: string;
  is_active: boolean;
};

export type PatientCheckState = {
  id: string | null;
  schedule_post_id: string;
  patient_name: string;
  chart_no: string;
  surgery_name: string;
  surgery_template_id: string;
  anesthesia_type: string;
  schedule_date: string;
  schedule_time: string;
  schedule_room: string;
  prep_items: ChecklistItemDraft[];
  consumable_items: ChecklistItemDraft[];
  notes: string;
  status: string;
  applied_template_ids: string[];
  surgery_started_at?: string | null;
  surgery_ended_at?: string | null;
  ward_message_sent_at?: string | null;
};

export type OpCheckViewUser = Partial<Pick<StaffMember, 'id' | 'name' | 'company' | 'company_id'>> &
  Record<string, unknown>;

import { logger } from '@/lib/logger';
import { isMissingColumnError } from '@/lib/supabase-compat';
import type { BoardPost, OpCheckItem, OpCheckTemplate, OpPatientCheck, StaffMember } from '@/types';
import {
  createLocalId,
  isMissingRelationError,
  normalizeDateValue,
  normalizeLookupValue,
  normalizeTimeValue,
  stripHiddenMetaBlocks,
  type QueryResult,
} from './op-check-utils';

export const SCHEDULE_META_PREFIX = '[[SCHEDULE_META]]';
export const SCHEDULE_META_SUFFIX = '[[/SCHEDULE_META]]';
export const WARD_MESSAGE_META_PREFIX = '[[WARD_MESSAGE_META]]';
export const WARD_MESSAGE_META_SUFFIX = '[[/WARD_MESSAGE_META]]';
export const STATUS_OPTIONS = ['준비중', '준비완료', '수술중', '완료'] as const;
export const ANESTHESIA_OPTIONS = ['전신마취', '척추마취', '국소마취', '수면마취', '부위마취', '기타'] as const;
export const ITEM_SUGGESTION_ID = 'op-check-item-suggestions';
export const MIGRATION_FILE = 'supabase_migrations/20260331_op_check_foundation.sql';
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

export function extractScheduleMetaFromContent(value: unknown) {
  const raw = String(value || '');
  const start = raw.indexOf(SCHEDULE_META_PREFIX);
  const end = raw.indexOf(SCHEDULE_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: stripHiddenMetaBlocks(raw),
      meta: null as Record<string, unknown> | null,
    };
  }

  const displayContent = stripHiddenMetaBlocks(
    `${raw.slice(0, start)}${raw.slice(end + SCHEDULE_META_SUFFIX.length)}`,
  );
  const metaText = raw.slice(start + SCHEDULE_META_PREFIX.length, end).trim();
  try {
    return {
      displayContent,
      meta: JSON.parse(metaText) as Record<string, unknown>,
    };
  } catch {
    return {
      displayContent,
      meta: null as Record<string, unknown> | null,
    };
  }
}

export function mapSchedulePost(post: BoardPost): LinkedSchedulePost {
  const { displayContent, meta } = extractScheduleMetaFromContent(post.content);
  return {
    id: String(post.id || ''),
    patient_name: String(post.patient_name ?? meta?.patient ?? '').trim(),
    surgery_name: String(post.title || '').trim(),
    chart_no: String(displayContent || '').trim(),
    schedule_date: normalizeDateValue(post.schedule_date ?? meta?.date ?? ''),
    schedule_time: normalizeTimeValue(post.schedule_time ?? meta?.time ?? ''),
    schedule_room: String(post.schedule_room ?? meta?.room ?? '').trim(),
    company: String(post.company || '').trim(),
    company_id: String(post.company_id || '').trim(),
    surgery_fasting: Boolean(post.surgery_fasting ?? meta?.fasting ?? false),
    surgery_inpatient: Boolean(post.surgery_inpatient ?? meta?.inpatient ?? false),
    surgery_guardian: Boolean(post.surgery_guardian ?? meta?.guardian ?? false),
    surgery_caregiver: Boolean(post.surgery_caregiver ?? meta?.caregiver ?? false),
    surgery_transfusion: Boolean(post.surgery_transfusion ?? meta?.transfusion ?? false),
  };
}

export function normalizeChecklistItems(items: unknown, prefix: string, sourceLabel?: string | null) {
  if (!Array.isArray(items)) return [] as ChecklistItemDraft[];

  const normalized: ChecklistItemDraft[] = [];

  items.forEach((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    const name = String(row.name || '').trim();
    if (!name) return;

    normalized.push({
      id: String(row.id || createLocalId(`${prefix}-${index + 1}`)),
      name,
      quantity: String(row.quantity || '').trim() || '',
      unit: String(row.unit || '').trim() || '',
      note: String(row.note || '').trim() || '',
      checked: Boolean(row.checked ?? false),
      source_label: String(row.source_label || sourceLabel || '').trim() || '',
    });
  });

  return normalized;
}

export function createChecklistItem(prefix: string): ChecklistItemDraft {
  return {
    id: createLocalId(prefix),
    name: '',
    quantity: '',
    unit: '',
    note: '',
    checked: false,
    source_label: '',
  };
}

export function dedupeChecklistItems(items: ChecklistItemDraft[]) {
  const merged = new Map<string, ChecklistItemDraft>();

  items.forEach((item) => {
    const key = normalizeLookupValue(item.name);
    if (!key) return;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...item, id: item.id || createLocalId('op-item') });
      return;
    }

    const sourceValues = [existing.source_label, item.source_label]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const noteValues = [existing.note, item.note]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    merged.set(key, {
      ...existing,
      checked: Boolean(existing.checked || item.checked),
      quantity: existing.quantity || item.quantity || '',
      unit: existing.unit || item.unit || '',
      note: Array.from(new Set(noteValues)).join(' / '),
      source_label: Array.from(new Set(sourceValues)).join(', '),
    });
  });

  return Array.from(merged.values());
}

export function formatChecklistItems(items: ChecklistItemDraft[]) {
  return items
    .map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      quantity: String(item.quantity || '').trim(),
      unit: String(item.unit || '').trim(),
      note: String(item.note || '').trim(),
      checked: Boolean(item.checked),
      source_label: String(item.source_label || '').trim(),
    }))
    .filter((item) => item.name);
}

export function serializeChecklistItemsForDiff(items: ChecklistItemDraft[]) {
  return items
    .map((item) => ({
      name: String(item.name || '').trim(),
      quantity: String(item.quantity || '').trim(),
      unit: String(item.unit || '').trim(),
      note: String(item.note || '').trim(),
      checked: Boolean(item.checked),
      source_label: String(item.source_label || '').trim(),
    }))
    .filter((item) => item.name || item.quantity || item.unit || item.note || item.checked || item.source_label)
    .sort((left, right) => {
      const nameDiff = normalizeLookupValue(left.name).localeCompare(normalizeLookupValue(right.name), 'ko');
      if (nameDiff !== 0) return nameDiff;
      const quantityDiff = left.quantity.localeCompare(right.quantity, 'ko');
      if (quantityDiff !== 0) return quantityDiff;
      const unitDiff = left.unit.localeCompare(right.unit, 'ko');
      if (unitDiff !== 0) return unitDiff;
      const noteDiff = left.note.localeCompare(right.note, 'ko');
      if (noteDiff !== 0) return noteDiff;
      return left.source_label.localeCompare(right.source_label, 'ko');
    });
}

export function buildPatientCheckSignature(state: PatientCheckState | null) {
  if (!state) return '';

  return JSON.stringify({
    schedule_post_id: String(state.schedule_post_id || '').trim(),
    patient_name: String(state.patient_name || '').trim(),
    chart_no: String(state.chart_no || '').trim(),
    surgery_name: String(state.surgery_name || '').trim(),
    surgery_template_id: String(state.surgery_template_id || '').trim(),
    anesthesia_type: String(state.anesthesia_type || '').trim(),
    schedule_date: String(state.schedule_date || '').trim(),
    schedule_time: String(state.schedule_time || '').trim(),
    schedule_room: String(state.schedule_room || '').trim(),
    prep_items: serializeChecklistItemsForDiff(state.prep_items),
    consumable_items: serializeChecklistItemsForDiff(state.consumable_items),
    notes: String(state.notes || '').trim(),
    status: String(state.status || '').trim(),
    applied_template_ids: Array.isArray(state.applied_template_ids)
      ? state.applied_template_ids
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right, 'ko'))
      : [],
    surgery_started_at: state.surgery_started_at || null,
    surgery_ended_at: state.surgery_ended_at || null,
    ward_message_sent_at: state.ward_message_sent_at || null,
  });
}

export function getScheduleStatusOrder(status: unknown) {
  const normalizedStatus = String(status || '').trim();
  const matchedIndex = STATUS_OPTIONS.findIndex((item) => item === normalizedStatus);
  return matchedIndex >= 0 ? matchedIndex : 0;
}

export function updateRecentTargetIds(currentIds: string[], nextIds: string[]) {
  return Array.from(
    new Set(
      [...nextIds, ...currentIds]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

export function buildWardMessageContent(messageText: string, checkForm: PatientCheckState | null) {
  const normalizedText = stripHiddenMetaBlocks(messageText).trim();
  if (!normalizedText) return '';

  const meta = {
    type: 'op_ward_request',
    patient_name: stripHiddenMetaBlocks(checkForm?.patient_name),
    chart_no: stripHiddenMetaBlocks(checkForm?.chart_no),
    surgery_name: stripHiddenMetaBlocks(checkForm?.surgery_name),
    schedule_room: stripHiddenMetaBlocks(checkForm?.schedule_room || '미정') || '미정',
    schedule_time: stripHiddenMetaBlocks(checkForm?.schedule_time || '미정') || '미정',
  };

  return `${normalizedText}\n${WARD_MESSAGE_META_PREFIX}${JSON.stringify(meta)}${WARD_MESSAGE_META_SUFFIX}`;
}

export function buildWardMessageTemplateOptions(checkForm: PatientCheckState | null) {
  if (!checkForm) return [] as Array<{ id: string; label: string; text: string }>;

  const patientName = stripHiddenMetaBlocks(checkForm.patient_name);
  const chartNo = stripHiddenMetaBlocks(checkForm.chart_no);
  const surgeryName = stripHiddenMetaBlocks(checkForm.surgery_name);
  const scheduleRoom = stripHiddenMetaBlocks(checkForm.schedule_room || '미정') || '미정';
  const scheduleTime = stripHiddenMetaBlocks(checkForm.schedule_time || '미정') || '미정';
  const patientLabel = `${patientName} 환자${chartNo ? ` (차트: ${chartNo})` : ''}`;
  const scheduleLabel = `수술실:${scheduleRoom} / 수술시간:${scheduleTime}`;

  return [
    {
      id: 'prep-complete',
      label: '기본 안내',
      text:
        `[수술실 메시지] ${patientLabel} ${surgeryName} 수술 준비가 완료되었습니다.\n` +
        `환자 처치 후 수술실로 올려주세요.\n${scheduleLabel}`,
    },
    {
      id: 'move-request',
      label: '이동 요청',
      text:
        `[수술실 이동 요청] ${patientLabel} ${surgeryName} 준비 완료되었습니다.\n` +
        `지금 수술실로 이동 부탁드립니다.\n${scheduleLabel}`,
    },
    {
      id: 'after-treatment',
      label: '검사 후 이동',
      text:
        `[수술실 이동 요청] ${patientLabel} ${surgeryName} 예정입니다.\n` +
        `검사/처치 완료 후 수술실로 올려주세요.\n${scheduleLabel}`,
    },
  ];
}

export function sortSchedulesForWorkspace(
  posts: LinkedSchedulePost[],
  patientChecksByScheduleId: Record<string, OpPatientCheck>,
  sortKey: WorkspaceSortKey,
) {
  return [...posts].sort((left, right) => {
    if (sortKey === 'status') {
      const statusDiff =
        getScheduleStatusOrder(patientChecksByScheduleId[left.id]?.status) -
        getScheduleStatusOrder(patientChecksByScheduleId[right.id]?.status);
      if (statusDiff !== 0) return statusDiff;
    }

    if (sortKey === 'room') {
      const roomDiff = String(left.schedule_room || '').localeCompare(String(right.schedule_room || ''), 'ko');
      if (roomDiff !== 0) return roomDiff;
    }

    if (sortKey === 'name') {
      const nameDiff = String(left.patient_name || '').localeCompare(String(right.patient_name || ''), 'ko');
      if (nameDiff !== 0) return nameDiff;
    }

    return compareSchedules(left, right);
  });
}

export function summarizeChecklistItems(items: ChecklistItemDraft[]) {
  const validItems = items.filter((item) => String(item.name || '').trim());
  if (validItems.length === 0) return '등록된 항목 없음';
  const checkedCount = validItems.filter((item) => Boolean(item.checked)).length;
  return `${checkedCount}/${validItems.length} 완료`;
}

export function findMatchingSurgeryTemplate(surgeryTemplates: SurgeryTemplateRow[], surgeryName: string) {
  const normalizedTarget = normalizeLookupValue(surgeryName);
  if (!normalizedTarget) return null;
  return (
    surgeryTemplates.find((template) => normalizeLookupValue(template.name) === normalizedTarget) || null
  );
}

export function buildTemplateLabel(template: OpCheckTemplate) {
  if (template.template_scope === 'anesthesia') {
    return template.anesthesia_type || template.template_name || '마취 템플릿';
  }
  return template.surgery_name || template.template_name || '수술 템플릿';
}

export function formatDateLabel(dateText: string) {
  if (!dateText) return '날짜 미정';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date(`${dateText}T00:00:00`));
  } catch {
    return dateText;
  }
}

export function compareSchedules(left: LinkedSchedulePost, right: LinkedSchedulePost) {
  const leftDateTime = `${left.schedule_date || '9999-12-31'}T${left.schedule_time || '23:59'}`;
  const rightDateTime = `${right.schedule_date || '9999-12-31'}T${right.schedule_time || '23:59'}`;
  const dateDiff = leftDateTime.localeCompare(rightDateTime);
  if (dateDiff !== 0) return dateDiff;
  return String(left.patient_name || '').localeCompare(String(right.patient_name || ''), 'ko');
}

export function findPreferredScheduleDate(posts: LinkedSchedulePost[]) {
  if (posts.length === 0) return '';
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcoming = posts.find((post) => post.schedule_date && post.schedule_date >= todayKey);
  return upcoming?.schedule_date || posts[0]?.schedule_date || '';
}

export function emptyTemplateEditor(): TemplateEditorState {
  return {
    id: null,
    template_scope: 'surgery',
    template_name: '',
    surgery_template_id: '',
    surgery_name: '',
    anesthesia_type: '',
    prep_items: [createChecklistItem('template-prep')],
    consumable_items: [createChecklistItem('template-consumable')],
    notes: '',
    is_active: true,
  };
}

export async function withOptionalQueryFallback<T>(
  execute: () => PromiseLike<QueryResult<T>>,
  options: {
    fallbackData: T;
    relationNames?: string[];
    columnNames?: string[];
  }
): Promise<QueryResult<T>> {
  const result = await execute();
  if (!result.error) return result;

  const relationNames = options.relationNames || [];
  const columnNames = options.columnNames || [];
  const missingRelation = relationNames.length > 0 && isMissingRelationError(result.error, relationNames);
  const missingColumn = columnNames.some((columnName) => isMissingColumnError(result.error, columnName));

  if (!missingRelation && !missingColumn) {
    return result;
  }

  logger.warn('OP체크 선택 데이터 조회를 건너뜁니다.', {
    relationNames,
    columnNames,
    error: result.error,
  });

  return {
    data: options.fallbackData,
    error: null,
  };
}

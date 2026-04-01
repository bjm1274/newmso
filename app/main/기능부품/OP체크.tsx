'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import {
  isMissingColumnError,
  withMissingColumnFallback,
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';
import type {
  BoardPost,
  InventoryItem,
  OpCheckItem,
  OpCheckTemplate,
  OpPatientCheck,
  StaffMember,
} from '@/types';
import {
  buildSelectColumns,
  buildWardSearchVariants,
  createLocalId,
  getChatRoomMemberIds,
  getFocusableElements,
  getWardFavoriteStorageKey,
  getWardRecentStorageKey,
  isInteractiveKeyboardTarget,
  isMissingRelationError,
  isOpCheckSchemaMissing,
  normalizeDateValue,
  normalizeInventoryRows,
  normalizeLookupValue,
  normalizeTimeValue,
  normalizeWardStaffList,
  QueryResult,
  resolveWardStaffCandidates,
  stripHiddenMetaBlocks,
} from './op-check-utils';
import {
  OpCheckScheduleList,
  OpCheckStatusFilterTabs,
  OpCheckWorkspaceChecklistSection,
  OpCheckWorkspaceHeader,
  OpCheckWorkspaceMetaPanel,
  OpCheckWorkspaceNotesSection,
  OpCheckWorkspaceProgressPanel,
} from './op-check-components';

const SCHEDULE_META_PREFIX = '[[SCHEDULE_META]]';
const SCHEDULE_META_SUFFIX = '[[/SCHEDULE_META]]';
const WARD_MESSAGE_META_PREFIX = '[[WARD_MESSAGE_META]]';
const WARD_MESSAGE_META_SUFFIX = '[[/WARD_MESSAGE_META]]';
const STATUS_OPTIONS = ['준비중', '준비완료', '수술중', '완료'] as const;
const ANESTHESIA_OPTIONS = ['전신마취', '척추마취', '국소마취', '수면마취', '부위마취', '기타'] as const;
const ITEM_SUGGESTION_ID = 'op-check-item-suggestions';
const MIGRATION_FILE = 'supabase_migrations/20260331_op_check_foundation.sql';
type ScheduleStatus = (typeof STATUS_OPTIONS)[number];

type TemplateScope = 'surgery' | 'anesthesia';
type OpCheckViewMode = 'patients' | 'templates';
type WorkspaceSortKey = 'time' | 'status' | 'room' | 'name';
type WorkspaceSectionKey = 'prep' | 'consumable' | 'notes';

type LinkedSchedulePost = {
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

type SurgeryTemplateRow = {
  id: string;
  name: string;
  sort_order?: number | null;
  is_active?: boolean | null;
};

type WardStaffRow = {
  id: string;
  name: string;
  department?: string | null;
  position?: string | null;
  company?: string | null;
  company_id?: string | null;
};

type ChatRoomMemberLookupRow = {
  id: string;
  members?: string[] | null;
  member_ids?: string[] | null;
};

type ChecklistItemDraft = OpCheckItem & {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  note?: string | null;
  checked?: boolean | null;
  source_label?: string | null;
};

type TemplateEditorState = {
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

type PatientCheckState = {
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

type OpCheckViewUser = Partial<Pick<StaffMember, 'id' | 'name' | 'company' | 'company_id'>> &
  Record<string, unknown>;

const OP_CHECK_BOARD_POST_REQUIRED_COLUMNS = ['id', 'title', 'content', 'company', 'created_at'] as const;
const OP_CHECK_BOARD_POST_OPTIONAL_COLUMNS = [
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
const OP_CHECK_TEMPLATE_SELECT = [
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
const OP_PATIENT_CHECK_REQUIRED_COLUMNS = [
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
const OP_PATIENT_CHECK_OPTIONAL_COLUMNS = [
  'surgery_started_at',
  'surgery_ended_at',
  'ward_message_sent_at',
] as const;

function extractScheduleMetaFromContent(value: unknown) {
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

function mapSchedulePost(post: BoardPost): LinkedSchedulePost {
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

function normalizeChecklistItems(items: unknown, prefix: string, sourceLabel?: string | null) {
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

function createChecklistItem(prefix: string): ChecklistItemDraft {
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

function dedupeChecklistItems(items: ChecklistItemDraft[]) {
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

function formatChecklistItems(items: ChecklistItemDraft[]) {
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

function serializeChecklistItemsForDiff(items: ChecklistItemDraft[]) {
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

function buildPatientCheckSignature(state: PatientCheckState | null) {
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

function getScheduleStatusOrder(status: unknown) {
  const normalizedStatus = String(status || '').trim();
  const matchedIndex = STATUS_OPTIONS.findIndex((item) => item === normalizedStatus);
  return matchedIndex >= 0 ? matchedIndex : 0;
}

function updateRecentTargetIds(currentIds: string[], nextIds: string[]) {
  return Array.from(
    new Set(
      [...nextIds, ...currentIds]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function buildWardMessageContent(messageText: string, checkForm: PatientCheckState | null) {
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

function buildWardMessageTemplateOptions(checkForm: PatientCheckState | null) {
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

function sortSchedulesForWorkspace(
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

function summarizeChecklistItems(items: ChecklistItemDraft[]) {
  const validItems = items.filter((item) => String(item.name || '').trim());
  if (validItems.length === 0) return '등록된 항목 없음';
  const checkedCount = validItems.filter((item) => Boolean(item.checked)).length;
  return `${checkedCount}/${validItems.length} 완료`;
}

function findMatchingSurgeryTemplate(surgeryTemplates: SurgeryTemplateRow[], surgeryName: string) {
  const normalizedTarget = normalizeLookupValue(surgeryName);
  if (!normalizedTarget) return null;
  return (
    surgeryTemplates.find((template) => normalizeLookupValue(template.name) === normalizedTarget) || null
  );
}

function buildTemplateLabel(template: OpCheckTemplate) {
  if (template.template_scope === 'anesthesia') {
    return template.anesthesia_type || template.template_name || '마취 템플릿';
  }
  return template.surgery_name || template.template_name || '수술 템플릿';
}

function formatDateLabel(dateText: string) {
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

function compareSchedules(left: LinkedSchedulePost, right: LinkedSchedulePost) {
  const leftDateTime = `${left.schedule_date || '9999-12-31'}T${left.schedule_time || '23:59'}`;
  const rightDateTime = `${right.schedule_date || '9999-12-31'}T${right.schedule_time || '23:59'}`;
  const dateDiff = leftDateTime.localeCompare(rightDateTime);
  if (dateDiff !== 0) return dateDiff;
  return String(left.patient_name || '').localeCompare(String(right.patient_name || ''), 'ko');
}

function findPreferredScheduleDate(posts: LinkedSchedulePost[]) {
  if (posts.length === 0) return '';
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcoming = posts.find((post) => post.schedule_date && post.schedule_date >= todayKey);
  return upcoming?.schedule_date || posts[0]?.schedule_date || '';
}

function emptyTemplateEditor(): TemplateEditorState {
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

async function withOptionalQueryFallback<T>(
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

  console.warn('OP체크 선택 데이터 조회를 건너뜁니다.', {
    relationNames,
    columnNames,
    error: result.error,
  });

  return {
    data: options.fallbackData,
    error: null,
  };
}

export default function OperationCheckView({
  user,
  staffs,
  selectedCo,
  selectedCompanyId,
  viewMode = 'patients',
  title,
}: {
  user?: OpCheckViewUser | null;
  staffs?: StaffMember[];
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
  viewMode?: OpCheckViewMode;
  title?: string;
}) {
  const activeTab: OpCheckViewMode = viewMode === 'templates' ? 'templates' : 'patients';
  const headerTitle = title || (activeTab === 'templates' ? 'OP체크 템플릿' : 'OP체크');
  const [loading, setLoading] = useState(true);
  const [savingCheck, setSavingCheck] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [schemaError, setSchemaError] = useState('');

  const [schedulePosts, setSchedulePosts] = useState<LinkedSchedulePost[]>([]);
  const [surgeryTemplates, setSurgeryTemplates] = useState<SurgeryTemplateRow[]>([]);
  const [opTemplates, setOpTemplates] = useState<OpCheckTemplate[]>([]);
  const [patientChecks, setPatientChecks] = useState<OpPatientCheck[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [checkForm, setCheckForm] = useState<PatientCheckState | null>(null);
  const [templateEditor, setTemplateEditor] = useState<TemplateEditorState>(emptyTemplateEditor);

  const [showWardMsgModal, setShowWardMsgModal] = useState(false);
  const [wardMsgText, setWardMsgText] = useState('');
  const [wardMsgTargets, setWardMsgTargets] = useState<string[]>([]);
  const [wardStaffs, setWardStaffs] = useState<WardStaffRow[]>([]);
  const [wardFavoriteTargets, setWardFavoriteTargets] = useState<string[]>([]);
  const [wardRecentTargets, setWardRecentTargets] = useState<string[]>([]);
  const [wardRecipientPickerOpen, setWardRecipientPickerOpen] = useState(false);
  const [wardRecipientSearch, setWardRecipientSearch] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [dayWorkspaceOpen, setDayWorkspaceOpen] = useState(false);
  const [workspaceSort, setWorkspaceSort] = useState<WorkspaceSortKey>('time');
  const [lastViewedScheduleIdsByDate, setLastViewedScheduleIdsByDate] = useState<Record<string, string>>({});
  const [workspaceSections, setWorkspaceSections] = useState<Record<WorkspaceSectionKey, boolean>>({
    prep: true,
    consumable: true,
    notes: true,
  });

  const [statusFilterTab, setStatusFilterTab] = useState<'전체' | ScheduleStatus>('전체');
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [deductingInventory, setDeductingInventory] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredWardRecipientSearch = useDeferredValue(wardRecipientSearch);
  const savePatientCheckRef = useRef<() => Promise<void>>(async () => {});
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const wardMessageDialogRef = useRef<HTMLDivElement | null>(null);
  const wardMessageCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const wardRecipientSearchInputRef = useRef<HTMLInputElement | null>(null);
  const wardMessageReturnFocusRef = useRef<HTMLElement | null>(null);

  const selectedScheduleCompanyId = useMemo(
    () => schedulePosts.find((post) => post.id === selectedScheduleId)?.company_id || null,
    [schedulePosts, selectedScheduleId]
  );

  const wardFavoriteStorageKey = useMemo(
    () =>
      getWardFavoriteStorageKey(
        user?.id,
        selectedScheduleCompanyId || selectedCompanyId || user?.company_id,
      ),
    [selectedCompanyId, selectedScheduleCompanyId, user?.company_id, user?.id],
  );

  const wardRecentStorageKey = useMemo(
    () =>
      getWardRecentStorageKey(
        user?.id,
        selectedScheduleCompanyId || selectedCompanyId || user?.company_id,
      ),
    [selectedCompanyId, selectedScheduleCompanyId, user?.company_id, user?.id],
  );

  const wardStaffMap = useMemo(
    () => new Map(wardStaffs.map((staff) => [staff.id, staff])),
    [wardStaffs],
  );

  const selectedWardStaffs = useMemo(
    () => wardMsgTargets.map((targetId) => wardStaffMap.get(targetId)).filter(Boolean) as WardStaffRow[],
    [wardMsgTargets, wardStaffMap],
  );

  const favoriteWardStaffs = useMemo(
    () =>
      wardFavoriteTargets
        .map((targetId) => wardStaffMap.get(targetId))
        .filter(Boolean) as WardStaffRow[],
    [wardFavoriteTargets, wardStaffMap],
  );

  const recentWardStaffs = useMemo(
    () =>
      wardRecentTargets
        .map((targetId) => wardStaffMap.get(targetId))
        .filter(Boolean) as WardStaffRow[],
    [wardRecentTargets, wardStaffMap],
  );

  const filteredWardStaffs = useMemo(() => {
    const lookupVariants = buildWardSearchVariants(deferredWardRecipientSearch);

    return wardStaffs.filter((staff) => {
      if (wardMsgTargets.includes(staff.id)) return false;
      if (lookupVariants.length === 0) return true;

      const staffSearchValues = [staff.name, staff.department, staff.position, staff.company]
        .flatMap((value) => buildWardSearchVariants(value));

      return lookupVariants.some((lookup) =>
        staffSearchValues.some((value) => value.includes(lookup)),
      );
    });
  }, [deferredWardRecipientSearch, wardMsgTargets, wardStaffs]);

  const normalizedWardMessageText = useMemo(
    () => stripHiddenMetaBlocks(wardMsgText).trim(),
    [wardMsgText],
  );

  const wardMessageValidationText = useMemo(() => {
    if (wardMsgTargets.length === 0) return '받는 사람을 1명 이상 선택하세요.';
    if (!normalizedWardMessageText) return '메시지 내용을 입력하세요.';
    return '';
  }, [normalizedWardMessageText, wardMsgTargets.length]);

  const wardMessageTemplates = useMemo(
    () => buildWardMessageTemplateOptions(checkForm),
    [checkForm],
  );

  const closeWardMessageModal = useCallback(() => {
    setWardRecipientPickerOpen(false);
    setWardRecipientSearch('');
    setShowWardMsgModal(false);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setPortalHost(document.body);
  }, []);

  useEffect(() => {
    if (!showWardMsgModal || typeof document === 'undefined' || typeof window === 'undefined') return;

    wardMessageReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      if (wardRecipientPickerOpen) {
        wardRecipientSearchInputRef.current?.focus();
        return;
      }
      wardMessageCloseButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      wardMessageReturnFocusRef.current?.focus();
      wardMessageReturnFocusRef.current = null;
    };
  }, [showWardMsgModal, wardRecipientPickerOpen]);

  useEffect(() => {
    if (!showWardMsgModal || typeof window === 'undefined') return;

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (wardRecipientPickerOpen) {
          setWardRecipientPickerOpen(false);
          setWardRecipientSearch('');
          return;
        }
        closeWardMessageModal();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(wardMessageDialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        wardMessageDialogRef.current?.focus();
        return;
      }

      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (!activeElement || !wardMessageDialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleDialogKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleDialogKeyDown, true);
    };
  }, [closeWardMessageModal, showWardMsgModal, wardRecipientPickerOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(wardFavoriteStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setWardFavoriteTargets(
        Array.isArray(parsed)
          ? Array.from(new Set(parsed.map((value) => String(value || '').trim()).filter(Boolean)))
          : [],
      );
    } catch {
      setWardFavoriteTargets([]);
    }
  }, [wardFavoriteStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(wardRecentStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setWardRecentTargets(
        Array.isArray(parsed)
          ? Array.from(new Set(parsed.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 8)
          : [],
      );
    } catch {
      setWardRecentTargets([]);
    }
  }, [wardRecentStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        wardFavoriteStorageKey,
        JSON.stringify(Array.from(new Set(wardFavoriteTargets))),
      );
    } catch {
      // localStorage save failures should not block the modal UX.
    }
  }, [wardFavoriteStorageKey, wardFavoriteTargets]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        wardRecentStorageKey,
        JSON.stringify(Array.from(new Set(wardRecentTargets)).slice(0, 8)),
      );
    } catch {
      // localStorage save failures should not block the modal UX.
    }
  }, [wardRecentStorageKey, wardRecentTargets]);

  useEffect(() => {
    if (!showWardMsgModal || wardStaffs.length === 0) return;
    const availableIds = new Set(wardStaffs.map((staff) => staff.id));
    setWardFavoriteTargets((prev) => {
      const next = prev.filter((targetId) => availableIds.has(targetId));
      return next.length === prev.length ? prev : next;
    });
    setWardRecentTargets((prev) => {
      const next = prev.filter((targetId) => availableIds.has(targetId));
      return next.length === prev.length ? prev : next;
    });
    setWardMsgTargets((prev) => {
      const next = prev.filter((targetId) => availableIds.has(targetId));
      return next.length === prev.length ? prev : next;
    });
  }, [showWardMsgModal, wardStaffs]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSchemaError('');

    try {
      const [scheduleRes, templateRes, patientCheckRes, surgeryTemplateRes, inventoryRes] = await Promise.all([
        withMissingColumnsFallback<BoardPost[]>(
          async (omittedColumns): Promise<QueryResult<BoardPost[]>> => {
            const result = await supabase
              .from('board_posts')
              .select(
                buildSelectColumns(
                  OP_CHECK_BOARD_POST_REQUIRED_COLUMNS,
                  OP_CHECK_BOARD_POST_OPTIONAL_COLUMNS,
                  omittedColumns,
                ),
              )
              .eq('board_type', '수술일정')
              .order('created_at', { ascending: true });
            return result as unknown as QueryResult<BoardPost[]>;
          },
          [...OP_CHECK_BOARD_POST_OPTIONAL_COLUMNS],
        ),
        supabase
          .from('op_check_templates')
          .select(OP_CHECK_TEMPLATE_SELECT)
          .order('template_scope', { ascending: true })
          .order('template_name', { ascending: true }) as unknown as Promise<QueryResult<OpCheckTemplate[]>>,
        withMissingColumnsFallback<OpPatientCheck[]>(
          async (omittedColumns): Promise<QueryResult<OpPatientCheck[]>> => {
            const result = await supabase
              .from('op_patient_checks')
              .select(
                buildSelectColumns(
                  OP_PATIENT_CHECK_REQUIRED_COLUMNS,
                  OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
                  omittedColumns,
                ),
              )
              .order('schedule_date', { ascending: true })
              .order('schedule_time', { ascending: true });
            return result as unknown as QueryResult<OpPatientCheck[]>;
          },
          [...OP_PATIENT_CHECK_OPTIONAL_COLUMNS],
        ),
        withOptionalQueryFallback<SurgeryTemplateRow[]>(
          async (): Promise<QueryResult<SurgeryTemplateRow[]>> =>
            withMissingColumnsFallback<SurgeryTemplateRow[]>(
              async (omittedColumns): Promise<QueryResult<SurgeryTemplateRow[]>> => {
                const selectedColumns = ['id', 'name', 'sort_order', 'is_active']
                  .filter((columnName) => !omittedColumns.has(columnName))
                  .join(', ');
                let query = supabase.from('surgery_templates').select(selectedColumns);
                if (!omittedColumns.has('is_active')) {
                  query = query.eq('is_active', true);
                }
                if (!omittedColumns.has('sort_order')) {
                  query = query.order('sort_order', { ascending: true });
                }
                const result = await query.order('name', { ascending: true });
                return result as QueryResult<SurgeryTemplateRow[]>;
              },
              ['sort_order', 'is_active'],
            ),
          {
            fallbackData: [] as SurgeryTemplateRow[],
            relationNames: ['surgery_templates'],
            columnNames: ['sort_order', 'is_active'],
          },
        ),
        withOptionalQueryFallback<InventoryItem[]>(
          async (): Promise<QueryResult<InventoryItem[]>> =>
            withMissingColumnsFallback<InventoryItem[]>(
              async (omittedColumns): Promise<QueryResult<InventoryItem[]>> => {
                const selectedColumns = ['id', 'name', 'unit', 'quantity', 'company', 'company_id', 'department']
                  .filter((columnName) => !omittedColumns.has(columnName))
                  .join(', ');
                const result = await supabase
                  .from('inventory_items')
                  .select(selectedColumns)
                  .order('name', { ascending: true });
                return result as QueryResult<InventoryItem[]>;
              },
              ['unit', 'quantity', 'company', 'company_id', 'department'],
            ),
          {
            fallbackData: [] as InventoryItem[],
            relationNames: ['inventory_items', 'inventory'],
            columnNames: ['unit', 'quantity', 'company', 'company_id', 'department'],
          },
        ),
      ]);

      const firstError =
        scheduleRes.error ||
        templateRes.error ||
        patientCheckRes.error ||
        surgeryTemplateRes.error ||
        inventoryRes.error;

      if (firstError) {
        if (isOpCheckSchemaMissing(firstError)) {
          setSchemaError(`OP체크 테이블이 아직 없습니다. ${MIGRATION_FILE} 를 먼저 적용해 주세요.`);
          return;
        }
        throw firstError;
      }

      const normalizedSchedules = ((scheduleRes.data || []) as BoardPost[])
        .map(mapSchedulePost)
        .filter((post) => post.id && post.patient_name && post.surgery_name);
      normalizedSchedules.sort(compareSchedules);

      setSchedulePosts(normalizedSchedules);
      setOpTemplates((templateRes.data || []) as OpCheckTemplate[]);
      setPatientChecks((patientCheckRes.data || []) as OpPatientCheck[]);
      setSurgeryTemplates((surgeryTemplateRes.data || []) as SurgeryTemplateRow[]);
      setInventoryItems(normalizeInventoryRows(inventoryRes.data));
    } catch (error) {
      console.error('OP체크 데이터 로딩 실패', error);
      toast('OP체크 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const patientChecksByScheduleId = useMemo(
    () =>
      patientChecks.reduce<Record<string, OpPatientCheck>>((acc, row) => {
        const key = String(row.schedule_post_id || '').trim();
        if (key) acc[key] = row;
        return acc;
      }, {}),
    [patientChecks]
  );

  const patientCheckStatusByScheduleId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(patientChecksByScheduleId).map(([scheduleId, row]) => [
          scheduleId,
          String(row?.status || '준비중'),
        ]),
      ) as Record<string, string>,
    [patientChecksByScheduleId],
  );

  const getSortedSchedulesForDate = useCallback(
    (dateKey: string) => {
      if (!dateKey) return [] as LinkedSchedulePost[];
      return sortSchedulesForWorkspace(
        schedulePosts.filter((post) => post.schedule_date === dateKey),
        patientChecksByScheduleId,
        workspaceSort,
      );
    },
    [patientChecksByScheduleId, schedulePosts, workspaceSort],
  );

  const selectedDateSchedules = useMemo(
    () => getSortedSchedulesForDate(selectedDate),
    [getSortedSchedulesForDate, selectedDate],
  );

  const searchFilteredSelectedDateSchedules = useMemo(() => {
    const search = normalizeLookupValue(deferredSearchTerm);
    return selectedDateSchedules.filter((post) => {
      if (!search) return true;
      return [post.patient_name, post.surgery_name, post.chart_no, post.schedule_room].some((value) =>
        normalizeLookupValue(value).includes(search)
      );
    });
  }, [deferredSearchTerm, selectedDateSchedules]);

  const filteredSchedules = useMemo(() => {
    if (statusFilterTab === '전체') {
      return searchFilteredSelectedDateSchedules;
    }

    return searchFilteredSelectedDateSchedules.filter((post) => {
      const savedRow = patientChecksByScheduleId[post.id];
      const currentStatus = String(savedRow?.status || '준비중');
      return currentStatus === statusFilterTab;
    });
  }, [patientChecksByScheduleId, searchFilteredSelectedDateSchedules, statusFilterTab]);
  const hasActiveScheduleFilters =
    statusFilterTab !== '전체' || normalizeLookupValue(deferredSearchTerm).length > 0;

  const statusFilterTabOptions = useMemo(
    () =>
      (['전체', ...STATUS_OPTIONS] as const).map((tab) => ({
        value: tab,
        count:
          tab === '전체'
            ? selectedDateSchedules.length
            : selectedDateSchedules.filter((post) => {
                const currentStatus = patientCheckStatusByScheduleId[post.id] || '준비중';
                return currentStatus === tab;
              }).length,
      })),
    [patientCheckStatusByScheduleId, selectedDateSchedules],
  );

  const scheduleCalendarData = useMemo(() => {
    const toKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const search = normalizeLookupValue(deferredSearchTerm);
    const filteredPosts = search
      ? schedulePosts.filter((post) =>
          [post.patient_name, post.surgery_name, post.chart_no, post.schedule_room].some((value) =>
            normalizeLookupValue(value).includes(search)
          )
        )
      : schedulePosts;

    const eventsByDate: Record<string, LinkedSchedulePost[]> = {};
    filteredPosts.forEach((post) => {
      if (!post.schedule_date) return;
      if (!eventsByDate[post.schedule_date]) {
        eventsByDate[post.schedule_date] = [];
      }
      eventsByDate[post.schedule_date].push(post);
    });
    Object.values(eventsByDate).forEach((posts) => posts.sort(compareSchedules));

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay();
    const startDate = new Date(year, month, 1 - startDay);
    const days = Array.from({ length: 42 }, (_, index) => (
      new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index)
    ));

    return {
      filteredPosts,
      eventsByDate,
      days,
      month,
      toKey,
    };
  }, [calendarMonth, deferredSearchTerm, schedulePosts]);

  useEffect(() => {
    if (schedulePosts.length === 0) return;
    if (selectedDate && schedulePosts.some((post) => post.schedule_date === selectedDate)) return;

    const preferredDate = findPreferredScheduleDate(schedulePosts);
    if (!preferredDate) return;

    setSelectedDate(preferredDate);
    setCalendarMonth(new Date(`${preferredDate}T00:00:00`));
  }, [schedulePosts, selectedDate]);

  const selectedSchedule = useMemo(
    () => schedulePosts.find((post) => post.id === selectedScheduleId) || null,
    [schedulePosts, selectedScheduleId]
  );

  const rememberLastViewedSchedule = useCallback((post: LinkedSchedulePost | null) => {
    if (!post?.schedule_date || !post.id) return;
    setLastViewedScheduleIdsByDate((prev) =>
      prev[post.schedule_date] === post.id
        ? prev
        : {
            ...prev,
            [post.schedule_date]: post.id,
          },
    );
  }, []);

  const getPreferredScheduleForDate = useCallback(
    (dateKey: string, daySchedules: LinkedSchedulePost[], preferredScheduleId?: string | null) => {
      const candidateSchedules =
        daySchedules.length > 0
          ? sortSchedulesForWorkspace(daySchedules, patientChecksByScheduleId, workspaceSort)
          : getSortedSchedulesForDate(dateKey);

      for (const candidateId of [preferredScheduleId, lastViewedScheduleIdsByDate[dateKey]]) {
        const matchedSchedule = candidateSchedules.find((post) => post.id === candidateId);
        if (matchedSchedule) return matchedSchedule;
      }

      return candidateSchedules[0] || null;
    },
    [getSortedSchedulesForDate, lastViewedScheduleIdsByDate, patientChecksByScheduleId, workspaceSort],
  );

  const applyDateAndScheduleSelection = useCallback(
    (
      dateKey: string,
      nextSchedule: LinkedSchedulePost | null,
      options?: {
        openWorkspace?: boolean;
      },
    ) => {
      setSelectedDate(dateKey);
      if (dateKey) {
        setCalendarMonth(new Date(`${dateKey}T00:00:00`));
      }
      setSelectedScheduleId(nextSchedule?.id || null);
      if (nextSchedule) {
        rememberLastViewedSchedule(nextSchedule);
      }
      if (typeof options?.openWorkspace === 'boolean') {
        setDayWorkspaceOpen(options.openWorkspace && Boolean(nextSchedule));
      }
    },
    [rememberLastViewedSchedule],
  );

  useEffect(() => {
    if (!selectedDate) {
      if (selectedScheduleId) setSelectedScheduleId(null);
      return;
    }

    if (
      selectedSchedule &&
      selectedSchedule.schedule_date === selectedDate &&
      selectedDateSchedules.some((post) => post.id === selectedSchedule.id)
    ) {
      rememberLastViewedSchedule(selectedSchedule);
      return;
    }

    const nextSchedule = getPreferredScheduleForDate(selectedDate, selectedDateSchedules);
    const nextScheduleId = nextSchedule?.id || null;
    if (nextScheduleId === selectedScheduleId) return;

    setSelectedScheduleId(nextScheduleId);
    if (nextSchedule) {
      rememberLastViewedSchedule(nextSchedule);
    }
  }, [
    getPreferredScheduleForDate,
    rememberLastViewedSchedule,
    selectedDate,
    selectedDateSchedules,
    selectedSchedule,
    selectedScheduleId,
  ]);

  const buildDefaultPatientCheck = useCallback(
    (schedule: LinkedSchedulePost, existingCheck?: OpPatientCheck | null): PatientCheckState => {
      const matchedSurgeryTemplate = findMatchingSurgeryTemplate(surgeryTemplates, schedule.surgery_name);
      const existingAnesthesiaType = String(existingCheck?.anesthesia_type || '').trim();

      const applicableTemplates = opTemplates.filter((template) => {
        if (template.is_active === false) return false;

        if (template.template_scope === 'anesthesia') {
          return (
            !!existingAnesthesiaType &&
            normalizeLookupValue(template.anesthesia_type) === normalizeLookupValue(existingAnesthesiaType)
          );
        }

        const matchesTemplateId =
          template.surgery_template_id &&
          matchedSurgeryTemplate?.id &&
          String(template.surgery_template_id) === String(matchedSurgeryTemplate.id);

        return (
          matchesTemplateId ||
          normalizeLookupValue(template.surgery_name) === normalizeLookupValue(schedule.surgery_name)
        );
      });

      const prepItems = dedupeChecklistItems(
        applicableTemplates.flatMap((template) =>
          normalizeChecklistItems(template.prep_items, 'prep', buildTemplateLabel(template))
        )
      );
      const consumableItems = dedupeChecklistItems(
        applicableTemplates.flatMap((template) =>
          normalizeChecklistItems(template.consumable_items, 'consumable', buildTemplateLabel(template))
        )
      );

      if (existingCheck) {
        return {
          id: String(existingCheck.id || ''),
          schedule_post_id: schedule.id,
          patient_name: schedule.patient_name,
          chart_no: stripHiddenMetaBlocks(existingCheck.chart_no || schedule.chart_no || ''),
          surgery_name: schedule.surgery_name,
          surgery_template_id: String(existingCheck.surgery_template_id || matchedSurgeryTemplate?.id || '').trim(),
          anesthesia_type: existingAnesthesiaType,
          schedule_date: schedule.schedule_date,
          schedule_time: schedule.schedule_time,
          schedule_room: schedule.schedule_room,
          prep_items: normalizeChecklistItems(existingCheck.prep_items, 'patient-prep'),
          consumable_items: normalizeChecklistItems(existingCheck.consumable_items, 'patient-consumable'),
          notes: String(existingCheck.notes || '').trim(),
          status: String(existingCheck.status || '준비중').trim() || '준비중',
          applied_template_ids: Array.isArray(existingCheck.applied_template_ids)
            ? existingCheck.applied_template_ids.map((value) => String(value))
            : applicableTemplates.map((template) => String(template.id)),
          surgery_started_at: (existingCheck as Record<string, unknown>).surgery_started_at as string | null ?? null,
          surgery_ended_at: (existingCheck as Record<string, unknown>).surgery_ended_at as string | null ?? null,
          ward_message_sent_at: (existingCheck as Record<string, unknown>).ward_message_sent_at as string | null ?? null,
        };
      }

      return {
        id: null,
        schedule_post_id: schedule.id,
        patient_name: schedule.patient_name,
        chart_no: stripHiddenMetaBlocks(schedule.chart_no),
        surgery_name: schedule.surgery_name,
        surgery_template_id: String(matchedSurgeryTemplate?.id || '').trim(),
        anesthesia_type: '',
        schedule_date: schedule.schedule_date,
        schedule_time: schedule.schedule_time,
        schedule_room: schedule.schedule_room,
        prep_items: prepItems.length ? prepItems : [createChecklistItem('patient-prep')],
        consumable_items: consumableItems.length ? consumableItems : [createChecklistItem('patient-consumable')],
        notes: '',
        status: '준비중',
        applied_template_ids: applicableTemplates.map((template) => String(template.id)),
      };
    },
    [opTemplates, surgeryTemplates]
  );

  const selectedScheduleBaseline = useMemo(() => {
    if (!selectedSchedule) return null;
    return buildDefaultPatientCheck(selectedSchedule, patientChecksByScheduleId[selectedSchedule.id] || null);
  }, [buildDefaultPatientCheck, patientChecksByScheduleId, selectedSchedule]);

  const checkFormIsDirty = useMemo(() => {
    if (!checkForm || !selectedScheduleBaseline) return false;
    return buildPatientCheckSignature(checkForm) !== buildPatientCheckSignature(selectedScheduleBaseline);
  }, [checkForm, selectedScheduleBaseline]);

  const confirmWorkspaceTransition = useCallback(
    (actionLabel: string) => {
      if (!checkFormIsDirty || typeof window === 'undefined') return true;
      return window.confirm(
        `저장되지 않은 OP체크 변경사항이 있습니다.\n\n${actionLabel} 전에 저장하지 않은 내용이 사라질 수 있습니다.\n계속하시겠습니까?`,
      );
    },
    [checkFormIsDirty],
  );

  const handleScheduleSelection = useCallback(
    (post: LinkedSchedulePost, openWorkspace = false) => {
      const changingPatient = selectedScheduleId !== post.id;
      if (
        changingPatient &&
        !confirmWorkspaceTransition(`"${stripHiddenMetaBlocks(post.patient_name) || '선택한 환자'}" 환자로 이동하기`)
      ) {
        return;
      }

      applyDateAndScheduleSelection(post.schedule_date, post, {
        openWorkspace: openWorkspace || dayWorkspaceOpen,
      });
    },
    [applyDateAndScheduleSelection, confirmWorkspaceTransition, dayWorkspaceOpen, selectedScheduleId]
  );

  const handleCalendarDaySelection = useCallback(
    (dateKey: string, daySchedules: LinkedSchedulePost[]) => {
      const currentScheduleIdForDate =
        selectedSchedule && selectedSchedule.schedule_date === dateKey ? selectedSchedule.id : null;
      const nextSchedule = getPreferredScheduleForDate(dateKey, daySchedules, currentScheduleIdForDate);
      const willChangePatient = (nextSchedule?.id || null) !== currentScheduleIdForDate;
      const willChangeDate = dateKey !== selectedDate;

      if ((willChangeDate || willChangePatient) && !confirmWorkspaceTransition(`${formatDateLabel(dateKey)} 일정 열기`)) {
        return;
      }

      applyDateAndScheduleSelection(dateKey, nextSchedule, {
        openWorkspace: Boolean(nextSchedule),
      });
    },
    [applyDateAndScheduleSelection, confirmWorkspaceTransition, getPreferredScheduleForDate, selectedDate, selectedSchedule]
  );

  useEffect(() => {
    if (!selectedSchedule) {
      setCheckForm(null);
      return;
    }
    setCheckForm(buildDefaultPatientCheck(selectedSchedule, patientChecksByScheduleId[selectedSchedule.id] || null));
  }, [buildDefaultPatientCheck, patientChecksByScheduleId, selectedSchedule]);

  useEffect(() => {
    if (activeTab !== 'patients' && dayWorkspaceOpen) {
      setDayWorkspaceOpen(false);
    }
  }, [activeTab, dayWorkspaceOpen]);

  useEffect(() => {
    if (!dayWorkspaceOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [dayWorkspaceOpen]);

  useEffect(() => {
    if (!checkFormIsDirty || typeof window === 'undefined') return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [checkFormIsDirty]);

  const workspaceSchedules = useMemo(
    () => (hasActiveScheduleFilters ? filteredSchedules : selectedDateSchedules),
    [filteredSchedules, hasActiveScheduleFilters, selectedDateSchedules],
  );

  const workspaceSelectedIndex = useMemo(
    () => workspaceSchedules.findIndex((post) => post.id === selectedScheduleId),
    [selectedScheduleId, workspaceSchedules],
  );

  const selectedScheduleHiddenByFilters = useMemo(
    () =>
      Boolean(
        selectedScheduleId &&
          selectedDateSchedules.some((post) => post.id === selectedScheduleId) &&
          !workspaceSchedules.some((post) => post.id === selectedScheduleId),
      ),
    [selectedDateSchedules, selectedScheduleId, workspaceSchedules],
  );

  const selectedDateStatusCounts = useMemo(() => {
    const counts = {
      total: selectedDateSchedules.length,
      ready: 0,
      prepComplete: 0,
      inProgress: 0,
      done: 0,
    };

    selectedDateSchedules.forEach((post) => {
      const currentStatus = String(patientChecksByScheduleId[post.id]?.status || '준비중');
      if (currentStatus === '완료') {
        counts.done += 1;
        return;
      }
      if (currentStatus === '수술중') {
        counts.inProgress += 1;
        return;
      }
      if (currentStatus === '준비완료') {
        counts.prepComplete += 1;
        return;
      }
      counts.ready += 1;
    });

    return counts;
  }, [patientChecksByScheduleId, selectedDateSchedules]);

  const workspaceStatusSummaryCards = useMemo(
    () =>
      [
        {
          value: '준비중' as const,
          label: '준비중',
          count: selectedDateStatusCounts.ready,
          testId: 'ready',
          idleClass: 'bg-[var(--muted)]/45 text-[var(--foreground)]',
          labelClass: 'text-[var(--toss-gray-3)]',
          activeClass: 'bg-[var(--foreground)] text-white shadow-sm',
        },
        {
          value: '준비완료' as const,
          label: '준비완료',
          count: selectedDateStatusCounts.prepComplete,
          testId: 'prep-complete',
          idleClass: 'bg-[var(--toss-blue-light)]/75 text-[var(--accent)]',
          labelClass: 'text-[var(--accent)]',
          activeClass: 'bg-[var(--accent)] text-white shadow-sm',
        },
        {
          value: '수술중' as const,
          label: '수술중',
          count: selectedDateStatusCounts.inProgress,
          testId: 'in-progress',
          idleClass: 'bg-orange-50 text-orange-700',
          labelClass: 'text-orange-700',
          activeClass: 'bg-orange-500 text-white shadow-sm',
        },
        {
          value: '완료' as const,
          label: '완료',
          count: selectedDateStatusCounts.done,
          testId: 'done',
          idleClass: 'bg-emerald-50 text-emerald-700',
          labelClass: 'text-emerald-700',
          activeClass: 'bg-emerald-500 text-white shadow-sm',
        },
      ] satisfies ReadonlyArray<{
        value: '준비중' | '준비완료' | '수술중' | '완료';
        label: string;
        count: number;
        testId: string;
        idleClass: string;
        labelClass: string;
        activeClass: string;
      }>,
    [selectedDateStatusCounts],
  );

  const workspaceVisibleScheduleCount = workspaceSchedules.length;
  const workspaceSelectedOrderLabel =
    workspaceSelectedIndex >= 0 ? `${workspaceSelectedIndex + 1} / ${workspaceVisibleScheduleCount}` : `0 / ${workspaceVisibleScheduleCount}`;
  const workspaceDisplayChartNo = stripHiddenMetaBlocks(checkForm?.chart_no);
  const workspaceDisplayScheduleTime = stripHiddenMetaBlocks(checkForm?.schedule_time || '미정') || '미정';
  const workspaceDisplayScheduleRoom = stripHiddenMetaBlocks(checkForm?.schedule_room || '미정') || '미정';

  const prepSummaryText = useMemo(
    () => (checkForm ? summarizeChecklistItems(checkForm.prep_items) : '등록된 항목 없음'),
    [checkForm],
  );

  const consumableSummaryText = useMemo(
    () => (checkForm ? summarizeChecklistItems(checkForm.consumable_items) : '등록된 항목 없음'),
    [checkForm],
  );

  const notesSummaryText = useMemo(() => {
    const trimmedNotes = String(checkForm?.notes || '').trim();
    if (!trimmedNotes) return '메모 없음';
    return trimmedNotes.length > 80 ? `${trimmedNotes.slice(0, 80)}...` : trimmedNotes;
  }, [checkForm?.notes]);

  const toggleWorkspaceSection = useCallback((sectionKey: WorkspaceSectionKey) => {
    setWorkspaceSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }, []);

  const handleWorkspaceStatusSummaryClick = useCallback(
    (nextStatus: ScheduleStatus) => {
      const nextTab = statusFilterTab === nextStatus ? '전체' : nextStatus;

      if (dayWorkspaceOpen && selectedDate && nextTab !== '전체') {
        const matchingSchedules = searchFilteredSelectedDateSchedules.filter((post) => {
          const currentStatus = String(patientChecksByScheduleId[post.id]?.status || '준비중');
          return currentStatus === nextTab;
        });

        if (
          matchingSchedules.length > 0 &&
          !matchingSchedules.some((post) => post.id === selectedScheduleId)
        ) {
          const nextSchedule = getPreferredScheduleForDate(selectedDate, matchingSchedules);
          if (
            nextSchedule &&
            selectedScheduleId !== nextSchedule.id &&
            !confirmWorkspaceTransition(
              `"${stripHiddenMetaBlocks(nextSchedule.patient_name) || '선택 환자'}" 환자로 이동하기`,
            )
          ) {
            return;
          }

          if (nextSchedule) {
            applyDateAndScheduleSelection(selectedDate, nextSchedule, {
              openWorkspace: true,
            });
          }
        }
      }

      setStatusFilterTab(nextTab);
    },
    [
      applyDateAndScheduleSelection,
      confirmWorkspaceTransition,
      dayWorkspaceOpen,
      getPreferredScheduleForDate,
      patientChecksByScheduleId,
      searchFilteredSelectedDateSchedules,
      selectedDate,
      selectedScheduleId,
      statusFilterTab,
    ],
  );

  const handleWorkspaceClose = useCallback(() => {
    setDayWorkspaceOpen(false);
  }, []);

  const handleWorkspaceStep = useCallback(
    (offset: number) => {
      const nextSchedule = workspaceSchedules[workspaceSelectedIndex + offset];
      if (!nextSchedule) return;
      handleScheduleSelection(nextSchedule, true);
    },
    [handleScheduleSelection, workspaceSchedules, workspaceSelectedIndex],
  );

  const handleDateFilterChange = useCallback(
    (nextDate: string) => {
      const nextSchedules = getSortedSchedulesForDate(nextDate);
      const currentScheduleIdForDate =
        selectedSchedule && selectedSchedule.schedule_date === nextDate ? selectedSchedule.id : null;
      const nextSchedule = getPreferredScheduleForDate(nextDate, nextSchedules, currentScheduleIdForDate);
      const willChangePatient = (nextSchedule?.id || null) !== currentScheduleIdForDate;
      const willChangeDate = nextDate !== selectedDate;

      if ((willChangeDate || willChangePatient) && !confirmWorkspaceTransition(`${formatDateLabel(nextDate)} 일정 보기`)) {
        return;
      }

      applyDateAndScheduleSelection(nextDate, nextSchedule, {
        openWorkspace: dayWorkspaceOpen,
      });
    },
    [
      applyDateAndScheduleSelection,
      confirmWorkspaceTransition,
      dayWorkspaceOpen,
      getPreferredScheduleForDate,
      getSortedSchedulesForDate,
      selectedDate,
      selectedSchedule,
    ],
  );

  const handleTodaySelection = useCallback(() => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    handleDateFilterChange(todayKey);
  }, [handleDateFilterChange]);

  const handleWorkspaceOpen = useCallback(() => {
    const currentScheduleIdForDate =
      selectedSchedule && selectedSchedule.schedule_date === selectedDate ? selectedSchedule.id : null;
    const nextSchedule = getPreferredScheduleForDate(
      selectedDate,
      filteredSchedules.length > 0 ? filteredSchedules : selectedDateSchedules,
      currentScheduleIdForDate,
    );
    if (!nextSchedule) return;
    handleScheduleSelection(nextSchedule, true);
  }, [filteredSchedules, getPreferredScheduleForDate, handleScheduleSelection, selectedDate, selectedDateSchedules, selectedSchedule]);

  useEffect(() => {
    if (!dayWorkspaceOpen || activeTab !== 'patients' || showWardMsgModal || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isInteractiveKeyboardTarget(event.target)) return;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        if (workspaceSelectedIndex <= 0) return;
        event.preventDefault();
        handleWorkspaceStep(-1);
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        if (workspaceSelectedIndex < 0 || workspaceSelectedIndex >= workspaceSchedules.length - 1) return;
        event.preventDefault();
        handleWorkspaceStep(1);
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        handleWorkspaceClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeTab,
    dayWorkspaceOpen,
    handleWorkspaceClose,
    handleWorkspaceStep,
    showWardMsgModal,
    workspaceSchedules.length,
    workspaceSelectedIndex,
  ]);

  const inventoryNameMap = useMemo(
    () =>
      inventoryItems.reduce<Record<string, InventoryItem>>((acc, item) => {
        const key = normalizeLookupValue(item.name);
        if (key && !acc[key]) acc[key] = item;
        return acc;
      }, {}),
    [inventoryItems]
  );

  const itemSuggestions = useMemo(() => {
    const names = new Set<string>();
    inventoryItems.forEach((item) => {
      const name = String(item.name || '').trim();
      if (name) names.add(name);
    });
    opTemplates.forEach((template) => {
      normalizeChecklistItems(template.prep_items, 'template').forEach((item) => names.add(item.name));
      normalizeChecklistItems(template.consumable_items, 'template').forEach((item) => names.add(item.name));
    });
    return Array.from(names).sort();
  }, [inventoryItems, opTemplates]);

  const mergeTemplateItemsIntoForm = useCallback(() => {
    if (!selectedSchedule || !checkForm) return;

    const matchedSurgeryTemplate = findMatchingSurgeryTemplate(surgeryTemplates, selectedSchedule.surgery_name);
    const applicableTemplates = opTemplates.filter((template) => {
      if (template.is_active === false) return false;
      if (template.template_scope === 'anesthesia') {
        return (
          !!checkForm.anesthesia_type &&
          normalizeLookupValue(template.anesthesia_type) === normalizeLookupValue(checkForm.anesthesia_type)
        );
      }

      const matchesTemplateId =
        template.surgery_template_id &&
        matchedSurgeryTemplate?.id &&
        String(template.surgery_template_id) === String(matchedSurgeryTemplate.id);

      return (
        matchesTemplateId ||
        normalizeLookupValue(template.surgery_name) === normalizeLookupValue(selectedSchedule.surgery_name)
      );
    });

    const templatePrepItems = dedupeChecklistItems(
      applicableTemplates.flatMap((template) =>
        normalizeChecklistItems(template.prep_items, 'merged-prep', buildTemplateLabel(template))
      )
    );
    const templateConsumableItems = dedupeChecklistItems(
      applicableTemplates.flatMap((template) =>
        normalizeChecklistItems(template.consumable_items, 'merged-consumable', buildTemplateLabel(template))
      )
    );

    setCheckForm((prev) => {
      if (!prev) return prev;

      const mergeItems = (existingItems: ChecklistItemDraft[], nextItems: ChecklistItemDraft[]) => {
        const existingMap = new Map(
          existingItems.map((item) => [normalizeLookupValue(item.name), item] as const)
        );
        const nextKeys = new Set(nextItems.map((item) => normalizeLookupValue(item.name)).filter(Boolean));

        const mergedItems = nextItems.map((item) => {
          const matched = existingMap.get(normalizeLookupValue(item.name));
          if (!matched) return item;
          return {
            ...item,
            checked: Boolean(matched.checked),
            quantity: matched.quantity || item.quantity || '',
            unit: matched.unit || item.unit || '',
            note: matched.note || item.note || '',
          };
        });

        const customItems = existingItems.filter((item) => {
          const key = normalizeLookupValue(item.name);
          return key && !nextKeys.has(key);
        });

        return dedupeChecklistItems([...mergedItems, ...customItems]);
      };

      return {
        ...prev,
        surgery_template_id: String(matchedSurgeryTemplate?.id || prev.surgery_template_id || '').trim(),
        prep_items: mergeItems(prev.prep_items, templatePrepItems.length ? templatePrepItems : [createChecklistItem('patient-prep')]),
        consumable_items: mergeItems(
          prev.consumable_items,
          templateConsumableItems.length ? templateConsumableItems : [createChecklistItem('patient-consumable')]
        ),
        applied_template_ids: applicableTemplates.map((template) => String(template.id)),
      };
    });

    toast('수술/마취 템플릿 기준으로 OP체크 항목을 반영했습니다.', 'success');
  }, [checkForm, opTemplates, selectedSchedule, surgeryTemplates]);

  const updateCheckFormList = useCallback(
    (
      key: 'prep_items' | 'consumable_items',
      updater: (items: ChecklistItemDraft[]) => ChecklistItemDraft[]
    ) => {
      setCheckForm((prev) => (prev ? { ...prev, [key]: updater(prev[key]) } : prev));
    },
    []
  );

  const savePatientCheck = useCallback(async () => {
    if (!checkForm || !selectedSchedule) return;

    setSavingCheck(true);
    try {
      const payload = {
        id: checkForm.id || undefined,
        schedule_post_id: checkForm.schedule_post_id,
        company_id: String(selectedSchedule.company_id || user?.company_id || '').trim() || null,
        company_name: String(selectedSchedule.company || user?.company || '전체').trim() || '전체',
        patient_name: checkForm.patient_name,
        chart_no: checkForm.chart_no || null,
        surgery_name: checkForm.surgery_name,
        surgery_template_id: checkForm.surgery_template_id || null,
        anesthesia_type: checkForm.anesthesia_type || null,
        schedule_date: checkForm.schedule_date || null,
        schedule_time: checkForm.schedule_time || null,
        schedule_room: checkForm.schedule_room || null,
        prep_items: formatChecklistItems(checkForm.prep_items),
        consumable_items: formatChecklistItems(checkForm.consumable_items),
        notes: checkForm.notes || null,
        status: checkForm.status || '준비중',
        applied_template_ids: checkForm.applied_template_ids,
        created_by: String(user?.id || '').trim() || null,
        created_by_name: String(user?.name || '').trim() || null,
        updated_by: String(user?.id || '').trim() || null,
        updated_by_name: String(user?.name || '').trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await withMissingColumnsFallback<OpPatientCheck>(
        async (omittedColumns): Promise<QueryResult<OpPatientCheck>> => {
          const result = await supabase
            .from('op_patient_checks')
            .upsert(payload, { onConflict: 'schedule_post_id' })
            .select(
              buildSelectColumns(
                OP_PATIENT_CHECK_REQUIRED_COLUMNS,
                OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
                omittedColumns,
              ),
            )
            .single();
          return result as unknown as QueryResult<OpPatientCheck>;
        },
        [...OP_PATIENT_CHECK_OPTIONAL_COLUMNS],
      );

      if (error) throw error;

      const nextRow = data as OpPatientCheck;
      setPatientChecks((prev) => {
        const filtered = prev.filter((row) => String(row.schedule_post_id || '') !== checkForm.schedule_post_id);
        return [nextRow, ...filtered];
      });
      setCheckForm(buildDefaultPatientCheck(selectedSchedule, nextRow));
      toast('환자별 OP체크를 저장했습니다.', 'success');
    } catch (error) {
      console.error('OP체크 저장 실패', error);
      toast('OP체크 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingCheck(false);
    }
  }, [buildDefaultPatientCheck, checkForm, selectedSchedule, user?.company, user?.company_id, user?.id, user?.name]);

  // savePatientCheckRef 항상 최신 함수로 동기화
  useEffect(() => {
    savePatientCheckRef.current = savePatientCheck;
  }, [savePatientCheck]);

  // #3 수술중 상태일 때 소모품 변경 3초 후 자동저장
  const consumableKey = checkForm?.status === '수술중'
    ? JSON.stringify(checkForm.consumable_items)
    : null;
  useEffect(() => {
    if (!consumableKey) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void savePatientCheckRef.current();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [consumableKey]);

  const updateTemplateEditorList = useCallback(
    (
      key: 'prep_items' | 'consumable_items',
      updater: (items: ChecklistItemDraft[]) => ChecklistItemDraft[]
    ) => {
      setTemplateEditor((prev) => ({ ...prev, [key]: updater(prev[key]) }));
    },
    []
  );

  const saveTemplate = useCallback(async () => {
    const effectiveName =
      templateEditor.template_name.trim() ||
      (templateEditor.template_scope === 'anesthesia'
        ? templateEditor.anesthesia_type.trim()
        : templateEditor.surgery_name.trim());

    if (!effectiveName) {
      toast('템플릿 이름을 입력해 주세요.', 'warning');
      return;
    }

    if (templateEditor.template_scope === 'surgery' && !templateEditor.surgery_name.trim()) {
      toast('수술명을 선택하거나 입력해 주세요.', 'warning');
      return;
    }

    if (templateEditor.template_scope === 'anesthesia' && !templateEditor.anesthesia_type.trim()) {
      toast('마취 유형을 입력해 주세요.', 'warning');
      return;
    }

    setSavingTemplate(true);
    try {
      const payload = {
        company_id: String(user?.company_id || '').trim() || null,
        company_name: String(user?.company || '전체').trim() || '전체',
        template_scope: templateEditor.template_scope,
        template_name: effectiveName,
        surgery_template_id:
          templateEditor.template_scope === 'surgery' && templateEditor.surgery_template_id
            ? templateEditor.surgery_template_id
            : null,
        surgery_name: templateEditor.template_scope === 'surgery' ? templateEditor.surgery_name.trim() : null,
        anesthesia_type:
          templateEditor.template_scope === 'anesthesia' ? templateEditor.anesthesia_type.trim() : null,
        prep_items: formatChecklistItems(templateEditor.prep_items),
        consumable_items: formatChecklistItems(templateEditor.consumable_items),
        notes: templateEditor.notes.trim() || null,
        is_active: templateEditor.is_active,
        created_by: String(user?.id || '').trim() || null,
        created_by_name: String(user?.name || '').trim() || null,
        updated_at: new Date().toISOString(),
      };

      const response = (templateEditor.id
        ? await supabase
            .from('op_check_templates')
            .update(payload)
            .eq('id', templateEditor.id)
            .select(OP_CHECK_TEMPLATE_SELECT)
            .single()
        : await supabase
            .from('op_check_templates')
            .insert({
              ...payload,
              created_at: new Date().toISOString(),
            })
            .select(OP_CHECK_TEMPLATE_SELECT)
            .single()) as unknown as QueryResult<OpCheckTemplate>;

      if (response.error) throw response.error;

      const savedRow = response.data as OpCheckTemplate;
      setOpTemplates((prev) => {
        const filtered = prev.filter((row) => String(row.id || '') !== String(savedRow.id || ''));
        return [...filtered, savedRow].sort((left, right) =>
          String(buildTemplateLabel(left)).localeCompare(String(buildTemplateLabel(right)), 'ko')
        );
      });
      setTemplateEditor(emptyTemplateEditor());
      toast('OP체크 템플릿을 저장했습니다.', 'success');
    } catch (error) {
      console.error('OP체크 템플릿 저장 실패', error);
      toast('템플릿 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingTemplate(false);
    }
  }, [templateEditor, user?.company, user?.company_id, user?.id, user?.name]);

  const loadTemplateIntoEditor = useCallback((template: OpCheckTemplate) => {
    setTemplateEditor({
      id: String(template.id || ''),
      template_scope: (template.template_scope === 'anesthesia' ? 'anesthesia' : 'surgery') as TemplateScope,
      template_name: String(template.template_name || '').trim(),
      surgery_template_id: String(template.surgery_template_id || '').trim(),
      surgery_name: String(template.surgery_name || '').trim(),
      anesthesia_type: String(template.anesthesia_type || '').trim(),
      prep_items: normalizeChecklistItems(template.prep_items, 'template-prep'),
      consumable_items: normalizeChecklistItems(template.consumable_items, 'template-consumable'),
      notes: String(template.notes || '').trim(),
      is_active: template.is_active !== false,
    });
  }, []);

  const quickStatusChange = useCallback(async (newStatus: string) => {
    if (!checkForm || !selectedSchedule) return;

    // #1 준비완료 전 미체크 항목 경고
    if (newStatus === '준비완료') {
      const unchecked = checkForm.prep_items.filter((item) => item.name && !item.checked);
      if (unchecked.length > 0) {
        const proceed = window.confirm(
          `준비 체크 미완료 항목이 ${unchecked.length}개 있습니다.\n\n미완료 항목:\n${unchecked.map((i) => `  · ${i.name}`).join('\n')}\n\n그래도 준비완료로 변경하시겠습니까?`
        );
        if (!proceed) return;
      }
    }

    setSavingCheck(true);
    try {
      const now = new Date().toISOString();
      const capturedConsumables = checkForm.consumable_items;

      const basePayload = {
        schedule_post_id: checkForm.schedule_post_id,
        company_id: String(selectedSchedule.company_id || user?.company_id || '').trim() || null,
        company_name: String(selectedSchedule.company || user?.company || '전체').trim() || '전체',
        patient_name: checkForm.patient_name,
        chart_no: checkForm.chart_no || null,
        surgery_name: checkForm.surgery_name,
        surgery_template_id: checkForm.surgery_template_id || null,
        anesthesia_type: checkForm.anesthesia_type || null,
        schedule_date: checkForm.schedule_date || null,
        schedule_time: checkForm.schedule_time || null,
        schedule_room: checkForm.schedule_room || null,
        prep_items: formatChecklistItems(checkForm.prep_items),
        consumable_items: formatChecklistItems(checkForm.consumable_items),
        notes: checkForm.notes || null,
        status: newStatus,
        applied_template_ids: checkForm.applied_template_ids,
        created_by: String(user?.id || '').trim() || null,
        created_by_name: String(user?.name || '').trim() || null,
        updated_by: String(user?.id || '').trim() || null,
        updated_by_name: String(user?.name || '').trim() || null,
        updated_at: now,
        // #6 타임스탬프 자동 기록
        surgery_started_at: (newStatus === '수술중' || newStatus === '완료')
          ? (checkForm.surgery_started_at || now)
          : (checkForm.surgery_started_at || null),
        surgery_ended_at: newStatus === '완료' ? now : (checkForm.surgery_ended_at || null),
        ward_message_sent_at: checkForm.ward_message_sent_at || null,
      };

      const { data, error } = await withMissingColumnsFallback<OpPatientCheck>(
        async (omittedColumns) => {
          const payload = { ...basePayload };
          omittedColumns.forEach((col) => delete (payload as Record<string, unknown>)[col]);
          return supabase
            .from('op_patient_checks')
            .upsert(payload, { onConflict: 'schedule_post_id' })
            .select(
              buildSelectColumns(
                OP_PATIENT_CHECK_REQUIRED_COLUMNS,
                OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
                omittedColumns,
              ),
            )
            .single() as unknown as Promise<{ data: OpPatientCheck | null; error: unknown }>;
        },
        ['surgery_started_at', 'surgery_ended_at', 'ward_message_sent_at'],
      );

      if (error) throw error;
      const nextRow = data as OpPatientCheck;
      setPatientChecks((prev) => {
        const filtered = prev.filter((r) => String(r.schedule_post_id || '') !== checkForm.schedule_post_id);
        return [nextRow, ...filtered];
      });
      setCheckForm(buildDefaultPatientCheck(selectedSchedule, nextRow));
      toast(`상태가 "${newStatus}"(으)로 변경되었습니다.`, 'success');

      // #8 완료 시 재고 차감 프롬프트 (비동기로 별도 실행)
      if (newStatus === '완료') {
        const itemsWithQty = capturedConsumables.filter(
          (item) => item.name && item.quantity && Number(item.quantity) > 0
        );
        if (itemsWithQty.length > 0) {
          setTimeout(() => {
            const proceed = window.confirm(
              `수술 완료 처리되었습니다.\n\n사용된 소모품 ${itemsWithQty.length}종의 재고를 자동으로 차감하시겠습니까?\n\n${itemsWithQty.map((i) => `  · ${i.name} ${i.quantity}${i.unit || ''}`).join('\n')}`
            );
            if (proceed) void deductInventoryItems(itemsWithQty);
          }, 300);
        }
      }
    } catch (err) {
      console.error('상태 변경 실패', err);
      toast('상태 변경 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingCheck(false);
    }
  }, [buildDefaultPatientCheck, checkForm, selectedSchedule, user?.company, user?.company_id, user?.id, user?.name]);

  const addWardMessageTarget = useCallback((targetId: string) => {
    const normalizedTargetId = String(targetId || '').trim();
    if (!normalizedTargetId) return;
    setWardMsgTargets((prev) =>
      prev.includes(normalizedTargetId) ? prev : [...prev, normalizedTargetId],
    );
    setWardRecipientSearch('');
    setWardRecipientPickerOpen(false);
  }, []);

  const removeWardMessageTarget = useCallback((targetId: string) => {
    const normalizedTargetId = String(targetId || '').trim();
    if (!normalizedTargetId) return;
    setWardMsgTargets((prev) => prev.filter((currentId) => currentId !== normalizedTargetId));
  }, []);

  const toggleWardFavoriteTarget = useCallback((targetId: string) => {
    const normalizedTargetId = String(targetId || '').trim();
    if (!normalizedTargetId) return;
    setWardFavoriteTargets((prev) =>
      prev.includes(normalizedTargetId)
        ? prev.filter((currentId) => currentId !== normalizedTargetId)
        : [...prev, normalizedTargetId],
    );
  }, []);

  const openWardMsgModal = useCallback(async () => {
    if (!checkForm || !selectedSchedule) return;
    setWardMsgText(wardMessageTemplates[0]?.text || '');
    setWardMsgTargets([]);
    setWardRecipientSearch('');
    setWardRecipientPickerOpen(false);
    try {
      const companyId = String(
        selectedSchedule.company_id || selectedCompanyId || user?.company_id || '',
      ).trim();
      const senderId = String(user?.id || '').trim();
      const companyName = String(
        selectedSchedule.company || selectedCo || user?.company || '',
      ).trim();
      const hasPrefetchedStaffs = Array.isArray(staffs) && staffs.length > 0;
      if (hasPrefetchedStaffs) {
        setWardStaffs(
          normalizeWardStaffList(
            resolveWardStaffCandidates(staffs, companyId, companyName) as WardStaffRow[],
            senderId,
          ),
        );
      } else {
        const { data } = await supabase
          .from('staff_members')
          .select('id, name, department, position, company, company_id')
          .order('name');
        setWardStaffs(
          normalizeWardStaffList(
            resolveWardStaffCandidates((data || []) as WardStaffRow[], companyId, companyName),
            senderId,
          ),
        );
      }
    } catch (e) {
      console.error('직원 목록 로딩 실패', e);
    }
    setShowWardMsgModal(true);
  }, [
    checkForm,
    selectedCo,
    selectedCompanyId,
    selectedSchedule,
    staffs,
    wardMessageTemplates,
    user?.company,
    user?.company_id,
    user?.id,
  ]);

  const sendWardMessage = useCallback(async () => {
    if (!wardMsgTargets.length || !normalizedWardMessageText) {
      toast('받는 사람과 메시지 내용을 입력해 주세요.', 'warning');
      return;
    }
    const senderId = String(user?.id || '').trim();
    if (!senderId) {
      toast('로그인 정보를 확인해 주세요.', 'error');
      return;
    }
    setSendingMsg(true);
    try {
      const roomLookupResult = await withMissingColumnFallback<ChatRoomMemberLookupRow[]>(
        async () =>
          supabase
            .from('chat_rooms')
            .select('id, members')
            .eq('type', 'direct')
            .contains('members', [senderId]) as unknown as Promise<QueryResult<ChatRoomMemberLookupRow[]>>,
        async () =>
          supabase
            .from('chat_rooms')
            .select('id, member_ids')
            .eq('type', 'direct')
            .contains('member_ids', [senderId]) as unknown as Promise<QueryResult<ChatRoomMemberLookupRow[]>>,
        'members',
      );

      if (roomLookupResult.error) {
        throw roomLookupResult.error;
      }

      const existingRoomMap = new Map<string, string>(
        (roomLookupResult.data || [])
          .flatMap((r) =>
            getChatRoomMemberIds(r)
              .filter((mid) => mid !== senderId)
              .map((mid) => [mid, r.id as string] as [string, string])
          )
      );

      let successCount = 0;
      let failedCount = 0;
      const successfulTargetIds: string[] = [];
      const companyId = String(selectedSchedule?.company_id || user?.company_id || '').trim();
      const storedWardMessageText = buildWardMessageContent(normalizedWardMessageText, checkForm);
      for (const targetId of wardMsgTargets) {
        let roomId = existingRoomMap.get(targetId);
        if (!roomId) {
          const targetStaff = wardStaffMap.get(targetId);
          const roomCreateResult = await withMissingColumnsFallback<ChatRoomMemberLookupRow>(
            async (omittedColumns) => {
              const roomPayload: Record<string, unknown> = {
                type: 'direct',
                name: targetStaff?.name || '개인 메시지',
              };
              if (omittedColumns.has('members')) {
                roomPayload.member_ids = [senderId, targetId];
              } else {
                roomPayload.members = [senderId, targetId];
              }
              if (!omittedColumns.has('company_id') && companyId) {
                roomPayload.company_id = companyId;
              }
              return supabase
                .from('chat_rooms')
                .insert(roomPayload)
                .select('id')
                .single() as unknown as Promise<QueryResult<ChatRoomMemberLookupRow>>;
            },
            ['members', 'company_id'],
          );
          if (roomCreateResult.error) {
            failedCount++;
            console.error('채팅방 생성 실패', roomCreateResult.error);
            continue;
          }
          const newRoom = roomCreateResult.data;
          roomId = String(newRoom?.id || '');
          if (roomId) {
            existingRoomMap.set(targetId, roomId);
          }
        }
        if (roomId) {
          const { error: msgErr } = await supabase
            .from('messages')
            .insert({ room_id: roomId, sender_id: senderId, content: storedWardMessageText });
          if (msgErr) {
            failedCount++;
            console.error('메시지 저장 실패', msgErr);
            continue;
          }
          successCount++;
          successfulTargetIds.push(targetId);
        }
      }
      if (successCount > 0) {
        // ward_message_sent_at 기록
        if (checkForm?.schedule_post_id) {
          const now = new Date().toISOString();
          await withMissingColumnsFallback(
            async (omittedColumns) => {
              if (omittedColumns.has('ward_message_sent_at')) return { data: null, error: null };
              return supabase
                .from('op_patient_checks')
                .upsert(
                  { schedule_post_id: checkForm.schedule_post_id, ward_message_sent_at: now },
                  { onConflict: 'schedule_post_id' }
                )
                .select('id')
                .single();
            },
            ['ward_message_sent_at'],
          );
          setCheckForm((prev) => (prev ? { ...prev, ward_message_sent_at: now } : prev));
        }
        setWardMsgText(normalizedWardMessageText);
        setWardRecentTargets((prev) => updateRecentTargetIds(prev, successfulTargetIds));
        if (failedCount > 0) {
          toast(`병동팀 ${successCount}명에게 전송했고 ${failedCount}명은 실패했습니다.`, 'warning');
        } else {
          toast(`병동팀 ${successCount}명에게 메시지를 보냈습니다.`, 'success');
        }
      } else {
        toast('메시지 전송에 실패했습니다. 다시 시도해 주세요.', 'error');
      }
      closeWardMessageModal();
    } catch (err) {
      console.error('메시지 전송 실패', err);
      toast('메시지 전송 중 오류가 발생했습니다.', 'error');
    } finally {
      setSendingMsg(false);
    }
  }, [checkForm, closeWardMessageModal, normalizedWardMessageText, selectedSchedule?.company_id, wardMsgTargets, wardStaffMap, user?.id, user?.company_id]);

  // #8 소모품 재고 차감
  const deductInventoryItems = useCallback(async (items: ChecklistItemDraft[]) => {
    setDeductingInventory(true);
    try {
      let successCount = 0;
      for (const item of items) {
        const match = inventoryNameMap[normalizeLookupValue(item.name)];
        if (!match) continue;
        const newQty = Math.max(0, (match.quantity || 0) - Number(item.quantity || 0));
        const { error } = await supabase
          .from('inventory_items')
          .update({ quantity: newQty })
          .eq('id', match.id);
        if (!error) {
          setInventoryItems((prev) =>
            prev.map((inv) => (inv.id === match.id ? { ...inv, quantity: newQty } : inv))
          );
          successCount++;
        }
      }
      toast(`소모품 ${successCount}종 재고를 차감했습니다.`, 'success');
    } catch (err) {
      console.error('재고 차감 실패', err);
      toast('재고 차감 중 오류가 발생했습니다.', 'error');
    } finally {
      setDeductingInventory(false);
    }
  }, [inventoryNameMap]);

  const removeTemplate = useCallback(async (templateId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('이 템플릿을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('op_check_templates').delete().eq('id', templateId);
      if (error) throw error;
      setOpTemplates((prev) => prev.filter((template) => String(template.id || '') !== templateId));
      if (templateEditor.id === templateId) {
        setTemplateEditor(emptyTemplateEditor());
      }
      toast('템플릿을 삭제했습니다.', 'success');
    } catch (error) {
      console.error('OP체크 템플릿 삭제 실패', error);
      toast('템플릿 삭제 중 오류가 발생했습니다.', 'error');
    }
  }, [templateEditor.id]);

  const templatesByScope = useMemo(
    () => ({
      surgery: opTemplates.filter((template) => template.template_scope !== 'anesthesia'),
      anesthesia: opTemplates.filter((template) => template.template_scope === 'anesthesia'),
    }),
    [opTemplates]
  );

  const renderItemRows = useCallback(
    (
      items: ChecklistItemDraft[],
      kind: 'prep' | 'consumable',
      onChange: (next: ChecklistItemDraft[]) => void
    ) => (
      <div className="space-y-2">
        {items.map((item, index) => {
          const inventoryMatch = inventoryNameMap[normalizeLookupValue(item.name)];
          return (
            <div
              key={item.id}
              className={`rounded-[var(--radius-md)] border bg-[var(--card)] p-2.5 transition-colors ${
                item.checked ? 'border-emerald-200 bg-emerald-50/40' : 'border-[var(--border)]'
              }`}
            >
              {/* Row 1: checkbox + name + delete */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(item.checked)}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, checked: event.target.checked };
                    onChange(next);
                  }}
                  className="h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent)]"
                />
                <input
                  value={item.name}
                  list={ITEM_SUGGESTION_ID}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, name: event.target.value };
                    onChange(next);
                  }}
                  placeholder={kind === 'prep' ? '준비 물품명' : '사용 소모품명'}
                  className={`min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-sm font-medium ${
                    item.checked ? 'text-[var(--toss-gray-3)] line-through' : 'text-[var(--foreground)]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = items.filter((row) => row.id !== item.id);
                    onChange(next.length ? next : [createChecklistItem(kind === 'prep' ? 'patient-prep' : 'patient-consumable')]);
                  }}
                  className="shrink-0 rounded-[var(--radius-md)] px-2 py-1.5 text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-rose-50 hover:text-rose-500"
                >
                  ✕
                </button>
              </div>

              {/* Row 2: quantity + unit + note + tags */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {kind === 'consumable' ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...items];
                        const cur = Number(next[index].quantity || 0);
                        if (cur > 0) next[index] = { ...item, quantity: String(cur - 1) };
                        onChange(next);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      −
                    </button>
                    <input
                      value={item.quantity || ''}
                      onChange={(event) => {
                        const next = [...items];
                        next[index] = { ...item, quantity: event.target.value };
                        onChange(next);
                      }}
                      placeholder="0"
                      className="w-10 rounded-[var(--radius-md)] border border-[var(--border)] px-1 py-1.5 text-center text-sm font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...items];
                        const cur = Number(next[index].quantity || 0);
                        next[index] = { ...item, quantity: String(cur + 1) };
                        onChange(next);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--toss-blue-light)] text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/20"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <input
                    value={item.quantity || ''}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, quantity: event.target.value };
                      onChange(next);
                    }}
                    placeholder="수량"
                    className="w-16 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-sm"
                  />
                )}
                <input
                  value={item.unit || ''}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, unit: event.target.value };
                    onChange(next);
                  }}
                  placeholder="단위"
                  className="w-16 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-sm"
                />
                <input
                  value={item.note || ''}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, note: event.target.value };
                    onChange(next);
                  }}
                  placeholder="메모"
                  className="min-w-[80px] flex-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-sm"
                />
                {item.source_label ? (
                  <span className="rounded-full bg-[var(--toss-blue-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    {item.source_label}
                  </span>
                ) : null}
                {inventoryMatch ? (
                  <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
                    재고 {String(inventoryMatch.quantity ?? 0)}{String(inventoryMatch.unit || item.unit || '').trim() ? ` ${String(inventoryMatch.unit || item.unit || '').trim()}` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    ),
    [inventoryNameMap]
  );

  const renderTemplateItemRows = useCallback(
    (
      items: ChecklistItemDraft[],
      kind: 'prep' | 'consumable',
      onChange: (next: ChecklistItemDraft[]) => void
    ) => (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 md:grid-cols-[1.5fr,0.7fr,0.7fr,1fr,auto]"
          >
            <input
              value={item.name}
              list={ITEM_SUGGESTION_ID}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, name: event.target.value };
                onChange(next);
              }}
              placeholder={kind === 'prep' ? '기본 준비 물품명' : '기본 소모품명'}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
            />
            <input
              value={item.quantity || ''}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, quantity: event.target.value };
                onChange(next);
              }}
              placeholder="기본 수량"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              value={item.unit || ''}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, unit: event.target.value };
                onChange(next);
              }}
              placeholder="단위"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              value={item.note || ''}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, note: event.target.value };
                onChange(next);
              }}
              placeholder="기본 메모"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const next = items.filter((row) => row.id !== item.id);
                onChange(next.length ? next : [createChecklistItem(kind === 'prep' ? 'template-prep' : 'template-consumable')]);
              }}
              className="rounded-full border border-[var(--border)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    ),
    []
  );

  const renderStatusFilterTabs = useCallback(
    (className = 'mb-2 flex flex-wrap gap-1') => (
      <OpCheckStatusFilterTabs
        className={className}
        activeTab={statusFilterTab}
        options={statusFilterTabOptions}
        onChange={(value) => setStatusFilterTab(value as '전체' | ScheduleStatus)}
      />
    ),
    [statusFilterTab, statusFilterTabOptions],
  );

  const renderFilteredScheduleList = useCallback(
    ({
      containerClassName,
      emptyMessage,
      openWorkspaceOnSelect,
      layout = 'stack',
      testIdPrefix,
      schedules = filteredSchedules,
    }: {
      containerClassName: string;
      emptyMessage: string;
      openWorkspaceOnSelect: boolean;
      layout?: 'stack' | 'row';
      testIdPrefix: string;
      schedules?: LinkedSchedulePost[];
    }) => (
      <OpCheckScheduleList
        items={schedules}
        containerClassName={containerClassName}
        emptyMessage={emptyMessage}
        openWorkspaceOnSelect={openWorkspaceOnSelect}
        layout={layout}
        testIdPrefix={testIdPrefix}
        selectedScheduleId={selectedScheduleId}
        statusByScheduleId={patientCheckStatusByScheduleId}
        sanitizeText={stripHiddenMetaBlocks}
        onSelect={handleScheduleSelection}
      />
    ),
    [handleScheduleSelection, patientCheckStatusByScheduleId, selectedScheduleId],
  );

  const patientWorkspaceTopPanel = !selectedSchedule || !checkForm ? (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-center shadow-sm">
      <p className="text-sm font-bold text-[var(--foreground)]">환자를 선택해 주세요.</p>
      <p className="mt-1 text-[11px] font-medium text-[var(--toss-gray-3)]">수술환자 목록에서 바로 선택할 수 있습니다.</p>
    </div>
  ) : (
    <OpCheckWorkspaceHeader
      patientName={checkForm.patient_name}
      status={checkForm.status}
      orderLabel={workspaceSelectedOrderLabel}
      surgeryName={checkForm.surgery_name}
      scheduleTime={workspaceDisplayScheduleTime}
      scheduleRoom={workspaceDisplayScheduleRoom}
      chartNo={workspaceDisplayChartNo || '-'}
      isDirty={checkFormIsDirty}
      hiddenByFilters={selectedScheduleHiddenByFilters}
      prevDisabled={workspaceSelectedIndex <= 0}
      nextDisabled={workspaceSelectedIndex < 0 || workspaceSelectedIndex >= workspaceSchedules.length - 1}
      saving={savingCheck}
      onPrev={() => handleWorkspaceStep(-1)}
      onNext={() => handleWorkspaceStep(1)}
      onPrint={() => setPrintModalOpen(true)}
      onSave={() => void savePatientCheck()}
    />
  );

  const patientWorkspaceDetailContent = !selectedSchedule || !checkForm ? (
    <div
      data-testid="op-check-workspace-empty"
      className="empty-state rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center shadow-sm"
    >
      <p className="text-base font-bold text-[var(--foreground)]">환자를 선택해 주세요.</p>
      <p className="mt-2 text-sm font-medium text-[var(--toss-gray-3)]">
        해당 날짜 환자를 선택하면 OP체크 항목이 자동으로 준비됩니다.
      </p>
    </div>
  ) : (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <OpCheckWorkspaceProgressPanel
          status={checkForm.status}
          saving={savingCheck}
          onQuickStatusChange={(status) => void quickStatusChange(status)}
          onOpenWardMessage={() => void openWardMsgModal()}
        />

        <OpCheckWorkspaceMetaPanel
          anesthesiaType={checkForm.anesthesia_type}
          appliedTemplateCount={checkForm.applied_template_ids.length}
          surgeryFasting={selectedSchedule.surgery_fasting}
          surgeryInpatient={selectedSchedule.surgery_inpatient}
          surgeryGuardian={selectedSchedule.surgery_guardian}
          surgeryCaregiver={selectedSchedule.surgery_caregiver}
          surgeryTransfusion={selectedSchedule.surgery_transfusion}
          surgeryStartedAt={checkForm.surgery_started_at}
          surgeryEndedAt={checkForm.surgery_ended_at}
          wardMessageSentAt={checkForm.ward_message_sent_at}
          deductingInventory={deductingInventory}
          onAnesthesiaTypeChange={(value) =>
            setCheckForm((prev) => (prev ? { ...prev, anesthesia_type: value } : prev))
          }
          onApplyTemplate={mergeTemplateItemsIntoForm}
        />

      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <OpCheckWorkspaceChecklistSection
          title="수술 전 준비 체크"
          collapsedSummary={prepSummaryText}
          expandedSummary="수술명과 마취 유형 템플릿을 바탕으로 필요한 준비사항을 환자별로 확인합니다."
          expanded={workspaceSections.prep}
          onToggle={() => toggleWorkspaceSection('prep')}
          toggleTestId="op-check-section-toggle-prep"
          contentTestId="op-check-section-content-prep"
          addButtonLabel="준비항목 추가"
          addButtonTestId="op-check-prep-add"
          onAdd={() => updateCheckFormList('prep_items', (items) => [...items, createChecklistItem('patient-prep')])}
        >
          {renderItemRows(checkForm.prep_items, 'prep', (next) => updateCheckFormList('prep_items', () => next))}
        </OpCheckWorkspaceChecklistSection>

        <OpCheckWorkspaceChecklistSection
          title="수술 중 의료소모품 사용 체크"
          collapsedSummary={consumableSummaryText}
          expandedSummary="실제 사용한 소모품을 체크하고 수량과 메모를 남겨 관리합니다."
          expanded={workspaceSections.consumable}
          onToggle={() => toggleWorkspaceSection('consumable')}
          toggleTestId="op-check-section-toggle-consumable"
          contentTestId="op-check-section-content-consumable"
          addButtonLabel="소모품 추가"
          addButtonTestId="op-check-consumable-add"
          onAdd={() =>
            updateCheckFormList('consumable_items', (items) => [...items, createChecklistItem('patient-consumable')])
          }
          active={checkForm.status === '수술중'}
          activeBadgeLabel={checkForm.status === '수술중' ? '실시간 입력' : undefined}
        >
          {renderItemRows(checkForm.consumable_items, 'consumable', (next) =>
            updateCheckFormList('consumable_items', () => next)
          )}
        </OpCheckWorkspaceChecklistSection>

      </div>

      <OpCheckWorkspaceNotesSection
        expanded={workspaceSections.notes}
        summary={notesSummaryText}
        value={checkForm.notes}
        onToggle={() => toggleWorkspaceSection('notes')}
        onChange={(value) => setCheckForm((prev) => (prev ? { ...prev, notes: value } : prev))}
      />
    </>
  );

  const wardMessageDialog =
    showWardMsgModal && portalHost
      ? createPortal(
          <div
            className="fixed inset-0 z-[360] flex items-center justify-center bg-black/50 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeWardMessageModal();
              }
            }}
          >
            <div
              ref={wardMessageDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="op-check-ward-message-title"
              aria-describedby="op-check-ward-message-description"
              data-testid="op-check-ward-message-modal"
              tabIndex={-1}
              className="relative w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                <div>
                  <h3
                    id="op-check-ward-message-title"
                    className="text-base font-bold text-[var(--foreground)]"
                  >
                    메시지 전송
                  </h3>
                  <p
                    id="op-check-ward-message-description"
                    className="mt-0.5 text-[12px] font-medium text-[var(--toss-gray-3)]"
                  >
                    환자를 수술실로 올려달라고 병동팀에게 메시지를 보냅니다.
                  </p>
                </div>
                <button
                  ref={wardMessageCloseButtonRef}
                  type="button"
                  onClick={closeWardMessageModal}
                  data-testid="op-check-ward-message-close"
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  닫기
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    받는 사람 선택 ({wardMsgTargets.length}명 선택)
                  </p>
                  <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        최근 보낸 사람
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {recentWardStaffs.length === 0 ? (
                          <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                            최근에 전송한 대상이 아직 없습니다.
                          </p>
                        ) : (
                          recentWardStaffs.map((staff) => {
                            const selected = wardMsgTargets.includes(staff.id);
                            return (
                              <button
                                key={staff.id}
                                type="button"
                                onClick={() =>
                                  selected ? removeWardMessageTarget(staff.id) : addWardMessageTarget(staff.id)
                                }
                                data-testid={`op-check-ward-recent-chip-${staff.id}`}
                                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                                  selected
                                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                    : 'border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]'
                                }`}
                              >
                                {staff.name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        즐겨찾는 사람
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {favoriteWardStaffs.length === 0 ? (
                          <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                            자주 보내는 대상을 추가해 두면 여기서 바로 선택할 수 있습니다.
                          </p>
                        ) : (
                          favoriteWardStaffs.map((staff) => {
                            const selected = wardMsgTargets.includes(staff.id);
                            return (
                              <div
                                key={staff.id}
                                className={`flex items-center gap-1 rounded-full border px-2 py-1 ${
                                  selected
                                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                                    : 'border-[var(--border)] bg-white'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    selected
                                      ? removeWardMessageTarget(staff.id)
                                      : addWardMessageTarget(staff.id)
                                  }
                                  data-testid={`op-check-ward-favorite-chip-${staff.id}`}
                                  className="text-[11px] font-semibold text-[var(--foreground)]"
                                >
                                  {staff.name}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleWardFavoriteTarget(staff.id)}
                                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                                >
                                  해제
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setWardRecipientPickerOpen((prev) => !prev)}
                        data-testid="op-check-ward-recipient-dropdown-button"
                        aria-haspopup="listbox"
                        aria-expanded={wardRecipientPickerOpen}
                        className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-left text-sm font-semibold text-[var(--foreground)]"
                      >
                        <span>
                          {selectedWardStaffs.length > 0
                            ? `받는 사람 추가 (${selectedWardStaffs.length}명 선택됨)`
                            : '받는 사람 추가...'}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">
                          {wardRecipientPickerOpen ? '닫기' : '열기'}
                        </span>
                      </button>

                      {wardRecipientPickerOpen && (
                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3 shadow-lg">
                          <input
                            ref={wardRecipientSearchInputRef}
                            value={wardRecipientSearch}
                            onChange={(e) => setWardRecipientSearch(e.target.value)}
                            data-testid="op-check-ward-recipient-search"
                            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                            placeholder="이름, 소속, 직책으로 검색"
                          />
                          <div className="mt-2 max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                            {wardStaffs.length === 0 ? (
                              <p className="py-4 text-center text-[11px] font-medium text-[var(--toss-gray-3)]">
                                직원 목록이 없습니다.
                              </p>
                            ) : filteredWardStaffs.length === 0 ? (
                              <p className="py-4 text-center text-[11px] font-medium text-[var(--toss-gray-3)]">
                                조건에 맞는 직원이 없습니다.
                              </p>
                            ) : (
                              filteredWardStaffs.map((staff) => {
                                const isFavorite = wardFavoriteTargets.includes(staff.id);
                                return (
                                  <div
                                    key={staff.id}
                                    className="flex items-center gap-2 rounded-[var(--radius-md)] border border-transparent px-1 py-1 hover:bg-[var(--muted)]/60"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => addWardMessageTarget(staff.id)}
                                      data-testid={`op-check-ward-recipient-option-${staff.id}`}
                                      className="flex flex-1 items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left"
                                    >
                                      <span className="flex-1 text-sm font-semibold text-[var(--foreground)]">
                                        {staff.name}
                                      </span>
                                      {staff.department && (
                                        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--toss-gray-3)]">
                                          {staff.department}
                                        </span>
                                      )}
                                      {staff.position && (
                                        <span className="text-[11px] font-medium text-[var(--toss-gray-4)]">
                                          {staff.position}
                                        </span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleWardFavoriteTarget(staff.id)}
                                      data-testid={`op-check-ward-favorite-toggle-${staff.id}`}
                                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                        isFavorite
                                          ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                          : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                      }`}
                                    >
                                      {isFavorite ? '저장됨' : '즐겨찾기'}
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          선택된 받는 사람
                        </p>
                        {selectedWardStaffs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setWardMsgTargets([])}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                          >
                            전체 해제
                          </button>
                        )}
                      </div>
                      {selectedWardStaffs.length === 0 ? (
                        <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                          드롭다운에서 받는 사람을 추가해 주세요.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedWardStaffs.map((staff) => {
                            const isFavorite = wardFavoriteTargets.includes(staff.id);
                            return (
                              <div
                                key={staff.id}
                                data-testid={`op-check-ward-selected-recipient-${staff.id}`}
                                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-[var(--foreground)]">{staff.name}</p>
                                  <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                                    {[staff.department, staff.position].filter(Boolean).join(' · ') || '직원'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleWardFavoriteTarget(staff.id)}
                                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                    isFavorite
                                      ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                      : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                  }`}
                                >
                                  {isFavorite ? '저장됨' : '즐겨찾기'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeWardMessageTarget(staff.id)}
                                  className="rounded-full px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                                >
                                  제거
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">메시지 내용</p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {wardMessageTemplates.map((template) => {
                      const selectedTemplate =
                        normalizedWardMessageText === stripHiddenMetaBlocks(template.text).trim();
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setWardMsgText(template.text)}
                          data-testid={`op-check-ward-template-${template.id}`}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                            selectedTemplate
                              ? 'bg-[var(--accent)] text-white'
                              : 'border border-[var(--border)] bg-white text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                          }`}
                        >
                          {template.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={wardMsgText}
                    onChange={(e) => setWardMsgText(e.target.value)}
                    data-testid="op-check-ward-message-textarea"
                    className="min-h-[120px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                    placeholder="전송할 메시지를 입력해 주세요."
                  />
                  {wardMessageValidationText ? (
                    <p
                      data-testid="op-check-ward-validation-text"
                      className="mt-2 text-[11px] font-semibold text-rose-600"
                    >
                      {wardMessageValidationText}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                      최근/즐겨찾기에서 받는 사람을 빠르게 추가할 수 있습니다.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeWardMessageModal}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendWardMessage()}
                    disabled={sendingMsg || wardMsgTargets.length === 0 || !normalizedWardMessageText}
                    data-testid="op-check-ward-message-send"
                    className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {sendingMsg ? '전송 중...' : `메시지 보내기 (${wardMsgTargets.length}명)`}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          portalHost,
        )
      : null;

  if (loading) {
    return (
      <div
        data-testid="op-check-view"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm"
      >
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
        <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">OP체크 데이터를 불러오는 중입니다.</p>
      </div>
    );
  }

  if (schemaError) {
    return (
      <div
        data-testid="op-check-view"
        className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 p-5 shadow-sm"
      >
        <h3 className="text-base font-bold text-amber-900">OP체크 초기 설정이 필요합니다.</h3>
        <p className="mt-2 text-sm font-medium text-amber-800">{schemaError}</p>
        <p className="mt-2 text-xs font-semibold text-amber-700">
          수술일정표 연동과 환자별 체크 저장을 위해 새 테이블이 먼저 생성되어야 합니다.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="op-check-view" className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)]">{headerTitle}</h2>
          </div>
          {activeTab === 'patients' ? (
            <div
              data-testid="op-check-patient-search-card"
              className="w-full min-w-[220px] max-w-[320px]"
            >
              <input
                data-testid="op-check-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="환자명, 수술명, 차트번호"
                className="w-full rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium"
              />
            </div>
          ) : null}
        </div>
      </div>

      {activeTab === 'patients' ? (
        <div
          data-testid="op-check-patient-top-grid"
          className="grid gap-3 lg:mx-auto lg:max-w-[920px] lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.46fr)_minmax(0,0.5fr)]"
        >
          <div
            data-testid="op-check-patient-calendar-card"
              className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    data-testid="op-check-calendar-toggle"
                    onClick={() => setCalendarOpen((prev) => !prev)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                      {calendarOpen ? '▲' : '▼'}
                    </span>
                    <span className="text-sm font-bold text-[var(--foreground)]">
                      {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
                    </span>
                    <span className="text-[11px] font-medium text-[var(--toss-gray-3)]">달력</span>
                  </button>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      이전
                    </button>
                    <button
                      type="button"
                      onClick={handleTodaySelection}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      오늘
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      다음
                    </button>
                  </div>
                </div>

                {calendarOpen && <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
                  <div className="grid grid-cols-7 bg-[var(--muted)] text-[10px] font-semibold text-[var(--toss-gray-3)]">
                    {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                      <div key={day} className="px-1 py-2 text-center">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 bg-[var(--card)] text-[10px]">
                    {scheduleCalendarData.days.map((day, index) => {
                      const key = scheduleCalendarData.toKey(day);
                      const inMonth = day.getMonth() === scheduleCalendarData.month;
                      const events = scheduleCalendarData.eventsByDate[key] || [];
                      const isSelectedDay = key === selectedDate;

                      return (
                        <button
                          key={`${key}-${index}`}
                          type="button"
                          data-testid={`op-check-calendar-day-${key}`}
                          onClick={() => handleCalendarDaySelection(key, events)}
                          className={`min-h-[92px] border border-[var(--border)] p-1.5 text-left align-top transition-colors ${
                            isSelectedDay
                              ? 'bg-[var(--toss-blue-light)]/60'
                              : inMonth
                                ? 'bg-[var(--card)] hover:bg-[var(--muted)]/35'
                                : 'bg-[var(--tab-bg)] hover:bg-[var(--muted)]/35'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[10px] font-bold ${
                                !inMonth
                                  ? 'text-[var(--toss-gray-3)]'
                                  : day.getDay() === 0
                                    ? 'text-red-500'
                                    : day.getDay() === 6
                                      ? 'text-[var(--accent)]'
                                      : 'text-[var(--foreground)]'
                              }`}
                            >
                              {day.getDate()}
                            </span>
                            {events.length > 0 ? (
                              <span className="rounded-full bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[var(--accent)]">
                                {events.length}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 space-y-1">
                            {events.slice(0, 2).map((event) => (
                              <div
                                key={event.id}
                                className="rounded-md bg-[var(--toss-blue-light)]/50 px-1.5 py-1 text-[9px] font-bold leading-tight text-[var(--foreground)]"
                              >
                                <div className="truncate text-[var(--accent)]">{event.schedule_time || '시간 미정'}</div>
                                <div className="truncate">{event.patient_name}</div>
                              </div>
                            ))}
                            {events.length > 2 ? (
                              <p className="text-center text-[9px] font-bold text-[var(--toss-gray-3)]">
                                + {events.length - 2}건
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>}

                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/35 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">선택된 수술일</p>
                      <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{formatDateLabel(selectedDate)}</p>
                    </div>
                    <input
                      data-testid="op-check-date-filter"
                      type="date"
                      value={selectedDate}
                      onChange={(event) => handleDateFilterChange(event.target.value)}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-medium text-[var(--toss-gray-3)]">해당일 {selectedDateSchedules.length}명</span>
                    <button
                      type="button"
                      data-testid="op-check-workspace-open"
                      onClick={handleWorkspaceOpen}
                      disabled={!selectedDateSchedules[0]}
                      className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    >
                      첫 환자 열기
                    </button>
                  </div>
                </div>
              </div>
          </div>

          <div
            data-testid="op-check-patient-summary-card"
            className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
          >
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">작업 현황</p>
            <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">
              전체 {selectedDateSchedules.length}명
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {workspaceStatusSummaryCards.map((card) => (
                <div key={card.value} className={`rounded-[var(--radius-md)] px-2.5 py-1.5 ${card.idleClass}`}>
                  <p className={`text-[10px] font-semibold ${card.labelClass}`}>{card.label}</p>
                  <p className="text-sm font-bold">{card.count}명</p>
                </div>
              ))}
            </div>
          </div>

          <div
            data-testid="op-check-patient-list-card"
            className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm lg:col-span-2"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-bold text-[var(--foreground)]">선택 날짜 수술 환자</p>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--toss-gray-4)]">
                  정렬
                  <select
                    data-testid="op-check-workspace-sort"
                    value={workspaceSort}
                    onChange={(event) => setWorkspaceSort(event.target.value as WorkspaceSortKey)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold outline-none"
                  >
                    <option value="time">시간순</option>
                    <option value="status">상태순</option>
                    <option value="room">수술실순</option>
                    <option value="name">이름순</option>
                  </select>
                </label>
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">{filteredSchedules.length}명</span>
              </div>
            </div>
            {renderStatusFilterTabs()}
            {renderFilteredScheduleList({
              containerClassName: 'max-h-[56vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar',
              emptyMessage: '선택한 날짜에 연결할 수술 환자가 없습니다.',
              openWorkspaceOnSelect: true,
              testIdPrefix: 'op-check-schedule-card',
            })}
          </div>

        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr,0.95fr]">
          <section className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setTemplateEditor((prev) => ({ ...prev, template_scope: 'surgery', anesthesia_type: '' }))
                  }
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    templateEditor.template_scope === 'surgery'
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  수술 템플릿
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTemplateEditor((prev) => ({
                      ...prev,
                      template_scope: 'anesthesia',
                      surgery_template_id: '',
                      surgery_name: '',
                    }))
                  }
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    templateEditor.template_scope === 'anesthesia'
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  마취 템플릿
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateEditor(emptyTemplateEditor())}
                  className="ml-auto rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  새 템플릿
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  템플릿 이름
                  <input
                    value={templateEditor.template_name}
                    onChange={(event) =>
                      setTemplateEditor((prev) => ({ ...prev, template_name: event.target.value }))
                    }
                    placeholder="예: 무릎 관절경 기본 준비"
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                  />
                </label>

                {templateEditor.template_scope === 'surgery' ? (
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    연동 수술명
                    <select
                      value={templateEditor.surgery_template_id}
                      onChange={(event) => {
                        const selectedTemplate =
                          surgeryTemplates.find((template) => String(template.id) === event.target.value) || null;
                        setTemplateEditor((prev) => ({
                          ...prev,
                          surgery_template_id: event.target.value,
                          surgery_name: selectedTemplate?.name || prev.surgery_name,
                          template_name: prev.template_name || selectedTemplate?.name || '',
                        }));
                      }}
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                    >
                      <option value="">직접 입력</option>
                      {surgeryTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    마취 유형
                    <input
                      list="op-check-anesthesia-options"
                      value={templateEditor.anesthesia_type}
                      onChange={(event) =>
                        setTemplateEditor((prev) => ({
                          ...prev,
                          anesthesia_type: event.target.value,
                          template_name: prev.template_name || event.target.value,
                        }))
                      }
                      placeholder="예: 전신마취"
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                    />
                  </label>
                )}
              </div>

              {templateEditor.template_scope === 'surgery' ? (
                <label className="mt-3 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  수술명 직접 입력
                  <input
                    value={templateEditor.surgery_name}
                    onChange={(event) =>
                      setTemplateEditor((prev) => ({ ...prev, surgery_name: event.target.value }))
                    }
                    placeholder="수술일정표 제목과 동일하게 입력"
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                  />
                </label>
              ) : null}

              <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--muted)]/45 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--foreground)]">기본 준비사항</h4>
                  <button
                    type="button"
                    onClick={() =>
                      updateTemplateEditorList('prep_items', (items) => [
                        ...items,
                        createChecklistItem('template-prep'),
                      ])
                    }
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--card)]"
                  >
                    준비항목 추가
                  </button>
                </div>
                {renderTemplateItemRows(templateEditor.prep_items, 'prep', (next) =>
                  updateTemplateEditorList('prep_items', () => next)
                )}
              </div>

              <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--muted)]/45 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--foreground)]">기본 의료소모품</h4>
                  <button
                    type="button"
                    onClick={() =>
                      updateTemplateEditorList('consumable_items', (items) => [
                        ...items,
                        createChecklistItem('template-consumable'),
                      ])
                    }
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--card)]"
                  >
                    소모품 추가
                  </button>
                </div>
                {renderTemplateItemRows(templateEditor.consumable_items, 'consumable', (next) =>
                  updateTemplateEditorList('consumable_items', () => next)
                )}
              </div>

              <label className="mt-4 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                템플릿 메모
                <textarea
                  value={templateEditor.notes}
                  onChange={(event) =>
                    setTemplateEditor((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="수술팀 공통 지침, 마취 준비 참고사항 등을 메모해 주세요."
                  className="mt-1 min-h-[100px] w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-medium"
                />
              </label>

              <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={templateEditor.is_active}
                  onChange={(event) =>
                    setTemplateEditor((prev) => ({ ...prev, is_active: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                />
                활성 템플릿으로 사용
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="op-check-template-save"
                  onClick={() => void saveTemplate()}
                  disabled={savingTemplate}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {savingTemplate ? '저장 중...' : '템플릿 저장'}
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateEditor(emptyTemplateEditor())}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  입력 초기화
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-[var(--foreground)]">저장된 OP체크 템플릿</h3>
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  수술 {templatesByScope.surgery.length} / 마취 {templatesByScope.anesthesia.length}
                </span>
              </div>

              <div className="space-y-3">
                {(['surgery', 'anesthesia'] as const).map((scope) => (
                  <div key={scope}>
                    <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      {scope === 'surgery' ? '수술 템플릿' : '마취 템플릿'}
                    </p>
                    <div className="space-y-2">
                      {templatesByScope[scope].length === 0 ? (
                        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/40 p-4 text-center text-sm font-medium text-[var(--toss-gray-3)]">
                          아직 등록된 템플릿이 없습니다.
                        </div>
                      ) : (
                        templatesByScope[scope].map((template) => (
                          <div
                            key={template.id}
                            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[var(--foreground)]">
                                  {buildTemplateLabel(template)}
                                </p>
                                <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">
                                  준비 {normalizeChecklistItems(template.prep_items, 'list').length}개 · 소모품{' '}
                                  {normalizeChecklistItems(template.consumable_items, 'list').length}개
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  template.is_active === false
                                    ? 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {template.is_active === false ? '비활성' : '활성'}
                              </span>
                            </div>
                            {template.notes ? (
                              <p className="mt-2 line-clamp-2 text-[12px] font-medium text-[var(--toss-gray-3)]">
                                {template.notes}
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => loadTemplateIntoEditor(template)}
                                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeTemplate(String(template.id || ''))}
                                className="rounded-full border border-red-500/20 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500/10"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {dayWorkspaceOpen && activeTab === 'patients' && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/45 p-0 md:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleWorkspaceClose();
            }
          }}
        >
          <div
            data-testid="op-check-workspace-modal"
            className="flex h-[100dvh] w-full max-w-none flex-col overflow-hidden rounded-none border border-[var(--border)] bg-[var(--card)] shadow-2xl md:h-[94vh] md:max-w-[1760px] md:rounded-[var(--radius-xl)]"
          >
            {/* 헤더 행 1: 제목 + 날짜 + 검색 + 닫기 */}
            <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)]/96 px-4 py-2.5 backdrop-blur">
              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">OP체크</p>
              <h3 className="text-sm font-bold text-[var(--foreground)]">{formatDateLabel(selectedDate)}</h3>
              <span className="rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--toss-gray-4)]">
                {workspaceSelectedOrderLabel}
              </span>
              <div className="flex-1" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="환자명 / 수술명 / 차트번호"
                className="hidden w-48 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium md:block"
              />
              <select
                data-testid="op-check-workspace-sort-modal"
                value={workspaceSort}
                onChange={(event) => setWorkspaceSort(event.target.value as WorkspaceSortKey)}
                className="hidden rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-bold text-[var(--toss-gray-4)] md:block"
              >
                <option value="time">시간순</option>
                <option value="status">상태순</option>
                <option value="room">수술실순</option>
                <option value="name">이름순</option>
              </select>
              <button
                type="button"
                onClick={handleWorkspaceClose}
                data-testid="op-check-workspace-close"
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-1.5 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>

            {/* 헤더 행 2: 상태 필터 탭 (pill 형태) */}
            <div
              data-testid="op-check-workspace-header-summary"
              className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--muted)]/25 px-4 py-2"
            >
              <button
                type="button"
                data-testid="op-check-workspace-status-filter-reset"
                onClick={() => setStatusFilterTab('전체')}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
                  statusFilterTab === '전체'
                    ? 'bg-[var(--foreground)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'
                }`}
              >
                전체 {workspaceVisibleScheduleCount}
              </button>
              {workspaceStatusSummaryCards.map((card) => {
                const isSelected = statusFilterTab === card.value;
                return (
                  <button
                    key={card.value}
                    type="button"
                    data-testid={`op-check-workspace-status-filter-${card.testId}`}
                    onClick={() => handleWorkspaceStatusSummaryClick(card.value)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
                      isSelected ? card.activeClass : `${card.idleClass} hover:opacity-80`
                    }`}
                  >
                    {card.label} {card.count}
                  </button>
                );
              })}
              <div className="flex-1" />
              {/* 모바일: 검색/정렬 */}
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="검색"
                className="w-28 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-xs font-medium md:hidden"
              />
              <select
                value={workspaceSort}
                onChange={(event) => setWorkspaceSort(event.target.value as WorkspaceSortKey)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-xs font-bold text-[var(--toss-gray-4)] md:hidden"
              >
                <option value="time">시간순</option>
                <option value="status">상태순</option>
                <option value="room">수술실순</option>
                <option value="name">이름순</option>
              </select>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="grid gap-3 border-b border-[var(--border)] bg-[var(--muted)]/20 px-4 py-3 xl:items-start xl:grid-cols-[minmax(0,1fr)_minmax(312px,336px)]">
                <aside className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      {statusFilterTab !== '전체' ? `${statusFilterTab} 환자` : '수술 환자 목록'}
                    </p>
                    <span className="text-[11px] font-bold text-[var(--foreground)]">{workspaceVisibleScheduleCount}명</span>
                  </div>
                  {renderFilteredScheduleList({
                    containerClassName: 'flex snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden pb-1 pr-1 scroll-smooth custom-scrollbar',
                    emptyMessage: statusFilterTab !== '전체'
                      ? '현재 조건에 맞는 수술 환자가 없습니다.'
                      : '선택한 날짜에 연결할 수술 환자가 없습니다.',
                    openWorkspaceOnSelect: false,
                    layout: 'row',
                    testIdPrefix: 'op-check-workspace-schedule-card',
                    schedules: workspaceSchedules,
                  })}
                </aside>
                {patientWorkspaceTopPanel}
              </div>

              <section className="min-h-0 flex-1 overflow-y-auto bg-[var(--page-bg)] p-4 md:p-5">
                <div className="space-y-4">{patientWorkspaceDetailContent}</div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* #4 청구내역 출력 모달 */}
      {printModalOpen && checkForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setPrintModalOpen(false); }}>
          <div className="w-full max-w-2xl rounded-[var(--radius-xl)] border border-[var(--border)] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 print:hidden">
              <h3 className="text-base font-bold text-gray-900">청구내역 출력</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
                >
                  프린트
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="p-6 text-gray-900">
              {/* 환자 정보 헤더 */}
              <div className="mb-5 border-b-2 border-gray-800 pb-4">
                <h2 className="text-xl font-bold">수술 소모품 사용 내역서</h2>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div><span className="font-semibold text-gray-500">환자명</span> <span className="ml-2 font-bold">{checkForm.patient_name}</span></div>
                  {workspaceDisplayChartNo && <div><span className="font-semibold text-gray-500">차트번호</span> <span className="ml-2 font-bold">{workspaceDisplayChartNo}</span></div>}
                  <div><span className="font-semibold text-gray-500">수술명</span> <span className="ml-2 font-bold">{checkForm.surgery_name}</span></div>
                  {checkForm.anesthesia_type && <div><span className="font-semibold text-gray-500">마취방법</span> <span className="ml-2">{checkForm.anesthesia_type}</span></div>}
                  <div><span className="font-semibold text-gray-500">수술일</span> <span className="ml-2">{formatDateLabel(checkForm.schedule_date)}</span></div>
                  <div><span className="font-semibold text-gray-500">수술실</span> <span className="ml-2">{workspaceDisplayScheduleRoom}</span></div>
                  {checkForm.surgery_started_at && <div><span className="font-semibold text-gray-500">수술 시작</span> <span className="ml-2">{new Date(checkForm.surgery_started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>}
                  {checkForm.surgery_ended_at && <div><span className="font-semibold text-gray-500">수술 종료</span> <span className="ml-2">{new Date(checkForm.surgery_ended_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>}
                </div>
              </div>

              {/* 소모품 테이블 */}
              <h3 className="mb-2 text-base font-bold">사용 소모품 목록</h3>
              {(() => {
                const used = checkForm.consumable_items.filter((i) => i.name && i.checked);
                if (used.length === 0) {
                  return <p className="text-sm text-gray-400">체크된 소모품이 없습니다.</p>;
                }
                return (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">품목명</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold w-16">수량</th>
                        <th className="border border-gray-300 px-3 py-2 text-center font-semibold w-16">단위</th>
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {used.map((item) => (
                        <tr key={item.id} className="even:bg-gray-50">
                          <td className="border border-gray-300 px-3 py-2">{item.name}</td>
                          <td className="border border-gray-300 px-3 py-2 text-center font-bold">{item.quantity || '-'}</td>
                          <td className="border border-gray-300 px-3 py-2 text-center">{item.unit || '-'}</td>
                          <td className="border border-gray-300 px-3 py-2 text-gray-500">{item.note || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}

              {checkForm.notes && (
                <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-500">메모</p>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{checkForm.notes}</p>
                </div>
              )}

              <div className="mt-6 text-right text-xs text-gray-400">
                출력일시: {new Date().toLocaleString('ko-KR')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메시지 전송 모달 */}
      {false && showWardMsgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowWardMsgModal(false); }}>
          <div className="w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-lg">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">메시지 전송</h3>
                <p className="mt-0.5 text-[12px] font-medium text-[var(--toss-gray-3)]">
                  환자를 수술실로 올려달라고 병동팀에게 메시지를 보냅니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWardMsgModal(false)}
                data-testid="op-check-ward-message-close"
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* 받는 사람 선택 */}
              <div>
                <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  받는 사람 선택 ({wardMsgTargets.length}명 선택됨)
                </p>
                <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">최근 보낸 사람</p>
                    <div className="flex flex-wrap gap-2">
                      {recentWardStaffs.length === 0 ? (
                        <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                          최근 전송한 사람이 아직 없습니다.
                        </p>
                      ) : (
                        recentWardStaffs.map((staff) => {
                          const selected = wardMsgTargets.includes(staff.id);
                          return (
                            <button
                              key={staff.id}
                              type="button"
                              onClick={() => (selected ? removeWardMessageTarget(staff.id) : addWardMessageTarget(staff.id))}
                              data-testid={`op-check-ward-recent-chip-${staff.id}`}
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                                selected
                                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                  : 'border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]'
                              }`}
                            >
                              {staff.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">즐겨찾는 사람</p>
                    <div className="flex flex-wrap gap-2">
                      {favoriteWardStaffs.length === 0 ? (
                        <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                          자주 보내는 사람을 추가해 두면 여기서 바로 선택할 수 있습니다.
                        </p>
                      ) : (
                        favoriteWardStaffs.map((staff) => {
                          const selected = wardMsgTargets.includes(staff.id);
                          return (
                            <div
                              key={staff.id}
                              className={`flex items-center gap-1 rounded-full border px-2 py-1 ${
                                selected
                                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                                  : 'border-[var(--border)] bg-white'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  selected
                                    ? removeWardMessageTarget(staff.id)
                                    : addWardMessageTarget(staff.id)
                                }
                                data-testid={`op-check-ward-favorite-chip-${staff.id}`}
                                className="text-[11px] font-semibold text-[var(--foreground)]"
                              >
                                {staff.name}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleWardFavoriteTarget(staff.id)}
                                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                              >
                                삭제
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setWardRecipientPickerOpen((prev) => !prev)}
                      data-testid="op-check-ward-recipient-dropdown-button"
                      className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-left text-sm font-semibold text-[var(--foreground)]"
                    >
                      <span>
                        {selectedWardStaffs.length > 0
                          ? `받는 사람 추가 (${selectedWardStaffs.length}명 선택됨)`
                          : '받는 사람 추가...'}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">
                        {wardRecipientPickerOpen ? '닫기' : '열기'}
                      </span>
                    </button>

                    {wardRecipientPickerOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-10 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3 shadow-lg">
                        <input
                          value={wardRecipientSearch}
                          onChange={(e) => setWardRecipientSearch(e.target.value)}
                          data-testid="op-check-ward-recipient-search"
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                          placeholder="이름, 소속, 직책으로 검색"
                        />
                        <div className="mt-2 max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                          {wardStaffs.length === 0 ? (
                            <p className="py-4 text-center text-[11px] font-medium text-[var(--toss-gray-3)]">
                              직원 목록이 없습니다.
                            </p>
                          ) : filteredWardStaffs.length === 0 ? (
                            <p className="py-4 text-center text-[11px] font-medium text-[var(--toss-gray-3)]">
                              추가할 수 있는 직원이 없습니다.
                            </p>
                          ) : (
                            filteredWardStaffs.map((staff) => {
                              const isFavorite = wardFavoriteTargets.includes(staff.id);
                              return (
                                <div
                                  key={staff.id}
                                  className="flex items-center gap-2 rounded-[var(--radius-md)] border border-transparent px-1 py-1 hover:bg-[var(--muted)]/60"
                                >
                                  <button
                                    type="button"
                                    onClick={() => addWardMessageTarget(staff.id)}
                                    data-testid={`op-check-ward-recipient-option-${staff.id}`}
                                    className="flex flex-1 items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left"
                                  >
                                    <span className="flex-1 text-sm font-semibold text-[var(--foreground)]">
                                      {staff.name}
                                    </span>
                                    {staff.department && (
                                      <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--toss-gray-3)]">
                                        {staff.department}
                                      </span>
                                    )}
                                    {staff.position && (
                                      <span className="text-[11px] font-medium text-[var(--toss-gray-4)]">
                                        {staff.position}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleWardFavoriteTarget(staff.id)}
                                    data-testid={`op-check-ward-favorite-toggle-${staff.id}`}
                                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                      isFavorite
                                        ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                        : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                    }`}
                                  >
                                    {isFavorite ? '저장됨' : '즐겨찾기'}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">선택된 받는 사람</p>
                      {selectedWardStaffs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setWardMsgTargets([])}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                        >
                          전체 해제
                        </button>
                      )}
                    </div>
                    {selectedWardStaffs.length === 0 ? (
                      <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                        드롭다운에서 받는 사람을 추가해 주세요.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedWardStaffs.map((staff) => {
                          const isFavorite = wardFavoriteTargets.includes(staff.id);
                          return (
                            <div
                              key={staff.id}
                              data-testid={`op-check-ward-selected-recipient-${staff.id}`}
                              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-[var(--foreground)]">{staff.name}</p>
                                <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                                  {[staff.department, staff.position].filter(Boolean).join(' · ') || '직원'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleWardFavoriteTarget(staff.id)}
                                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  isFavorite
                                    ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                }`}
                              >
                                {isFavorite ? '저장됨' : '즐겨찾기'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeWardMessageTarget(staff.id)}
                                className="rounded-full px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                              >
                                제거
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 메시지 내용 */}
              <div>
                <p className="mb-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">메시지 내용</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {wardMessageTemplates.map((template) => {
                    const selectedTemplate = normalizedWardMessageText === stripHiddenMetaBlocks(template.text).trim();
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setWardMsgText(template.text)}
                        data-testid={`op-check-ward-template-${template.id}`}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                          selectedTemplate
                            ? 'bg-[var(--accent)] text-white'
                            : 'border border-[var(--border)] bg-white text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                        }`}
                      >
                        {template.label}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={wardMsgText}
                  onChange={(e) => setWardMsgText(e.target.value)}
                  data-testid="op-check-ward-message-textarea"
                  className="min-h-[120px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                  placeholder="전송할 메시지를 입력해 주세요."
                />
                {wardMessageValidationText ? (
                  <p
                    data-testid="op-check-ward-validation-text"
                    className="mt-2 text-[11px] font-semibold text-rose-600"
                  >
                    {wardMessageValidationText}
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                    최근/즐겨찾기에서 받는 사람을 빠르게 추가할 수 있습니다.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowWardMsgModal(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void sendWardMessage()}
                  disabled={sendingMsg || wardMsgTargets.length === 0 || !normalizedWardMessageText}
                  data-testid="op-check-ward-message-send"
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {sendingMsg ? '전송 중...' : `메시지 보내기 (${wardMsgTargets.length}명)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {wardMessageDialog}

      <datalist id={ITEM_SUGGESTION_ID}>
        {itemSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <datalist id="op-check-anesthesia-options">
        {ANESTHESIA_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

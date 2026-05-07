import type { BoardPost, OpCheckTemplate, OpPatientCheck } from '@/types';
import { createLocalId, normalizeLookupValue, stripHiddenMetaBlocks } from './op-check-utils';
import type {
  ChecklistItemDraft,
  LinkedSchedulePost,
  PatientCheckState,
  ScheduleStatus,
  SurgeryTemplateRow,
  TemplateEditorState,
  WorkspaceSortKey,
} from './op-check-types';
import {
  SCHEDULE_META_PREFIX,
  SCHEDULE_META_SUFFIX,
  STATUS_OPTIONS,
  WARD_MESSAGE_META_PREFIX,
  WARD_MESSAGE_META_SUFFIX,
} from './op-check-types';

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

  const raw = String(post.schedule_date ?? meta?.date ?? '').trim();
  let schedule_date = '';
  if (raw) {
    const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (matched) {
      schedule_date = matched[1];
    } else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        schedule_date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      } else {
        schedule_date = raw;
      }
    }
  }

  const rawTime = String(post.schedule_time ?? meta?.time ?? '').trim();
  let schedule_time = '';
  if (rawTime) {
    const matchedTime = rawTime.match(/^(\d{2}:\d{2})/);
    schedule_time = matchedTime ? matchedTime[1] : rawTime;
  }

  return {
    id: String(post.id || ''),
    patient_name: String(post.patient_name ?? meta?.patient ?? '').trim(),
    surgery_name: String(post.title || '').trim(),
    chart_no: String(displayContent || '').trim(),
    schedule_date,
    schedule_time,
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
    {
      id: 'outpatient-doctor-call',
      label: '외래 호출',
      text:
        `[수술실 호출] ${patientLabel} ${surgeryName} 수술 준비가 완료되었습니다.\n` +
        `외래 간호사님, 담당 의사에게 수술실로 내려오시라고 전달 부탁드립니다.\n${scheduleLabel}`,
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

export function getStatusLabel(status: ScheduleStatus | string) {
  return status || '준비중';
}

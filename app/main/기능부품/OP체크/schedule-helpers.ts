// OP체크 스케줄 관련 헬퍼 함수

import { normalizeDateValue, normalizeTimeValue, normalizeLookupValue, stripHiddenMetaBlocks } from '../op-check-utils';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { SCHEDULE_META_PREFIX, SCHEDULE_META_SUFFIX, STATUS_OPTIONS } from './constants';
import type { BoardPost, OpPatientCheck } from '@/types';

export type ScheduleStatus = (typeof STATUS_OPTIONS)[number];
export type WorkspaceSortKey = 'time' | 'status' | 'room' | 'name';

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

export function getScheduleStatusOrder(status: unknown) {
  const normalizedStatus = String(status || '').trim();
  const matchedIndex = STATUS_OPTIONS.findIndex((item) => item === normalizedStatus);
  return matchedIndex >= 0 ? matchedIndex : 0;
}

export function compareSchedules(left: LinkedSchedulePost, right: LinkedSchedulePost) {
  const leftDateTime = `${left.schedule_date || '9999-12-31'}T${left.schedule_time || '23:59'}`;
  const rightDateTime = `${right.schedule_date || '9999-12-31'}T${right.schedule_time || '23:59'}`;
  const dateDiff = leftDateTime.localeCompare(rightDateTime);
  if (dateDiff !== 0) return dateDiff;
  return String(left.patient_name || '').localeCompare(String(right.patient_name || ''), 'ko');
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

export function findPreferredScheduleDate(posts: LinkedSchedulePost[]) {
  if (posts.length === 0) return '';
  const todayKey = getKoreanTodayString();
  const upcoming = posts.find((post) => post.schedule_date && post.schedule_date >= todayKey);
  return upcoming?.schedule_date || posts[0]?.schedule_date || '';
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

export function findMatchingSurgeryTemplate(surgeryTemplates: SurgeryTemplateRow[], surgeryName: string) {
  const normalizedTarget = normalizeLookupValue(surgeryName);
  if (!normalizedTarget) return null;
  return (
    surgeryTemplates.find((template) => normalizeLookupValue(template.name) === normalizedTarget) || null
  );
}

export function buildTemplateLabel(template: { template_scope?: string | null; anesthesia_type?: string | null; template_name?: string | null; surgery_name?: string | null }) {
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

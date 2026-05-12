// OP체크 환자 체크 / 병동 메시지 관련 헬퍼 함수

import { stripHiddenMetaBlocks } from '../op-check-utils';
import { WARD_MESSAGE_META_PREFIX, WARD_MESSAGE_META_SUFFIX } from './constants';
import { serializeChecklistItemsForDiff } from './checklist-helpers';
import type { ChecklistItemDraft } from './checklist-helpers';

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

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  normalizeHandoverNote,
  parseRoomConfigsFromNote,
  type HandoverNoteRow,
  type HandoverRoomConfig,
} from '@/lib/handover-notes';
import type { StaffMember } from '@/types';
type RoomBoardPatientSlot = {
  bedNumber: number;
  patientName: string;
  age: string;
  gender: string;
};
type RoomBoardDraft = {
  roomNumber: string;
  deviceId: string;
  updatedAt: string | null;
  patientSlots: RoomBoardPatientSlot[];
};
type HandoverSnapshot = { dateKey: string; createdAt: string | null; rooms: HandoverRoomConfig[] };
type ScannerControlsLike = { stop: () => void };
type Props = { user?: StaffMember | null; selectedCo?: string | null; selectedCompanyId?: string | null };
type MobileBleTaskAttempt = {
  label: string;
  query: string;
  ok: boolean;
  upstream: unknown;
};
type BrowserBleCharacteristicPropertiesLike = {
  broadcast?: boolean;
  read?: boolean;
  writeWithoutResponse?: boolean;
  write?: boolean;
  notify?: boolean;
  indicate?: boolean;
  authenticatedSignedWrites?: boolean;
  reliableWrite?: boolean;
  writableAuxiliaries?: boolean;
};
type BrowserBleCharacteristicLike = {
  uuid?: string;
  properties?: BrowserBleCharacteristicPropertiesLike;
};
type BrowserBleServiceLike = {
  getCharacteristics?: () => Promise<BrowserBleCharacteristicLike[]>;
};
type BrowserBleGattServerLike = {
  connected?: boolean;
  connect?: () => Promise<BrowserBleGattServerLike>;
  disconnect?: () => void;
  getPrimaryService?: (serviceUuid: string) => Promise<BrowserBleServiceLike>;
};
type BrowserBleDeviceLike = {
  name?: string;
  gatt?: BrowserBleGattServerLike;
  addEventListener?: (type: string, listener: (...args: unknown[]) => void, options?: unknown) => void;
  removeEventListener?: (type: string, listener: (...args: unknown[]) => void, options?: unknown) => void;
};
type BrowserBleAdapterLike = {
  requestDevice: (options: { filters?: Array<{ namePrefix?: string }>; optionalServices?: string[] }) => Promise<BrowserBleDeviceLike>;
};
type BoundBleDeviceSummary = {
  id?: number | null;
  eslCode?: string;
  productCode?: string;
  templateId?: number | null;
  typeCode?: string;
  deviceArea?: number | null;
  actionFrom?: string;
  pid?: string;
  eslVersion?: string;
};
type MobileBlePreflightResult = {
  ok: boolean;
  normalizedBaseUrl?: string;
  deviceId?: string;
  license?: unknown;
  trigger?: unknown;
  bleQuery?: unknown;
  deviceLookup?: unknown;
  boundDevice?: BoundBleDeviceSummary | null;
  waitingCount?: number | null;
  errorTaskCount?: number | null;
  queryBleCount?: number;
  taskList?: unknown;
  taskState?: 'ready' | 'idle' | 'missing' | 'unknown';
  statusSummary?: string;
  taskReady?: boolean;
  task?: unknown;
  taskAttempts?: MobileBleTaskAttempt[];
  browserBle?: {
    primaryServiceUuid?: string;
    characteristicUuids?: string[];
  };
  error?: string;
};
type LegacyBleActionResult = {
  ok: boolean;
  normalizedBaseUrl?: string;
  apiCode?: string;
  storeCode?: string;
  deviceIds?: string[];
  requestBody?: unknown;
  upstream?: unknown;
  error?: string;
};
type LegacyTemplateSummary = {
  id: number;
  name: string;
  typeCode?: string;
  isDefault?: boolean;
};
type LegacyTemplateQueryResult = {
  ok: boolean;
  normalizedBaseUrl?: string;
  apiCode?: string;
  storeCode?: string;
  templates?: LegacyTemplateSummary[];
  upstream?: unknown;
  error?: string;
};
type LegacyEslApiConfig = {
  baseUrl: string;
  apiCode: string;
  shopCode: string;
  sign: string;
  templateId: string;
};
type LegacyTemplateRecommendation = {
  template: LegacyTemplateSummary | null;
  reason: 'bound-template' | 'type-default' | 'type-match' | 'current' | 'store-default' | 'first' | 'none';
};
type BrowserBleCharacteristicInfo = {
  uuid: string;
  properties: string[];
  expected: boolean;
};
type BrowserBleProbeResult = {
  ok: boolean;
  secureContext: boolean;
  aliasPrefix: string;
  serviceUuid: string;
  expectedCharacteristicUuids: string[];
  deviceName?: string;
  characteristics: BrowserBleCharacteristicInfo[];
  error?: string;
};
type BrowserBlePayloadCandidate = {
  path: string;
  kind: 'hex' | 'base64' | 'byte-array';
  byteLength: number;
  previewHex: string;
  previewValue: string;
};
type OfficialBleWorkflowStageTone = 'emerald' | 'amber' | 'rose' | 'slate';
type OfficialBleWorkflowStage = {
  key: 'bind' | 'task' | 'start';
  title: string;
  badge: string;
  tone: OfficialBleWorkflowStageTone;
  summary: string;
  detail?: string;
};
type OfficialBleWorkflowSummary = {
  stages: OfficialBleWorkflowStage[];
  handshakeCandidate: BrowserBlePayloadCandidate | null;
  streamCandidates: BrowserBlePayloadCandidate[];
  topCandidates: BrowserBlePayloadCandidate[];
  browserWriteReady: boolean;
};

const ROOM_DRAFT_STORAGE_KEY = 'erp-zhsunyco-room-board-drafts';
const MOBILE_USERNAME_STORAGE_KEY = 'erp-zhsunyco-mobile-user-name';
const LEGACY_API_CONFIG_STORAGE_KEY = 'erp-zhsunyco-legacy-esl-api-config';
const CAMERA_BARCODE_HINT = '카메라를 바코드에 가까이 대고 잠시 멈추면 자동 등록됩니다.';
const ROOM_BOARD_PREVIEW_SLOT_COUNT = 4;
const ZHSUNYCO_MOBILE_BASE_URL = 'http://www.zhsunyco.com.cn';
const DEFAULT_BROWSER_BLE_SERVICE_UUID = '3e3d1158-5656-4217-b715-266f37eb5000';
const DEFAULT_BROWSER_BLE_CHARACTERISTIC_UUIDS = [
  '30323032-4c53-4545-4c42-4b4e494c4f57',
  '31323032-4c53-4545-4c42-4b4e494c4f57',
  '32323032-4c53-4545-4c42-4b4e494c4f57',
  '33323032-4c53-4545-4c42-4b4e494c4f57',
  '34323032-4c53-4545-4c42-4b4e494c4f57',
  '35323032-4c53-4545-4c42-4b4e494c4f57',
];
const OFFICIAL_BLE_HANDSHAKE_CHARACTERISTIC_UUID = '33323032-4c53-4545-4c42-4b4e494c4f57';
const OFFICIAL_BLE_STREAM_CHARACTERISTIC_UUID = '31323032-4c53-4545-4c42-4b4e494c4f57';
const DEFAULT_LEGACY_API_CONFIG: LegacyEslApiConfig = {
  baseUrl: '',
  apiCode: 'default',
  shopCode: '',
  sign: '',
  templateId: '',
};

function compareDateKeys(left?: string | null, right?: string | null) {
  return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function buildRoomDraft(room: HandoverRoomConfig, previous?: RoomBoardDraft | null): RoomBoardDraft {
  const previousSlots = new Map((previous?.patientSlots || []).map((slot) => [slot.bedNumber, slot]));
  return {
    roomNumber: room.roomNumber,
    deviceId: previous?.deviceId || '',
    updatedAt: previous?.updatedAt || null,
    patientSlots: room.beds.map((bed) => {
      const existing = previousSlots.get(bed.bedNumber);
      return {
        bedNumber: bed.bedNumber,
        patientName: String(bed.patientName || '').trim(),
        age: existing?.age || '',
        gender: existing?.gender || '',
      };
    }),
  };
}

function buildRoomSummaryText(draft: RoomBoardDraft) {
  const lines = [
    '[병실 안내판 전송 메모]',
    `병실: ${draft.roomNumber}호`,
    `기기 바코드: ${draft.deviceId || '-'}`,
    '',
    ...draft.patientSlots.map((slot) => {
      const parts = [
        `${slot.bedNumber}번`,
        slot.patientName || '미기입',
        slot.age ? `나이 ${slot.age}` : '',
        slot.gender ? `성별 ${slot.gender}` : '',
      ].filter(Boolean);
      return `- ${parts.join(' / ')}`;
    }),
  ];
  return lines.filter(Boolean).join('\n');
}

function buildRoomJson(draft: RoomBoardDraft) {
  return JSON.stringify(
    {
      roomNumber: draft.roomNumber,
      deviceId: draft.deviceId,
      updatedAt: draft.updatedAt,
      patients: draft.patientSlots,
    },
    null,
    2,
  );
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, 'success');
  } catch {
    toast('클립보드 복사에 실패했습니다.', 'error');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getBoardPreviewSlots(draft: RoomBoardDraft) {
  const normalized = Array.from({ length: ROOM_BOARD_PREVIEW_SLOT_COUNT }, (_, index) => {
    const slot = draft.patientSlots[index];
    return {
      bedNumber: slot?.bedNumber ?? index + 1,
      patientName: String(slot?.patientName || '').trim(),
      age: String(slot?.age || '').trim(),
      gender: String(slot?.gender || '').trim(),
    };
  });

  return normalized;
}

function formatPreviewPatientMeta(slot: RoomBoardPatientSlot) {
  const values = [slot.age ? `${slot.age}세` : '', slot.gender].filter(Boolean);
  return values.length > 0 ? values.join(' / ') : '나이 · 성별 미입력';
}

function buildLegacyDirectProduct(draft: RoomBoardDraft) {
  const slots = getBoardPreviewSlots(draft);
  const extend = Object.fromEntries(
    slots.flatMap((slot, index) => {
      const valueIndex = index * 2 + 1;
      return [
        [`e${String(valueIndex).padStart(3, '0')}`, `${slot.bedNumber}번 ${slot.patientName || '공실'}`],
        [`e${String(valueIndex + 1).padStart(3, '0')}`, formatPreviewPatientMeta(slot)],
      ];
    }),
  );

  return {
    pc: draft.roomNumber,
    pn: slots.map((slot) => `${slot.bedNumber}:${slot.patientName || '공실'}`).join(' / '),
    pp: draft.patientSlots.filter((slot) => String(slot.patientName || '').trim()).length,
    extend,
  };
}

function stringifyDiagnosticValue(value: unknown) {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractDiagnosticMessage(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const error = typeof record.error === 'string' ? record.error : '';
    const message = typeof record.message === 'string' ? record.message : '';
    if (error) return error;
    if (message) return message;
    if (record.error_code === 0) return '정상';
  }
  return '응답 확인 필요';
}

function normalizeLegacyTemplateTypeCode(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function normalizeUuidString(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function truncateDiagnosticValue(value: string, maxLength = 120) {
  const trimmed = String(value || '').trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

function previewHex(bytes: Uint8Array, limit = 32) {
  const hex = Array.from(bytes.slice(0, limit), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  return bytes.length > limit ? `${hex} ...` : hex;
}

function hexToBytes(value: string) {
  const normalized = String(value || '')
    .replace(/^0x/i, '')
    .replace(/[\s:-]+/g, '')
    .trim();
  if (!normalized || normalized.length % 2 !== 0 || !/^[\da-fA-F]+$/.test(normalized)) {
    return null;
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function base64ToBytes(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length < 12 || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return null;
  }
  if (typeof window === 'undefined' || typeof window.atob !== 'function') {
    return null;
  }
  try {
    const binary = window.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function hasInterestingPayloadKey(path: string) {
  const lowered = String(path || '').toLowerCase();
  return ['payload', 'data', 'hex', 'base64', 'bytes', 'cmd', 'command', 'packet', 'buffer', 'raw', 'value', 'content'].some((token) =>
    lowered.includes(token),
  );
}

function collectMobileBlePayloadCandidates(value: unknown) {
  const results: BrowserBlePayloadCandidate[] = [];
  const seenObjects = new WeakSet<object>();

  const appendCandidate = (candidate: BrowserBlePayloadCandidate) => {
    const duplicate = results.some(
      (existing) =>
        existing.path === candidate.path &&
        existing.kind === candidate.kind &&
        existing.byteLength === candidate.byteLength &&
        existing.previewHex === candidate.previewHex,
    );
    if (!duplicate) {
      results.push(candidate);
    }
  };

  const visit = (current: unknown, path: string, depth: number) => {
    if (current == null || depth > 7) return;

    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) return;

      const hexBytes = hexToBytes(trimmed);
      if (hexBytes && (hexBytes.length >= 6 || hasInterestingPayloadKey(path))) {
        appendCandidate({
          path,
          kind: 'hex',
          byteLength: hexBytes.length,
          previewHex: previewHex(hexBytes),
          previewValue: truncateDiagnosticValue(trimmed),
        });
        return;
      }

      const base64Bytes = base64ToBytes(trimmed);
      if (base64Bytes && (base64Bytes.length >= 6 || hasInterestingPayloadKey(path))) {
        appendCandidate({
          path,
          kind: 'base64',
          byteLength: base64Bytes.length,
          previewHex: previewHex(base64Bytes),
          previewValue: truncateDiagnosticValue(trimmed),
        });
      }
      return;
    }

    if (Array.isArray(current)) {
      const isByteArray = current.every(
        (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 255 && Number.isInteger(item),
      );
      if (isByteArray && (current.length >= 6 || hasInterestingPayloadKey(path))) {
        const bytes = Uint8Array.from(current as number[]);
        appendCandidate({
          path,
          kind: 'byte-array',
          byteLength: bytes.length,
          previewHex: previewHex(bytes),
          previewValue: truncateDiagnosticValue(JSON.stringify(current)),
        });
      }

      current.forEach((item, index) => {
        visit(item, `${path}[${index}]`, depth + 1);
      });
      return;
    }

    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (seenObjects.has(record)) return;
      seenObjects.add(record);
      Object.entries(record).forEach(([key, nextValue]) => {
        visit(nextValue, path ? `${path}.${key}` : key, depth + 1);
      });
    }
  };

  visit(value, 'mobileBle', 0);
  return results;
}

function scoreMobileBlePayloadCandidate(candidate: BrowserBlePayloadCandidate) {
  const loweredPath = candidate.path.toLowerCase();
  let score = candidate.byteLength;

  if (loweredPath.includes('taskattempts')) score += 180;
  if (loweredPath.includes('.value')) score += 140;
  if (loweredPath.includes('cmd')) score += 120;
  if (loweredPath.includes('tasklist')) score += 60;
  if (loweredPath.includes('extend')) score -= 40;
  if (candidate.kind === 'byte-array') score += 20;
  if (candidate.byteLength >= 128) score += 800;
  if (candidate.byteLength >= 12 && candidate.byteLength <= 32) score += 120;

  return score;
}

function sortMobileBlePayloadCandidates(candidates: BrowserBlePayloadCandidate[]) {
  return [...candidates].sort((left, right) => {
    const scoreDelta = scoreMobileBlePayloadCandidate(right) - scoreMobileBlePayloadCandidate(left);
    if (scoreDelta !== 0) return scoreDelta;
    const sizeDelta = right.byteLength - left.byteLength;
    if (sizeDelta !== 0) return sizeDelta;
    return left.path.localeCompare(right.path, 'ko-KR', { sensitivity: 'base' });
  });
}

function buildOfficialBleWorkflowSummary(
  preflight: MobileBlePreflightResult | null,
  browserBleProbeResult: BrowserBleProbeResult | null,
  payloadCandidates: BrowserBlePayloadCandidate[],
): OfficialBleWorkflowSummary | null {
  if (!preflight) return null;

  const bindReady = Boolean(preflight.boundDevice?.eslCode);
  const taskReady = Boolean(preflight.taskReady);
  const handshakeCandidate =
    payloadCandidates.find((candidate) => candidate.byteLength >= 12 && candidate.byteLength <= 32) || null;
  const streamCandidates = payloadCandidates.filter((candidate) => candidate.byteLength >= 128);
  const writableCharacteristicUuids = new Set(
    (browserBleProbeResult?.characteristics || [])
      .filter((characteristic) =>
        characteristic.properties.some((property) => property === 'write' || property === 'writeWithoutResponse'),
      )
      .map((characteristic) => normalizeUuidString(characteristic.uuid)),
  );
  const browserWriteReady =
    writableCharacteristicUuids.has(OFFICIAL_BLE_HANDSHAKE_CHARACTERISTIC_UUID) &&
    writableCharacteristicUuids.has(OFFICIAL_BLE_STREAM_CHARACTERISTIC_UUID);
  const largestCandidate = payloadCandidates[0] || null;

  const stages: OfficialBleWorkflowStage[] = [
    bindReady
      ? {
          key: 'bind',
          title: '1. BLE EPD BIND',
          badge: 'DONE',
          tone: 'emerald',
          summary: `기기 ${preflight.boundDevice?.eslCode || preflight.deviceId || '-'}가 제조사 앱 기준으로 바인드돼 있습니다.`,
          detail: preflight.boundDevice?.typeCode
            ? `기기 종류 ${preflight.boundDevice.typeCode} / template ${preflight.boundDevice.templateId ?? '-'}`
            : undefined,
        }
      : {
          key: 'bind',
          title: '1. BLE EPD BIND',
          badge: 'NEED BIND',
          tone: 'rose',
          summary: '공식 앱의 BLE EPD 화면에서 먼저 BIND가 필요합니다.',
          detail: '현재 서버 응답에는 바인드된 ESL 정보가 없습니다.',
        },
    taskReady
      ? {
          key: 'task',
          title: '2. TASK READY',
          badge: 'READY',
          tone: 'emerald',
          summary: 'TASK 화면에서 Start Task를 누를 수 있는 상태입니다.',
          detail:
            preflight.waitingCount != null || preflight.errorTaskCount != null
              ? `대기 ${preflight.waitingCount ?? 0}건 / 오류 ${preflight.errorTaskCount ?? 0}건`
              : undefined,
        }
      : bindReady
        ? {
            key: 'task',
            title: '2. TASK READY',
            badge: 'WAITING',
            tone: 'amber',
            summary: 'BIND는 됐지만 아직 TASK READY가 아닙니다.',
            detail: '공식 앱에서도 이 단계가 준비돼야 Start Task가 열립니다.',
          }
        : {
            key: 'task',
            title: '2. TASK READY',
            badge: 'BLOCKED',
            tone: 'slate',
            summary: 'BIND 이후에만 TASK가 생성됩니다.',
          },
    !bindReady
      ? {
          key: 'start',
          title: '3. Start Task',
          badge: 'BLOCKED',
          tone: 'slate',
          summary: 'BIND가 끝나야 Start Task를 시도할 수 있습니다.',
        }
      : !taskReady
        ? {
            key: 'start',
            title: '3. Start Task',
            badge: 'WAITING',
            tone: 'amber',
            summary: 'TASK READY 이후에만 Start Task가 실제 BLE write를 시작합니다.',
          }
        : streamCandidates.length === 0
          ? {
              key: 'start',
              title: '3. Start Task',
              badge: 'WRITE MISSING',
              tone: 'amber',
              summary: '서버는 준비됐지만 앱 로그의 대용량 write 후보가 아직 보이지 않습니다.',
              detail: largestCandidate
                ? `현재 자동 추출된 최대 후보는 ${largestCandidate.byteLength}B (${largestCandidate.path}) 입니다.`
                : '자동 추출된 write 후보가 없습니다.',
            }
          : browserWriteReady
            ? {
                key: 'start',
                title: '3. Start Task',
                badge: 'WRITE READY',
                tone: 'emerald',
                summary: 'Start Task 실험에 필요한 characteristic과 대용량 write 후보가 모두 보입니다.',
                detail: `핸드셰이크 ${handshakeCandidate?.byteLength ?? 0}B / 대용량 후보 ${streamCandidates.length}개`,
              }
            : {
                key: 'start',
                title: '3. Start Task',
                badge: 'NEED LOCAL WRITE',
                tone: 'amber',
                summary: 'TASK READY는 됐지만 Start Task의 로컬 BLE write 단계가 아직 비어 있습니다.',
                detail: `앱 로그 기준 ${OFFICIAL_BLE_HANDSHAKE_CHARACTERISTIC_UUID} 16B 1회 + ${OFFICIAL_BLE_STREAM_CHARACTERISTIC_UUID} 244B 반복 write`,
              },
  ];

  return {
    stages,
    handshakeCandidate,
    streamCandidates,
    topCandidates: payloadCandidates.slice(0, 20),
    browserWriteReady,
  };
}

function describeCharacteristicProperties(properties?: BrowserBleCharacteristicPropertiesLike | null) {
  if (!properties) return [];

  const propertyRecord = properties as Record<string, unknown>;
  return [
    ['broadcast', properties.broadcast],
    ['read', properties.read],
    ['writeWithoutResponse', properties.writeWithoutResponse],
    ['write', properties.write],
    ['notify', properties.notify],
    ['indicate', properties.indicate],
    ['authenticatedSignedWrites', propertyRecord.authenticatedSignedWrites === true],
    ['reliableWrite', propertyRecord.reliableWrite === true],
    ['writableAuxiliaries', propertyRecord.writableAuxiliaries === true],
  ]
    .filter((entry) => Boolean(entry[1]))
    .map((entry) => String(entry[0]));
}

function choosePreferredLegacyTemplate(
  templates: LegacyTemplateSummary[],
  boundDevice?: BoundBleDeviceSummary | null,
  currentTemplateId?: string | null,
): LegacyTemplateRecommendation {
  if (!templates.length) {
    return { template: null, reason: 'none' };
  }

  const normalizedCurrentId = String(currentTemplateId || '').trim();
  const currentTemplate = normalizedCurrentId
    ? templates.find((template) => String(template.id) === normalizedCurrentId) || null
    : null;

  const boundTemplateId = boundDevice?.templateId != null ? String(boundDevice.templateId).trim() : '';
  const boundTemplate =
    boundTemplateId ? templates.find((template) => String(template.id) === boundTemplateId) || null : null;

  if (boundTemplate) {
    return { template: boundTemplate, reason: 'bound-template' };
  }

  const boundTypeCode = normalizeLegacyTemplateTypeCode(boundDevice?.typeCode);
  const matchingTypeTemplates = boundTypeCode
    ? templates.filter((template) => normalizeLegacyTemplateTypeCode(template.typeCode) === boundTypeCode)
    : [];
  const defaultMatchingTypeTemplate = matchingTypeTemplates.find((template) => template.isDefault) || null;

  if (currentTemplate) {
    const currentTypeCode = normalizeLegacyTemplateTypeCode(currentTemplate.typeCode);
    if (!boundTypeCode || currentTypeCode === boundTypeCode) {
      return { template: currentTemplate, reason: 'current' };
    }
  }

  if (defaultMatchingTypeTemplate) {
    return { template: defaultMatchingTypeTemplate, reason: 'type-default' };
  }

  if (matchingTypeTemplates[0]) {
    return { template: matchingTypeTemplates[0], reason: 'type-match' };
  }

  if (currentTemplate) {
    return { template: currentTemplate, reason: 'current' };
  }

  const defaultTemplate = templates.find((template) => template.isDefault) || null;
  if (defaultTemplate) {
    return { template: defaultTemplate, reason: 'store-default' };
  }

  return { template: templates[0], reason: 'first' };
}

function formatLegacyTemplateRecommendation(recommendation: LegacyTemplateRecommendation) {
  if (!recommendation.template) return '';

  const label = `#${recommendation.template.id} ${recommendation.template.name}${
    recommendation.template.typeCode ? ` · ${recommendation.template.typeCode}` : ''
  }`;

  switch (recommendation.reason) {
    case 'bound-template':
      return `기기에 연결된 템플릿 기준으로 자동 선택: ${label}`;
    case 'type-default':
      return `기기 종류와 일치하는 기본 템플릿 자동 선택: ${label}`;
    case 'type-match':
      return `기기 종류와 일치하는 템플릿 자동 선택: ${label}`;
    case 'store-default':
      return `매장 기본 템플릿 자동 선택: ${label}`;
    case 'first':
      return `조회된 첫 템플릿으로 자동 선택: ${label}`;
    case 'current':
      return `현재 선택 템플릿 유지: ${label}`;
    default:
      return '';
  }
}

function RoomBoardPreview({ draft }: { draft: RoomBoardDraft }) {
  const slots = getBoardPreviewSlots(draft);

  return (
    <div className="overflow-hidden rounded-[28px] border-[10px] border-neutral-200 bg-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_48px_rgba(15,23,42,0.12)]">
      <div className="aspect-[5/3] bg-neutral-50 text-neutral-900">
        <div className="grid h-full grid-rows-[auto_1fr]">
          <div className="flex items-center justify-between border-b border-neutral-300 bg-neutral-200 px-5 py-3">
            <div className="text-2xl font-black tracking-tight">{draft.roomNumber}호</div>
            <div className="text-sm font-semibold text-neutral-600">입원환자 정보</div>
          </div>

          <div className="grid h-full grid-cols-2 grid-rows-2">
            {slots.map((slot, index) => {
              const borderClass = [
                index % 2 === 0 ? 'border-r' : '',
                index < 2 ? 'border-b' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={`${draft.roomNumber}-${slot.bedNumber}-${index}`}
                  className={`flex flex-col justify-between border-neutral-300 p-4 ${borderClass}`}
                >
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.16em] text-neutral-500">{slot.bedNumber}번 환자</div>
                    <div className="mt-3 text-3xl font-black tracking-tight text-neutral-900">
                      {slot.patientName || '공란'}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    <div className="rounded-2xl border border-neutral-300 bg-white px-3 py-2">
                      <div className="text-[10px] font-bold tracking-[0.14em] text-neutral-500">나이 / 성별</div>
                      <div className="mt-1 text-base font-semibold text-neutral-800">{formatPreviewPatientMeta(slot)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ZhsunycoEslSync(_props: Props) {
  const permissionMap = (_props.user?.permissions as Record<string, unknown> | undefined) || undefined;
  const canManageDeviceRegistration = Boolean(_props.user?.role === 'admin' || permissionMap?.admin === true || permissionMap?.mso === true);
  const [rooms, setRooms] = useState<HandoverRoomConfig[]>([]);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomBoardDraft>>({});
  const [selectedRoomNumber, setSelectedRoomNumber] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [deviceRegistrationOpen, setDeviceRegistrationOpen] = useState(false);
  const [deviceRegistrationValue, setDeviceRegistrationValue] = useState('');
  const [cameraScanOpen, setCameraScanOpen] = useState(false);
  const [cameraScanBusy, setCameraScanBusy] = useState(false);
  const [cameraScanStatus, setCameraScanStatus] = useState(CAMERA_BARCODE_HINT);
  const [previewRoomNumber, setPreviewRoomNumber] = useState('');
  const [mobileUserName, setMobileUserName] = useState('');
  const [mobilePassword, setMobilePassword] = useState('');
  const [mobileBleChecking, setMobileBleChecking] = useState(false);
  const [mobileBlePreflight, setMobileBlePreflight] = useState<MobileBlePreflightResult | null>(null);
  const [legacyApiConfig, setLegacyApiConfig] = useState<LegacyEslApiConfig>(DEFAULT_LEGACY_API_CONFIG);
  const [legacyTemplateLoading, setLegacyTemplateLoading] = useState(false);
  const [legacyTemplateQueryResult, setLegacyTemplateQueryResult] = useState<LegacyTemplateQueryResult | null>(null);
  const [legacyTemplateRecommendation, setLegacyTemplateRecommendation] = useState('');
  const [legacyBleSearching, setLegacyBleSearching] = useState(false);
  const [legacyBleDirectSending, setLegacyBleDirectSending] = useState(false);
  const [legacyBleSearchResult, setLegacyBleSearchResult] = useState<LegacyBleActionResult | null>(null);
  const [legacyBleDirectResult, setLegacyBleDirectResult] = useState<LegacyBleActionResult | null>(null);
  const [browserBleProbing, setBrowserBleProbing] = useState(false);
  const [browserBleProbeResult, setBrowserBleProbeResult] = useState<BrowserBleProbeResult | null>(null);
  const deviceRegistrationInputRef = useRef<HTMLInputElement | null>(null);
  const deviceRegistrationVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraScanControlsRef = useRef<ScannerControlsLike | null>(null);
  const browserBleDeviceRef = useRef<BrowserBleDeviceLike | null>(null);
  const browserBleServerRef = useRef<BrowserBleGattServerLike | null>(null);

  useEffect(() => {
    try {
      const rawDrafts = localStorage.getItem(ROOM_DRAFT_STORAGE_KEY);
      if (rawDrafts) {
        setRoomDrafts(JSON.parse(rawDrafts) as Record<string, RoomBoardDraft>);
      }

      const savedMobileUserName = localStorage.getItem(MOBILE_USERNAME_STORAGE_KEY);
      if (savedMobileUserName) {
        setMobileUserName(savedMobileUserName);
      }

      const savedLegacyApiConfig = localStorage.getItem(LEGACY_API_CONFIG_STORAGE_KEY);
      if (savedLegacyApiConfig) {
        setLegacyApiConfig({
          ...DEFAULT_LEGACY_API_CONFIG,
          ...(JSON.parse(savedLegacyApiConfig) as Partial<LegacyEslApiConfig>),
        });
      }
    } catch {
      // ignore local storage failures
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ROOM_DRAFT_STORAGE_KEY, JSON.stringify(roomDrafts));
    } catch {
      // ignore local storage failures
    }
  }, [roomDrafts]);

  useEffect(() => {
    try {
      const nextValue = mobileUserName.trim();
      if (nextValue) {
        localStorage.setItem(MOBILE_USERNAME_STORAGE_KEY, nextValue);
      } else {
        localStorage.removeItem(MOBILE_USERNAME_STORAGE_KEY);
      }
    } catch {
      // ignore local storage failures
    }
  }, [mobileUserName]);

  useEffect(() => {
    try {
      localStorage.setItem(LEGACY_API_CONFIG_STORAGE_KEY, JSON.stringify(legacyApiConfig));
    } catch {
      // ignore local storage failures
    }
  }, [legacyApiConfig]);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { data, error } = await supabase.from('handover_notes').select('*').order('created_at', { ascending: false }).limit(1500);
      if (error) throw error;

      const notes = ((data || []) as HandoverNoteRow[]).map(normalizeHandoverNote);
      const latestByDate = new Map<string, HandoverSnapshot>();
      notes.forEach((note) => {
        if (note.handover_kind !== 'room_config' || !note.handover_date) return;
        const snapshot: HandoverSnapshot = {
          dateKey: note.handover_date,
          createdAt: note.created_at || null,
          rooms: parseRoomConfigsFromNote(note),
        };
        const current = latestByDate.get(note.handover_date);
        const currentTime = current ? new Date(current.createdAt || 0).getTime() : -1;
        const nextTime = new Date(note.created_at || 0).getTime();
        if (!current || nextTime >= currentTime) latestByDate.set(note.handover_date, snapshot);
      });

      const matched = Array.from(latestByDate.values())
        .sort((left, right) => compareDateKeys(right.dateKey, left.dateKey))[0];

      const nextRooms = matched?.rooms || [];
      setRooms(nextRooms);
      setRoomDrafts((prev) => {
        const next: Record<string, RoomBoardDraft> = {};
        nextRooms.forEach((room) => {
          next[room.roomNumber] = buildRoomDraft(room, prev[room.roomNumber]);
        });
        return next;
      });
    } catch (error) {
      console.error('Failed to load handover room configs:', error);
      setRooms([]);
      toast('병실 설정을 불러오지 못했습니다.', 'error');
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!selectedRoomNumber && rooms.length > 0) {
      setSelectedRoomNumber(rooms[0].roomNumber);
    } else if (selectedRoomNumber && !rooms.some((room) => room.roomNumber === selectedRoomNumber)) {
      setSelectedRoomNumber(rooms[0]?.roomNumber || '');
    }
  }, [rooms, selectedRoomNumber]);

  useEffect(() => {
    if (!deviceRegistrationOpen) return;
    const timer = window.setTimeout(() => {
      deviceRegistrationInputRef.current?.focus();
      deviceRegistrationInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [deviceRegistrationOpen]);

  useEffect(() => {
    return () => {
      cameraScanControlsRef.current?.stop();
      cameraScanControlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      const server = browserBleServerRef.current;
      const device = browserBleDeviceRef.current;
      try {
        if (server?.connected && typeof server.disconnect === 'function') {
          server.disconnect();
        } else if (device?.gatt?.connected && typeof device.gatt.disconnect === 'function') {
          device.gatt.disconnect();
        }
      } catch {
        // ignore cleanup failures
      }
    };
  }, []);

  const selectedRoom = useMemo(() => rooms.find((room) => room.roomNumber === selectedRoomNumber) || null, [rooms, selectedRoomNumber]);
  const selectedDraft = useMemo(() => (selectedRoomNumber ? roomDrafts[selectedRoomNumber] || null : null), [roomDrafts, selectedRoomNumber]);
  const previewDraft = useMemo(() => (previewRoomNumber ? roomDrafts[previewRoomNumber] || null : null), [previewRoomNumber, roomDrafts]);
  const preparedRooms = useMemo(
    () => rooms.map((room) => roomDrafts[room.roomNumber]).filter((draft): draft is RoomBoardDraft => Boolean(draft)).filter((draft) => Boolean(draft.updatedAt)),
    [roomDrafts, rooms],
  );
  const browserBleServiceUuid = useMemo(
    () => normalizeUuidString(mobileBlePreflight?.browserBle?.primaryServiceUuid) || DEFAULT_BROWSER_BLE_SERVICE_UUID,
    [mobileBlePreflight?.browserBle?.primaryServiceUuid],
  );
  const browserBleCharacteristicUuids = useMemo(() => {
    const candidates = (mobileBlePreflight?.browserBle?.characteristicUuids || [])
      .map((value) => normalizeUuidString(value))
      .filter(Boolean);
    return candidates.length > 0 ? Array.from(new Set(candidates)) : DEFAULT_BROWSER_BLE_CHARACTERISTIC_UUIDS;
  }, [mobileBlePreflight?.browserBle?.characteristicUuids]);
  const mobileBlePayloadCandidates = useMemo(
    () =>
      mobileBlePreflight
        ? sortMobileBlePayloadCandidates(
            collectMobileBlePayloadCandidates({
              task: mobileBlePreflight.task,
              taskList: mobileBlePreflight.taskList,
              taskAttempts: (mobileBlePreflight.taskAttempts || []).map((attempt) => ({
                label: attempt.label,
                query: attempt.query,
                upstream: attempt.upstream,
              })),
            }),
          )
        : [],
    [mobileBlePreflight],
  );
  const officialBleWorkflowSummary = useMemo(
    () => buildOfficialBleWorkflowSummary(mobileBlePreflight, browserBleProbeResult, mobileBlePayloadCandidates),
    [browserBleProbeResult, mobileBlePayloadCandidates, mobileBlePreflight],
  );
  const mobileBleTopPayloadCandidates = useMemo(
    () => officialBleWorkflowSummary?.topCandidates || [],
    [officialBleWorkflowSummary],
  );

  const updateSelectedDraft = useCallback((updater: (draft: RoomBoardDraft) => RoomBoardDraft) => {
    if (!selectedRoomNumber) return;
    setRoomDrafts((prev) => {
      const current = prev[selectedRoomNumber];
      if (!current) return prev;
      return { ...prev, [selectedRoomNumber]: updater(current) };
    });
  }, [selectedRoomNumber]);

  const updateSelectedPatientSlot = useCallback((index: number, patch: Partial<RoomBoardPatientSlot>) => {
    updateSelectedDraft((draft) => ({
      ...draft,
      patientSlots: draft.patientSlots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)),
    }));
  }, [updateSelectedDraft]);

  const updateLegacyApiField = useCallback(
    <Key extends keyof LegacyEslApiConfig,>(key: Key, value: LegacyEslApiConfig[Key]) => {
      if (key === 'baseUrl' || key === 'apiCode' || key === 'shopCode' || key === 'sign') {
        setLegacyTemplateQueryResult(null);
        setLegacyTemplateRecommendation('');
      }
      setLegacyApiConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetSelectedRoomFromSource = useCallback(() => {
    if (!selectedRoom) return;
    setRoomDrafts((prev) => ({
      ...prev,
      [selectedRoom.roomNumber]: buildRoomDraft(selectedRoom, prev[selectedRoom.roomNumber]),
    }));
    toast('인계노트 기준 환자 정보를 다시 채웠습니다.', 'success');
  }, [selectedRoom]);

  const stopCameraBarcodeScan = useCallback(() => {
    cameraScanControlsRef.current?.stop();
    cameraScanControlsRef.current = null;

    const video = deviceRegistrationVideoRef.current;
    const stream = video?.srcObject;
    if (stream && 'getTracks' in stream) {
      (stream as MediaStream).getTracks().forEach((track) => track.stop());
    }
    if (video) {
      video.srcObject = null;
    }

    setCameraScanOpen(false);
    setCameraScanBusy(false);
    setCameraScanStatus(CAMERA_BARCODE_HINT);
  }, []);

  const closeDeviceRegistration = useCallback(() => {
    stopCameraBarcodeScan();
    setDeviceRegistrationOpen(false);
    setDeviceRegistrationValue('');
  }, [stopCameraBarcodeScan]);

  const saveSelectedRoomDevice = useCallback((deviceCode: string) => {
    if (!selectedDraft) return false;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 등록할 수 있습니다.', 'error');
      return false;
    }

    const nextValue = deviceCode.trim();
    if (!nextValue) {
      toast('기기 바코드를 스캔하거나 입력해 주세요.', 'error');
      return false;
    }

    updateSelectedDraft((draft) => ({ ...draft, deviceId: nextValue }));
    closeDeviceRegistration();
    toast(`${selectedDraft.roomNumber}호 기기 바코드를 등록했습니다.`, 'success');
    return true;
  }, [canManageDeviceRegistration, closeDeviceRegistration, selectedDraft, updateSelectedDraft]);

  const submitSelectedRoomDeviceRegistration = useCallback(() => {
    void saveSelectedRoomDevice(deviceRegistrationValue);
  }, [deviceRegistrationValue, saveSelectedRoomDevice]);

  const startCameraBarcodeScan = useCallback(async () => {
    if (!selectedDraft) return;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 등록할 수 있습니다.', 'error');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('이 브라우저는 카메라 스캔을 지원하지 않습니다.', 'error');
      return;
    }
    stopCameraBarcodeScan();
    setCameraScanOpen(true);
    setCameraScanBusy(true);
    setCameraScanStatus('카메라 여는 중...');

    try {
      const previewElement = deviceRegistrationVideoRef.current;
      if (!previewElement) {
        throw new Error('preview-not-ready');
      }

      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.CODABAR,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ];

      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        previewElement,
        (result, error, nextControls) => {
          cameraScanControlsRef.current = nextControls;
          if (result) {
            const scannedText = String(result.getText() || '').trim();
            if (!scannedText) return;
            nextControls.stop();
            cameraScanControlsRef.current = null;
            setDeviceRegistrationValue(scannedText);
            setCameraScanStatus(`인식 완료: ${scannedText}`);
            saveSelectedRoomDevice(scannedText);
            return;
          }

          const errorName = String((error as { name?: string } | undefined)?.name || '');
          if (errorName && errorName !== 'NotFoundException' && errorName !== 'ChecksumException' && errorName !== 'FormatException') {
            setCameraScanStatus('바코드 인식 중 오류가 발생했습니다. 다시 시도해 주세요.');
          }
        }
      );

      cameraScanControlsRef.current = controls;
      setCameraScanStatus(CAMERA_BARCODE_HINT);
    } catch (error) {
      console.error('Failed to start barcode camera scan:', error);
      stopCameraBarcodeScan();
      const message =
        error instanceof Error && error.message === 'preview-not-ready'
          ? '카메라 화면을 준비하는 중입니다. 다시 한 번 눌러 주세요.'
          : '카메라 권한을 허용한 뒤 다시 시도해 주세요.';
      toast(message, 'error');
      setCameraScanStatus(message);
    } finally {
      setCameraScanBusy(false);
    }
  }, [canManageDeviceRegistration, saveSelectedRoomDevice, selectedDraft, stopCameraBarcodeScan]);

  const registerSelectedRoomDevice = useCallback(() => {
    if (!selectedDraft) return;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 등록할 수 있습니다.', 'error');
      return;
    }

    const suggestedValue = String(selectedDraft.deviceId || '').trim();
    setDeviceRegistrationValue(suggestedValue);
    setDeviceRegistrationOpen(true);
  }, [canManageDeviceRegistration, selectedDraft]);

  const clearSelectedRoomDevice = useCallback(() => {
    if (!selectedDraft) return;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 삭제할 수 있습니다.', 'error');
      return;
    }
    if (!selectedDraft.deviceId.trim()) return;
    if (!window.confirm(`${selectedDraft.roomNumber}호에 등록된 기기 바코드를 삭제할까요?`)) return;

    updateSelectedDraft((draft) => ({ ...draft, deviceId: '' }));
    toast(`${selectedDraft.roomNumber}호 기기 바코드를 삭제했습니다.`, 'success');
  }, [canManageDeviceRegistration, selectedDraft, updateSelectedDraft]);

  const markSelectedRoomPrepared = useCallback(() => {
    if (!selectedDraft) return;
    if (!selectedDraft.deviceId.trim()) {
      toast('기기 바코드를 먼저 등록해 주세요.', 'error');
      return;
    }
    updateSelectedDraft((draft) => ({ ...draft, updatedAt: new Date().toISOString() }));
    toast('전송 준비 목록에 올렸습니다.', 'success');
  }, [selectedDraft, updateSelectedDraft]);

  const clearPreparedState = useCallback((roomNumber: string) => {
    setRoomDrafts((prev) => {
      const current = prev[roomNumber];
      if (!current) return prev;
      return {
        ...prev,
        [roomNumber]: {
          ...current,
          updatedAt: null,
        },
      };
    });
    toast(`${roomNumber}호 전송 준비를 해제했습니다.`, 'success');
  }, []);

  const disconnectBrowserBle = useCallback(() => {
    const server = browserBleServerRef.current;
    const device = browserBleDeviceRef.current;
    try {
      if (server?.connected && typeof server.disconnect === 'function') {
        server.disconnect();
      } else if (device?.gatt?.connected && typeof device.gatt.disconnect === 'function') {
        device.gatt.disconnect();
      }
    } catch {
      // ignore disconnect failures
    } finally {
      browserBleServerRef.current = null;
      browserBleDeviceRef.current = null;
    }
  }, []);

  const runBrowserBleProbe = useCallback(
    async (draft: RoomBoardDraft) => {
      if (!draft.deviceId.trim()) {
        toast('湲곌린 諛붿퐫?쒕? 癒쇱? ?깅줉??二쇱꽭??', 'error');
        return;
      }

      const bluetooth =
        typeof navigator !== 'undefined' ? (navigator as Navigator & { bluetooth?: BrowserBleAdapterLike }).bluetooth : undefined;
      if (!bluetooth?.requestDevice) {
        const message = '??釉뚮씪?곗???Web Bluetooth瑜?吏?먰븯吏 ?딆뒿?덈떎.';
        setBrowserBleProbeResult({
          ok: false,
          secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
          aliasPrefix: draft.deviceId.trim(),
          serviceUuid: browserBleServiceUuid,
          expectedCharacteristicUuids: browserBleCharacteristicUuids,
          characteristics: [],
          error: message,
        });
        toast(message, 'error');
        return;
      }

      if (typeof window !== 'undefined' && !window.isSecureContext) {
        const message = 'Web Bluetooth??HTTPS ?먮뒗 localhost?먯꽌留? ?ъ슜?????덉뒿?덈떎.';
        setBrowserBleProbeResult({
          ok: false,
          secureContext: false,
          aliasPrefix: draft.deviceId.trim(),
          serviceUuid: browserBleServiceUuid,
          expectedCharacteristicUuids: browserBleCharacteristicUuids,
          characteristics: [],
          error: message,
        });
        toast(message, 'error');
        return;
      }

      const deviceCode = draft.deviceId.trim();
      const aliasPrefix = deviceCode.toUpperCase().startsWith('WL') ? deviceCode : `WL${deviceCode}`;

      setBrowserBleProbing(true);
      setBrowserBleProbeResult(null);
      disconnectBrowserBle();

      try {
        const device = await bluetooth.requestDevice({
          filters: [{ namePrefix: aliasPrefix }, { namePrefix: deviceCode }],
          optionalServices: [browserBleServiceUuid],
        });

        const handleDisconnected = () => {
          browserBleServerRef.current = null;
          browserBleDeviceRef.current = null;
          setBrowserBleProbeResult((prev) =>
            prev
              ? {
                  ...prev,
                  ok: false,
                  error: '釉뚮씪?곗? BLE ?곌껐???댁젣?섏뿀?듬땲??',
                }
              : prev,
          );
        };

        device.addEventListener?.('gattserverdisconnected', handleDisconnected, { once: true });
        browserBleDeviceRef.current = device;

        const server = device.gatt;
        if (!server?.connect || !server.getPrimaryService) {
          throw new Error('GATT ?쒕쾭?먯뿉 ?곌껐???덉쓣 ???놁뒿?덈떎.');
        }

        const connectedServer = await server.connect();
        browserBleServerRef.current = connectedServer;

        if (!connectedServer.getPrimaryService) {
          throw new Error('?꾩닔 BLE ?쒕퉬?ㅻ? 諛쏆븘???놁뒿?덈떎.');
        }

        const primaryService = await connectedServer.getPrimaryService(browserBleServiceUuid);
        const characteristics = (await primaryService.getCharacteristics?.()) || [];
        const expectedSet = new Set(browserBleCharacteristicUuids);
        const normalizedCharacteristics = characteristics.map((characteristic) => {
          const uuid = normalizeUuidString(characteristic.uuid);
          return {
            uuid: uuid || '-',
            properties: describeCharacteristicProperties(characteristic.properties),
            expected: expectedSet.has(uuid),
          };
        });

        setBrowserBleProbeResult({
          ok: true,
          secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
          aliasPrefix,
          serviceUuid: browserBleServiceUuid,
          expectedCharacteristicUuids: browserBleCharacteristicUuids,
          deviceName: String(device.name || '').trim() || undefined,
          characteristics: normalizedCharacteristics,
        });
        toast('釉뚮씪?곗? BLE濡??ㅼ젣 ESL ?쒕퉬?ㅼ? ?≪꽦?щ? ?뺤씤?덉뒿?덈떎.', 'success');
      } catch (error) {
        disconnectBrowserBle();
        const message = error instanceof Error ? error.message : '釉뚮씪?곗? BLE ?곌껐 ?뺤씤???ㅽ뙣?덉뒿?덈떎.';
        setBrowserBleProbeResult({
          ok: false,
          secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
          aliasPrefix,
          serviceUuid: browserBleServiceUuid,
          expectedCharacteristicUuids: browserBleCharacteristicUuids,
          characteristics: [],
          error: message,
        });
        toast(message, 'error');
      } finally {
        setBrowserBleProbing(false);
      }
    },
    [browserBleCharacteristicUuids, browserBleServiceUuid, disconnectBrowserBle],
  );

  const openPreview = useCallback((roomNumber?: string) => {
    const nextRoomNumber = String(roomNumber || selectedRoomNumber || '').trim();
    if (!nextRoomNumber) return;
    disconnectBrowserBle();
    setPreviewRoomNumber(nextRoomNumber);
    setMobileBlePreflight(null);
    setLegacyBleSearchResult(null);
    setLegacyBleDirectResult(null);
    setLegacyTemplateRecommendation('');
    setBrowserBleProbeResult(null);
  }, [disconnectBrowserBle, selectedRoomNumber]);

  const closePreview = useCallback(() => {
    disconnectBrowserBle();
    setPreviewRoomNumber('');
    setMobileBlePreflight(null);
    setLegacyBleSearchResult(null);
    setLegacyBleDirectResult(null);
    setLegacyTemplateRecommendation('');
    setBrowserBleProbeResult(null);
  }, [disconnectBrowserBle]);

  const runMobileBlePreflight = useCallback(async (draft: RoomBoardDraft) => {
    if (!draft.deviceId.trim()) {
      toast('기기 바코드를 먼저 등록해 주세요.', 'error');
      return;
    }

    if (!mobileUserName.trim() || !mobilePassword.trim()) {
      toast('제조사 모바일 계정과 비밀번호를 입력해 주세요.', 'error');
      return;
    }

    setMobileBleChecking(true);
    setMobileBlePreflight(null);

    try {
      const response = await fetch('/api/esl/zhsunyco', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'mobileBlePreflight',
          config: {
            baseUrl: ZHSUNYCO_MOBILE_BASE_URL,
            userName: mobileUserName.trim(),
            password: mobilePassword,
          },
          payload: {
            deviceId: draft.deviceId.trim(),
          },
        }),
      });

      const parsed = (await response.json().catch(() => null)) as MobileBlePreflightResult | null;
      if (!response.ok || !parsed?.ok) {
        const errorMessage = parsed?.error || '제조사 전송 상태를 확인하지 못했습니다.';
        throw new Error(errorMessage);
      }

      setMobileBlePreflight(parsed);

      if (legacyTemplateQueryResult?.ok && (legacyTemplateQueryResult.templates?.length ?? 0) > 0) {
        const recommendation = choosePreferredLegacyTemplate(
          legacyTemplateQueryResult.templates || [],
          parsed.boundDevice,
          legacyApiConfig.templateId,
        );
        const nextRecommendationMessage = formatLegacyTemplateRecommendation(recommendation);
        setLegacyTemplateRecommendation(nextRecommendationMessage);
        if (recommendation.template && String(recommendation.template.id) !== legacyApiConfig.templateId.trim()) {
          setLegacyApiConfig((prev) => ({ ...prev, templateId: String(recommendation.template?.id || '') }));
        }
      }

      if (parsed.taskReady) {
        toast('공식 앱 기준 BIND 완료 + TASK READY 상태입니다. 다음은 Start Task 로컬 BLE write입니다.', 'success');
      } else if (parsed.boundDevice?.eslCode) {
        toast('BIND는 확인됐지만 아직 TASK READY가 아닙니다.', 'error');
      } else {
        toast('제조사 앱 BLE EPD에서 먼저 BIND가 필요합니다.', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '제조사 전송 상태 확인에 실패했습니다.';
      setMobileBlePreflight({ ok: false, error: message });
      toast(message, 'error');
    } finally {
      setMobileBleChecking(false);
    }
  }, [legacyApiConfig.templateId, legacyTemplateQueryResult, mobilePassword, mobileUserName]);

  const runLegacyBleSearch = useCallback(async (draft: RoomBoardDraft) => {
    if (!draft.deviceId.trim()) {
      toast('기기 바코드를 먼저 등록해 주세요.', 'error');
      return;
    }

    if (!legacyApiConfig.baseUrl.trim() || !legacyApiConfig.shopCode.trim() || !legacyApiConfig.sign.trim()) {
      toast('공식 API 주소, 매장코드, sign 값을 입력해 주세요.', 'error');
      return;
    }

    setLegacyBleSearching(true);
    setLegacyBleSearchResult(null);

    try {
      const response = await fetch('/api/esl/zhsunyco', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'legacyBleSearch',
          config: {
            baseUrl: legacyApiConfig.baseUrl.trim(),
            shopCode: legacyApiConfig.shopCode.trim(),
            legacyApiCode: legacyApiConfig.apiCode.trim() || 'default',
            legacyApiSign: legacyApiConfig.sign.trim(),
          },
          payload: {
            deviceId: draft.deviceId.trim(),
          },
        }),
      });

      const parsed = (await response.json().catch(() => null)) as LegacyBleActionResult | null;
      if (!response.ok || !parsed?.ok) {
        throw new Error(parsed?.error || '공식 BLE 검색 요청에 실패했습니다.');
      }

      setLegacyBleSearchResult(parsed);
      toast('공식 API로 LED 점멸 요청을 보냈습니다.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '공식 BLE 검색 요청에 실패했습니다.';
      setLegacyBleSearchResult({ ok: false, error: message });
      toast(message, 'error');
    } finally {
      setLegacyBleSearching(false);
    }
  }, [legacyApiConfig]);

  const runLegacyTemplateQuery = useCallback(async () => {
    if (!legacyApiConfig.baseUrl.trim() || !legacyApiConfig.shopCode.trim() || !legacyApiConfig.sign.trim()) {
      toast('공식 API 주소, 매장코드, sign 값을 입력해 주세요.', 'error');
      return;
    }

    setLegacyTemplateLoading(true);
    setLegacyTemplateQueryResult(null);

    try {
      const response = await fetch('/api/esl/zhsunyco', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'legacyTemplateQuery',
          config: {
            baseUrl: legacyApiConfig.baseUrl.trim(),
            shopCode: legacyApiConfig.shopCode.trim(),
            legacyApiCode: legacyApiConfig.apiCode.trim() || 'default',
            legacyApiSign: legacyApiConfig.sign.trim(),
          },
        }),
      });

      const parsed = (await response.json().catch(() => null)) as LegacyTemplateQueryResult | null;
      if (!response.ok || !parsed?.ok) {
        throw new Error(parsed?.error || '공식 템플릿 조회에 실패했습니다.');
      }

      setLegacyTemplateQueryResult(parsed);

      const templates = Array.isArray(parsed.templates) ? parsed.templates : [];
      const recommendation = choosePreferredLegacyTemplate(templates, mobileBlePreflight?.boundDevice, legacyApiConfig.templateId);
      setLegacyTemplateRecommendation(formatLegacyTemplateRecommendation(recommendation));
      if (templates.length > 0) {
        const currentTemplateId = legacyApiConfig.templateId.trim();
        const preferredTemplate = recommendation.template;
        if (preferredTemplate && String(preferredTemplate.id) !== currentTemplateId) {
          setLegacyApiConfig((prev) => ({ ...prev, templateId: String(preferredTemplate.id) }));
        }
      } else {
        setLegacyTemplateRecommendation('');
      }

      toast(
        templates.length > 0
          ? `공식 템플릿 ${templates.length}개를 불러왔습니다.`
          : '공식 템플릿 목록은 비어 있습니다.',
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '공식 템플릿 조회에 실패했습니다.';
      setLegacyTemplateQueryResult({ ok: false, error: message });
      toast(message, 'error');
    } finally {
      setLegacyTemplateLoading(false);
    }
  }, [legacyApiConfig, mobileBlePreflight?.boundDevice]);

  const runLegacyBleDirect = useCallback(async (draft: RoomBoardDraft) => {
    if (!draft.deviceId.trim()) {
      toast('기기 바코드를 먼저 등록해 주세요.', 'error');
      return;
    }

    if (!legacyApiConfig.baseUrl.trim() || !legacyApiConfig.shopCode.trim() || !legacyApiConfig.sign.trim()) {
      toast('공식 API 주소, 매장코드, sign 값을 입력해 주세요.', 'error');
      return;
    }

    const templateId = Number(legacyApiConfig.templateId);
    if (!Number.isFinite(templateId) || templateId <= 0) {
      toast('직접 전송용 template ID를 숫자로 입력해 주세요.', 'error');
      return;
    }

    setLegacyBleDirectSending(true);
    setLegacyBleDirectResult(null);

    try {
      const response = await fetch('/api/esl/zhsunyco', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'legacyBleDirect',
          config: {
            baseUrl: legacyApiConfig.baseUrl.trim(),
            shopCode: legacyApiConfig.shopCode.trim(),
            legacyApiCode: legacyApiConfig.apiCode.trim() || 'default',
            legacyApiSign: legacyApiConfig.sign.trim(),
          },
          payload: {
            deviceId: draft.deviceId.trim(),
            templateId,
            product: buildLegacyDirectProduct(draft),
            led: [{ r: 0, g: 100, b: 0, timeOn: 100, time: 5 }],
          },
        }),
      });

      const parsed = (await response.json().catch(() => null)) as LegacyBleActionResult | null;
      if (!response.ok || !parsed?.ok) {
        throw new Error(parsed?.error || '공식 BLE 직접 전송 요청에 실패했습니다.');
      }

      setLegacyBleDirectResult(parsed);
      toast('공식 API가 전송 요청을 수락했습니다. 실제 ESL 반영 여부는 아래 전송 상태에서 다시 확인합니다.', 'success');

      if (mobileUserName.trim() && mobilePassword.trim()) {
        await sleep(1200);
        await runMobileBlePreflight(draft);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '공식 BLE 직접 전송 요청에 실패했습니다.';
      setLegacyBleDirectResult({ ok: false, error: message });
      toast(message, 'error');
    } finally {
      setLegacyBleDirectSending(false);
    }
  }, [legacyApiConfig, mobilePassword, mobileUserName, runMobileBlePreflight]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-5 py-4 shadow-sm">
        <h2 className="text-lg font-bold text-[var(--foreground)]">입원실 안내판 ESL 준비</h2>
      </section>

      <section className="space-y-4">
          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">병실 데이터 편집</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageDeviceRegistration ? (
                  <button
                    type="button"
                    onClick={registerSelectedRoomDevice}
                    disabled={!selectedDraft}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                  >
                    기기바코드 등록
                  </button>
                ) : null}
                {canManageDeviceRegistration && selectedDraft?.deviceId ? (
                  <button
                    type="button"
                    onClick={clearSelectedRoomDevice}
                    className="rounded-[var(--radius-md)] border border-red-200 bg-red-500/5 px-3 py-2 text-[12px] font-semibold text-red-600"
                  >
                    기기바코드 삭제
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openPreview()}
                  disabled={!selectedDraft}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                >
                  4분할 미리보기
                </button>
                <button
                  type="button"
                  onClick={resetSelectedRoomFromSource}
                  disabled={!selectedRoom}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                >
                  다시 채우기
                </button>
                <button
                  type="button"
                  onClick={markSelectedRoomPrepared}
                  disabled={!selectedDraft}
                  className="rounded-[var(--radius-md)] bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                >
                  전송 준비
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">병실 선택</span>
                <select
                  value={selectedRoomNumber}
                  onChange={(event) => setSelectedRoomNumber(event.target.value)}
                  disabled={loadingRooms || rooms.length === 0}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                >
                  {loadingRooms ? <option value="">병실 불러오는 중...</option> : null}
                  {!loadingRooms && rooms.length === 0 ? <option value="">등록된 병실 없음</option> : null}
                  {!loadingRooms &&
                    rooms.map((room) => (
                      <option key={room.roomNumber} value={room.roomNumber}>
                        {room.roomNumber}호 · {room.capacity}병상
                      </option>
                    ))}
                </select>
              </label>

              {selectedRoom ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/15 px-3 py-2 text-[12px] text-[var(--toss-gray-3)]">
                  <div className="font-semibold text-[var(--foreground)]">{selectedRoom.roomNumber}호</div>
                  <div className="mt-1">
                    환자 {selectedRoom.beds.filter((bed) => String(bed.patientName || '').trim()).length}/{selectedRoom.capacity}
                    명
                  </div>
                  <div className="mt-1 break-all">기기 바코드 {selectedDraft?.deviceId || '미등록'}</div>
                </div>
              ) : null}
            </div>

            {!selectedDraft ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--toss-gray-3)]">
                {loadingRooms ? '병실 데이터를 불러오는 중입니다.' : '편집할 병실을 선택해 주세요.'}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  {selectedDraft.patientSlots.map((slot, index) => (
                    <div
                      key={`${selectedDraft.roomNumber}-${slot.bedNumber}`}
                      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4"
                    >
                      <div className="text-sm font-bold text-[var(--foreground)]">{slot.bedNumber}번 환자</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <input
                          value={slot.patientName}
                          onChange={(event) => updateSelectedPatientSlot(index, { patientName: event.target.value })}
                          placeholder="환자명"
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                        <input
                          value={slot.age}
                          onChange={(event) => updateSelectedPatientSlot(index, { age: event.target.value })}
                          placeholder="나이"
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                        <select
                          value={slot.gender}
                          onChange={(event) => updateSelectedPatientSlot(index, { gender: event.target.value })}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        >
                          <option value="">성별</option>
                          <option value="남">남</option>
                          <option value="여">여</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyText(buildRoomSummaryText(selectedDraft), `${selectedDraft.roomNumber}호 전송 메모를 복사했습니다.`)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)]"
                  >
                    전송 메모 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(buildRoomJson(selectedDraft), `${selectedDraft.roomNumber}호 JSON을 복사했습니다.`)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)]"
                  >
                    JSON 복사
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[var(--foreground)]">전송 준비 목록</h3>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                {preparedRooms.length}건
              </span>
            </div>

            {preparedRooms.length === 0 ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
                아직 전송 준비한 병실이 없습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {preparedRooms.map((draft) => (
                  <div key={draft.roomNumber} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[var(--foreground)]">{draft.roomNumber}호</div>
                        <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          기기 {draft.deviceId || '-'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRoomNumber(draft.roomNumber)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          편집
                        </button>
                        <button
                          type="button"
                          onClick={() => openPreview(draft.roomNumber)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          미리보기
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyText(buildRoomSummaryText(draft), `${draft.roomNumber}호 전송 메모를 복사했습니다.`)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          메모 복사
                        </button>
                        <button
                          type="button"
                          onClick={() => clearPreparedState(draft.roomNumber)}
                          className="rounded-[var(--radius-md)] bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-600"
                        >
                          대기 해제
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {draft.patientSlots.map((slot) => (
                        <div
                          key={`${draft.roomNumber}-${slot.bedNumber}`}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                        >
                          <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">{slot.bedNumber}번 환자</div>
                          <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                            {slot.patientName || '미기입'}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                            {[slot.age ? `${slot.age}세` : '', slot.gender].filter(Boolean).join(' / ') || '나이 · 성별 미입력'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
      </section>

      {previewDraft ? (
        <div
          className="fixed inset-0 z-[190] overflow-y-auto bg-black/45 p-3 sm:p-4"
          onClick={closePreview}
        >
          <div
            className="mx-auto my-3 w-full max-w-[min(96rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-[var(--radius-xl)] bg-[var(--card)] p-4 shadow-xl sm:my-4 sm:p-5 xl:overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-[var(--foreground)]">{previewDraft.roomNumber}호 7.5인치 최종 미리보기</div>
                <div className="mt-1 text-sm text-[var(--toss-gray-3)]">4인실 기준 4분할 화면과 제조사 BLE 작업 상태를 함께 확인합니다.</div>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid items-start gap-4 xl:max-h-[calc(100dvh-10rem)] xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
              <div className="min-w-0 space-y-3 xl:sticky xl:top-0">
                <div className="overflow-x-auto pb-1">
                  <div className="min-w-[520px]">
                    <RoomBoardPreview draft={previewDraft} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[12px] text-[var(--toss-gray-3)]">
                  <div className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1">기기 바코드 {previewDraft.deviceId || '미등록'}</div>
                  <div className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1">
                    {previewDraft.updatedAt ? `전송 준비 ${new Date(previewDraft.updatedAt).toLocaleString('ko-KR')}` : '전송 준비 전'}
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/20 p-4 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:pr-2">
                <div className="text-base font-bold text-[var(--foreground)]">제조사 BLE 전송 상태</div>
                <div className="mt-2 text-sm text-[var(--toss-gray-3)]">
                  현재 제조사 앱은 클라우드 태스크를 받아 BLE로 쓰는 구조라서, 먼저 서버가 이 기기의 전송 작업을 만들 수 있는지 확인합니다.
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">제조사 계정</span>
                    <input
                      value={mobileUserName}
                      onChange={(event) => setMobileUserName(event.target.value)}
                      placeholder="WoPda / Zhsunyco 로그인 계정"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">제조사 비밀번호</span>
                    <input
                      type="password"
                      value={mobilePassword}
                      onChange={(event) => setMobilePassword(event.target.value)}
                      placeholder="계정 비밀번호"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void runMobileBlePreflight(previewDraft)}
                    disabled={mobileBleChecking}
                    className="rounded-[var(--radius-md)] bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {mobileBleChecking ? '전송 상태 확인 중...' : '전송 상태 확인'}
                  </button>
                </div>

                <div className="mt-6 border-t border-[var(--border)] pt-4">
                  <div className="text-base font-bold text-[var(--foreground)]">공식 ESL API 테스트</div>
                  <div className="mt-2 text-sm text-[var(--toss-gray-3)]">
                    문서의 <code>esl_ble/search</code>, <code>esl_ble/direct</code>를 바로 호출합니다. 직접 전송은 템플릿이
                    <code>pc</code>, <code>pn</code>, <code>pp</code>, <code>e001~e008</code> 필드를 읽도록 맞춰져 있어야 합니다.
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="space-y-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">공식 API 주소</span>
                      <input
                        value={legacyApiConfig.baseUrl}
                        onChange={(event) => updateLegacyApiField('baseUrl', event.target.value)}
                        placeholder="http://127.0.0.1"
                        className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                      />
                    </label>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">API 코드</span>
                        <input
                          value={legacyApiConfig.apiCode}
                          onChange={(event) => updateLegacyApiField('apiCode', event.target.value)}
                          placeholder="default"
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">매장코드</span>
                        <input
                          value={legacyApiConfig.shopCode}
                          onChange={(event) => updateLegacyApiField('shopCode', event.target.value)}
                          placeholder="001"
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">sign</span>
                        <input
                          value={legacyApiConfig.sign}
                          onChange={(event) => updateLegacyApiField('sign', event.target.value)}
                          placeholder="80805d794841f1b4"
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">template ID</span>
                        <input
                          value={legacyApiConfig.templateId}
                          onChange={(event) => updateLegacyApiField('templateId', event.target.value)}
                          placeholder="11"
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => void runLegacyTemplateQuery()}
                      disabled={legacyTemplateLoading}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] disabled:opacity-60"
                    >
                      {legacyTemplateLoading ? '템플릿 조회 중...' : '템플릿 목록 조회'}
                    </button>

                    {legacyTemplateRecommendation ? (
                      <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                        {legacyTemplateRecommendation}
                      </div>
                    ) : null}

                    {legacyTemplateQueryResult ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[12px] font-bold text-[var(--foreground)]">공식 템플릿 목록</div>
                          <div
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              legacyTemplateQueryResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {legacyTemplateQueryResult.ok
                              ? `${legacyTemplateQueryResult.templates?.length ?? 0}개`
                              : legacyTemplateQueryResult.error || 'ERROR'}
                          </div>
                        </div>

                        {legacyTemplateQueryResult.ok && (legacyTemplateQueryResult.templates?.length ?? 0) > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(legacyTemplateQueryResult.templates || []).map((template) => {
                              const selected = String(template.id) === legacyApiConfig.templateId.trim();
                              return (
                                <button
                                  key={`${template.id}-${template.typeCode || ''}`}
                                  type="button"
                                  onClick={() => updateLegacyApiField('templateId', String(template.id))}
                                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                    selected
                                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                      : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'
                                  }`}
                                >
                                  {`#${template.id} ${template.name}${
                                    template.typeCode ? ` · ${template.typeCode}` : ''
                                  }${template.isDefault ? ' · 기본' : ''}`}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        {legacyTemplateQueryResult.ok && (legacyTemplateQueryResult.templates?.length ?? 0) === 0 ? (
                          <div className="mt-3 text-[12px] text-[var(--toss-gray-3)]">이 매장에서 조회된 공식 템플릿이 없습니다.</div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-2 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void runLegacyBleSearch(previewDraft)}
                        disabled={legacyBleSearching}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] disabled:opacity-60"
                      >
                        {legacyBleSearching ? 'LED 점멸 요청 중...' : 'LED 점멸 확인'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runLegacyBleDirect(previewDraft)}
                        disabled={legacyBleDirectSending}
                        className="rounded-[var(--radius-md)] bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {legacyBleDirectSending ? '직접 전송 요청 중...' : '직접 전송 테스트'}
                      </button>
                    </div>
                  </div>
                </div>

                {mobileBlePreflight ? (
                  <div className="mt-4 space-y-3">
                    <div
                      className={`rounded-[var(--radius-lg)] border px-3 py-3 text-sm ${
                        mobileBlePreflight.taskReady
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : mobileBlePreflight.boundDevice?.eslCode
                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                            : 'border-rose-200 bg-rose-50 text-rose-800'
                      }`}
                    >
                      {mobileBlePreflight.taskReady
                        ? '제조사 서버가 BLE 작업을 반환했습니다. 다만 실제 브라우저 write 프로토콜은 아직 별도 확인이 필요합니다.'
                        : mobileBlePreflight.statusSummary ||
                          mobileBlePreflight.error ||
                          '제조사 서버 상태를 더 확인해 주세요.'}
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-2">
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">라이선스</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {extractDiagnosticMessage(mobileBlePreflight.license)}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">트리거</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {extractDiagnosticMessage(mobileBlePreflight.trigger)}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">기기 등록 상태</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {mobileBlePreflight.boundDevice?.eslCode ? '제조사 서버 등록됨' : '제조사 서버 미확인'}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">대기 작업</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {mobileBlePreflight.taskReady
                            ? 'BLE 작업 준비됨'
                            : mobileBlePreflight.boundDevice?.eslCode
                              ? `대기 ${mobileBlePreflight.waitingCount ?? 0}건`
                              : '작업 없음'}
                        </div>
                      </div>
                    </div>

                    {officialBleWorkflowSummary ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[12px] font-bold text-[var(--foreground)]">공식 앱 기준 단계</div>
                        <div className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                          공식 앱은 <code>BLE EPD BIND</code> 후 <code>TASK &gt; Start Task</code>를 눌러야 실제 BLE write가 시작됩니다.
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {officialBleWorkflowSummary.stages.map((stage) => (
                            <div key={stage.key} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[11px] font-bold text-[var(--foreground)]">{stage.title}</div>
                                <div
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    stage.tone === 'emerald'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : stage.tone === 'amber'
                                        ? 'bg-amber-100 text-amber-800'
                                        : stage.tone === 'rose'
                                          ? 'bg-rose-100 text-rose-700'
                                          : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {stage.badge}
                                </div>
                              </div>
                              <div className="mt-2 text-[12px] font-semibold text-[var(--foreground)]">{stage.summary}</div>
                              {stage.detail ? (
                                <div className="mt-2 text-[11px] text-[var(--toss-gray-3)]">{stage.detail}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 rounded-[var(--radius-md)] border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900">
                          앱 로그 기준 Start Task는 <code>{OFFICIAL_BLE_HANDSHAKE_CHARACTERISTIC_UUID}</code>에 16B 1회,
                          <code className="ml-1">{OFFICIAL_BLE_STREAM_CHARACTERISTIC_UUID}</code>에 244B 반복 write를 수행합니다.
                          {officialBleWorkflowSummary.browserWriteReady
                            ? ' 브라우저 probe에서는 공식 characteristic write 접근 가능성이 확인됐습니다.'
                            : ' 현재는 이 마지막 로컬 write 단계가 아직 구현/검증되지 않았습니다.'}
                        </div>
                      </div>
                    ) : null}

                    {mobileBlePreflight.boundDevice ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">제조사 서버에 저장된 기기 정보</div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">ESL 코드</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.eslCode || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">상품 코드</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.productCode || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">템플릿 ID</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.templateId ?? '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">기기 종류</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.typeCode || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">바인딩 출처</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.actionFrom || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">펌웨어 / PID</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {[mobileBlePreflight.boundDevice.eslVersion, mobileBlePreflight.boundDevice.pid].filter(Boolean).join(' / ') || '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {mobileBlePreflight.taskAttempts?.length ? (
                      <div className="space-y-2">
                        {mobileBlePreflight.taskAttempts.map((attempt) => (
                          <div key={`${attempt.label}-${attempt.query}`} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[12px] font-bold text-[var(--foreground)]">{attempt.label}</div>
                              <div
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  attempt.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {attempt.ok ? 'TASK READY' : extractDiagnosticMessage(attempt.upstream)}
                              </div>
                            </div>
                            {attempt.query ? (
                              <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{attempt.query}</div>
                            ) : null}
                            <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                              {stringifyDiagnosticValue(attempt.upstream)}
                            </pre>
                          </div>
                        ))}
                        </div>
                      ) : null}

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">BLE 조회 응답</div>
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(mobileBlePreflight.bleQuery)}
                        </pre>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">기기 상세 응답</div>
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(mobileBlePreflight.deviceLookup)}
                        </pre>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">대기 작업 목록 응답</div>
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(mobileBlePreflight.taskList)}
                        </pre>
                      </div>
                    </div>

                    {mobileBlePreflight.browserBle ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">APK에서 확인한 BLE 식별자</div>
                        <div className="mt-2 text-[11px] text-[var(--foreground)]">
                          서비스 {mobileBlePreflight.browserBle.primaryServiceUuid || '-'}
                        </div>
                        <div className="mt-1 break-all text-[11px] text-[var(--toss-gray-3)]">
                          {(mobileBlePreflight.browserBle.characteristicUuids || []).join(', ') || '-'}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">브라우저 BLE 연결 확인</div>
                        <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {typeof window !== 'undefined' && window.isSecureContext ? 'SECURE' : 'INSECURE'}
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                        앱처럼 실제 ESL 기기에 브라우저가 같은 서비스로 접근 가능한지 확인합니다. 아직 write는 하지 않고 service / characteristic만 읽습니다.
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void runBrowserBleProbe(previewDraft)}
                          disabled={browserBleProbing}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                        >
                          {browserBleProbing ? '브라우저 BLE 연결 중...' : '브라우저 BLE 연결 확인'}
                        </button>
                        <button
                          type="button"
                          onClick={disconnectBrowserBle}
                          disabled={!browserBleProbeResult && !browserBleDeviceRef.current}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                        >
                          연결 해제
                        </button>
                      </div>
                      <div className="mt-3 text-[11px] text-[var(--toss-gray-3)]">
                        예상 alias <span className="font-semibold text-[var(--foreground)]">{`WL${previewDraft.deviceId.trim()}`}</span> / 서비스{' '}
                        <span className="break-all font-mono text-[10px] text-[var(--foreground)]">{browserBleServiceUuid}</span>
                      </div>
                      {browserBleProbeResult ? (
                        <div className="mt-3 space-y-2">
                          <div
                            className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold ${
                              browserBleProbeResult.ok
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-rose-200 bg-rose-50 text-rose-800'
                            }`}
                          >
                            {browserBleProbeResult.ok
                              ? `${browserBleProbeResult.deviceName || browserBleProbeResult.aliasPrefix} 연결 성공 · 특성 ${browserBleProbeResult.characteristics.length}개`
                              : browserBleProbeResult.error || '브라우저 BLE 확인 실패'}
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[11px]">
                            <div className="font-semibold text-[var(--foreground)]">예상 characteristic</div>
                            <div className="mt-1 break-all text-[var(--toss-gray-3)]">
                              {browserBleProbeResult.expectedCharacteristicUuids.join(', ') || '-'}
                            </div>
                          </div>
                          {browserBleProbeResult.characteristics.length ? (
                            <div className="space-y-2">
                              {browserBleProbeResult.characteristics.map((characteristic) => (
                                <div key={characteristic.uuid} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="break-all font-mono text-[10px] font-semibold text-[var(--foreground)]">{characteristic.uuid}</div>
                                    <div
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        characteristic.expected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {characteristic.expected ? 'EXPECTED' : 'DISCOVERED'}
                                    </div>
                                  </div>
                                  <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                    {characteristic.properties.join(', ') || '특성 정보 없음'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                      <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">모바일 task payload 후보</div>
                      <div className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                        버그리포트 기준 앱은 GATT write를 직접 수행합니다. <code>/mobile/getTask/ble</code> 응답 안에 hex / base64 / byte-array 바이트가
                        들어있는지 자동으로 추려서 보여줍니다.
                      </div>
                      {mobileBleTopPayloadCandidates.length ? (
                        <div className="mt-3 space-y-2">
                          {mobileBleTopPayloadCandidates.map((candidate) => (
                            <div key={`${candidate.path}-${candidate.kind}-${candidate.previewHex}`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[11px] font-semibold text-[var(--foreground)]">{candidate.path}</div>
                                <div className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                  {candidate.kind} · {candidate.byteLength}B
                                </div>
                              </div>
                              <div className="mt-1 font-mono text-[10px] text-[var(--foreground)]">{candidate.previewHex}</div>
                              <div className="mt-1 break-all text-[11px] text-[var(--toss-gray-3)]">{candidate.previewValue}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-3 text-[11px] text-[var(--toss-gray-3)]">
                          현재 /mobile task 응답에서 바로 write할 raw bytes는 못 찾았습니다. 이 경우 앱이 받은 메타데이터를 내부 프로토콜로 다시 조립할 가능성이 큽니다.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {legacyBleSearchResult || legacyBleDirectResult ? (
                  <div className="mt-4 space-y-3">
                    {legacyBleSearchResult ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[12px] font-bold text-[var(--foreground)]">LED 점멸 응답</div>
                          <div
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              legacyBleSearchResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {legacyBleSearchResult.ok ? 'OK' : legacyBleSearchResult.error || 'ERROR'}
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                          {(legacyBleSearchResult.normalizedBaseUrl || '-') +
                            ' / ' +
                            (legacyBleSearchResult.storeCode || '-') +
                            ' / ' +
                            (legacyBleSearchResult.apiCode || 'default')}
                        </div>
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(legacyBleSearchResult.upstream || legacyBleSearchResult.error)}
                        </pre>
                      </div>
                    ) : null}

                    {legacyBleDirectResult ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[12px] font-bold text-[var(--foreground)]">직접 전송 응답</div>
                          <div
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              legacyBleDirectResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {legacyBleDirectResult.ok ? 'OK' : legacyBleDirectResult.error || 'ERROR'}
                          </div>
                        </div>
                        {legacyBleDirectResult.ok ? (
                          <div className="mt-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                            서버가 전송 요청을 수락했습니다. 실제 ESL 화면 반영은 위 `전송 상태 확인` 결과나 기기 반응으로 한 번 더 확인해야 합니다.
                          </div>
                        ) : null}
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(legacyBleDirectResult.upstream || legacyBleDirectResult.error)}
                        </pre>
                        <div className="mt-3 text-[11px] font-bold text-[var(--toss-gray-3)]">전송 payload</div>
                        <pre className="mt-2 max-h-40 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(legacyBleDirectResult.requestBody)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deviceRegistrationOpen && selectedDraft ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
          onClick={closeDeviceRegistration}
        >
          <div
            className="w-full max-w-md rounded-[var(--radius-xl)] bg-[var(--card)] p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-base font-bold text-[var(--foreground)]">{selectedDraft.roomNumber}호 기기바코드 등록</div>
            <div className="mt-2 text-sm text-[var(--toss-gray-3)]">카메라 스캔 또는 외부 스캐너 입력을 사용할 수 있습니다.</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startCameraBarcodeScan()}
                disabled={cameraScanBusy}
                className="rounded-[var(--radius-md)] bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {cameraScanBusy ? '카메라 여는 중...' : cameraScanOpen ? '카메라 다시 시작' : '카메라로 스캔'}
              </button>
              {cameraScanOpen ? (
                <button
                  type="button"
                  onClick={stopCameraBarcodeScan}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
                >
                  카메라 닫기
                </button>
              ) : null}
            </div>

            <div
              className={`mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-black ${
                cameraScanOpen ? 'block' : 'hidden'
              }`}
            >
              <video
                ref={deviceRegistrationVideoRef}
                autoPlay
                playsInline
                muted
                className="aspect-[4/3] w-full object-cover"
              />
            </div>

            <div className="mt-2 text-[12px] text-[var(--toss-gray-3)]">{cameraScanStatus}</div>
            <input
              ref={deviceRegistrationInputRef}
              value={deviceRegistrationValue}
              onChange={(event) => setDeviceRegistrationValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitSelectedRoomDeviceRegistration();
                }
              }}
              placeholder="바코드 스캔 대기 중"
              className="mt-4 w-full rounded-[var(--radius-lg)] border-2 border-teal-700/80 px-4 py-3 text-base outline-none transition focus:border-teal-700"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeviceRegistration}
                className="rounded-[var(--radius-md)] bg-cyan-100 px-4 py-2 text-sm font-semibold text-teal-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitSelectedRoomDeviceRegistration}
                className="rounded-[var(--radius-md)] bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

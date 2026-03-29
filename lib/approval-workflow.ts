type JsonRecord = Record<string, unknown>;

export type ApprovalDelayConfig = {
  thresholdHours: number;
  repeatHours: number;
  maxNotifications: number;
};

export type ApprovalDocNumberDateMode = 'full' | 'month' | 'year';

export type ApprovalDocNumberConfig = {
  prefix?: string | null;
  includeDepartment?: boolean;
  dateMode?: ApprovalDocNumberDateMode;
  sequencePadding?: number;
};

export type ApprovalHistoryAction =
  | 'created'
  | 'recalled'
  | 'resubmitted'
  | 'approved_step'
  | 'approved_final'
  | 'rejected'
  | 'delegated'
  | 'delay_notified'
  | 'locked';

export type ApprovalHistoryEntry = {
  at: string;
  action: ApprovalHistoryAction;
  actor_id?: string | null;
  actor_name?: string | null;
  note?: string | null;
  revision?: number | null;
  current_approver_id?: string | null;
};

const APPROVAL_TYPE_CODES: Record<string, string> = {
  leave: 'LEV',
  annual_plan: 'ALP',
  overtime: 'OVT',
  purchase: 'PUR',
  repair_request: 'REP',
  draft_business: 'DRF',
  cooperation: 'COP',
  generic: 'GEN',
  attendance_fix: 'ATD',
  personnel_order: 'ORD',
  '연차/휴가': 'LEV',
  연차사용계획서: 'ALP',
  연장근무: 'OVT',
  물품신청: 'PUR',
  수리요청서: 'REP',
  수리요청: 'REP',
  업무기안: 'DRF',
  업무협조: 'COP',
  양식신청: 'GEN',
  출결정정: 'ATD',
  인사명령: 'ORD',
};

function asMetaData(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? ({ ...(value as JsonRecord) }) : {};
}

function asNullableString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function normalizeDateStamp(value?: string | Date | null) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, '')
    : date.toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizeDateStampByMode(value: string | Date | null | undefined, mode: ApprovalDocNumberDateMode) {
  const fullStamp = normalizeDateStamp(value);
  if (mode === 'year') return fullStamp.slice(0, 4);
  if (mode === 'month') return fullStamp.slice(0, 6);
  return fullStamp;
}

function normalizeCompanyCode(companyName?: string | null, companyId?: string | null) {
  const ascii = String(companyName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  if (ascii) return ascii;

  const companyToken = String(companyId || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  if (companyToken) return companyToken;
  return 'APRV';
}

function normalizeDepartmentCode(value?: string | null) {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 4);
  return normalized || '';
}

export function resolveApprovalTypeCode(formSlug?: string | null, typeName?: string | null) {
  const slugKey = String(formSlug || '').trim();
  if (slugKey && APPROVAL_TYPE_CODES[slugKey]) return APPROVAL_TYPE_CODES[slugKey];

  const typeKey = String(typeName || '').trim();
  if (typeKey && APPROVAL_TYPE_CODES[typeKey]) return APPROVAL_TYPE_CODES[typeKey];

  const fallback = typeKey
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
  return fallback || 'GEN';
}

export function buildApprovalDocNumber(params: {
  companyName?: string | null;
  companyId?: string | null;
  departmentName?: string | null;
  formSlug?: string | null;
  typeName?: string | null;
  createdAt?: string | Date | null;
  sequence?: number;
  config?: ApprovalDocNumberConfig | null;
}) {
  const config = params.config || {};
  const prefix = String(config.prefix || '').trim() || normalizeCompanyCode(params.companyName, params.companyId);
  const dateMode = parseApprovalDocNumberDateMode(config.dateMode, 'full');
  const typeCode = resolveApprovalTypeCode(params.formSlug, params.typeName);
  const dateStamp = normalizeDateStampByMode(params.createdAt, dateMode);
  const departmentCode =
    config.includeDepartment && params.departmentName
      ? normalizeDepartmentCode(params.departmentName)
      : '';
  const sequence = Math.max(1, Number(params.sequence) || 1);
  const sequencePadding = parseApprovalDocNumberSequencePadding(config.sequencePadding, 3);
  const segments = [prefix];
  if (departmentCode) segments.push(departmentCode);
  segments.push(typeCode, dateStamp, String(sequence).padStart(sequencePadding, '0'));
  return segments.join('-');
}

export function getApprovalEditHistory(metaData: unknown): ApprovalHistoryEntry[] {
  const meta = asMetaData(metaData);
  const raw = meta.edit_history;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (entry && typeof entry === 'object' ? (entry as ApprovalHistoryEntry) : null))
    .filter(Boolean) as ApprovalHistoryEntry[];
}

export function getApprovalRevision(metaData: unknown) {
  const meta = asMetaData(metaData);
  const revision = Number(meta.revision);
  return Number.isFinite(revision) && revision > 0 ? revision : 1;
}

export function appendApprovalHistory(
  metaData: unknown,
  entry: Omit<ApprovalHistoryEntry, 'at'> & { at?: string | null }
) {
  const meta = asMetaData(metaData);
  const nextEntry: ApprovalHistoryEntry = {
    at: entry.at || new Date().toISOString(),
    action: entry.action,
    actor_id: entry.actor_id ?? null,
    actor_name: entry.actor_name ?? null,
    note: entry.note ?? null,
    revision: entry.revision ?? null,
    current_approver_id: entry.current_approver_id ?? null,
  };

  return {
    ...meta,
    edit_history: [...getApprovalEditHistory(meta), nextEntry],
  };
}

export function buildRevisionDocNumber(existingDocNumber: unknown, revision: number) {
  const base = String(existingDocNumber || '').replace(/-R\d+$/i, '').trim();
  if (!base) return '';
  return revision > 1 ? `${base}-R${revision}` : base;
}

export function lockApprovalMeta(metaData: unknown, actorId?: string | null) {
  const meta = asMetaData(metaData);
  return {
    ...meta,
    edit_locked_at: meta.edit_locked_at || new Date().toISOString(),
    edit_locked_by: actorId ?? meta.edit_locked_by ?? null,
  };
}

export function isApprovalLocked(metaData: unknown) {
  const meta = asMetaData(metaData);
  return Boolean(meta.edit_locked_at);
}

export function isApprovalOverdue(item: Record<string, unknown>, thresholdHours = 24) {
  const status = String(item.status || '').trim();
  if (status !== '대기') return false;
  const createdAt = String(item.created_at || '').trim();
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return Date.now() - created.getTime() >= thresholdHours * 60 * 60 * 1000;
}

export function parseApprovalDelayHours(value: unknown, fallback = 24) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(168, Math.max(1, Math.round(numeric)));
}

export function parseApprovalDelayRepeatHours(value: unknown, fallback = 24) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(168, Math.max(1, Math.round(numeric)));
}

export function parseApprovalDelayMaxNotifications(value: unknown, fallback = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

export function parseApprovalDocNumberDateMode(
  value: unknown,
  fallback: ApprovalDocNumberDateMode = 'full'
): ApprovalDocNumberDateMode {
  if (value === 'year' || value === 'month' || value === 'full') return value;
  return fallback;
}

export function parseApprovalDocNumberSequencePadding(value: unknown, fallback = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(6, Math.max(2, Math.round(numeric)));
}

export function resolveApprovalDelayConfig(staff: Record<string, unknown> | null | undefined): ApprovalDelayConfig {
  const permissions =
    staff?.permissions && typeof staff.permissions === 'object'
      ? (staff.permissions as JsonRecord)
      : null;

  return {
    thresholdHours: parseApprovalDelayHours(permissions?.approval_delay_hours, 24),
    repeatHours: parseApprovalDelayRepeatHours(permissions?.approval_delay_repeat_hours, 24),
    maxNotifications: parseApprovalDelayMaxNotifications(permissions?.approval_delay_max_notifications, 3),
  };
}

export function resolveApprovalDocNumberConfig(
  source: Record<string, unknown> | null | undefined
): ApprovalDocNumberConfig {
  const permissions =
    source?.permissions && typeof source.permissions === 'object'
      ? (source.permissions as JsonRecord)
      : null;

  return {
    prefix: asNullableString(permissions?.approval_doc_number_prefix),
    includeDepartment: Boolean(permissions?.approval_doc_number_include_department),
    dateMode: parseApprovalDocNumberDateMode(permissions?.approval_doc_number_date_mode, 'full'),
    sequencePadding: parseApprovalDocNumberSequencePadding(permissions?.approval_doc_number_sequence_padding, 3),
  };
}

export function resolveApprovalDelegateConfig(staff: Record<string, unknown> | null | undefined, at = new Date()) {
  const permissions =
    staff?.permissions && typeof staff.permissions === 'object'
      ? (staff.permissions as JsonRecord)
      : null;
  const delegateId = asNullableString(permissions?.approval_delegate_id);
  const start = asNullableString(permissions?.approval_delegate_start);
  const end = asNullableString(permissions?.approval_delegate_end);
  const startsAt = start ? new Date(start) : null;
  const endsAt = end ? new Date(end) : null;
  const hasValidStart = Boolean(startsAt && !Number.isNaN(startsAt.getTime()));
  const hasValidEnd = Boolean(endsAt && !Number.isNaN(endsAt.getTime()));

  return {
    delegateId,
    start,
    end,
    active:
      Boolean(delegateId) &&
      (!hasValidStart || at.getTime() >= (startsAt as Date).getTime()) &&
      (!hasValidEnd || at.getTime() <= (endsAt as Date).getTime()),
  };
}

export function shouldSendDelayNotification(
  metaData: unknown,
  currentApproverId: string,
  thresholdHours = 24,
  repeatHours = 24,
  maxNotifications = 3
) {
  const meta = asMetaData(metaData);
  const tracker = meta.delay_notification as JsonRecord | undefined;
  if (!tracker || typeof tracker !== 'object') return true;

  const storedApproverId = String(tracker.current_approver_id || '');
  const lastNotifiedAt = String(tracker.last_notified_at || '');
  const notificationCount = Math.max(0, Number(tracker.count) || 0);
  if (storedApproverId !== String(currentApproverId)) return true;
  if (notificationCount >= parseApprovalDelayMaxNotifications(maxNotifications)) return false;
  if (!lastNotifiedAt) return true;

  const notifiedAt = new Date(lastNotifiedAt);
  if (Number.isNaN(notifiedAt.getTime())) return true;
  return Date.now() - notifiedAt.getTime() >= parseApprovalDelayRepeatHours(repeatHours) * 60 * 60 * 1000;
}

export function markDelayNotification(
  metaData: unknown,
  currentApproverId: string,
  thresholdHours = 24,
  repeatHours = 24,
  maxNotifications = 3
) {
  const meta = asMetaData(metaData);
  const tracker = meta.delay_notification as JsonRecord | undefined;
  const count = Math.max(0, Number(tracker?.count) || 0) + 1;
  return {
    ...meta,
    delay_notification: {
      current_approver_id: currentApproverId,
      last_notified_at: new Date().toISOString(),
      count,
      threshold_hours: parseApprovalDelayHours(thresholdHours),
      repeat_hours: parseApprovalDelayRepeatHours(repeatHours),
      max_notifications: parseApprovalDelayMaxNotifications(maxNotifications),
    },
  };
}

export function formatApprovalHistoryActionLabel(action: ApprovalHistoryAction) {
  switch (action) {
    case 'created':
      return '초안 생성';
    case 'recalled':
      return '회수';
    case 'resubmitted':
      return '수정 후 재상신';
    case 'approved_step':
      return '결재 승인';
    case 'approved_final':
      return '최종 승인';
    case 'rejected':
      return '반려';
    case 'delegated':
      return '대결 전환';
    case 'delay_notified':
      return '지연 알림';
    case 'locked':
      return '수정 잠금';
    default:
      return action;
  }
}

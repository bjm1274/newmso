export const LEAVE_NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
export const LEAVE_NOTICE_TIMEZONE = 'Asia/Seoul';

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type LeaveRequestMetaSummary = {
  startDate: string;
  endDate: string;
  leaveType: string;
  normalizedLeaveType: string;
  reason: string;
  delegateId: string;
  delegateName: string;
  delegateDepartment: string;
  delegatePosition: string;
  delegateLabel: string;
};

function readMetaString(
  metaData: Record<string, unknown> | null | undefined,
  ...keys: string[]
) {
  if (!metaData) return '';
  for (const key of keys) {
    const value = metaData[key];
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function parseDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
}

function buildUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function normalizeLeaveTypeLabel(value: unknown) {
  const raw = String(value ?? '').trim();
  const normalized = raw.toLowerCase();

  if (normalized.includes('반차') || normalized.includes('0.5') || normalized.includes('half')) {
    return '반차';
  }
  if (normalized.includes('병가') || normalized.includes('sick')) {
    return '병가';
  }
  if (normalized.includes('경조')) {
    return '경조';
  }
  if (normalized.includes('특별')) {
    return '특별휴가';
  }

  return raw.replace(/\s*\([^)]*\)\s*/g, '').trim() || '연차';
}

export function extractLeaveRequestMeta(metaData: Record<string, unknown> | null | undefined): LeaveRequestMetaSummary | null {
  const startDate = readMetaString(metaData, 'startDate', 'start', 'start_date');
  if (!startDate) return null;

  const endDate = readMetaString(metaData, 'endDate', 'end', 'end_date') || startDate;
  const leaveType = readMetaString(metaData, 'leaveType', 'vType', 'leave_type') || '연차';
  const delegateId = readMetaString(metaData, 'delegateId', 'delegate_id');
  const delegateName = readMetaString(metaData, 'delegateName', 'delegate_name');
  const delegateDepartment = readMetaString(metaData, 'delegateDepartment', 'delegate_department');
  const delegatePosition = readMetaString(metaData, 'delegatePosition', 'delegate_position');
  const delegateLabel = delegateName
    ? [delegateName, delegateDepartment ? `(${delegateDepartment})` : null, delegatePosition || null]
        .filter(Boolean)
        .join(' ')
    : '';

  return {
    startDate,
    endDate,
    leaveType,
    normalizedLeaveType: normalizeLeaveTypeLabel(leaveType),
    reason: readMetaString(metaData, 'reason'),
    delegateId,
    delegateName,
    delegateDepartment,
    delegatePosition,
    delegateLabel,
  };
}

export function formatLeaveNoticeDate(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return String(dateKey || '').trim();

  const weekday = KOREAN_WEEKDAYS[buildUtcDate(parsed.year, parsed.month, parsed.day).getUTCDay()];
  return `${parsed.year}.${parsed.month}.${parsed.day}(${weekday})`;
}

export function formatLeaveNoticeDateRange(startDate: string, endDate?: string | null) {
  const resolvedEndDate = String(endDate || startDate).trim() || startDate;
  if (!startDate) return '';
  if (startDate === resolvedEndDate) {
    return formatLeaveNoticeDate(startDate);
  }
  return `${formatLeaveNoticeDate(startDate)} ~ ${formatLeaveNoticeDate(resolvedEndDate)}`;
}

export function formatLeaveNoticeMessage({
  leaveType,
  employeeName,
  department,
  startDate,
  endDate,
  delegateName,
}: {
  leaveType: string;
  employeeName: string;
  department: string;
  startDate: string;
  endDate?: string | null;
  delegateName?: string | null;
}) {
  return [
    `[ ${normalizeLeaveTypeLabel(leaveType)} ]`,
    `- 성명 : ${String(employeeName || '').trim() || '-'}`,
    `- 소속 : ${String(department || '').trim() || '-'}`,
    `- 일시 : ${formatLeaveNoticeDateRange(startDate, endDate)}`,
    `- 업무대행 : ${String(delegateName || '').trim()}`,
    '',
    '업무에 참고 바랍니다.',
  ].join('\n');
}

function getTimeZoneDateParts(date: Date, timeZone = LEAVE_NOTICE_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value || '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value || '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value || '0');
  return { year, month, day };
}

export function getTimeZoneDateKeyOffset(offsetDays: number, timeZone = LEAVE_NOTICE_TIMEZONE, now = new Date()) {
  const parts = getTimeZoneDateParts(now, timeZone);
  const anchor = buildUtcDate(parts.year, parts.month, parts.day);
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  const year = anchor.getUTCFullYear();
  const month = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const day = String(anchor.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

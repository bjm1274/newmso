import { formatKoreanClock } from '@/lib/date-formatter';

export type PresenceState = 'working' | 'checked_out' | 'before_work';

export type PresenceMeta = {
  state: PresenceState;
  label: string;
  toneClass: string;
  dotClass: string;
  checkInLabel: string | null;
  checkOutLabel: string | null;
};

export interface AttendanceSnapshot {
  staff_id: string;
  date?: string | null;
  work_date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
}

function normalizeText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim();
  }
  return '';
}

function formatClockLabel(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return text.slice(0, 5);
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul' }).format(new Date(parsed));
  }
  // 폴백도 잘라 쓰지 않는다 — 잘라내면 UTC 값이 그대로 나온다.
  return formatKoreanClock(text);
}

function getAttendanceCheckIn(attendance?: AttendanceSnapshot | null) {
  return normalizeText(attendance?.check_in) || normalizeText(attendance?.check_in_time) || null;
}

function getAttendanceCheckOut(attendance?: AttendanceSnapshot | null) {
  return normalizeText(attendance?.check_out) || normalizeText(attendance?.check_out_time) || null;
}

export function getPresenceMeta(attendance?: AttendanceSnapshot | null): PresenceMeta {
  const checkInLabel = formatClockLabel(getAttendanceCheckIn(attendance));
  const checkOutLabel = formatClockLabel(getAttendanceCheckOut(attendance));

  if (checkInLabel && !checkOutLabel) {
    return {
      state: 'working',
      label: '근무중',
      toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClass: 'bg-emerald-500',
      checkInLabel,
      checkOutLabel: null };
  }

  if (checkInLabel && checkOutLabel) {
    return {
      state: 'checked_out',
      label: '퇴근 완료',
      toneClass: 'border-[var(--border)] bg-[var(--muted)] text-[var(--toss-gray-4)]',
      dotClass: 'bg-[var(--toss-gray-3)]',
      checkInLabel,
      checkOutLabel };
  }

  return {
    state: 'before_work',
    label: '출근 전',
    toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-400',
    checkInLabel: null,
    checkOutLabel: null };
}

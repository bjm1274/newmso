import type { HandoverNote, HandoverNoteScope, HandoverRoomConfig } from '@/lib/handover-notes';

export type { HandoverNote, HandoverNoteScope, HandoverRoomConfig };

export type BedOption = {
  selectionKey: string;
  bedKey: string;
  roomNumber: string;
  roomCapacity: number;
  bedNumber: number;
  patientName: string;
  admissionDate: string;
  label: string;
};

export type Summary = { general: number; patient: number; total: number };
export type RoomStatus = 'idle' | 'saving' | 'saved' | 'error';

export type RoomConfigSnapshot = {
  dateKey: string;
  createdAt: string | null;
  rooms: HandoverRoomConfig[];
};

export type PatientEpisode = {
  episodeKey: string;
  bedKey: string;
  roomNumber: string;
  roomCapacity: number;
  bedNumber: number;
  patientName: string;
  patientKey: string | null;
  startDate: string;
  endDate: string | null;
};

export type PatientGroup = {
  key: string;
  testIdKey: string;
  label: string;
  roomNumber: string;
  bedNumber: number;
  patientName: string;
  patientKey: string | null;
  startDate: string;
  endDate: string | null;
  notes: HandoverNote[];
};

export type TemplateFamily = {
  key: string;
  name: string;
  scope: HandoverNoteScope;
  latestVersion: number;
  count: number;
  latestCreatedAt?: string | null;
  latestAuthorName?: string | null;
};

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
export const DEFAULT_SHIFT = 'Day';
export const DEFAULT_PRIORITY = 'Normal';
export const DEFAULT_SCOPE: HandoverNoteScope = 'general';

// ── 날짜 유틸리티 ──────────────────────────────────────────

export function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthGrid(date: Date) {
  const firstDay = monthStart(date);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push(new Date(date.getFullYear(), date.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function monthLabel(date: Date) {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
}

export function fullDateLabel(date: Date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function compareDateKeys(left?: string | null, right?: string | null) {
  return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function previousDateKey(value: string) {
  const date = fromDateKey(value);
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

export function createdLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dateLabel(value?: string | null) {
  if (!value) return '-';
  const date = fromDateKey(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

export function emptySummary(): Summary {
  return { general: 0, patient: 0, total: 0 };
}

export function compareRooms(left?: string | null, right?: string | null) {
  return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function buildEpisodeRenderKey(
  bedKey: string,
  startDate: string,
  patientKey?: string | null,
  patientName?: string | null,
) {
  const seed = String(patientKey || patientName || 'patient');
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${bedKey}-${startDate}-${hash.toString(36)}`;
}

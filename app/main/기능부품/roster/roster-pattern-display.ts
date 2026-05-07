/**
 * Extracted pattern display helpers.
 */
import type { WorkShift } from './roster-wizard-types';
import { OFF_SHIFT_TOKEN } from './roster-wizard-types';
import { normalizeShiftName, resolveConfiguredWorkDayMode } from './roster-shift-utils';

export function getShiftNameById(shiftId: string, workShifts: WorkShift[]) {
  if (shiftId === OFF_SHIFT_TOKEN) return '휴무';
  return workShifts.find((shift) => shift.id === shiftId)?.name || '미지정';
}

export function getPatternSequenceLabel(token: string, workShifts: WorkShift[]) {
  if (token === OFF_SHIFT_TOKEN) return 'OFF';
  return getShiftNameById(token, workShifts);
}

export function getShiftCode(name: string) {
  const normalized = normalizeShiftName(name);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return 'OFF';
  if (normalized.includes('휴가') || normalized.includes('연차')) return '휴';
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) return 'D';
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) return 'E';
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) return 'N';
  return name.slice(0, 2);
}

export function getShiftDisplayLabel(name: string) {
  const rawName = String(name || '').trim();
  const normalized = normalizeShiftName(rawName);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return '휴무';
  return rawName.replace(/\s*\([^)]*\)\s*$/, '').trim() || rawName;
}

export function getShiftBadgeClass(name: string) {
  const normalized = normalizeShiftName(name);
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) {
    return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]';
  }
  if (normalized.includes('휴가') || normalized.includes('연차')) {
    return 'bg-green-500/10 text-green-700 border-green-500/20';
  }
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) {
    return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
  }
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) {
    return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
  }
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) {
    return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function formatShiftHours(shift: WorkShift) {
  if (!shift.start_time || !shift.end_time) return '시간 미지정';
  return `${String(shift.start_time).slice(0, 5)} - ${String(shift.end_time).slice(0, 5)}`;
}

export function resolveShiftWorkDayMode(shift?: WorkShift | null) {
  return resolveConfiguredWorkDayMode(shift);
}

export function shiftIncludesWeekend(shift?: WorkShift | null) {
  if (!shift) return false;
  return resolveShiftWorkDayMode(shift) === 'all_days';
}

// ─── 날짜 라벨 유틸 ───────────────────────────────────────────────────────────

export function formatRosterShortDateLabel(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  return `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`;
}

export function summarizeRosterDateLabels(dateKeys: string[], limit = 3) {
  const uniqueLabels = [...new Set(dateKeys.filter(Boolean).map((dateKey) => formatRosterShortDateLabel(dateKey)))];
  if (uniqueLabels.length === 0) return '';
  if (uniqueLabels.length <= limit) return uniqueLabels.join(', ');
  return `${uniqueLabels.slice(0, limit).join(', ')} 외 ${uniqueLabels.length - limit}일`;
}

export function buildAssignmentKey(staffId: string, date: string) {
  return `${staffId}::${date}`;
}

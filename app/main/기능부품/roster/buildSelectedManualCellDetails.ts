
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import {
  OFF_SHIFT_TOKEN,
  STAFF_BLOCK_PREFERENCE_OPTIONS,
} from '../근무표자동편성-types';
import {
  formatShiftHours,
  getAssignedShiftBand,
  getGenerationStyleMeta,
  getShiftCode,
  isWeekendDateKey,
  normalizeStaffBlockPreference,
} from '../근무표자동편성-engine';

export function buildSelectedManualCellDetails({
  defaultShiftPool,
  monthDates,
  preferredOffSelections,
  previewGenerationRule,
  previewRows,
  selectedManualCell,
  staffPlanningMeta,
}: any) {
  if (!selectedManualCell) return null;

  const row = previewRows.find(
    (previewRow: any) => String(previewRow.staff.id) === selectedManualCell.staffId
  );
  if (!row) return null;

  const cell = row.cells.find((previewCell: any) => previewCell.date === selectedManualCell.date);
  if (!cell) return null;

  const shiftMap: Map<string, any> = new Map(defaultShiftPool.map((shift: any) => [shift.id, shift]));
  const staffMeta =
    staffPlanningMeta.find((meta: any) => meta.staffId === selectedManualCell.staffId) || null;
  const currentBand = getAssignedShiftBand(cell.shiftId, shiftMap);
  const criticalNightCoverage =
    currentBand === 'night' &&
    ((previewGenerationRule.minDedicatedNightStaff > 0 && staffMeta?.dedicatedBand === 'night') ||
      (previewGenerationRule.minSeniorNightStaff > 0 && staffMeta?.isSeniorStaff));
  const explanations = [
    staffMeta?.resolvedGroupReason
      ? `기본 배치 기준: ${staffMeta.resolvedGroupReason}`
      : '기본 배치 기준: 저장된 패턴과 생성 규칙을 함께 반영했습니다.',
    staffMeta?.dedicatedBand
      ? `전담 밴드: ${staffMeta.dedicatedBand.toUpperCase()}`
      : '전담 밴드 강제는 없습니다.',
    (() => {
      const currentDateIndex = monthDates.indexOf(cell.date);
      if (currentDateIndex > 0) {
        const previousBand = getAssignedShiftBand(
          row.cells[currentDateIndex - 1]?.shiftId || '',
          shiftMap
        );
        if (cell.shiftId === OFF_SHIFT_TOKEN && previousBand === 'night') {
          return `나이트 이후 OFF ${previewGenerationRule.offDaysAfterNight}일 규칙을 반영한 자리입니다.`;
        }
      }
      return null;
    })(),
    preferredOffSelections[String(row.staff.id)]?.includes(cell.date)
      ? '희망 OFF가 등록된 날짜입니다.'
      : null,
    staffMeta?.config.preferWeekendOff && isWeekendDateKey(cell.date)
      ? '주말 OFF 선호가 반영되어 있는 날짜입니다.'
      : null,
    staffMeta?.config.preferHolidayOff && isKoreanPublicHoliday(cell.date)
      ? '공휴일 OFF 선호가 반영되어 있는 날짜입니다.'
      : null,
    staffMeta?.config.avoidConsecutiveEvening && currentBand === 'evening'
      ? '연속 EVENING 제한 선호를 함께 고려한 배치입니다.'
      : null,
    `생성 성향: ${getGenerationStyleMeta(previewGenerationRule.generationStyle).label}`,
    `개인 블록 선호: ${
      STAFF_BLOCK_PREFERENCE_OPTIONS.find(
        (option: any) =>
          option.value === normalizeStaffBlockPreference(staffMeta?.config.blockPreference)
      )?.label || '균형'
    }`,
  ].filter(Boolean);

  const options = [OFF_SHIFT_TOKEN, ...defaultShiftPool.map((shift: any) => shift.id)].map(
    (shiftId) => {
      const shift = shiftId === OFF_SHIFT_TOKEN ? null : shiftMap.get(shiftId);
      const band = getAssignedShiftBand(shiftId, shiftMap);
      const isCurrent = cell.shiftId === shiftId;
      const isBase = cell.baseShiftId === shiftId;
      const allowed = isCurrent ? true : !(criticalNightCoverage && band !== 'night');

      return {
        shiftId,
        label: shiftId === OFF_SHIFT_TOKEN ? 'OFF' : (shift as any)?.name || '근무',
        code: shiftId === OFF_SHIFT_TOKEN ? 'OFF' : getShiftCode((shift as any)?.name || '근무'),
        hours: shift ? formatShiftHours(shift as any) : '휴무',
        allowed,
        reason: allowed ? '' : '현재 NIGHT 최소 커버를 유지해야 해서 변경할 수 없습니다.',
        isCurrent,
        isBase,
      };
    }
  );

  return {
    staffId: selectedManualCell.staffId,
    row,
    cell,
    options,
    explanations,
  };
}

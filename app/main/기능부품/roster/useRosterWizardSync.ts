'use client';

import type { RosterGenerationRule } from '@/lib/roster-generation-rules';
import {
expandCoverageRoleTags
} from '@/lib/roster-role-tags';
import type { StaffMember } from '@/types';
import {
useEffect,
useMemo,
type Dispatch,
type SetStateAction
} from 'react';
import {
buildDefaultCustomPatternSequence,
buildGenerationRuleSummaryItems,
buildInitialConfig,
clampNightShiftCount,
cloneGenerationRule,
getRequiredShiftCount,
isCustomPattern,
isNightPattern,
isWeeklyTemplatePattern,
normalizeBlockedShiftBands,
normalizeBlockedWeekdays,
normalizeCustomPatternSequence,
normalizePresetRecord,
normalizeStaffBlockPreference,
normalizeWeeklyTemplateWeeks
} from '../근무표자동편성-engine';
import {
OFF_SHIFT_TOKEN,
type CoverageBand,
type RosterWizardPreset,
type StaffBlockPreference,
type StaffConfig,
type StaffRestrictionDraft,
type WeeklyTemplateWeek,
type WizardNightRangeDraft,
type WizardOffOverride,
type WizardPairRule,
type WorkShift
} from '../근무표자동편성-types';

/** useRosterWizardSync에 전달되는 context 타입 */
export interface RosterWizardSyncContext {
  // ── 읽기 전용 데이터 ──────────────────────────────────────────────────────
  /** 기본 근무 순서 배열 (정렬된 WorkShift 목록) */
  defaultShiftOrder: WorkShift[];
  /** 전체 근무 풀 */
  defaultShiftPool: WorkShift[];
  /** 마법사 기본 선택 직원 ID 목록 */
  defaultWizardSelectedStaffIds: string[];
  /** 직원별 StaffConfig Map (staffId → StaffConfig) */
  effectiveTargetStaffConfigs: Map<string, StaffConfig>;
  /** 해당 월의 날짜 문자열 배열 (YYYY-MM-DD) */
  monthDates: string[];
  /** 정렬된 대상 직원 ID 목록 */
  orderedTargetStaffIds: string[];
  /** 플래너 페어 규칙 목록 */
  plannerPairRules: WizardPairRule[];
  /** 미리보기용 생성 규칙 */
  previewGenerationRule: RosterGenerationRule;
  /** 저장된 마법사 프리셋 목록 (정규화 전 원본, normalizePresetRecord로 검증됨) */
  savedWizardPresets: Record<string, unknown>[];
  /** 직원별 커버리지 롤 태그 (staffId → 태그 배열) */
  staffCoverageRoleTags: Record<string, string[]>;
  /** 직원별 전담 밴드 오버라이드 (staffId → CoverageBand | '') */
  staffDedicatedBandOverrides: Record<string, CoverageBand | ''>;
  /** 대상 직원 목록 */
  targetStaffs: StaffMember[];
  // ── 마법사 상태 (읽기) ────────────────────────────────────────────────────
  /** 커스텀 패턴 시퀀스 (근무 ID 또는 OFF_SHIFT_TOKEN) */
  wizardCustomPatternSequence: string[];
  /** 마법사 열림 여부 */
  wizardOpen: boolean;
  /** 선택된 근무 패턴 (예: '3교대', '커스텀' 등) */
  wizardPattern: string;
  /** 편집 중인 생성 규칙 초안 */
  wizardRuleDraft: RosterGenerationRule;
  /** 선택된 프리셋 ID */
  wizardSelectedPresetId: string;
  /** 선택된 직원 ID 목록 */
  wizardSelectedStaffIds: string[];
  /** 선택된 근무 ID 목록 */
  wizardShiftIds: string[];
  /** 주차 템플릿 주 목록 */
  wizardWeeklyTemplateWeeks: WeeklyTemplateWeek[];
  // ── 마법사 상태 setter ────────────────────────────────────────────────────
  setWizardBlockPreferenceDrafts: Dispatch<SetStateAction<Record<string, StaffBlockPreference>>>;
  setWizardCoverageRoleDrafts: Dispatch<SetStateAction<Record<string, string[]>>>;
  setWizardCustomPatternSequence: Dispatch<SetStateAction<string[]>>;
  setWizardDedicatedBandDrafts: Dispatch<SetStateAction<Record<string, CoverageBand | ''>>>;
  setWizardNightRangeDrafts: Dispatch<SetStateAction<Record<string, WizardNightRangeDraft>>>;
  setWizardNightShiftCount: Dispatch<SetStateAction<number>>;
  setWizardOffOverrides: Dispatch<SetStateAction<Record<string, WizardOffOverride>>>;
  setWizardPairRules: Dispatch<SetStateAction<WizardPairRule[]>>;
  setWizardRuleDraft: Dispatch<SetStateAction<RosterGenerationRule>>;
  setWizardSelectedStaffIds: Dispatch<SetStateAction<string[]>>;
  setWizardShiftIds: Dispatch<SetStateAction<string[]>>;
  setWizardStaffRestrictionDrafts: Dispatch<SetStateAction<Record<string, StaffRestrictionDraft>>>;
  setWizardWeeklyTemplateWeeks: Dispatch<SetStateAction<WeeklyTemplateWeek[]>>;
}

export function useRosterWizardSync(ctx: RosterWizardSyncContext) {
  const {
    defaultShiftOrder,
    defaultShiftPool,
    defaultWizardSelectedStaffIds,
    effectiveTargetStaffConfigs,
    monthDates,
    orderedTargetStaffIds,
    plannerPairRules,
    previewGenerationRule,
    savedWizardPresets,
    setWizardBlockPreferenceDrafts,
    setWizardCoverageRoleDrafts,
    setWizardCustomPatternSequence,
    setWizardDedicatedBandDrafts,
    setWizardNightRangeDrafts,
    setWizardNightShiftCount,
    setWizardOffOverrides,
    setWizardPairRules,
    setWizardRuleDraft,
    setWizardSelectedStaffIds,
    setWizardShiftIds,
    setWizardStaffRestrictionDrafts,
    setWizardWeeklyTemplateWeeks,
    staffCoverageRoleTags,
    staffDedicatedBandOverrides,
    targetStaffs,
    wizardCustomPatternSequence,
    wizardOpen,
    wizardPattern,
    wizardRuleDraft,
    wizardSelectedPresetId,
    wizardSelectedStaffIds,
    wizardShiftIds,
    wizardWeeklyTemplateWeeks,
  } = ctx;

  const wizardRequiredShiftCount = getRequiredShiftCount(wizardPattern);
  const wizardUsesCustomPattern = isCustomPattern(wizardPattern);
  const wizardUsesWeeklyTemplate = isWeeklyTemplatePattern(wizardPattern);

  const orderedWizardShiftIds = useMemo(
    () =>
      defaultShiftPool
        .filter((shift) => wizardShiftIds.includes(shift.id))
        .map((shift) => shift.id),
    [defaultShiftPool, wizardShiftIds]
  );

  const effectiveWizardCustomPatternSequence = useMemo(
    () =>
      wizardUsesCustomPattern
        ? normalizeCustomPatternSequence(wizardCustomPatternSequence, defaultShiftPool)
        : [],
    [defaultShiftPool, wizardCustomPatternSequence, wizardUsesCustomPattern]
  );

  const effectiveWizardWeeklyTemplateWeeks = useMemo(
    () =>
      wizardUsesWeeklyTemplate
        ? normalizeWeeklyTemplateWeeks(
            wizardWeeklyTemplateWeeks,
            [
              ...new Set<string>(
                wizardWeeklyTemplateWeeks
                  .map((week) => week.shiftId)
                  .concat(orderedWizardShiftIds)
                  .filter(Boolean)
              ),
            ],
            wizardWeeklyTemplateWeeks.length || 1
          )
        : [],
    [orderedWizardShiftIds, wizardUsesWeeklyTemplate, wizardWeeklyTemplateWeeks]
  );

  const userWizardPresets = useMemo(() => {
    const seen = new Set<string>();
    return savedWizardPresets
      .map((preset) => normalizePresetRecord(preset))
      .filter((preset): preset is RosterWizardPreset => preset !== null)
      .filter(
        (preset) =>
          isCustomPattern(preset.pattern) || isWeeklyTemplatePattern(preset.pattern)
      )
      .filter((preset) => {
        if (seen.has(preset.id)) return false;
        seen.add(preset.id);
        return true;
      });
  }, [savedWizardPresets]);

  const selectedWizardPreset = useMemo(
    () =>
      userWizardPresets.find((preset) => preset.id === wizardSelectedPresetId) || null,
    [userWizardPresets, wizardSelectedPresetId]
  );

  const wizardSelectedStaffs = useMemo(
    () =>
      targetStaffs.filter((staff) =>
        wizardSelectedStaffIds.includes(String(staff.id))
      ),
    [targetStaffs, wizardSelectedStaffIds]
  );

  const wizardExcludedStaffs = useMemo(
    () =>
      targetStaffs.filter(
        (staff) => !wizardSelectedStaffIds.includes(String(staff.id))
      ),
    [targetStaffs, wizardSelectedStaffIds]
  );

  const wizardOverrideDateOptions = useMemo(
    () => monthDates.slice(0, -1),
    [monthDates]
  );

  const wizardOverrideShiftOptions = useMemo(
    () =>
      orderedWizardShiftIds.length > 0
        ? defaultShiftPool.filter((shift) => orderedWizardShiftIds.includes(shift.id))
        : defaultShiftOrder.length > 0
          ? defaultShiftOrder
          : defaultShiftPool,
    [defaultShiftOrder, defaultShiftPool, orderedWizardShiftIds]
  );

  const wizardRuleSummaryItems = useMemo(
    () => buildGenerationRuleSummaryItems(wizardRuleDraft),
    [wizardRuleDraft]
  );

  useEffect(() => {
    setWizardRuleDraft(cloneGenerationRule(previewGenerationRule) || previewGenerationRule);
  }, [previewGenerationRule]);

  useEffect(() => {
    if (!wizardOpen) return;

    const validStaffIds = new Set(orderedTargetStaffIds);
    setWizardSelectedStaffIds((prev) => {
      const filtered = prev.filter((staffId) => validStaffIds.has(staffId));
      if (filtered.length > 0) return filtered;
      return defaultWizardSelectedStaffIds;
    });
  }, [defaultWizardSelectedStaffIds, orderedTargetStaffIds, wizardOpen]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;

    setWizardShiftIds((prev) =>
      defaultShiftPool
        .filter((shift) => prev.includes(shift.id))
        .map((shift) => shift.id)
    );
  }, [defaultShiftPool, wizardOpen, wizardSelectedPresetId]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId || !wizardUsesCustomPattern) return;

    setWizardCustomPatternSequence((prev) => {
      const normalized = normalizeCustomPatternSequence(prev, defaultShiftPool).filter(
        (token) => token === OFF_SHIFT_TOKEN || orderedWizardShiftIds.includes(token)
      );
      if (normalized.length > 0) return normalized;
      return buildDefaultCustomPatternSequence(orderedWizardShiftIds);
    });
  }, [
    defaultShiftPool,
    orderedWizardShiftIds,
    wizardOpen,
    wizardSelectedPresetId,
    wizardUsesCustomPattern,
  ]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;
    if (!wizardUsesWeeklyTemplate) {
      setWizardWeeklyTemplateWeeks([]);
      return;
    }

    setWizardWeeklyTemplateWeeks((prev) =>
      normalizeWeeklyTemplateWeeks(prev, orderedWizardShiftIds, prev.length || 1)
    );
  }, [
    orderedWizardShiftIds,
    wizardOpen,
    wizardSelectedPresetId,
    wizardUsesWeeklyTemplate,
  ]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;
    if (!isNightPattern(wizardPattern)) {
      setWizardNightShiftCount(0);
      return;
    }

    setWizardNightShiftCount((prev) =>
      clampNightShiftCount(prev, monthDates.length)
    );
  }, [monthDates.length, wizardOpen, wizardPattern, wizardSelectedPresetId]);

  useEffect(() => {
    if (!wizardOpen) return;

    const defaultNextShiftId = wizardOverrideShiftOptions[0]?.id || '';
    const lastDateIndex = Math.max(wizardOverrideDateOptions.length - 1, 0);

    setWizardOffOverrides((prev) => {
      const next: Record<string, WizardOffOverride> = {};

      wizardSelectedStaffIds.forEach((staffId, index) => {
        const current = prev[staffId];
        const fallbackOffDate =
          wizardOverrideDateOptions[Math.min(index, lastDateIndex)] || '';
        const nextShiftId =
          current?.nextShiftId &&
          wizardOverrideShiftOptions.some(
            (shift) => shift.id === current.nextShiftId
          )
            ? current.nextShiftId
            : defaultNextShiftId;

        next[staffId] = {
          enabled: current?.enabled ?? false,
          offDate:
            current?.offDate && wizardOverrideDateOptions.includes(current.offDate)
              ? current.offDate
              : fallbackOffDate,
          nextShiftId,
        };
      });

      return next;
    });
  }, [
    wizardOpen,
    wizardOverrideDateOptions,
    wizardOverrideShiftOptions,
    wizardSelectedStaffIds,
  ]);

  useEffect(() => {
    if (!wizardOpen) return;

    const nextNightRanges: Record<string, WizardNightRangeDraft> = {};
    const nextBlockPreferences: Record<string, StaffBlockPreference> = {};
    const nextDedicatedBands: Record<string, CoverageBand | ''> = {};
    const nextRestrictions: Record<string, StaffRestrictionDraft> = {};
    const nextCoverageRoles: Record<string, string[]> = {};

    targetStaffs.forEach((staff, index) => {
      const staffId = String(staff.id);
      const config =
        effectiveTargetStaffConfigs.get(staffId) ||
        buildInitialConfig(
          staff,
          index,
          defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
          monthDates.length
        );

      nextNightRanges[staffId] = {
        minNightShiftCount: clampNightShiftCount(
          config.minNightShiftCount || 0,
          monthDates.length
        ),
        maxNightShiftCount: clampNightShiftCount(
          config.maxNightShiftCount || 0,
          monthDates.length
        ),
      };
      nextBlockPreferences[staffId] = normalizeStaffBlockPreference(
        config.blockPreference
      );
      nextDedicatedBands[staffId] = staffDedicatedBandOverrides[staffId] || '';
      nextRestrictions[staffId] = {
        blockedShiftBands: normalizeBlockedShiftBands(
          config.blockedShiftBands || []
        ),
        blockedWeekdays: normalizeBlockedWeekdays(config.blockedWeekdays || []),
        avoidWeekendWork: Boolean(config.avoidWeekendWork),
        avoidHolidayWork: Boolean(config.avoidHolidayWork),
        preferWeekendOff: Boolean(config.preferWeekendOff),
        preferHolidayOff: Boolean(config.preferHolidayOff),
        avoidConsecutiveEvening: Boolean(config.avoidConsecutiveEvening),
        preferEarlyMonthNight: Boolean(config.preferEarlyMonthNight),
      };
      nextCoverageRoles[staffId] = expandCoverageRoleTags(
        staffCoverageRoleTags[staffId] || []
      );
    });

    setWizardNightRangeDrafts(nextNightRanges);
    setWizardBlockPreferenceDrafts(nextBlockPreferences);
    setWizardDedicatedBandDrafts(nextDedicatedBands);
    setWizardStaffRestrictionDrafts(nextRestrictions);
    setWizardCoverageRoleDrafts(nextCoverageRoles);
    setWizardPairRules(plannerPairRules);
  }, [
    defaultShiftOrder,
    defaultShiftPool,
    effectiveTargetStaffConfigs,
    monthDates.length,
    plannerPairRules,
    staffCoverageRoleTags,
    staffDedicatedBandOverrides,
    targetStaffs,
    wizardOpen,
  ]);

  return {
    effectiveWizardCustomPatternSequence,
    effectiveWizardWeeklyTemplateWeeks,
    orderedWizardShiftIds,
    selectedWizardPreset,
    userWizardPresets,
    wizardExcludedStaffs,
    wizardOverrideDateOptions,
    wizardOverrideShiftOptions,
    wizardRequiredShiftCount,
    wizardRuleSummaryItems,
    wizardSelectedStaffs,
    wizardUsesCustomPattern,
    wizardUsesWeeklyTemplate,
  };
}

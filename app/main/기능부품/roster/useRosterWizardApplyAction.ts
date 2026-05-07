'use client';

import type { RosterGenerationRule } from '@/lib/roster-generation-rules';
import {
expandCoverageRoleTags,
normalizeCoverageRoleTags,
} from '@/lib/roster-role-tags';
import {
buildAssignmentKey,
buildInitialConfig,
clampNightShiftCount,
isNightPattern,
normalizeBlockedShiftBands,
normalizeBlockedWeekdays
} from '../근무표자동편성-engine';
import {
OFF_SHIFT_TOKEN,
type ManualAssignmentMap
} from '../근무표자동편성-types';

export function useRosterWizardApplyAction(ctx: any) {
  const {
    closeWizard,
    defaultShiftOrder,
    defaultShiftPool,
    effectiveWizardCustomPatternSequence,
    effectiveWizardWeeklyTemplateWeeks,
    monthDates,
    orderedWizardShiftIds,
    plannerActions,
    previewGenerationRule,
    scope,
    targetStaffs,
    toast,
    wizardBlockPreferenceDrafts,
    wizardCoverageRoleDrafts,
    wizardDedicatedBandDrafts,
    wizardNightRangeDrafts,
    wizardNightShiftCount,
    wizardOffOverrides,
    wizardPairRules,
    wizardPattern,
    wizardRequiredShiftCount,
    wizardRuleDraft,
    wizardSelectedStaffIds,
    wizardStaffRestrictionDrafts,
    wizardStartOffset,
    wizardUsesCustomPattern,
    wizardUsesWeeklyTemplate,
  } = ctx;

  return () => {
    if (!scope.selectedCompany) {
      toast('사업체를 먼저 선택하세요.', 'warning');
      return;
    }
    if (!scope.selectedDepartment || scope.selectedDepartment === '전체 부서') {
      toast('근무표를 생성할 대상을 선택하세요.', 'warning');
      return;
    }
    if (!wizardSelectedStaffIds.length) {
      toast('근무표를 생성할 직원을 한 명 이상 선택하세요.', 'warning');
      return;
    }
    if (
      !wizardUsesCustomPattern &&
      !wizardUsesWeeklyTemplate &&
      orderedWizardShiftIds.length < wizardRequiredShiftCount
    ) {
      toast(
        `${wizardPattern} 패턴에 필요한 근무유형 ${wizardRequiredShiftCount}개를 선택하세요.`,
        'warning'
      );
      return;
    }
    if (wizardUsesCustomPattern && orderedWizardShiftIds.length === 0) {
      toast('커스텀 패턴에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
      return;
    }
    if (wizardUsesWeeklyTemplate && orderedWizardShiftIds.length === 0) {
      toast('주간 템플릿에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
      return;
    }
    if (
      wizardUsesCustomPattern &&
      (effectiveWizardCustomPatternSequence.length === 0 ||
        !effectiveWizardCustomPatternSequence.some(
          (token: any) => token !== OFF_SHIFT_TOKEN
        ))
    ) {
      toast(
        '커스텀 패턴 순서를 만들고 실제 근무유형을 1개 이상 포함해 주세요.'
      );
      return;
    }
    if (
      wizardUsesWeeklyTemplate &&
      !effectiveWizardWeeklyTemplateWeeks.some(
        (week: any) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
      )
    ) {
      toast('주간 템플릿에는 근무가 들어갈 요일을 최소 1일 이상 지정해 주세요.');
      return;
    }

    const primaryShiftId = orderedWizardShiftIds[0] || '';
    const secondaryShiftId = orderedWizardShiftIds[1] || primaryShiftId;
    const tertiaryShiftId =
      orderedWizardShiftIds[2] || secondaryShiftId || primaryShiftId;
    if (!primaryShiftId) {
      toast('근무유형을 한 개 이상 선택하세요.', 'warning');
      return;
    }

    const nextCustomPatternSequence = wizardUsesCustomPattern
      ? effectiveWizardCustomPatternSequence
      : [];
    const nextWeeklyTemplateWeeks = wizardUsesWeeklyTemplate
      ? effectiveWizardWeeklyTemplateWeeks
      : [];

    const selectedIndexMap = new Map<string, number>();
    wizardSelectedStaffIds.forEach((staffId: any, index: any) => {
      selectedIndexMap.set(staffId, index);
    });

    const nextManualAssignments: ManualAssignmentMap = {};
    const nextGenerationRuleOverride: RosterGenerationRule = {
      ...wizardRuleDraft,
      name: wizardRuleDraft.name || previewGenerationRule.name || '추가 생성 규칙',
      companyName: scope.selectedCompany,
      companyId: scope.selectedCompanyId,
      teamKeywords:
        wizardRuleDraft.teamKeywords.length > 0
          ? wizardRuleDraft.teamKeywords
          : [scope.selectedDepartment, ...scope.includedDepartments].filter(Boolean),
      weekendMinDayStaff: Math.max(
        0,
        Math.floor(wizardRuleDraft.weekendMinDayStaff || 0)
      ),
      weekendMinEveningStaff: Math.max(
        0,
        Math.floor(wizardRuleDraft.weekendMinEveningStaff || 0)
      ),
      weekendMinNightStaff: Math.max(
        0,
        Math.floor(wizardRuleDraft.weekendMinNightStaff || 0)
      ),
      holidayMinDayStaff: Math.max(
        0,
        Math.floor(wizardRuleDraft.holidayMinDayStaff || 0)
      ),
      holidayMinEveningStaff: Math.max(
        0,
        Math.floor(wizardRuleDraft.holidayMinEveningStaff || 0)
      ),
      holidayMinNightStaff: Math.max(
        0,
        Math.floor(wizardRuleDraft.holidayMinNightStaff || 0)
      ),
      dateCoverageOverrides: (wizardRuleDraft.dateCoverageOverrides || [])
        .map((entry: any, index: any) => ({
          id: entry.id || `date-coverage-${index + 1}`,
          date: String(entry.date || '').slice(0, 10),
          minDayStaff: Math.max(0, Math.floor(entry.minDayStaff || 0)),
          minEveningStaff: Math.max(0, Math.floor(entry.minEveningStaff || 0)),
          minNightStaff: Math.max(0, Math.floor(entry.minNightStaff || 0)),
        }))
        .filter(
          (entry: any) =>
            /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
            (entry.minDayStaff > 0 ||
              entry.minEveningStaff > 0 ||
              entry.minNightStaff > 0)
        ),
      roleCoverageRules: wizardRuleDraft.roleCoverageRules
        .map((rule: any, index: any) => ({
          ...rule,
          id: rule.id || `role-slot-${index + 1}`,
          label: String(rule.label || `역할 슬롯 ${index + 1}`).trim(),
          keywords: normalizeCoverageRoleTags(rule.keywords || []),
          minDayStaff: Math.max(0, Math.floor(rule.minDayStaff || 0)),
          minEveningStaff: Math.max(0, Math.floor(rule.minEveningStaff || 0)),
          minNightStaff: Math.max(0, Math.floor(rule.minNightStaff || 0)),
        }))
        .filter(
          (rule: any) =>
            (rule.label || '').trim() &&
            (rule.minDayStaff > 0 ||
              rule.minEveningStaff > 0 ||
              rule.minNightStaff > 0)
        ),
    };

    wizardSelectedStaffIds.forEach((staffId: any) => {
      const override = wizardOffOverrides[staffId];
      if (!override?.enabled || !override.offDate) return;

      const offDateIndex = monthDates.indexOf(override.offDate);
      if (offDateIndex === -1) return;

      nextManualAssignments[buildAssignmentKey(staffId, override.offDate)] =
        OFF_SHIFT_TOKEN;

      const nextDate = monthDates[offDateIndex + 1];
      if (nextDate && override.nextShiftId) {
        nextManualAssignments[buildAssignmentKey(staffId, nextDate)] =
          override.nextShiftId;
      }
    });

    plannerActions.setPlannerPattern(wizardPattern);
    plannerActions.setPlannerPrimaryShiftId(primaryShiftId);
    plannerActions.setPlannerSecondaryShiftId(secondaryShiftId);
    plannerActions.setPlannerTertiaryShiftId(tertiaryShiftId);
    plannerActions.setPlannerStartOffset(wizardStartOffset);
    plannerActions.setPlannerNightShiftCount(
      isNightPattern(wizardPattern) ? wizardNightShiftCount : 0
    );
    plannerActions.setPlannerCustomPatternSequence(nextCustomPatternSequence);
    plannerActions.setPlannerWeeklyTemplateWeeks(nextWeeklyTemplateWeeks);

    plannerActions.setStaffConfigs((prev: any) => {
      const next = { ...prev };
      targetStaffs.forEach((staff: any, index: any) => {
        const current =
          prev[staff.id] ||
          buildInitialConfig(
            staff,
            index,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          );
        const selectedIndex = selectedIndexMap.get(String(staff.id));

        next[staff.id] = {
          ...current,
          enabled: selectedIndex !== undefined,
          pattern: wizardPattern,
          primaryShiftId,
          secondaryShiftId,
          tertiaryShiftId,
          startOffset:
            selectedIndex !== undefined
              ? wizardStartOffset + selectedIndex
              : current.startOffset,
          nightShiftCount: isNightPattern(wizardPattern)
            ? clampNightShiftCount(wizardNightShiftCount, monthDates.length)
            : 0,
          minNightShiftCount:
            wizardNightRangeDrafts[String(staff.id)]?.minNightShiftCount ??
            current.minNightShiftCount,
          maxNightShiftCount:
            wizardNightRangeDrafts[String(staff.id)]?.maxNightShiftCount ??
            current.maxNightShiftCount,
          blockPreference:
            wizardBlockPreferenceDrafts[String(staff.id)] ?? current.blockPreference,
          customPatternSequence: nextCustomPatternSequence,
          weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
          blockedShiftBands: normalizeBlockedShiftBands(
            wizardStaffRestrictionDrafts[String(staff.id)]?.blockedShiftBands || []
          ),
          blockedWeekdays: normalizeBlockedWeekdays(
            wizardStaffRestrictionDrafts[String(staff.id)]?.blockedWeekdays || []
          ),
          avoidWeekendWork: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.avoidWeekendWork
          ),
          avoidHolidayWork: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.avoidHolidayWork
          ),
          preferWeekendOff: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.preferWeekendOff
          ),
          preferHolidayOff: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.preferHolidayOff
          ),
          avoidConsecutiveEvening: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.avoidConsecutiveEvening
          ),
          preferEarlyMonthNight: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.preferEarlyMonthNight
          ),
        };
      });
      return next;
    });

    plannerActions.setStaffDedicatedBandOverrides((prev: any) => {
      const next = { ...prev };
      targetStaffs.forEach((staff: any) => {
        next[String(staff.id)] = wizardDedicatedBandDrafts[String(staff.id)] || '';
      });
      return next;
    });

    plannerActions.setStaffCoverageRoleTags((prev: any) => {
      const next = { ...prev };
      targetStaffs.forEach((staff: any) => {
        next[String(staff.id)] = expandCoverageRoleTags(
          wizardCoverageRoleDrafts[String(staff.id)] || []
        );
      });
      return next;
    });

    plannerActions.setActiveGenerationRuleOverride(nextGenerationRuleOverride);
    plannerActions.setPlannerPairRules(wizardPairRules);
    plannerActions.setSelectedManualCell(null);
    plannerActions.setManualAssignments(nextManualAssignments);
    closeWizard();
    toast(
      `${scope.rosterScopeLabel} 대상 ${wizardSelectedStaffIds.length}명의 근무표 초안을 생성했습니다. 아래에서 세부 수정 후 저장하세요.`,
      'success'
    );
  };
}

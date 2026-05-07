// @ts-nocheck
'use client';

import { mergeBlockedDateMaps } from '@/lib/roster-date-utils';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { OFF_SHIFT_TOKEN, PATTERN_GROUP_MODE_OPTIONS } from '../근무표자동편성-types';
import {
  buildInitialConfig,
  buildProgrammaticAssignments,
  buildProgrammaticCycle,
  buildRuleAwareRotationAssignments,
  buildStaffRestrictionBlockedDateSet,
  enforceMinimumMonthlyOffDays,
  enforceMaxConsecutiveWorkDays,
  enforceNightRecoveryAssignments,
  enforceTeamMinimumCoverage,
  getMonthEndDateKey,
  getRestrictedAllowedShiftIds,
  getRosterModeGenerationPriority,
  isStaffNewNurse,
  resolvePlannerPatternGroup,
  resolveShiftBand,
} from '../근무표자동편성-engine';
import { loadRosterBlockedDateContext } from './roster-generation-actions';

type GenerateRosterPatternDraftParams = Record<string, any>;

export async function generateRosterPatternDraft({
  defaultPlannerMode,
  defaultShiftOrder,
  defaultShiftPool,
  effectiveTargetStaffConfigs,
  enabledTargetStaffs,
  monthDates,
  preferredOffSelections,
  previewGenerationRule,
  rosterScopeLabel,
  selectedPlannerShifts,
  selectedDepartment,
  selectedGenerationRule,
  selectedMonth,
  selectedPatternProfile,
  setGeneratedDraft,
  setGenerationAppliedAt,
  setGenerationLoading,
  setGenerationSummary,
  setManualAssignments,
  setManualEditMode,
  setPendingSnapshotMeta,
  toast,
  workShifts,
  workingShifts,
}: GenerateRosterPatternDraftParams) {
  if (!selectedDepartment) {
    toast('부서를 먼저 선택하세요.', 'warning');
    return;
  }
  if (workingShifts.length === 0) {
    toast('생성에 사용할 근무유형이 없습니다. 먼저 근무형태를 등록하세요.', 'warning');
    return;
  }
  if (selectedPlannerShifts.length === 0) {
    toast('자동 생성에 사용할 근무유형을 한 개 이상 선택하세요.', 'warning');
    return;
  }
  if (!enabledTargetStaffs.length) {
    toast('생성 대상 직원이 없습니다.');
    return;
  }

  setGenerationLoading(true);

  try {
    const shiftMap = new Map(selectedPlannerShifts.map((shift) => [shift.id, shift]));
    const groupUsage = new Map();
    const groupMemberIndexMap = new Map();
    const groupSizeMap = new Map();
    const weekendWorkCountsByGroup = new Map();
    const holidayWorkCountsByGroup = new Map();
    const rotationDailyBandCountsByGroup = new Map();
    const rotationNewNurseDailyBandCountsByGroup = new Map();
    const effectiveGenerationRule = previewGenerationRule;
    const teamDailyBandCounts = Array.from({ length: monthDates.length }, () => ({
      day: 0,
      evening: 0,
      night: 0,
    }));
    const holidayDateSet = new Set(
      monthDates.filter((dateKey) => isKoreanPublicHoliday(dateKey))
    );
    const referenceDateKey = getMonthEndDateKey(monthDates);

    const targetStaffIds = enabledTargetStaffs
      .map((staff) => String(staff?.id || ''))
      .filter(Boolean);
    const {
      approvedLeaveDayCount,
      approvedLeaveRequestCount,
      blockedDatesByStaff,
      preferredOffDateCount,
    } = await loadRosterBlockedDateContext({
      monthDates,
      preferredOffSelections,
      targetStaffIds,
    });

    const resolvedGroupsByStaff = enabledTargetStaffs.map((staff) => {
      const config =
        effectiveTargetStaffConfigs.get(String(staff.id)) ||
        buildInitialConfig(
          staff,
          0,
          defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
          monthDates.length
        );
      const resolvedGroup = resolvePlannerPatternGroup({
        staff,
        patternProfile: selectedPatternProfile,
        availableShifts: selectedPlannerShifts,
        allShifts: workShifts,
      });
      const groupKey = resolvedGroup?.key || `default-${defaultPlannerMode}`;
      groupSizeMap.set(groupKey, (groupSizeMap.get(groupKey) || 0) + 1);
      return {
        staff,
        staffId: String(staff.id),
        config,
        resolvedGroup,
        groupKey,
      };
    });

    const generationOrderEntries = [...resolvedGroupsByStaff].sort((left, right) => {
      const leftRawMode = left.resolvedGroup?.mode || defaultPlannerMode;
      const rightRawMode = right.resolvedGroup?.mode || defaultPlannerMode;
      const leftMode =
        !effectiveGenerationRule.fixedShiftOnly && leftRawMode !== 'rotation'
          ? 'rotation'
          : leftRawMode;
      const rightMode =
        !effectiveGenerationRule.fixedShiftOnly && rightRawMode !== 'rotation'
          ? 'rotation'
          : rightRawMode;
      return (
        getRosterModeGenerationPriority(leftMode) -
        getRosterModeGenerationPriority(rightMode)
      );
    });

    const generatedStaffPlans = generationOrderEntries.map((entry) => {
      const staffConfig = entry.config;
      const resolvedGroup = entry.resolvedGroup || null;
      const groupKey = entry.groupKey || `default-${defaultPlannerMode}`;
      const totalStaffCount = groupSizeMap.get(groupKey) || 1;
      const groupMemberIndex = groupMemberIndexMap.get(groupKey) || 0;
      const restrictionBlockedDateSet = buildStaffRestrictionBlockedDateSet(
        staffConfig,
        monthDates
      );
      const blockedDateSet = mergeBlockedDateMaps(
        blockedDatesByStaff,
        new Map([[String(entry.staff.id), restrictionBlockedDateSet]])
      ).get(String(entry.staff.id));
      const isNewNurse = isStaffNewNurse(entry.staff, referenceDateKey);
      groupMemberIndexMap.set(groupKey, groupMemberIndex + 1);
      const baseAllowedShiftIds = (
        resolvedGroup?.shiftIds.filter((shiftId) => shiftMap.has(shiftId)) ||
        selectedPlannerShifts.map((shift) => shift.id)
      ).filter(Boolean);
      const allowedShiftIds = getRestrictedAllowedShiftIds(
        baseAllowedShiftIds,
        staffConfig.blockedShiftBands,
        shiftMap
      );
      const rawMode = resolvedGroup?.mode || defaultPlannerMode;
      const effectiveMode =
        !effectiveGenerationRule.fixedShiftOnly && rawMode !== 'rotation'
          ? 'rotation'
          : rawMode;
      const sharedDailyBandCounts =
        effectiveMode === 'rotation' && effectiveGenerationRule.balanceRotationBands
          ? (() => {
              const current =
                rotationDailyBandCountsByGroup.get(groupKey) ||
                Array.from({ length: monthDates.length }, () => ({
                  day: 0,
                  evening: 0,
                  night: 0,
                }));
              rotationDailyBandCountsByGroup.set(groupKey, current);
              return current;
            })()
          : undefined;
      const sharedNewNurseDailyBandCounts =
        effectiveMode === 'rotation' &&
        effectiveGenerationRule.separateNewNursesByShift
          ? (() => {
              const current =
                rotationNewNurseDailyBandCountsByGroup.get(groupKey) ||
                Array.from({ length: monthDates.length }, () => ({
                  day: 0,
                  evening: 0,
                  night: 0,
                }));
              rotationNewNurseDailyBandCountsByGroup.set(groupKey, current);
              return current;
            })()
          : undefined;
      const sharedWeekendAssignmentCounts =
        effectiveMode === 'rotation' &&
        effectiveGenerationRule.distributeWeekendShifts
          ? (() => {
              const current =
                weekendWorkCountsByGroup.get(groupKey) ||
                Array.from({ length: Math.max(totalStaffCount, 1) }, () => 0);
              if (current.length < totalStaffCount) {
                current.push(
                  ...Array.from({ length: totalStaffCount - current.length }, () => 0)
                );
              }
              weekendWorkCountsByGroup.set(groupKey, current);
              return current;
            })()
          : undefined;
      const sharedHolidayAssignmentCounts =
        effectiveMode === 'rotation' &&
        effectiveGenerationRule.distributeHolidayShifts
          ? (() => {
              const current =
                holidayWorkCountsByGroup.get(groupKey) ||
                Array.from({ length: Math.max(totalStaffCount, 1) }, () => 0);
              if (current.length < totalStaffCount) {
                current.push(
                  ...Array.from({ length: totalStaffCount - current.length }, () => 0)
                );
              }
              holidayWorkCountsByGroup.set(groupKey, current);
              return current;
            })()
          : undefined;

      const assignments =
        effectiveMode === 'rotation'
          ? buildRuleAwareRotationAssignments({
              monthDates,
              shiftMap,
              shiftIds: allowedShiftIds,
              staffIndex: groupMemberIndex,
              rule: effectiveGenerationRule,
              nightCountRange: {
                min: staffConfig?.minNightShiftCount || 0,
                max: staffConfig?.maxNightShiftCount || 0,
              },
              sharedDailyBandCounts,
              sharedNewNurseDailyBandCounts,
              totalStaffCount,
              weekendAssignmentCounts: sharedWeekendAssignmentCounts,
              holidayAssignmentCounts: sharedHolidayAssignmentCounts,
              blockedDateSet,
              holidayDateSet,
              isNewNurse,
              teamDailyBandCounts,
              staffConfig,
            })
          : buildProgrammaticAssignments({
              monthDates,
              shiftMap,
              cycle: buildProgrammaticCycle(
                effectiveMode,
                allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
                shiftMap
              ),
              staffIndex: groupMemberIndex,
              mode: effectiveMode,
              blockedDateSet,
              teamDailyBandCounts,
            });

      if (resolvedGroup) {
        groupUsage.set(resolvedGroup.label, (groupUsage.get(resolvedGroup.label) || 0) + 1);
      }

      return {
        staffId: String(entry.staff.id),
        modeLabel: resolvedGroup
          ? `${resolvedGroup.label} / ${
              PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === effectiveMode)?.label ||
              effectiveMode
            }`
          : PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === effectiveMode)?.label ||
            '기본 패턴',
        rationale: resolvedGroup
          ? `${resolvedGroup.label} 그룹 설정에 연결된 근무유형을 기준으로 고정 사이클을 적용했습니다.`
          : '기본 규칙과 선택한 근무유형 순서를 기준으로 자동 사이클을 적용했습니다.',
        assignments,
        effectiveMode,
        allowedShiftIds: allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
        blockedDateSet,
      };
    });

    const coveredStaffPlans = enforceTeamMinimumCoverage({
      staffPlans: generatedStaffPlans,
      monthDates,
      shiftMap,
      rule: effectiveGenerationRule,
    });
    const coveredAndRestedStaffPlans = enforceMinimumMonthlyOffDays({
      staffPlans: coveredStaffPlans,
      monthDates,
      shiftMap,
      rule: effectiveGenerationRule,
    });
    const recoveredStaffPlans = coveredAndRestedStaffPlans.map((plan) => ({
      ...plan,
      assignments: enforceNightRecoveryAssignments(
        plan.assignments,
        shiftMap,
        effectiveGenerationRule.offDaysAfterNight
      ),
    }));
    const ruleBalancedStaffPlans = enforceMaxConsecutiveWorkDays({
      staffPlans: recoveredStaffPlans,
      monthDates,
      shiftMap,
      rule: effectiveGenerationRule,
    });

    const recommendation = {
      summary: '',
      leaveSummary:
        approvedLeaveDayCount > 0
          ? `승인 휴가 ${approvedLeaveRequestCount}건 / ${approvedLeaveDayCount}일 반영`
          : '',
      preferredOffSummary:
        preferredOffDateCount > 0 ? `희망 OFF ${preferredOffDateCount}건 반영` : '',
      teamAnalysis: {
        teamPurpose: selectedPatternProfile
          ? `${selectedPatternProfile.name} 패턴을 기준으로 ${selectedDepartment} 근무표를 생성`
          : `${selectedDepartment} 기본 규칙 패턴으로 근무표를 생성`,
        workMode: selectedPatternProfile
          ? '패턴 + 규칙 기반 자동 생성'
          : '기본 규칙 자동 생성',
        includesNight: selectedPlannerShifts.some((shift) => resolveShiftBand(shift) === 'night'),
        reasoning: [
          selectedPatternProfile
            ? `${selectedPatternProfile.name} 패턴 적용`
            : '기본 교대 패턴 적용',
          selectedGenerationRule
            ? `${selectedGenerationRule.name} 근무규칙 적용`
            : '기본 근무규칙 적용',
        ],
        planningFocus: [
          '전담자와 순환 근무를 분리',
          '나이트 이후 금지 및 OFF 반영',
          '3교대 나이트 최소/최대 기준 반영',
        ],
      },
      staffPlans: ruleBalancedStaffPlans.map((plan) => ({
        staffId: plan.staffId,
        modeLabel: plan.modeLabel,
        rationale: plan.rationale,
        assignments: plan.assignments,
      })),
    };

    recommendation.summary = selectedPatternProfile
      ? `${selectedDepartment} 팀에 "${selectedPatternProfile.name}" 패턴과 "${
          effectiveGenerationRule.name || '기본 근무규칙'
        }" 규칙을 적용해 월간 초안을 생성했습니다. ${Array.from(groupUsage.entries())
          .map(([label, count]) => `${label} ${count}명`)
          .join(', ')}`
      : `${selectedDepartment} 팀에 "${
          effectiveGenerationRule.name || '기본 근무규칙'
        }" 규칙을 적용해 월간 초안을 생성했습니다.`;

    setGeneratedDraft(recommendation);
    setManualAssignments({});
    setManualEditMode(false);
    setGenerationSummary(
      recommendation.summary?.trim() || `${selectedDepartment} 팀 패턴 기반 초안이 적용되었습니다.`
    );
    setGenerationAppliedAt(new Date().toLocaleString('ko-KR'));
    setPendingSnapshotMeta({
      source: 'generated',
      label: `${selectedMonth} ${rosterScopeLabel} 패턴 생성본`,
    });
    toast(
      '저장된 교대방식 패턴과 선택한 근무유형을 기준으로 월간 초안을 생성했습니다. 아래 미리보기에서 확인하세요.',
      'success'
    );
  } catch (error) {
    console.error('패턴 기반 근무표 생성 실패:', error);
    toast(
      `패턴 기반 근무표 생성 중 오류가 발생했습니다.\n${
        error?.message || '알 수 없는 오류'
      }`,
      'error'
    );
  } finally {
    setGenerationLoading(false);
  }
}


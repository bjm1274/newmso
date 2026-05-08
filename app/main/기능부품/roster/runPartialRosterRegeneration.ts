// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
'use client';

import { mergeBlockedDateMaps } from '@/lib/roster-date-utils';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { OFF_SHIFT_TOKEN } from '../근무표자동편성-types';
import {
  buildEmptyCoverageCounts,
  buildInitialConfig,
  buildProgrammaticAssignments,
  buildProgrammaticCycle,
  buildRuleAwareRotationAssignments,
  buildStaffRestrictionBlockedDateSet,
  canAssignPlanShiftAtDate,
  enforceNightRecoveryAssignments,
  getAssignedShiftBand,
  getMonthEndDateKey,
  getRestrictedAllowedShiftIds,
  isStaffNewNurse,
  isSeniorPlannerStaff,
  normalizeGeneratedAssignments,
  resolveShiftBand,
} from '../근무표자동편성-engine';
import { loadRosterBlockedDateContext } from './roster-generation-actions';

type RunPartialRosterRegenerationParams = Record<string, any>;

export async function runPartialRosterRegeneration({
  generatedDraft,
  defaultPlannerMode,
  defaultShiftOrder,
  defaultShiftPool,
  effectiveTargetStaffConfigs,
  enabledTargetStaffs,
  fairnessScoreboard,
  monthDates,
  partialRegenerationEndDate,
  partialRegenerationMode,
  partialRegenerationStaffId,
  partialRegenerationStartDate,
  preferredOffSelections,
  previewGenerationRule,
  previewRows,
  rosterScopeLabel,
  selectedPlannerShifts,
  selectedMonth,
  setGeneratedDraft,
  setGenerationSummary,
  setManualAssignments,
  setPartialRegenerationLoading,
  setPendingSnapshotMeta,
  setSelectedManualCell,
  staffPlanningMeta,
  toast,
}: RunPartialRosterRegenerationParams) {
  const startIndex = monthDates.indexOf(partialRegenerationStartDate);
  const endIndex = monthDates.indexOf(partialRegenerationEndDate);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    toast('부분 재생성 범위를 다시 확인하세요.', 'warning');
    return;
  }

  setPartialRegenerationLoading(true);
  try {
    if (!generatedDraft?.staffPlans?.length || previewRows.length === 0) {
      toast('먼저 근무표를 생성한 뒤 부분 재생성을 실행하세요.', 'warning');
      return;
    }
    if (selectedPlannerShifts.length === 0) {
      toast('부분 재생성에 사용할 근무형태가 없습니다.', 'warning');
      return;
    }
    if (!previewRows.length || !staffPlanningMeta.length) {
      toast('부분 재생성에 필요한 초안 데이터가 없습니다.', 'warning');
      return;
    }

    const shiftMap = new Map(selectedPlannerShifts.map((shift) => [shift.id, shift]));
    const validShiftIds = new Set(selectedPlannerShifts.map((shift) => shift.id));
    const effectiveGenerationRule =
      partialRegenerationMode === 'preserve_pattern'
        ? {
            ...previewGenerationRule,
            generationStyle: 'stable',
          }
        : partialRegenerationMode === 'rebalance_fairness'
          ? {
              ...previewGenerationRule,
              generationStyle: 'balanced',
              distributeWeekendShifts: true,
              distributeHolidayShifts: true,
            }
          : previewGenerationRule;
    const holidayDateSet = new Set(
      monthDates.filter((dateKey) => isKoreanPublicHoliday(dateKey))
    );
    const referenceDateKey = getMonthEndDateKey(monthDates);
    const targetStaffIds = partialRegenerationStaffId
      ? [partialRegenerationStaffId]
      : previewRows.map((row) => String(row.staff.id));
    const { blockedDatesByStaff, targetStaffIdSet } = await loadRosterBlockedDateContext({
      monthDates,
      preferredOffSelections,
      targetStaffIds,
    });
    const currentAssignmentsByStaff = new Map(
      previewRows.map((row) => [
        String(row.staff.id),
        row.cells.map((cell) => cell.shiftId),
      ])
    );
    const aiPlanByStaffId = new Map(
      generatedDraft.staffPlans.map((plan) => [String(plan.staffId || ''), plan])
    );
    const metaByStaffId = new Map(staffPlanningMeta.map((meta) => [meta.staffId, meta]));
    const teamDailyBandCounts = monthDates.map(() => buildEmptyCoverageCounts());

    previewRows.forEach((row) => {
      const staffId = String(row.staff.id);
      row.cells.forEach((cell, dateIndex) => {
        const keepCurrentAssignment =
          !targetStaffIdSet.has(staffId) || dateIndex < startIndex || dateIndex > endIndex;
        if (!keepCurrentAssignment) return;
        const band = getAssignedShiftBand(cell.shiftId || '', shiftMap);
        if (band) {
          teamDailyBandCounts[dateIndex][band] += 1;
        }
      });
    });

    const fairnessRowByStaffId = new Map(
      fairnessScoreboard.rows.map((row) => [row.staffId, row])
    );
    const planningEntries = enabledTargetStaffs.map((staff, index) => {
      const staffId = String(staff.id);
      const fallbackConfig =
        effectiveTargetStaffConfigs.get(staffId) ||
        buildInitialConfig(
          staff,
          index,
          defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
          monthDates.length
        );
      const meta =
        metaByStaffId.get(staffId) || {
          staff,
          staffId,
          config: fallbackConfig,
          resolvedGroup: null,
          resolvedGroupMode: defaultPlannerMode,
          resolvedGroupLabel: '',
          resolvedGroupReason: '',
          dedicatedBand: null,
          coverageRoleTags: [],
          coverageRoleMatcherText: '',
          isSeniorStaff: isSeniorPlannerStaff(staff),
          isNewNurse: isStaffNewNurse(staff, referenceDateKey),
        };
      const groupKey = meta.resolvedGroup?.key || `default-${defaultPlannerMode}`;
      return { staff, staffId, meta, groupKey };
    });
    const orderedPlanningEntries =
      partialRegenerationMode === 'rebalance_fairness'
        ? [...planningEntries].sort((left, right) => {
            const leftRow = fairnessRowByStaffId.get(left.staffId);
            const rightRow = fairnessRowByStaffId.get(right.staffId);
            const leftLoad =
              (leftRow?.nightCount || 0) +
              (leftRow?.weekendWorkCount || 0) +
              (leftRow?.holidayWorkCount || 0);
            const rightLoad =
              (rightRow?.nightCount || 0) +
              (rightRow?.weekendWorkCount || 0) +
              (rightRow?.holidayWorkCount || 0);
            if (leftLoad !== rightLoad) return leftLoad - rightLoad;
            return left.staffId.localeCompare(right.staffId, 'ko');
          })
        : planningEntries;
    const groupSizeMap = new Map();
    orderedPlanningEntries.forEach((entry) => {
      groupSizeMap.set(entry.groupKey, (groupSizeMap.get(entry.groupKey) || 0) + 1);
    });
    const groupMemberIndexMap = new Map();
    const nextPlansByStaffId = new Map(
      previewRows.map((row) => [
        String(row.staff.id),
        {
          staffId: String(row.staff.id),
          modeLabel: metaByStaffId.get(String(row.staff.id))?.resolvedGroupLabel || '부분 재생성',
          rationale: metaByStaffId.get(String(row.staff.id))?.resolvedGroupReason || '',
          assignments: [...row.cells.map((cell) => cell.shiftId)],
        },
      ])
    );

    orderedPlanningEntries
      .filter((entry) => targetStaffIdSet.has(entry.staffId))
      .forEach((entry) => {
        const { staff, staffId, meta, groupKey } = entry;
        const currentAssignments =
          currentAssignmentsByStaff.get(staffId) ||
          normalizeGeneratedAssignments(
            aiPlanByStaffId.get(staffId)?.assignments,
            monthDates,
            validShiftIds
          );
        const restrictionBlockedDateSet = buildStaffRestrictionBlockedDateSet(
          meta.config,
          monthDates
        );
        const blockedDateSet = mergeBlockedDateMaps(
          blockedDatesByStaff,
          new Map([[staffId, restrictionBlockedDateSet]])
        ).get(staffId);
        const baseAllowedShiftIds = (
          meta.resolvedGroup?.shiftIds.filter((shiftId) => shiftMap.has(shiftId)) ||
          selectedPlannerShifts.map((shift) => shift.id)
        ).filter(Boolean);
        const allowedShiftIds = getRestrictedAllowedShiftIds(
          baseAllowedShiftIds,
          meta.config.blockedShiftBands,
          shiftMap
        );
        const rawMode = meta.resolvedGroup?.mode || defaultPlannerMode;
        const effectiveMode =
          !effectiveGenerationRule.fixedShiftOnly && rawMode !== 'rotation'
            ? 'rotation'
            : rawMode;
        const groupMemberIndex = groupMemberIndexMap.get(groupKey) || 0;
        groupMemberIndexMap.set(groupKey, groupMemberIndex + 1);
        const tempTeamDailyBandCounts = teamDailyBandCounts.map((counts) => ({ ...counts }));
        const generatedAssignments =
          effectiveMode === 'rotation'
            ? buildRuleAwareRotationAssignments({
                monthDates,
                shiftMap,
                shiftIds: allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
                staffIndex: groupMemberIndex,
                rule: effectiveGenerationRule,
                nightCountRange: {
                  min: meta.config.minNightShiftCount || 0,
                  max: meta.config.maxNightShiftCount || 0,
                },
                totalStaffCount: groupSizeMap.get(groupKey) || 1,
                blockedDateSet,
                holidayDateSet,
                isNewNurse: meta.isNewNurse,
                teamDailyBandCounts: tempTeamDailyBandCounts,
                staffConfig: meta.config,
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
                teamDailyBandCounts: tempTeamDailyBandCounts,
              });
        const recoveredAssignments = enforceNightRecoveryAssignments(
          generatedAssignments,
          shiftMap,
          effectiveGenerationRule.offDaysAfterNight
        );
        const existingPlan = nextPlansByStaffId.get(staffId);
        const mergedAssignments = [...currentAssignments];

        for (let dateIndex = startIndex; dateIndex <= endIndex; dateIndex += 1) {
          const generatedShiftId = recoveredAssignments[dateIndex] || OFF_SHIFT_TOKEN;
          const currentShiftId = currentAssignments[dateIndex] || OFF_SHIFT_TOKEN;
          let nextShiftId = generatedShiftId;

          if (
            partialRegenerationMode === 'minimize_changes' &&
            currentShiftId !== generatedShiftId
          ) {
            const currentIsAllowed =
              currentShiftId === OFF_SHIFT_TOKEN ||
              (allowedShiftIds.includes(currentShiftId) &&
                canAssignPlanShiftAtDate({
                  plan: {
                    staffId,
                    modeLabel: existingPlan?.modeLabel || meta.resolvedGroupLabel || '부분 재생성',
                    rationale: existingPlan?.rationale || meta.resolvedGroupReason || '',
                    assignments: [...mergedAssignments],
                    effectiveMode,
                    allowedShiftIds:
                      allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
                    blockedDateSet,
                  },
                  dateIndex,
                  nextShiftId: currentShiftId,
                  monthDates,
                  shiftMap,
                  rule: effectiveGenerationRule,
                }));

            if (currentIsAllowed) {
              nextShiftId = currentShiftId;
            }
          }

          mergedAssignments[dateIndex] = nextShiftId;
          const band = getAssignedShiftBand(nextShiftId, shiftMap);
          if (band) {
            teamDailyBandCounts[dateIndex][band] += 1;
          }
        }

        if (existingPlan) {
          nextPlansByStaffId.set(staffId, {
            ...existingPlan,
            assignments: mergedAssignments,
          });
        }
      });

    setGeneratedDraft({
      ...generatedDraft,
      staffPlans: generatedDraft.staffPlans.map((plan) => {
        const updatedPlan = nextPlansByStaffId.get(String(plan.staffId || ''));
        return updatedPlan || plan;
      }),
    });
    setManualAssignments((prev) => {
      const nextEntries = Object.entries(prev).filter(([assignmentKey]) => {
        const separatorIndex = assignmentKey.indexOf('::');
        if (separatorIndex === -1) return true;
        const staffId = assignmentKey.slice(0, separatorIndex);
        const date = assignmentKey.slice(separatorIndex + 2);
        if (partialRegenerationStaffId && staffId !== partialRegenerationStaffId) {
          return true;
        }
        const dateIndex = monthDates.indexOf(date);
        return dateIndex < startIndex || dateIndex > endIndex;
      });
      return Object.fromEntries(nextEntries);
    });
    setSelectedManualCell(null);
    setGenerationSummary('\uC120\uD0DD\uD55C \uBC94\uC704\uB9CC \uB2E4\uC2DC \uC0DD\uC131\uD588\uC2B5\uB2C8\uB2E4.');
    setPendingSnapshotMeta({
      source: 'generated',
      label: `${selectedMonth} ${rosterScopeLabel} \uBD80\uBD84 \uC7AC\uC0DD\uC131\uBCF8`,
    });
    toast('\uC120\uD0DD\uD55C \uBC94\uC704\uB97C \uB2E4\uC2DC \uC0DD\uC131\uD588\uC2B5\uB2C8\uB2E4.', 'success');
  } catch (error) {
    console.error('부분 재생성 실패:', error);
    toast('부분 재생성 중 오류가 발생했습니다.', 'error');
  } finally {
    setPartialRegenerationLoading(false);
  }
}


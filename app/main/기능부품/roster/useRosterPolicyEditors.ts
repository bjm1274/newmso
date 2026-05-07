// @ts-nocheck
'use client';

import { useCallback, useMemo } from 'react';
import { deleteRosterPolicyStorageRecord } from '@/lib/roster-policy-storage';
import {
  buildDefaultPatternProfile,
  type RosterPatternProfile,
  type RosterPatternStaffGroup,
} from '@/lib/roster-pattern-profiles';
import {
  buildDefaultGenerationRule,
  type RosterGenerationRule,
} from '@/lib/roster-generation-rules';
import { buildPlannerPatternPreviewGroups } from './buildPlannerPatternPreviewGroups';
import type {
  EditableGenerationRuleField,
  PlannerPatternPreviewGroup,
} from '../근무표자동편성-types';
import {
  getTeamRecommendationCategory,
} from '../근무표자동편성-engine';

type UseRosterPolicyEditorsParams = Record<string, any>;

export function useRosterPolicyEditors({
  canManageRosterPolicies,
  defaultPlannerMode,
  enabledTargetStaffs,
  generationRuleDraft,
  patternDraft,
  persistGenerationRules,
  persistPatternProfiles,
  savedGenerationRules,
  savedPatternProfiles,
  selectedPlannerShifts,
  selectedCompany,
  selectedCompanyId,
  selectedDepartment,
  selectedGenerationRuleId,
  selectedPatternProfile,
  selectedPatternProfileId,
  setGenerationRuleDraft,
  setPatternDraft,
  setSavedGenerationRules,
  setSavedPatternProfiles,
  setSelectedGenerationRuleId,
  setSelectedPatternProfileId,
  syncGenerationRuleToSharedStorage,
  syncPatternProfileToSharedStorage,
  toast,
  workShifts,
}: UseRosterPolicyEditorsParams) {
  const plannerPatternPreviewGroups = useMemo<PlannerPatternPreviewGroup[]>(() => {
    return buildPlannerPatternPreviewGroups({
      defaultPlannerMode,
      enabledTargetStaffs,
      selectedPlannerShifts,
      selectedPatternProfile,
      workShifts,
    });
  }, [defaultPlannerMode, enabledTargetStaffs, selectedPlannerShifts, selectedPatternProfile, workShifts]);

  const resetPatternDraft = () => {
    setPatternDraft(buildDefaultPatternProfile(selectedCompany, selectedCompanyId));
  };

  const resetGenerationRuleDraft = () => {
    setGenerationRuleDraft(buildDefaultGenerationRule(selectedCompany, selectedCompanyId));
  };

  const updatePatternDraftField = (
    field: 'name' | 'description' | 'teamKeywords',
    value: string
  ) => {
    setPatternDraft((prev) => {
      if (field === 'teamKeywords') {
        return {
          ...prev,
          teamKeywords: value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const applyGenerationRuleDraftFieldUpdate = (
    prev: RosterGenerationRule,
    field: EditableGenerationRuleField,
    value: string | number | boolean
  ) => {
    if (field === 'teamKeywords') {
      return {
        ...prev,
        teamKeywords: String(value || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }

    if (
      field === 'maxConsecutiveEveningShifts' ||
      field === 'offDaysAfterNight' ||
      field === 'nightBlockSize' ||
      field === 'minRotationNightCount' ||
      field === 'maxRotationNightCount' ||
      field === 'minMonthlyOffDays' ||
      field === 'maxConsecutiveWorkDays' ||
      field === 'maxConsecutiveWeekendWorkDays' ||
      field === 'minDayStaff' ||
      field === 'minEveningStaff' ||
      field === 'minNightStaff' ||
      field === 'weekendMinDayStaff' ||
      field === 'weekendMinEveningStaff' ||
      field === 'weekendMinNightStaff' ||
      field === 'holidayMinDayStaff' ||
      field === 'holidayMinEveningStaff' ||
      field === 'holidayMinNightStaff' ||
      field === 'minSeniorDayStaff' ||
      field === 'minSeniorEveningStaff' ||
      field === 'minSeniorNightStaff' ||
      field === 'minDedicatedDayStaff' ||
      field === 'minDedicatedEveningStaff' ||
      field === 'minDedicatedNightStaff'
    ) {
      return {
        ...prev,
        [field]: Math.max(0, Math.floor(Number(value) || 0)),
      };
    }

    return {
      ...prev,
      [field]: value,
    };
  };

  const updateGenerationRuleDraftField = (
    field: EditableGenerationRuleField,
    value: string | number | boolean
  ) => {
    setGenerationRuleDraft((prev) => applyGenerationRuleDraftFieldUpdate(prev, field, value));
  };


  const updatePatternGroup = useCallback((
    groupId: string,
    patch: Partial<RosterPatternStaffGroup> & { matchKeywordsText?: string }
  ) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          ...patch,
          matchKeywords:
            patch.matchKeywordsText !== undefined
              ? patch.matchKeywordsText
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean)
              : patch.matchKeywords ?? group.matchKeywords,
        };
      }),
    }));
  }, []);

  const togglePatternGroupShift = useCallback((groupId: string, shiftId: string) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          shiftIds: group.shiftIds.includes(shiftId)
            ? group.shiftIds.filter((currentId) => currentId !== shiftId)
            : [...group.shiftIds, shiftId],
        };
      }),
    }));
  }, []);

  const addPatternGroup = () => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: [
        ...prev.staffGroups,
        {
          id: `group-${Date.now()}`,
      label: `그룹 ${prev.staffGroups.length + 1}`,
          mode: 'rotation',
          matchKeywords: [],
          shiftIds: [],
          note: '',
        },
      ],
    }));
  };

  const removePatternGroup = useCallback((groupId: string) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.filter((group) => group.id !== groupId),
    }));
  }, []);

  const editPatternProfile = useCallback((profile: RosterPatternProfile) => {
    setPatternDraft({
      ...profile,
      teamKeywords: [...profile.teamKeywords],
      staffGroups: profile.staffGroups.map((group) => ({
        ...group,
        matchKeywords: [...group.matchKeywords],
        shiftIds: [...group.shiftIds],
      })),
    });
  }, []);

  const savePatternProfile = () => {
    if (!canManageRosterPolicies) {
      toast('근무 패턴 저장은 관리자 전용입니다.', 'warning');
      return;
    }
    const nextName = patternDraft.name.trim();
    if (!nextName) {
      toast('패턴 이름을 입력하세요.', 'warning');
      return;
    }

    if (patternDraft.teamKeywords.length === 0) {
      toast('적용할 팀 키워드를 한 개 이상 입력하세요.', 'warning');
      return;
    }

    if (patternDraft.staffGroups.length === 0) {
      toast('직원 그룹을 한 개 이상 만들어 주세요.');
      return;
    }

    if (patternDraft.staffGroups.some((group) => group.shiftIds.length === 0)) {
      toast('각 그룹마다 연결할 근무유형을 한 개 이상 선택하세요.', 'warning');
      return;
    }

    const nextProfile: RosterPatternProfile = {
      ...patternDraft,
      name: nextName,
      companyName: selectedCompany,
      companyId: selectedCompanyId,
      description: patternDraft.description.trim(),
      updatedAt: new Date().toISOString(),
    };

    const nextProfiles = [nextProfile, ...savedPatternProfiles.filter((profile) => profile.id !== nextProfile.id)];
    setSavedPatternProfiles(nextProfiles);
    persistPatternProfiles(nextProfiles);
    setSelectedPatternProfileId(nextProfile.id);
    resetPatternDraft();
    void syncPatternProfileToSharedStorage(nextProfile).catch((error) => {
      console.error('근무 패턴 공용 저장 실패:', error);
      toast('근무 패턴을 공용 저장소와 동기화하지 못했습니다. 현재 브라우저에는 저장되었습니다.', 'warning');
    });
    toast(`"${nextName}" 교대방식 패턴을 저장했습니다.`, 'success');
  };

  const deletePatternProfile = (profileId: string) => {
    if (!canManageRosterPolicies) {
      toast('근무 패턴 삭제는 관리자 전용입니다.', 'warning');
      return;
    }
    const nextProfiles = savedPatternProfiles.filter((profile) => profile.id !== profileId);
    setSavedPatternProfiles(nextProfiles);
    persistPatternProfiles(nextProfiles);
    if (selectedPatternProfileId === profileId) {
      setSelectedPatternProfileId('');
    }
    if (patternDraft.id === profileId) {
      resetPatternDraft();
    }
    void deleteRosterPolicyStorageRecord('pattern_profile', profileId).catch((error) => {
      console.error('근무 패턴 공용 삭제 실패:', error);
      toast('근무 패턴 공용 저장소 삭제에 실패했습니다. 현재 브라우저 기준으로는 삭제했습니다.', 'warning');
    });
  };

  const editGenerationRule = useCallback((rule: RosterGenerationRule) => {
    setGenerationRuleDraft({
      ...rule,
      teamKeywords: [...rule.teamKeywords],
    });
  }, []);

  const saveGenerationRule = () => {
    if (!canManageRosterPolicies) {
      toast('근무 규칙 저장은 관리자 전용입니다.', 'warning');
      return;
    }
    const nextName = generationRuleDraft.name.trim();
    if (!nextName) {
      toast('근무규칙 이름을 입력해 주세요.', 'warning');
      return;
    }

    if (generationRuleDraft.teamKeywords.length === 0) {
      toast('적용할 팀 키워드를 한 개 이상 입력해 주세요.', 'warning');
      return;
    }

    const nextRule: RosterGenerationRule = {
      ...generationRuleDraft,
      name: nextName,
      companyName: selectedCompany,
      companyId: selectedCompanyId,
      description: generationRuleDraft.description.trim(),
      maxConsecutiveEveningShifts: Math.max(
        0,
        Math.min(7, Math.floor(generationRuleDraft.maxConsecutiveEveningShifts || 0))
      ),
      offDaysAfterNight: Math.max(0, Math.min(5, Math.floor(generationRuleDraft.offDaysAfterNight || 0))),
      nightBlockSize: Math.max(1, Math.min(5, Math.floor(generationRuleDraft.nightBlockSize || 1))),
      minRotationNightCount: Math.max(
        0,
        Math.min(31, Math.floor(generationRuleDraft.minRotationNightCount || 0))
      ),
      maxRotationNightCount: Math.max(
        Math.max(0, Math.min(31, Math.floor(generationRuleDraft.minRotationNightCount || 0))),
        Math.min(31, Math.floor(generationRuleDraft.maxRotationNightCount || 0))
      ),
      minMonthlyOffDays: Math.max(
        7,
        Math.min(31, Math.floor(generationRuleDraft.minMonthlyOffDays || 7))
      ),
      maxConsecutiveWorkDays: Math.max(
        2,
        Math.min(7, Math.floor(generationRuleDraft.maxConsecutiveWorkDays || 5))
      ),
      maxConsecutiveWeekendWorkDays: Math.max(
        0,
        Math.min(4, Math.floor(generationRuleDraft.maxConsecutiveWeekendWorkDays || 0))
      ),
      minDayStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minDayStaff || 0))),
      minEveningStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minEveningStaff || 0))),
      minNightStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minNightStaff || 0))),
      weekendMinDayStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.weekendMinDayStaff || 0))),
      weekendMinEveningStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.weekendMinEveningStaff || 0))),
      weekendMinNightStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.weekendMinNightStaff || 0))),
      holidayMinDayStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.holidayMinDayStaff || 0))),
      holidayMinEveningStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.holidayMinEveningStaff || 0))),
      holidayMinNightStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.holidayMinNightStaff || 0))),
      dateCoverageOverrides: (generationRuleDraft.dateCoverageOverrides || [])
        .map((entry, index) => ({
          id: entry.id || `date-coverage-${index + 1}`,
          date: String(entry.date || '').slice(0, 10),
          minDayStaff: Math.max(0, Math.min(20, Math.floor(entry.minDayStaff || 0))),
          minEveningStaff: Math.max(0, Math.min(20, Math.floor(entry.minEveningStaff || 0))),
          minNightStaff: Math.max(0, Math.min(20, Math.floor(entry.minNightStaff || 0))),
        }))
        .filter(
          (entry) =>
            /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
            (entry.minDayStaff > 0 || entry.minEveningStaff > 0 || entry.minNightStaff > 0)
        ),
      updatedAt: new Date().toISOString(),
    };

    const nextRules = [nextRule, ...savedGenerationRules.filter((rule) => rule.id !== nextRule.id)];
    setSavedGenerationRules(nextRules);
    persistGenerationRules(nextRules);
    setSelectedGenerationRuleId(nextRule.id);
    resetGenerationRuleDraft();
    void syncGenerationRuleToSharedStorage(nextRule).catch((error) => {
      console.error('근무 규칙 공용 저장 실패:', error);
      toast('근무 규칙을 공용 저장소와 동기화하지 못했습니다. 현재 브라우저에는 저장되었습니다.', 'warning');
    });
    toast(`"${nextName}" 근무규칙을 저장했습니다.`, 'success');
  };

  const migrateLegacyGenerationRules = async () => {
    if (!canManageRosterPolicies) {
      toast('근무 규칙 보정은 관리자 전용입니다.', 'warning');
      return;
    }

    const changedRules: RosterGenerationRule[] = [];
    const nextRules = savedGenerationRules.map((rule) => {
      if (selectedCompany && rule.companyName && rule.companyName !== selectedCompany) {
        return rule;
      }

      const normalizedTeamKeywords =
        rule.teamKeywords.length > 0
          ? rule.teamKeywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
          : selectedDepartment
            ? [selectedDepartment]
            : [];
      const isWardRule = normalizedTeamKeywords.some(
        (keyword) => getTeamRecommendationCategory(keyword) === 'ward'
      );
      if (!isWardRule) return rule;

      const nextRule: RosterGenerationRule = {
        ...rule,
        teamKeywords: normalizedTeamKeywords,
        generationStyle: rule.generationStyle === 'balanced' ? 'variety' : rule.generationStyle,
        maxConsecutiveEveningShifts: 0,
        nightBlockSize: Math.max(3, Math.floor(rule.nightBlockSize || 0)),
        minMonthlyOffDays: Math.max(8, Math.floor(rule.minMonthlyOffDays || 0)),
        distributeWeekendShifts: true,
        distributeHolidayShifts: true,
        updatedAt: new Date().toISOString(),
      };

      const hasChanged =
        nextRule.generationStyle !== rule.generationStyle ||
        nextRule.maxConsecutiveEveningShifts !== rule.maxConsecutiveEveningShifts ||
        nextRule.nightBlockSize !== rule.nightBlockSize ||
        nextRule.minMonthlyOffDays !== rule.minMonthlyOffDays ||
        nextRule.distributeWeekendShifts !== rule.distributeWeekendShifts ||
        nextRule.distributeHolidayShifts !== rule.distributeHolidayShifts ||
        nextRule.teamKeywords.join('|') !== rule.teamKeywords.join('|');
      if (!hasChanged) return rule;

      changedRules.push(nextRule);
      return nextRule;
    });

    if (changedRules.length === 0) {
      toast('보정할 병동 근무 규칙이 없습니다.', 'success');
      return;
    }

    setSavedGenerationRules(nextRules);
    persistGenerationRules(nextRules);

    if (selectedGenerationRuleId) {
      const updatedSelectedRule = nextRules.find((rule) => rule.id === selectedGenerationRuleId);
      if (!updatedSelectedRule) {
        setSelectedGenerationRuleId('');
      }
    }
    if (generationRuleDraft.id) {
      const updatedDraftRule = nextRules.find((rule) => rule.id === generationRuleDraft.id);
      if (updatedDraftRule) {
        setGenerationRuleDraft({
          ...updatedDraftRule,
          teamKeywords: [...updatedDraftRule.teamKeywords],
        });
      }
    }

    const syncResults = await Promise.allSettled(
      changedRules.map((rule) => syncGenerationRuleToSharedStorage(rule))
    );
    if (syncResults.some((result) => result.status === 'rejected')) {
      console.error(
        '근무 규칙 일괄 보정 공용 저장 실패:',
        syncResults
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason)
      );
      toast(
        `병동 규칙 ${changedRules.length}개를 보정했지만 일부 공용 저장에 실패했습니다. 현재 브라우저 기준으로는 적용했습니다.`,
        'warning'
      );
      return;
    }

    toast(`병동 규칙 ${changedRules.length}개를 현재 추천 기본값으로 보정했습니다.`, 'success');
  };

  const deleteGenerationRule = (ruleId: string) => {
    if (!canManageRosterPolicies) {
      toast('근무 규칙 삭제는 관리자 전용입니다.', 'warning');
      return;
    }
    const nextRules = savedGenerationRules.filter((rule) => rule.id !== ruleId);
    setSavedGenerationRules(nextRules);
    persistGenerationRules(nextRules);
    if (selectedGenerationRuleId === ruleId) {
      setSelectedGenerationRuleId('');
    }
    if (generationRuleDraft.id === ruleId) {
      resetGenerationRuleDraft();
    }
    void deleteRosterPolicyStorageRecord('generation_rule', ruleId).catch((error) => {
      console.error('근무 규칙 공용 삭제 실패:', error);
      toast('근무 규칙 공용 저장소 삭제에 실패했습니다. 현재 브라우저 기준으로는 삭제했습니다.', 'warning');
    });
  };


  return {
    addPatternGroup,
    applyGenerationRuleDraftFieldUpdate,
    deleteGenerationRule,
    deletePatternProfile,
    editGenerationRule,
    editPatternProfile,
    migrateLegacyGenerationRules,
    plannerPatternPreviewGroups,
    removePatternGroup,
    resetGenerationRuleDraft,
    resetPatternDraft,
    saveGenerationRule,
    savePatternProfile,
    togglePatternGroupShift,
    updateGenerationRuleDraftField,
    updatePatternDraftField,
    updatePatternGroup,
  };
}


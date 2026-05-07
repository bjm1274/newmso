
import { normalizeCoverageRoleTags } from '@/lib/roster-role-tags';

export function useRosterWizardRuleDraftActions({
  applyGenerationRuleDraftFieldUpdate,
  monthDates,
  setWizardRuleDraft,
}: any) {
  const updateWizardRuleDraftField = (field: any, value: string | number | boolean) => {
    setWizardRuleDraft((prev: any) =>
      applyGenerationRuleDraftFieldUpdate(prev, field, value)
    );
  };

  const applyWizardNightBlockPreset = (preset: any) => {
    setWizardRuleDraft((prev: any) => ({
      ...prev,
      nightBlockSize: preset.nightBlockSize,
      offDaysAfterNight: preset.offDaysAfterNight,
    }));
  };

  const addWizardDateCoverageOverride = () => {
    setWizardRuleDraft((prev: any) => ({
      ...prev,
      dateCoverageOverrides: [
        ...(prev.dateCoverageOverrides || []),
        {
          id: `date-coverage-${Date.now()}-${(prev.dateCoverageOverrides || []).length + 1}`,
          date: monthDates[0] || '',
          minDayStaff: 0,
          minEveningStaff: 0,
          minNightStaff: 0,
        },
      ],
    }));
  };

  const updateWizardDateCoverageOverride = (
    overrideId: string,
    field: 'date' | 'minDayStaff' | 'minEveningStaff' | 'minNightStaff',
    value: string | number
  ) => {
    setWizardRuleDraft((prev: any) => ({
      ...prev,
      dateCoverageOverrides: (prev.dateCoverageOverrides || []).map((entry: any) => {
        if (entry.id !== overrideId) return entry;
        if (field === 'date') {
          return {
            ...entry,
            date: String(value || '').slice(0, 10),
          };
        }
        return {
          ...entry,
          [field]: Math.max(0, Math.floor(Number(value) || 0)),
        };
      }),
    }));
  };

  const removeWizardDateCoverageOverride = (overrideId: string) => {
    setWizardRuleDraft((prev: any) => ({
      ...prev,
      dateCoverageOverrides: (prev.dateCoverageOverrides || []).filter(
        (entry: any) => entry.id !== overrideId
      ),
    }));
  };

  const addWizardRoleCoverageRule = () => {
    setWizardRuleDraft((prev: any) => {
      const nextIndex = prev.roleCoverageRules.length + 1;
      return {
        ...prev,
        roleCoverageRules: [
          ...prev.roleCoverageRules,
          {
            id: `role-slot-${Date.now()}-${nextIndex}`,
            label: `역할 슬롯 ${nextIndex}`,
            keywords: [],
            minDayStaff: 0,
            minEveningStaff: 0,
            minNightStaff: 0,
          },
        ],
      };
    });
  };

  const updateWizardRoleCoverageRule = (
    ruleId: string,
    field: 'label' | 'keywords' | 'minDayStaff' | 'minEveningStaff' | 'minNightStaff',
    value: string | number
  ) => {
    setWizardRuleDraft((prev: any) => ({
      ...prev,
      roleCoverageRules: prev.roleCoverageRules.map((rule: any) => {
        if (rule.id !== ruleId) return rule;
        if (field === 'keywords') {
          return {
            ...rule,
            keywords: normalizeCoverageRoleTags(String(value || '').split(',')),
          };
        }
        if (
          field === 'minDayStaff' ||
          field === 'minEveningStaff' ||
          field === 'minNightStaff'
        ) {
          return {
            ...rule,
            [field]: Math.max(0, Math.floor(Number(value) || 0)),
          };
        }
        return {
          ...rule,
          [field]: String(value || ''),
        };
      }),
    }));
  };

  const removeWizardRoleCoverageRule = (ruleId: string) => {
    setWizardRuleDraft((prev: any) => ({
      ...prev,
      roleCoverageRules: prev.roleCoverageRules.filter((rule: any) => rule.id !== ruleId),
    }));
  };

  return {
    addWizardDateCoverageOverride,
    addWizardRoleCoverageRule,
    applyWizardNightBlockPreset,
    removeWizardDateCoverageOverride,
    removeWizardRoleCoverageRule,
    updateWizardDateCoverageOverride,
    updateWizardRoleCoverageRule,
    updateWizardRuleDraftField,
  };
}

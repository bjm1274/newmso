
import { useEffect } from 'react';
import {
  normalizePreferredOffSelections,
  type PreferredOffSelectionMap,
} from '@/lib/roster-date-utils';
import type { StoredStaffNightRangeMap } from '../근무표자동편성-types';
import {
  buildInitialConfig,
  clampNightShiftCount,
  normalizeStoredStaffNightRanges,
} from '../근무표자동편성-engine';

export function useRosterScopeLocalStorage({
  defaultShiftOrder,
  defaultShiftPool,
  effectiveTargetStaffConfigs,
  monthDates,
  monthDateSet,
  preferredOffSelections,
  preferredOffStorageKey,
  selectedCompany,
  selectedDepartment,
  setPreferredOffSelections,
  setStaffConfigs,
  staffNightRangeStorageKey,
  targetStaffs,
}: any) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) {
      setPreferredOffSelections({});
      return;
    }

    try {
      const raw = window.localStorage.getItem(preferredOffStorageKey);
      if (!raw) {
        setPreferredOffSelections({});
        return;
      }

      const parsed = JSON.parse(raw);
      setPreferredOffSelections(
        normalizePreferredOffSelections(parsed, monthDateSet)
      );
    } catch (error) {
      console.error('희망 OFF 로드 실패:', error);
      setPreferredOffSelections({});
    }
  }, [monthDateSet, preferredOffStorageKey, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) return;

    try {
      const normalized: PreferredOffSelectionMap = normalizePreferredOffSelections(
        preferredOffSelections,
        monthDateSet
      );
      if (Object.keys(normalized).length === 0) {
        window.localStorage.removeItem(preferredOffStorageKey);
        return;
      }

      window.localStorage.setItem(
        preferredOffStorageKey,
        JSON.stringify(normalized)
      );
    } catch (error) {
      console.error('희망 OFF 저장 실패:', error);
    }
  }, [
    monthDateSet,
    preferredOffSelections,
    preferredOffStorageKey,
    selectedCompany,
    selectedDepartment,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) return;

    const targetStaffIdSet = new Set<string>(targetStaffs.map((staff: any) => String(staff.id)));
    try {
      const raw = window.localStorage.getItem(staffNightRangeStorageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const normalized = normalizeStoredStaffNightRanges(
        parsed,
        targetStaffIdSet,
        monthDates.length
      );
      if (Object.keys(normalized).length === 0) return;

      setStaffConfigs((prev: any) => {
        const next = { ...prev };
        targetStaffs.forEach((staff: any, index: number) => {
          const staffId = String(staff.id);
          const stored = normalized[staffId];
          if (!stored) return;
          const current =
            next[staffId] ||
            buildInitialConfig(
              staff,
              index,
              defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
              monthDates.length
            );
          next[staffId] = {
            ...current,
            minNightShiftCount: stored.minNightShiftCount,
            maxNightShiftCount: stored.maxNightShiftCount,
          };
        });
        return next;
      });
    } catch (error) {
      console.error('직원별 야간 범위 로드 실패:', error);
    }
  }, [
    defaultShiftOrder,
    defaultShiftPool,
    monthDates.length,
    selectedCompany,
    selectedDepartment,
    setStaffConfigs,
    staffNightRangeStorageKey,
    targetStaffs,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) return;

    try {
      const normalized: StoredStaffNightRangeMap = {};
      targetStaffs.forEach((staff: any) => {
        const config = effectiveTargetStaffConfigs.get(String(staff.id));
        if (!config) return;
        if (
          (config.minNightShiftCount || 0) <= 0 &&
          (config.maxNightShiftCount || 0) <= 0
        ) {
          return;
        }
        normalized[String(staff.id)] = {
          minNightShiftCount: clampNightShiftCount(
            config.minNightShiftCount || 0,
            monthDates.length
          ),
          maxNightShiftCount: clampNightShiftCount(
            config.maxNightShiftCount || 0,
            monthDates.length
          ),
        };
      });

      if (Object.keys(normalized).length === 0) {
        window.localStorage.removeItem(staffNightRangeStorageKey);
        return;
      }

      window.localStorage.setItem(
        staffNightRangeStorageKey,
        JSON.stringify(normalized)
      );
    } catch (error) {
      console.error('직원별 야간 범위 저장 실패:', error);
    }
  }, [
    effectiveTargetStaffConfigs,
    monthDates.length,
    selectedCompany,
    selectedDepartment,
    staffNightRangeStorageKey,
    targetStaffs,
  ]);
}

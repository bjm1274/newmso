import {
type PreferredOffSelectionMap
} from '@/lib/roster-date-utils';
import { filterRosterShiftsForDepartment } from '@/lib/roster-shift-team-filter';
import {
buildRosterSnapshotStorageKey,
} from '@/lib/roster-snapshot-history';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { assertArray } from '@/lib/type-guards';
import type { StaffMember } from '@/types';
import {
useEffect,
useMemo,
useState,
type Dispatch,
type SetStateAction,
} from 'react';
import {
buildDefaultShiftOrder,
buildDepartmentScopeKey,
buildDepartmentScopeLabel,
buildInitialConfig,
buildPreferredOffStorageKey,
buildStaffNightRangeStorageKey,
getDepartmentName,
getMonthDates,
normalizeShiftName
} from '../\uADFC\uBB34\uD45C\uC790\uB3D9\uD3B8\uC131-engine';
import type {
StaffConfig,
WorkShift
} from '../\uADFC\uBB34\uD45C\uC790\uB3D9\uD3B8\uC131-types';


import { useRosterScopeLocalStorage } from './useRosterScopeLocalStorage';
type UseRosterScopeParams = {
  activeStaffs: StaffMember[];
  companyOptions: string[];
  initialDepartment?: string;
  isAdmin: boolean;
  ownDepartment: string;
  selectedCo: string;
  selectedMonth: string;
  setStaffConfigs: Dispatch<SetStateAction<Record<string, StaffConfig>>>;
  staffConfigs: Record<string, StaffConfig>;
  userCompany?: string;
};

export function useRosterScope({
  activeStaffs,
  companyOptions,
  initialDepartment,
  isAdmin,
  ownDepartment,
  selectedCo,
  selectedMonth,
  setStaffConfigs,
  staffConfigs,
  userCompany,
}: UseRosterScopeParams) {
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [includedDepartments, setIncludedDepartments] = useState<string[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [preferredOffSelections, setPreferredOffSelections] =
    useState<PreferredOffSelectionMap>({});
  const [preferredOffStaffId, setPreferredOffStaffId] = useState('');
  const [preferredOffDate, setPreferredOffDate] = useState('');

  const selectedDepartmentScopeKey = useMemo(
    () => buildDepartmentScopeKey(selectedDepartment, includedDepartments),
    [includedDepartments, selectedDepartment]
  );
  const selectedDepartmentScopeLabel = useMemo(
    () => buildDepartmentScopeLabel(selectedDepartment, includedDepartments),
    [includedDepartments, selectedDepartment]
  );
  const rosterScopeLabel = selectedDepartmentScopeLabel || selectedDepartment;
  const rosterSnapshotStorageKey = useMemo(
    () =>
      buildRosterSnapshotStorageKey(
        selectedCompany,
        selectedDepartmentScopeKey,
        selectedMonth
      ),
    [selectedCompany, selectedDepartmentScopeKey, selectedMonth]
  );

  useEffect(() => {
    if (!companyOptions.length) return;
    if (selectedCo !== '\uC804\uCCB4' && companyOptions.includes(selectedCo)) {
      setSelectedCompany(selectedCo);
      return;
    }
    if (!isAdmin) {
      setSelectedCompany(userCompany || companyOptions[0]);
      return;
    }
    if (!selectedCompany || !companyOptions.includes(selectedCompany)) {
      setSelectedCompany(
        userCompany && userCompany !== 'SY INC.' ? userCompany : companyOptions[0]
      );
    }
  }, [companyOptions, isAdmin, selectedCo, selectedCompany, userCompany]);

  const departmentOptions = useMemo(() => {
    if (!selectedCompany) return [];
    const list = Array.from(
      new Set(
        activeStaffs
          .filter((staff) => staff.company === selectedCompany)
          .map((staff) => getDepartmentName(staff))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));

    if (!isAdmin) {
      return list;
    }
    return ['\uC804\uCCB4 \uBD80\uC11C', ...list];
  }, [activeStaffs, isAdmin, ownDepartment, selectedCompany]);

  useEffect(() => {
    if (!departmentOptions.length) return;
    const forcedDepartment =
      initialDepartment && departmentOptions.includes(initialDepartment)
        ? initialDepartment
        : '';
    const defaultDepartment =
      forcedDepartment ||
      (departmentOptions.includes(ownDepartment)
        ? ownDepartment
        : departmentOptions.find((department) => department !== '\uC804\uCCB4 \uBD80\uC11C') ||
          departmentOptions[0] ||
          '');
    if (forcedDepartment && selectedDepartment !== forcedDepartment) {
      setSelectedDepartment(forcedDepartment);
      return;
    }
    if (
      !selectedDepartment ||
      !departmentOptions.includes(selectedDepartment) ||
      selectedDepartment === '\uC804\uCCB4 \uBD80\uC11C'
    ) {
      setSelectedDepartment(defaultDepartment);
    }
  }, [departmentOptions, initialDepartment, ownDepartment, selectedDepartment]);

  useEffect(() => {
    const validDepartments = new Set(
      departmentOptions.filter(
        (department) =>
          department !== '\uC804\uCCB4 \uBD80\uC11C' && department !== selectedDepartment
      )
    );
    setIncludedDepartments((prev) =>
      prev.filter((department) => validDepartments.has(department))
    );
  }, [departmentOptions, selectedDepartment]);

  useEffect(() => {
    if (!selectedCompany) {
      setWorkShifts([]);
      return;
    }

    const loadWorkShifts = async () => {
      setLoadingShifts(true);
      try {
        const { data, error } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const columns = [
              'id',
              'name',
              'start_time',
              'end_time',
              'description',
              'shift_type',
              'company_name',
              'weekly_work_days',
              'is_weekend_work',
            ].filter((column) => !omittedColumns.has(column));

            return supabase
              .from('work_shifts')
              .select(columns.join(', '))
              .eq('company_name', selectedCompany)
              .eq('is_active', true)
              .order('start_time', { ascending: true });
          },
          ['weekly_work_days', 'is_weekend_work', 'description']
        );

        if (error) throw error;
        setWorkShifts(
          assertArray<WorkShift>(data, 'WorkShift').map((shift) => ({
            ...shift,
            weekly_work_days: shift?.weekly_work_days ?? null,
            is_weekend_work: shift?.is_weekend_work ?? null,
            description: shift?.description ?? '',
          }))
        );
      } catch (error) {
        console.error('근무형태 로드 실패:', error);
        setWorkShifts([]);
      } finally {
        setLoadingShifts(false);
      }
    };

    void loadWorkShifts();
  }, [selectedCompany]);

  const offShift = useMemo(
    () =>
      workShifts.find((shift) =>
        ['\uD734\uBB34', 'off', '\uBE44\uBC88', '\uC2A4\uD504'].some((keyword) =>
          normalizeShiftName(shift.name).includes(keyword)
        )
      ),
    [workShifts]
  );

  const workingShifts = useMemo(
    () => workShifts.filter((shift) => shift.id !== offShift?.id),
    [offShift?.id, workShifts]
  );

  const teamScopedWorkingShifts = useMemo(() => {
    const scopedDepartments = [selectedDepartment, ...includedDepartments]
      .map((department) => String(department || '').trim())
      .filter(Boolean)
      .filter((department, index, list) => list.indexOf(department) === index);
    if (scopedDepartments.length === 0) return workingShifts;

    const scopedShiftMap = new Map<string, WorkShift>();
    scopedDepartments.forEach((department) => {
      filterRosterShiftsForDepartment(department, workingShifts, {
        includeOffShift: false,
      }).forEach((shift) => {
        if (!scopedShiftMap.has(shift.id)) {
          scopedShiftMap.set(shift.id, shift);
        }
      });
    });

    const scopedShifts = [...scopedShiftMap.values()];
    return scopedShifts.length > 0 ? scopedShifts : workingShifts;
  }, [includedDepartments, selectedDepartment, workingShifts]);

  const defaultShiftPool =
    teamScopedWorkingShifts.length > 0 ? teamScopedWorkingShifts : workingShifts;
  const defaultShiftOrder = useMemo(
    () => buildDefaultShiftOrder(defaultShiftPool),
    [defaultShiftPool]
  );
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const monthDateSet = useMemo(() => new Set(monthDates), [monthDates]);
  const preferredOffStorageKey = useMemo(
    () =>
      buildPreferredOffStorageKey(
        selectedCompany,
        selectedDepartmentScopeKey,
        selectedMonth
      ),
    [selectedCompany, selectedDepartmentScopeKey, selectedMonth]
  );
  const staffNightRangeStorageKey = useMemo(
    () =>
      buildStaffNightRangeStorageKey(selectedCompany, selectedDepartmentScopeKey),
    [selectedCompany, selectedDepartmentScopeKey]
  );
  const companyLockedByHrFilter = selectedCo !== '\uC804\uCCB4';
  const teamOptions = useMemo(
    () => departmentOptions.filter((department) => department !== '\uC804\uCCB4 \uBD80\uC11C'),
    [departmentOptions]
  );
  const availableIncludedDepartments = useMemo(
    () => teamOptions.filter((department) => department !== selectedDepartment),
    [selectedDepartment, teamOptions]
  );
  const suyeonNursingDepartment = useMemo(
    () =>
      availableIncludedDepartments.find((department) => {
        const normalizedDepartment = String(department || '').replace(/\s+/g, '');
        return (
          normalizedDepartment.includes('\uC218\uC5F0\uBCD1\uC6D0') &&
          normalizedDepartment.includes('\uAC04\uD638')
        );
      }) || '',
    [availableIncludedDepartments]
  );
  const scopedRosterDepartments = useMemo(
    () =>
      [selectedDepartment, ...includedDepartments]
        .map((department) => String(department || '').trim())
        .filter(
          (department, index, list) => department && list.indexOf(department) === index
        ),
    [includedDepartments, selectedDepartment]
  );

  const targetStaffs = useMemo(() => {
    const scopedDepartments = new Set(
      [selectedDepartment, ...includedDepartments]
        .map((department) => String(department || '').trim())
        .filter(Boolean)
    );
    return activeStaffs.filter((staff) => {
      if (selectedCompany && staff.company !== selectedCompany) return false;
      if (selectedDepartment && selectedDepartment !== '\uC804\uCCB4 \uBD80\uC11C') {
        return scopedDepartments.has(getDepartmentName(staff));
      }
      return true;
    });
  }, [activeStaffs, includedDepartments, selectedCompany, selectedDepartment]);

  const orderedTargetStaffIds = useMemo(
    () => targetStaffs.map((staff) => String(staff.id)),
    [targetStaffs]
  );
  const enabledTargetStaffs = useMemo(
    () =>
      targetStaffs.filter(
        (staff) => staffConfigs[String(staff.id)]?.enabled !== false
      ),
    [staffConfigs, targetStaffs]
  );
  const effectiveTargetStaffConfigs = useMemo(() => {
    const nextMap = new Map<string, StaffConfig>();

    targetStaffs.forEach((staff, index) => {
      nextMap.set(
        String(staff.id),
        staffConfigs[String(staff.id)] ||
          buildInitialConfig(
            staff,
            index,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          )
      );
    });

    return nextMap;
  }, [defaultShiftOrder, defaultShiftPool, monthDates.length, staffConfigs, targetStaffs]);
  const defaultWizardSelectedStaffIds = useMemo(() => {
    const enabledIds = orderedTargetStaffIds.filter(
      (staffId) => staffConfigs[staffId]?.enabled !== false
    );
    return enabledIds.length > 0 ? enabledIds : orderedTargetStaffIds;
  }, [orderedTargetStaffIds, staffConfigs]);

  useEffect(() => {
    if (!monthDates.length) {
      setPreferredOffDate('');
      return;
    }

    setPreferredOffDate((prev) =>
      monthDates.includes(prev) ? prev : monthDates[0]
    );
  }, [monthDates]);

  useEffect(() => {
    if (targetStaffs.length === 0) {
      setPreferredOffStaffId('');
      return;
    }

    setPreferredOffStaffId((prev) =>
      targetStaffs.some((staff) => String(staff.id) === prev)
        ? prev
        : String(targetStaffs[0].id)
    );
  }, [targetStaffs]);

  useRosterScopeLocalStorage({
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
  });

  return {
    availableIncludedDepartments,
    companyLockedByHrFilter,
    defaultShiftOrder,
    defaultShiftPool,
    defaultWizardSelectedStaffIds,
    effectiveTargetStaffConfigs,
    enabledTargetStaffs,
    includedDepartments,
    loadingShifts,
    monthDates,
    offShift,
    orderedTargetStaffIds,
    preferredOffDate,
    preferredOffSelections,
    preferredOffStaffId,
    rosterScopeLabel,
    rosterSnapshotStorageKey,
    scopedRosterDepartments,
    selectedCompany,
    selectedDepartment,
    selectedDepartmentScopeKey,
    setIncludedDepartments,
    setPreferredOffDate,
    setPreferredOffSelections,
    setPreferredOffStaffId,
    setSelectedCompany,
    setSelectedDepartment,
    setWorkShifts,
    suyeonNursingDepartment,
    targetStaffs,
    teamOptions,
    workShifts,
    workingShifts,
  };
}

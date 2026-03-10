'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SmartMonthPicker from './공통/SmartMonthPicker';

const MANAGER_POSITION_KEYWORDS = [
  '팀장',
  '과장',
  '실장',
  '수간호사',
  '파트장',
  '센터장',
  '부장',
  '본부장',
  '이사',
  '원장',
  '병원장',
  '대표',
];

const OFF_SHIFT_TOKEN = '__OFF__';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type ManualAssignmentMap = Record<string, string>;
type WizardStep = 1 | 2 | 3;

const PATTERN_OPTIONS = [
  { value: '상근', label: '상근', desc: '평일 근무, 주말 휴무' },
  { value: '2교대', label: '2교대', desc: '주/야 또는 A/B 2개 근무 순환' },
  { value: '3교대', label: '3교대', desc: '데이/이브닝/나이트 + OFF 순환' },
  { value: '2일근무1일휴무', label: '2일근무 1일휴무', desc: '이틀 근무 후 하루 OFF' },
  { value: '1일근무1일휴무', label: '1일근무 1일휴무', desc: '하루 근무 후 하루 OFF' },
  { value: '야간전담', label: '야간전담', desc: '나이트 중심 편성 + OFF 순환' },
];

type WorkShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  shift_type?: string | null;
  company_name?: string | null;
};

type StaffConfig = {
  enabled: boolean;
  pattern: string;
  primaryShiftId: string;
  secondaryShiftId: string;
  tertiaryShiftId: string;
  startOffset: number;
  nightShiftCount: number;
};

type PreviewCell = {
  date: string;
  baseShiftId: string;
  shiftId: string;
  shiftName: string;
  code: string;
  badgeClass: string;
  isManual: boolean;
};

type PreviewRow = {
  staff: any;
  config: StaffConfig;
  cells: PreviewCell[];
  counts: {
    work: number;
    off: number;
    night: number;
  };
};

function getDepartmentName(target: any) {
  return target?.department || target?.team || '';
}

function isManagerOrHigher(user: any) {
  const position = String(user?.position || '');
  return (
    user?.role === 'admin' ||
    user?.company === 'SY INC.' ||
    user?.permissions?.mso === true ||
    MANAGER_POSITION_KEYWORDS.some((keyword) => position.includes(keyword))
  );
}

function getMonthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return Array.from(
    { length: daysInMonth },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
  );
}

function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

function pickShiftByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.find((shift) => keywords.some((keyword) => normalizeShiftName(shift.name).includes(keyword)));
}

function sortShifts(shifts: WorkShift[]) {
  return [...shifts].sort((a, b) => {
    const aTime = String(a.start_time || '99:99').slice(0, 5);
    const bTime = String(b.start_time || '99:99').slice(0, 5);
    return aTime.localeCompare(bTime);
  });
}

function buildDefaultShiftOrder(shifts: WorkShift[]) {
  const sorted = sortShifts(shifts);
  const bucket = [
    pickShiftByKeywords(sorted, ['day', '데이', '주간', '상근', '일근', '오전']),
    pickShiftByKeywords(sorted, ['evening', 'eve', '이브', '오후', '중간']),
    pickShiftByKeywords(sorted, ['night', '나이트', '야간']),
  ].filter(Boolean) as WorkShift[];

  const unique = [...bucket];
  sorted.forEach((shift) => {
    if (!unique.some((item) => item.id === shift.id)) {
      unique.push(shift);
    }
  });

  return unique.slice(0, 3);
}

function inferPattern(staff: any, shifts: WorkShift[]) {
  const base = normalizeShiftName(staff?.shift_type || '');
  if (base.includes('3교대')) return '3교대';
  if (base.includes('2교대')) return '2교대';
  if (base.includes('2일근무1일휴무')) return '2일근무1일휴무';
  if (base.includes('1일근무1일휴무')) return '1일근무1일휴무';
  if (base.includes('야간')) return '야간전담';
  if (shifts.length >= 3) return '3교대';
  if (shifts.length >= 2) return '2교대';
  return '상근';
}

function isNightPattern(pattern: string) {
  return pattern === '3교대' || pattern === '야간전담';
}

function getRequiredShiftCount(pattern: string) {
  switch (pattern) {
    case '3교대':
      return 3;
    case '2교대':
    case '2일근무1일휴무':
      return 2;
    default:
      return 1;
  }
}

function clampNightShiftCount(value: number, days: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(days, Math.floor(value)));
}

function inferDefaultNightShiftCount(pattern: string, days: number) {
  if (pattern === '야간전담') return Math.ceil(days / 2);
  if (pattern === '3교대') return Math.max(1, Math.round(days / 4));
  return 0;
}

function selectDistributedDays({
  candidateDays,
  days,
  targetCount,
  seed,
}: {
  candidateDays: number[];
  days: number;
  targetCount: number;
  seed: number;
}) {
  const sortedDays = [...candidateDays].sort((a, b) => a - b);
  if (targetCount <= 0 || sortedDays.length === 0) return [];
  if (targetCount >= sortedDays.length) return sortedDays;

  const picks: number[] = [];
  const used = new Set<number>();
  const normalizedSeed = ((seed % days) + days) % days;

  for (let index = 0; index < targetCount; index += 1) {
    const idealPosition = ((((index + 0.5) * days) / targetCount) + normalizedSeed) % days;
    let bestDay = sortedDays[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    sortedDays.forEach((day) => {
      if (used.has(day)) return;
      const zeroBasedDay = day - 1;
      const directDistance = Math.abs(zeroBasedDay - idealPosition);
      const wrappedDistance = Math.min(directDistance, days - directDistance);
      if (wrappedDistance < bestDistance) {
        bestDistance = wrappedDistance;
        bestDay = day;
      }
    });

    used.add(bestDay);
    picks.push(bestDay);
  }

  return picks.sort((a, b) => a - b);
}

function buildInitialConfig(staff: any, index: number, shifts: WorkShift[], days: number) {
  const primary = shifts.find((shift) => shift.id === staff?.shift_id)?.id || shifts[0]?.id || '';
  const secondary = shifts[1]?.id || primary;
  const tertiary = shifts[2]?.id || secondary || primary;
  const pattern = inferPattern(staff, shifts);

  return {
    enabled: false,
    pattern,
    primaryShiftId: primary,
    secondaryShiftId: secondary,
    tertiaryShiftId: tertiary,
    startOffset: index,
    nightShiftCount: isNightPattern(pattern) ? inferDefaultNightShiftCount(pattern, days) : 0,
  };
}

function getShiftNameById(shiftId: string, workShifts: WorkShift[]) {
  if (shiftId === OFF_SHIFT_TOKEN) return '휴무';
  return workShifts.find((shift) => shift.id === shiftId)?.name || '미지정';
}

function buildPatternSchedule(config: StaffConfig, monthDates: string[]) {
  const primary = config.primaryShiftId;
  const secondary = config.secondaryShiftId || primary;
  const tertiary = config.tertiaryShiftId || secondary || primary;

  const baseRow = monthDates.map((date, dateIndex) => {
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

    switch (config.pattern) {
      case '상근':
        return dayOfWeek === 0 || dayOfWeek === 6 ? OFF_SHIFT_TOKEN : primary;
      case '2교대': {
        const sequence = [primary, secondary, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '3교대': {
        const sequence = [primary, secondary, tertiary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '2일근무1일휴무': {
        const sequence = [primary, secondary || primary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '1일근무1일휴무': {
        const sequence = [primary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '야간전담': {
        const nightShift = tertiary || secondary || primary;
        const sequence = [nightShift, nightShift, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      default:
        return primary;
    }
  });

  if (!isNightPattern(config.pattern)) return baseRow;

  const days = monthDates.length;
  const nightShiftId = tertiary || secondary || primary;
  if (!nightShiftId) return baseRow;

  const desiredNightCount = clampNightShiftCount(
    Number.isFinite(config.nightShiftCount) ? config.nightShiftCount : inferDefaultNightShiftCount(config.pattern, days),
    days
  );
  const fallbackShiftId =
    config.pattern === '야간전담'
      ? OFF_SHIFT_TOKEN
      : [secondary, primary, OFF_SHIFT_TOKEN].find((shiftId) => shiftId && shiftId !== nightShiftId) || OFF_SHIFT_TOKEN;
  const baseNightDays = Array.from({ length: days }, (_, index) => index + 1).filter(
    (day) => baseRow[day - 1] === nightShiftId
  );
  const desiredNightDays = new Set<number>();
  const baseKeepCount = Math.min(desiredNightCount, baseNightDays.length);

  selectDistributedDays({
    candidateDays: baseNightDays,
    days,
    targetCount: baseKeepCount,
    seed: config.startOffset,
  }).forEach((day) => {
    desiredNightDays.add(day);
  });

  if (desiredNightDays.size < desiredNightCount) {
    const remaining = desiredNightCount - desiredNightDays.size;
    const allDays = Array.from({ length: days }, (_, index) => index + 1);
    const preferredCandidates =
      config.pattern === '야간전담'
        ? allDays.filter((day) => !desiredNightDays.has(day) && baseRow[day - 1] === OFF_SHIFT_TOKEN)
        : allDays.filter(
          (day) =>
            !desiredNightDays.has(day) &&
            baseRow[day - 1] !== OFF_SHIFT_TOKEN &&
            baseRow[day - 1] !== nightShiftId
        );

    selectDistributedDays({
      candidateDays: preferredCandidates,
      days,
      targetCount: Math.min(remaining, preferredCandidates.length),
      seed: config.startOffset + 1,
    }).forEach((day) => {
      desiredNightDays.add(day);
    });

    if (desiredNightDays.size < desiredNightCount) {
      const fallbackCandidates = allDays.filter((day) => !desiredNightDays.has(day));
      selectDistributedDays({
        candidateDays: fallbackCandidates,
        days,
        targetCount: desiredNightCount - desiredNightDays.size,
        seed: config.startOffset + 2,
      }).forEach((day) => {
        desiredNightDays.add(day);
      });
    }
  }

  return baseRow.map((shiftId, index) => {
    const day = index + 1;
    if (desiredNightDays.has(day)) return nightShiftId;
    if (shiftId === nightShiftId) return fallbackShiftId;
    return shiftId;
  });
}

function getShiftCode(name: string) {
  const normalized = normalizeShiftName(name);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return 'OFF';
  if (normalized.includes('휴가') || normalized.includes('연차')) return '휴';
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근')) return 'D';
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve')) return 'E';
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간')) return 'N';
  return name.slice(0, 2);
}

function getShiftBadgeClass(name: string) {
  const normalized = normalizeShiftName(name);
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) {
    return 'bg-zinc-100 text-zinc-500 border-zinc-200';
  }
  if (normalized.includes('휴가') || normalized.includes('연차')) {
    return 'bg-green-50 text-green-700 border-green-200';
  }
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근')) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve')) {
    return 'bg-orange-50 text-orange-700 border-orange-200';
  }
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간')) {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function buildAssignmentKey(staffId: string, date: string) {
  return `${staffId}::${date}`;
}

function formatShiftHours(shift: WorkShift) {
  if (!shift.start_time || !shift.end_time) return '시간 미지정';
  return `${String(shift.start_time).slice(0, 5)} - ${String(shift.end_time).slice(0, 5)}`;
}

export default function AutoRosterPlanner({
  user,
  staffs = [],
  selectedCo = '전체',
}: {
  user?: any;
  staffs?: any[];
  selectedCo?: string;
}) {
  const canAccess = isManagerOrHigher(user);
  const isAdmin = user?.role === 'admin' || user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const ownDepartment = getDepartmentName(user);
  const activeStaffs = useMemo(() => staffs.filter((staff: any) => staff?.status !== '퇴사'), [staffs]);
  const companyOptions = useMemo(
    () => Array.from(new Set(activeStaffs.map((staff: any) => staff.company).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [activeStaffs]
  );

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [staffConfigs, setStaffConfigs] = useState<Record<string, StaffConfig>>({});
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plannerPattern, setPlannerPattern] = useState('3교대');
  const [plannerPrimaryShiftId, setPlannerPrimaryShiftId] = useState('');
  const [plannerSecondaryShiftId, setPlannerSecondaryShiftId] = useState('');
  const [plannerTertiaryShiftId, setPlannerTertiaryShiftId] = useState('');
  const [plannerStartOffset, setPlannerStartOffset] = useState(0);
  const [plannerNightShiftCount, setPlannerNightShiftCount] = useState(0);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [manualAssignments, setManualAssignments] = useState<ManualAssignmentMap>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardSelectedStaffIds, setWizardSelectedStaffIds] = useState<string[]>([]);
  const [wizardPattern, setWizardPattern] = useState('3교대');
  const [wizardShiftIds, setWizardShiftIds] = useState<string[]>([]);
  const [wizardStartOffset, setWizardStartOffset] = useState(0);
  const [wizardNightShiftCount, setWizardNightShiftCount] = useState(0);

  useEffect(() => {
    if (!companyOptions.length) return;
    if (selectedCo !== '전체' && companyOptions.includes(selectedCo)) {
      setSelectedCompany(selectedCo);
      return;
    }
    if (!isAdmin) {
      setSelectedCompany(user?.company || companyOptions[0]);
      return;
    }
    if (!selectedCompany || !companyOptions.includes(selectedCompany)) {
      setSelectedCompany(user?.company && user.company !== 'SY INC.' ? user.company : companyOptions[0]);
    }
  }, [companyOptions, isAdmin, selectedCo, selectedCompany, user?.company]);

  const departmentOptions = useMemo(() => {
    if (!selectedCompany) return [];
    const list = Array.from(
      new Set(
        activeStaffs
          .filter((staff: any) => staff.company === selectedCompany)
          .map((staff: any) => getDepartmentName(staff))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));

    if (!isAdmin) {
      return list;
    }
    return ['전체 부서', ...list];
  }, [activeStaffs, isAdmin, ownDepartment, selectedCompany]);

  useEffect(() => {
    if (!departmentOptions.length) return;
    const defaultDepartment = departmentOptions.includes(ownDepartment)
      ? ownDepartment
      : departmentOptions.find((department) => department !== '전체 부서') || departmentOptions[0];
    if (!selectedDepartment || !departmentOptions.includes(selectedDepartment) || selectedDepartment === '전체 부서') {
      setSelectedDepartment(defaultDepartment);
    }
  }, [departmentOptions, ownDepartment, selectedDepartment]);

  useEffect(() => {
    if (!selectedCompany) {
      setWorkShifts([]);
      return;
    }

    const loadWorkShifts = async () => {
      setLoadingShifts(true);
      try {
        const { data, error } = await supabase
          .from('work_shifts')
          .select('id, name, start_time, end_time, shift_type, company_name')
          .eq('company_name', selectedCompany)
          .eq('is_active', true)
          .order('start_time', { ascending: true });

        if (error) throw error;
        setWorkShifts(data || []);
      } catch (error) {
        console.error('근무형태 로드 실패:', error);
        setWorkShifts([]);
      } finally {
        setLoadingShifts(false);
      }
    };

    loadWorkShifts();
  }, [selectedCompany]);

  const offShift = useMemo(
    () => workShifts.find((shift) => ['휴무', 'off', '비번', '오프'].some((keyword) => normalizeShiftName(shift.name).includes(keyword))),
    [workShifts]
  );

  const workingShifts = useMemo(
    () => workShifts.filter((shift) => shift.id !== offShift?.id),
    [offShift?.id, workShifts]
  );

  const defaultShiftOrder = useMemo(() => buildDefaultShiftOrder(workingShifts), [workingShifts]);
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const companyLockedByHrFilter = selectedCo !== '전체';
  const teamOptions = useMemo(
    () => departmentOptions.filter((department) => department !== '전체 부서'),
    [departmentOptions]
  );

  useEffect(() => {
    setManualAssignments({});
    setManualEditMode(false);
  }, [selectedMonth, selectedCompany, selectedDepartment]);

  const targetStaffs = useMemo(() => {
    return activeStaffs.filter((staff: any) => {
      if (selectedCompany && staff.company !== selectedCompany) return false;
      if (selectedDepartment && selectedDepartment !== '전체 부서') {
        return getDepartmentName(staff) === selectedDepartment;
      }
      return true;
    });
  }, [activeStaffs, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (!workingShifts.length) return;
    const validShiftIds = new Set(workingShifts.map((shift) => shift.id));
    const fallbackPrimary = defaultShiftOrder[0]?.id || workingShifts[0]?.id || '';
    const fallbackSecondary = defaultShiftOrder[1]?.id || fallbackPrimary;
    const fallbackTertiary = defaultShiftOrder[2]?.id || fallbackSecondary || fallbackPrimary;

    setPlannerPrimaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackPrimary : prev));
    setPlannerSecondaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackSecondary : prev));
    setPlannerTertiaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackTertiary : prev));
  }, [defaultShiftOrder, workingShifts]);

  useEffect(() => {
    if (!targetStaffs.length || !workingShifts.length) return;
    const validShiftIds = new Set(workingShifts.map((shift) => shift.id));
    const fallbackPrimary = defaultShiftOrder[0]?.id || workingShifts[0]?.id || '';
    const fallbackSecondary = defaultShiftOrder[1]?.id || fallbackPrimary;
    const fallbackTertiary = defaultShiftOrder[2]?.id || fallbackSecondary || fallbackPrimary;

    setStaffConfigs((prev) => {
      const next: Record<string, StaffConfig> = {};
      targetStaffs.forEach((staff: any, index: number) => {
        const current = prev[staff.id];
        const baseConfig =
          current || buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
        const nextPattern = baseConfig.pattern || inferPattern(staff, workingShifts);
        next[staff.id] = current
          ? {
              ...baseConfig,
              pattern: nextPattern,
              primaryShiftId: validShiftIds.has(baseConfig.primaryShiftId) ? baseConfig.primaryShiftId : fallbackPrimary,
              secondaryShiftId: validShiftIds.has(baseConfig.secondaryShiftId) ? baseConfig.secondaryShiftId : fallbackSecondary,
          tertiaryShiftId: validShiftIds.has(baseConfig.tertiaryShiftId) ? baseConfig.tertiaryShiftId : fallbackTertiary,
          nightShiftCount: isNightPattern(nextPattern)
            ? clampNightShiftCount(
              Number.isFinite(baseConfig.nightShiftCount)
                ? baseConfig.nightShiftCount
                : inferDefaultNightShiftCount(nextPattern, monthDates.length),
              monthDates.length
            )
            : 0,
            }
          : {
              ...baseConfig,
              pattern: nextPattern,
              primaryShiftId: validShiftIds.has(baseConfig.primaryShiftId) ? baseConfig.primaryShiftId : fallbackPrimary,
              secondaryShiftId: validShiftIds.has(baseConfig.secondaryShiftId) ? baseConfig.secondaryShiftId : fallbackSecondary,
          tertiaryShiftId: validShiftIds.has(baseConfig.tertiaryShiftId) ? baseConfig.tertiaryShiftId : fallbackTertiary,
          nightShiftCount: isNightPattern(nextPattern)
            ? clampNightShiftCount(
              Number.isFinite(baseConfig.nightShiftCount)
                ? baseConfig.nightShiftCount
                : inferDefaultNightShiftCount(nextPattern, monthDates.length),
              monthDates.length
            )
            : 0,
            };
      });
      return next;
    });
  }, [defaultShiftOrder, monthDates.length, targetStaffs, workingShifts]);

  useEffect(() => {
    if (!isNightPattern(plannerPattern)) {
      setPlannerNightShiftCount(0);
      return;
    }

    setPlannerNightShiftCount((prev) => {
      return clampNightShiftCount(prev, monthDates.length);
    });
  }, [monthDates.length, plannerPattern]);

  const wizardRequiredShiftCount = getRequiredShiftCount(wizardPattern);
  const orderedWizardShiftIds = useMemo(
    () => workingShifts.filter((shift) => wizardShiftIds.includes(shift.id)).map((shift) => shift.id),
    [wizardShiftIds, workingShifts]
  );

  useEffect(() => {
    if (!wizardOpen) return;
    const validStaffIds = new Set(targetStaffs.map((staff: any) => String(staff.id)));
    setWizardSelectedStaffIds((prev) => {
      const filtered = prev.filter((staffId) => validStaffIds.has(staffId));
      if (filtered.length > 0) return filtered;
      return targetStaffs.map((staff: any) => String(staff.id));
    });
  }, [targetStaffs, wizardOpen]);

  useEffect(() => {
    if (!wizardOpen) return;

    const presetShiftIds = buildDefaultShiftOrder(workingShifts)
      .slice(0, wizardRequiredShiftCount)
      .map((shift) => shift.id);

    setWizardShiftIds((prev) => {
      const valid = workingShifts.filter((shift) => prev.includes(shift.id)).map((shift) => shift.id);
      if (valid.length >= wizardRequiredShiftCount) {
        return valid.slice(0, wizardRequiredShiftCount);
      }
      const missing = presetShiftIds.filter((shiftId) => !valid.includes(shiftId));
      return [...valid, ...missing].slice(0, wizardRequiredShiftCount);
    });
  }, [wizardOpen, wizardPattern, wizardRequiredShiftCount, workingShifts]);

  useEffect(() => {
    if (!wizardOpen) return;
    if (!isNightPattern(wizardPattern)) {
      setWizardNightShiftCount(0);
      return;
    }

    setWizardNightShiftCount((prev) => {
      return clampNightShiftCount(prev, monthDates.length);
    });
  }, [monthDates.length, wizardOpen, wizardPattern]);

  const setManualAssignment = ({
    staffId,
    date,
    nextShiftId,
    baseShiftId,
  }: {
    staffId: string;
    date: string;
    nextShiftId: string;
    baseShiftId: string;
  }) => {
    const assignmentKey = buildAssignmentKey(staffId, date);
    setManualAssignments((prev) => {
      if (nextShiftId === baseShiftId) {
        const { [assignmentKey]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [assignmentKey]: nextShiftId,
      };
    });
  };

  const cycleManualAssignment = ({
    staffId,
    date,
    currentShiftId,
    baseShiftId,
  }: {
    staffId: string;
    date: string;
    currentShiftId: string;
    baseShiftId: string;
  }) => {
    const shiftSequence = [OFF_SHIFT_TOKEN, ...workingShifts.map((shift) => shift.id)];
    if (!shiftSequence.length) return;

    const currentIndex = Math.max(shiftSequence.findIndex((shiftId) => shiftId === currentShiftId), 0);
    const nextShiftId = shiftSequence[(currentIndex + 1) % shiftSequence.length];
    setManualAssignment({ staffId, date, nextShiftId, baseShiftId });
  };

  const previewRows = useMemo<PreviewRow[]>(() => {
    return targetStaffs
      .map((staff: any, index: number) => {
        const config =
          staffConfigs[staff.id] ||
          buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
        return { staff, config };
      })
      .filter((row) => row.config.enabled)
      .map(({ staff, config }) => {
        const baseSchedule = buildPatternSchedule(config, monthDates);
        const cells = monthDates.map((date, index) => {
          const baseShiftId = baseSchedule[index] || OFF_SHIFT_TOKEN;
          const manualShiftId = manualAssignments[buildAssignmentKey(String(staff.id), date)];
          const shiftId = manualShiftId || baseShiftId;
          const shiftName = getShiftNameById(shiftId, workShifts);
          return {
            date,
            baseShiftId,
            shiftId,
            shiftName,
            code: getShiftCode(shiftName),
            badgeClass: getShiftBadgeClass(shiftName),
            isManual: Boolean(manualShiftId),
          };
        });

        return {
          staff,
          config,
          cells,
          counts: {
            work: cells.filter((cell) => cell.code !== 'OFF').length,
            off: cells.filter((cell) => cell.code === 'OFF').length,
            night: cells.filter((cell) => cell.code === 'N').length,
          },
        };
      });
  }, [defaultShiftOrder, manualAssignments, monthDates, staffConfigs, targetStaffs, workShifts, workingShifts]);

  const summary = useMemo(() => {
    const enabledConfigs = targetStaffs
      .map((staff: any) => staffConfigs[staff.id])
      .filter((config): config is StaffConfig => Boolean(config?.enabled));
    return {
      staffCount: targetStaffs.length,
      enabledCount: enabledConfigs.length,
      shiftCount: workingShifts.length,
      manualCount: Object.keys(manualAssignments).length,
    };
  }, [manualAssignments, staffConfigs, targetStaffs, workingShifts.length]);

  const updateConfig = (staff: any, index: number, patch: Partial<StaffConfig>) => {
    setStaffConfigs((prev) => {
      const current =
        prev[staff.id] ||
        buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
      const nextPattern = patch.pattern ?? current.pattern;
      const nextNightShiftCount = Object.prototype.hasOwnProperty.call(patch, 'nightShiftCount')
        ? patch.nightShiftCount || 0
        : current.nightShiftCount;

      return {
        ...prev,
        [staff.id]: {
          ...current,
          ...patch,
          pattern: nextPattern,
          nightShiftCount: isNightPattern(nextPattern)
            ? clampNightShiftCount(
              Number.isFinite(nextNightShiftCount)
                ? nextNightShiftCount
                : inferDefaultNightShiftCount(nextPattern, monthDates.length),
              monthDates.length
            )
            : 0,
        },
      };
    });
  };

  const currentPlannerShifts = useMemo(
    () =>
      [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
        .filter(Boolean)
        .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
        .map((shiftId) => getShiftNameById(shiftId, workShifts)),
    [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId, workShifts]
  );

  const openWizard = () => {
    setWizardStep(1);
    setWizardPattern(plannerPattern || inferPattern(null, workingShifts));
    setWizardStartOffset(plannerStartOffset);
    setWizardNightShiftCount(
      isNightPattern(plannerPattern)
        ? previewRows.length > 0 || summary.enabledCount > 0
          ? plannerNightShiftCount
          : inferDefaultNightShiftCount(plannerPattern, monthDates.length)
        : inferDefaultNightShiftCount('3교대', monthDates.length)
    );
    setWizardSelectedStaffIds(
      previewRows.length > 0 ? previewRows.map((row) => String(row.staff.id)) : targetStaffs.map((staff: any) => String(staff.id))
    );
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
  };

  const toggleWizardStaff = (staffId: string) => {
    setWizardSelectedStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((value) => value !== staffId) : [...prev, staffId]
    );
  };

  const toggleWizardShiftId = (shiftId: string) => {
    setWizardShiftIds((prev) => {
      const orderedCurrent = workingShifts.filter((shift) => prev.includes(shift.id)).map((shift) => shift.id);
      const alreadySelected = orderedCurrent.includes(shiftId);
      if (!alreadySelected && orderedCurrent.length >= wizardRequiredShiftCount) {
        alert(`${wizardPattern} 패턴은 최대 ${wizardRequiredShiftCount}개의 근무유형만 선택할 수 있습니다.`);
        return prev;
      }

      const next = alreadySelected
        ? orderedCurrent.filter((value) => value !== shiftId)
        : [...orderedCurrent, shiftId];
      return workingShifts.filter((shift) => next.includes(shift.id)).map((shift) => shift.id);
    });
  };

  const applyWizard = () => {
    if (!selectedCompany) return alert('사업체를 먼저 선택하세요.');
    if (!selectedDepartment || selectedDepartment === '전체 부서') {
      return alert('근무표를 생성할 팀을 선택하세요.');
    }
    if (!wizardSelectedStaffIds.length) return alert('근무표를 생성할 직원을 한 명 이상 선택하세요.');
    if (orderedWizardShiftIds.length < wizardRequiredShiftCount) {
      return alert(`${wizardPattern} 패턴에 필요한 근무유형 ${wizardRequiredShiftCount}개를 선택하세요.`);
    }

    const primaryShiftId = orderedWizardShiftIds[0] || '';
    const secondaryShiftId = orderedWizardShiftIds[1] || primaryShiftId;
    const tertiaryShiftId = orderedWizardShiftIds[2] || secondaryShiftId || primaryShiftId;
    if (!primaryShiftId) return alert('근무유형을 한 개 이상 선택하세요.');

    const selectedIndexMap = new Map<string, number>();
    wizardSelectedStaffIds.forEach((staffId, index) => {
      selectedIndexMap.set(staffId, index);
    });

    setPlannerPattern(wizardPattern);
    setPlannerPrimaryShiftId(primaryShiftId);
    setPlannerSecondaryShiftId(secondaryShiftId);
    setPlannerTertiaryShiftId(tertiaryShiftId);
    setPlannerStartOffset(wizardStartOffset);
    setPlannerNightShiftCount(isNightPattern(wizardPattern) ? wizardNightShiftCount : 0);

    setStaffConfigs((prev) => {
      const next = { ...prev };
      targetStaffs.forEach((staff: any, index: number) => {
        const current =
          prev[staff.id] ||
          buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
        const selectedIndex = selectedIndexMap.get(String(staff.id));

        next[staff.id] = {
          ...current,
          enabled: selectedIndex !== undefined,
          pattern: wizardPattern,
          primaryShiftId,
          secondaryShiftId,
          tertiaryShiftId,
          startOffset: selectedIndex !== undefined ? wizardStartOffset + selectedIndex : current.startOffset,
          nightShiftCount: isNightPattern(wizardPattern)
            ? clampNightShiftCount(wizardNightShiftCount, monthDates.length)
            : 0,
        };
      });
      return next;
    });

    setManualAssignments({});
    closeWizard();
    alert(`${selectedDepartment} 팀 ${wizardSelectedStaffIds.length}명의 근무표 초안을 생성했습니다. 아래에서 임의 수정 후 저장하세요.`);
  };

  const ensureOffShift = async () => {
    if (offShift) return offShift;

    const payload = {
      name: '휴무',
      start_time: '00:00',
      end_time: '00:00',
      description: '근무표 자동편성에서 생성한 휴무 코드',
      company_name: selectedCompany,
      shift_type: '휴무',
      weekly_work_days: 0,
      is_weekend_work: true,
      is_shift: false,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('work_shifts')
      .insert([payload])
      .select('id, name, start_time, end_time, shift_type, company_name')
      .single();

    if (error) throw error;

    const nextOffShift = data as WorkShift;
    setWorkShifts((prev) => [...prev, nextOffShift]);
    return nextOffShift;
  };

  const saveAssignments = async () => {
    const enabledRows = previewRows.filter((row) => row.config.enabled);
    if (!selectedCompany) return alert('사업체를 먼저 선택하세요.');
    if (!selectedDepartment) return alert('팀을 먼저 선택하세요.');
    if (!enabledRows.length) return alert('저장할 대상 직원이 없습니다.');
    if (!confirm(`${selectedMonth} ${selectedDepartment} 근무표를 저장하시겠습니까?\n기존 월간 편성은 덮어씁니다.`)) return;

    setSaving(true);
    try {
      const requiresOffShift = enabledRows.some((row) => row.cells.some((cell) => cell.shiftId === OFF_SHIFT_TOKEN));
      const resolvedOffShift = requiresOffShift ? await ensureOffShift() : null;
      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${String(monthDates.length).padStart(2, '0')}`;
      const staffIds = enabledRows.map((row) => row.staff.id);

      const { error: deleteError } = await supabase
        .from('shift_assignments')
        .delete()
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (deleteError) throw deleteError;

      const insertRows = enabledRows.flatMap((row) =>
        row.cells.map((cell) => ({
          staff_id: row.staff.id,
          work_date: cell.date,
          shift_id: cell.shiftId === OFF_SHIFT_TOKEN ? resolvedOffShift?.id || null : cell.shiftId || null,
          company_name: selectedCompany,
        }))
      );

      for (let index = 0; index < insertRows.length; index += 500) {
        const chunk = insertRows.slice(index, index + 500);
        const { error } = await supabase.from('shift_assignments').upsert(chunk, {
          onConflict: 'staff_id,work_date',
        });
        if (error) throw error;
      }

      alert(`${selectedDepartment} 팀 ${enabledRows.length}명의 ${selectedMonth} 근무표를 저장했습니다.`);
    } catch (error: any) {
      console.error('근무표 저장 실패:', error);
      alert(`근무표 저장에 실패했습니다.\n${error?.message || '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="rounded-[20px] border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-600">
        부서장 이상만 교대근무 생성 마법사를 사용할 수 있습니다.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--toss-blue)]">Shift Wizard</p>
            <h3 className="mt-2 text-xl font-bold text-[var(--foreground)]">교대근무 생성 마법사</h3>
            <p className="mt-2 text-[12px] text-[var(--toss-gray-3)]">
              자동편성과 간호근무표를 하나로 합쳐 팀 단위로 생성하고, 생성 후에는 표에서 바로 임의 수정할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">대상 월</span>
              <div className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2">
                <SmartMonthPicker
                  value={selectedMonth}
                  onChange={(value) => setSelectedMonth(value)}
                  className="w-[150px]"
                  inputClassName="text-sm font-semibold text-[var(--foreground)]"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={openWizard}
              className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--toss-blue)] hover:text-[var(--toss-blue)]"
            >
              근무표 생성 마법사
            </button>
            <button
              type="button"
              onClick={saveAssignments}
              disabled={saving || loadingShifts || previewRows.length === 0}
              className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '저장 중...' : '월간 근무표 저장'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">사업체</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{selectedCompany || '-'}</p>
            {companyLockedByHrFilter && (
              <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">인사관리 사업체 필터와 연동 중</p>
            )}
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">팀</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{selectedDepartment || '-'}</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">대상 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.staffCount}명</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">편성 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.enabledCount}명</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">선택 패턴</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{plannerPattern}</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">수동 수정</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.manualCount}건</p>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">현재 생성 규칙</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              마법사에서 선택한 팀, 패턴, 근무유형이 여기에 반영됩니다. 병동 3교대는 D / E / N / OFF 표기로 미리보기를 확인할 수 있습니다.
            </p>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--toss-blue)]">근무유형 불러오는 중...</span>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
            {selectedCompany || '사업체 미선택'} / {selectedDepartment || '팀 미선택'}
          </span>
          <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
            패턴: {plannerPattern}
          </span>
          {currentPlannerShifts.map((shiftName) => (
            <span
              key={shiftName}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getShiftBadgeClass(shiftName)}`}
            >
              {shiftName} · {getShiftCode(shiftName)}
            </span>
          ))}
          {isNightPattern(plannerPattern) && (
            <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[11px] font-semibold text-purple-700">
              월간 나이트 {plannerNightShiftCount}회
            </span>
          )}
          <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
            시작 오프셋 {plannerStartOffset}
          </span>
        </div>

        <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 text-[12px] text-[var(--toss-gray-3)]">
          표기 안내: <span className="font-bold text-[var(--foreground)]">D</span> 데이 / <span className="font-bold text-[var(--foreground)]">E</span> 이브닝 / <span className="font-bold text-[var(--foreground)]">N</span> 나이트 / <span className="font-bold text-[var(--foreground)]">OFF</span> 휴무
        </div>
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">대상 직원 세부 조정</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              마법사로 생성한 후 필요한 직원만 켜거나, 패턴과 나이트 횟수, 시작 오프셋을 직원별로 다시 맞출 수 있습니다.
            </p>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--toss-blue)]">근무형태 불러오는 중...</span>}
        </div>

        {workingShifts.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 사업체에 등록된 근무유형이 없습니다. 먼저 근무형태 관리에서 주간/이브닝/나이트/휴무 코드를 등록하세요.
          </div>
        ) : targetStaffs.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 팀에 직원이 없습니다. 생성 마법사에서 사업체와 팀을 다시 선택하세요.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                  <th className="px-3 py-2">적용</th>
                  <th className="px-3 py-2">직원</th>
                  <th className="px-3 py-2">패턴</th>
                  <th className="px-3 py-2">주 근무</th>
                  <th className="px-3 py-2">보조 근무</th>
                  <th className="px-3 py-2">야간/3차</th>
                  <th className="px-3 py-2">시작 오프셋</th>
                  <th className="px-3 py-2">월 나이트</th>
                </tr>
              </thead>
              <tbody>
                {targetStaffs.map((staff: any, index: number) => {
                  const config =
                    staffConfigs[staff.id] ||
                    buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
                  const requiredShiftCount = getRequiredShiftCount(config.pattern);
                  return (
                    <tr key={staff.id} className="rounded-[18px] bg-[var(--toss-gray-1)]">
                      <td className="rounded-l-[18px] px-3 py-3">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => updateConfig(staff, index, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[var(--toss-blue)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)]">
                          {getDepartmentName(staff)} · {staff.position || '직원'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.pattern}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              pattern: e.target.value,
                              nightShiftCount: isNightPattern(e.target.value)
                                ? inferDefaultNightShiftCount(e.target.value, monthDates.length)
                                : 0,
                            })
                          }
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {PATTERN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.primaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { primaryShiftId: e.target.value })}
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.secondaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { secondaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 2}
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.tertiaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { tertiaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 3}
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          value={config.startOffset}
                          onChange={(e) => updateConfig(staff, index, { startOffset: Number(e.target.value) || 0 })}
                          className="w-24 rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        />
                      </td>
                      <td className="rounded-r-[18px] px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.nightShiftCount}
                          disabled={!isNightPattern(config.pattern)}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              nightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">월간 미리보기</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              셀을 직접 눌러 D / E / N / OFF를 임의 수정할 수 있습니다. 저장하면 근태 쪽 `shift_assignments`에 바로 반영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualEditMode((prev) => !prev)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-100 text-orange-700' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}
            >
              {manualEditMode ? '수동 수정 중' : '수동 수정'}
            </button>
            <button
              type="button"
              onClick={() => setManualAssignments({})}
              disabled={summary.manualCount === 0}
              className="rounded-full bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
            >
              수정 초기화
            </button>
            <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
              {previewRows.length}명 표시 · 수동 수정 {summary.manualCount}건
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">
          수동 수정 모드에서는 셀을 클릭할 때 근무유형이 순환 변경됩니다. 생성 결과로 되돌리려면 같은 셀을 다시 순환하거나 `수정 초기화`를 사용하세요.
        </p>

        {previewRows.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            생성 마법사로 팀과 직원을 선택하면 여기에서 월간 근무표를 확인할 수 있습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: `${260 + monthDates.length * 50}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[260px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                    직원
                  </th>
                  {monthDates.map((date) => {
                    const day = Number(date.slice(-2));
                    const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
                    return (
                      <th
                        key={date}
                        className="min-w-[50px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
                      >
                        <div>{day}</div>
                        <div className="mt-1 text-[9px]">{weekday}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.staff.id} className="border-b border-[var(--toss-border)] last:border-b-0">
                    <td className="sticky left-0 z-10 bg-[var(--toss-card)] px-4 py-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                        {row.config.pattern} · {getDepartmentName(row.staff)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                        근무 {row.counts.work} · OFF {row.counts.off} · N {row.counts.night}
                      </p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} className="px-1 py-2 text-center">
                        <button
                          type="button"
                          disabled={!manualEditMode}
                          onClick={() => cycleManualAssignment({
                            staffId: String(row.staff.id),
                            date: cell.date,
                            currentShiftId: cell.shiftId,
                            baseShiftId: cell.baseShiftId,
                          })}
                          className={`inline-flex h-8 min-w-[40px] items-center justify-center rounded-[10px] border px-1 text-[11px] font-black transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--toss-blue)] ring-offset-1' : ''}`}
                          title={`${row.staff.name} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭하여 변경' : ''}`}
                        >
                          {cell.code}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {wizardOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-[var(--toss-border)] bg-[var(--toss-card)] shadow-2xl">
            <div className="border-b border-[var(--toss-border)] bg-[var(--page-bg)] px-6 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-2xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                    <span className="bg-gradient-to-r from-[var(--toss-blue)] to-fuchsia-500 bg-clip-text text-transparent">
                      RUN SHIFT
                    </span>{' '}
                    마법사
                  </h3>
                  <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                    팀을 카드로 선택하고, 직원을 고른 뒤, 근무유형을 체크해서 월간 근무표를 바로 생성합니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { step: 1 as WizardStep, label: '팀 선택' },
                    { step: 2 as WizardStep, label: '직원 선택' },
                    { step: 3 as WizardStep, label: '패턴 · 근무유형' },
                  ].map(({ step, label }) => (
                    <div
                      key={step}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${wizardStep === step ? 'bg-[var(--toss-blue)] text-white' : wizardStep > step ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'}`}
                    >
                      {step}. {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {wizardStep === 1 && (
                <div className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">대상 월</span>
                        <div className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2">
                          <SmartMonthPicker
                            value={selectedMonth}
                            onChange={(value) => setSelectedMonth(value)}
                            className="w-[150px]"
                            inputClassName="text-sm font-semibold text-[var(--foreground)]"
                          />
                        </div>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">사업체</span>
                        <select
                          value={selectedCompany}
                          onChange={(e) => setSelectedCompany(e.target.value)}
                          disabled={!isAdmin || companyLockedByHrFilter}
                          className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-50"
                        >
                          {companyOptions.map((company) => (
                            <option key={company} value={company}>
                              {company}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[22px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-5 py-4">
                        <p className="text-sm font-bold text-[var(--foreground)]">어떤 팀의 근무표를 만들까요?</p>
                        <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                          병동처럼 3교대 팀은 이후 단계에서 데이 / 이브닝 / 나이트를 체크해서 D / E / N / OFF 형태로 만들 수 있습니다.
                        </p>
                      </div>

                      {teamOptions.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
                          선택한 사업체에 등록된 팀이 없습니다.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {teamOptions.map((department) => {
                            const teamStaffCount = activeStaffs.filter(
                              (staff: any) =>
                                staff.company === selectedCompany && getDepartmentName(staff) === department
                            ).length;
                            const selected = selectedDepartment === department;
                            return (
                              <button
                                key={department}
                                type="button"
                                onClick={() => setSelectedDepartment(department)}
                                className={`rounded-[24px] border px-7 py-6 text-left transition-all ${selected ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 shadow-[0_18px_40px_rgba(37,99,235,0.12)] ring-1 ring-[var(--toss-blue)]/20' : 'border-[var(--toss-border)] bg-white hover:border-[var(--toss-blue)]/40 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]'}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className={`flex h-12 w-12 items-center justify-center rounded-[16px] text-xl ${selected ? 'bg-white text-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] text-[var(--toss-blue)]'}`}>
                                    🏥
                                  </div>
                                  {selected && (
                                    <span className="rounded-full bg-[var(--toss-blue)] px-3 py-1 text-[10px] font-bold text-white">
                                      선택됨
                                    </span>
                                  )}
                                </div>
                                <p className="mt-6 text-xl font-bold tracking-[-0.02em] text-[var(--foreground)]">{department}</p>
                                <p className="mt-3 text-sm text-[var(--toss-gray-3)]">
                                  {selectedCompany || '사업체 미선택'} · 직원 {teamStaffCount}명
                                </p>
                                <p className="mt-3 text-[12px] leading-5 text-[var(--toss-gray-3)]">
                                  {workingShifts.length >= 3 ? '3교대/야간전담 팀에 적합한 근무표를 생성할 수 있습니다.' : '등록된 근무유형 기준으로 월간 근무표를 생성합니다.'}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-[var(--foreground)]">{selectedDepartment} 팀 직원 선택</h4>
                      <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                        근무표를 생성할 직원을 고르세요. 선택한 직원만 아래 미리보기에 생성됩니다.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardSelectedStaffIds(targetStaffs.map((staff: any) => String(staff.id)))}
                        className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
                      >
                        전체 선택
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardSelectedStaffIds([])}
                        className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)]"
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>

                  {targetStaffs.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
                      선택한 팀에 직원이 없습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {targetStaffs.map((staff: any) => {
                        const selected = wizardSelectedStaffIds.includes(String(staff.id));
                        return (
                          <button
                            key={staff.id}
                            type="button"
                            onClick={() => toggleWizardStaff(String(staff.id))}
                            className={`rounded-[18px] border p-4 text-left transition-all ${selected ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--toss-blue)]/30' : 'border-[var(--toss-border)] bg-white hover:border-[var(--toss-blue)]/50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--tab-bg)] text-sm font-bold text-[var(--toss-blue)]">
                                {String(staff.name || '?').slice(0, 1)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                                <p className="text-[11px] text-[var(--toss-gray-3)]">
                                  {getDepartmentName(staff)} · {staff.position || '직원'}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-base font-bold text-[var(--foreground)]">패턴과 근무유형 선택</h4>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      팀 패턴을 고른 뒤 사용할 근무유형을 체크하세요. 시간순으로 선택된 근무유형이 주 근무, 보조 근무, 나이트에 배치됩니다.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {PATTERN_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setWizardPattern(option.value)}
                        className={`rounded-[20px] border p-4 text-left transition-all ${wizardPattern === option.value ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--toss-blue)]/20' : 'border-[var(--toss-border)] bg-white hover:border-[var(--toss-blue)]/50'}`}
                      >
                        <p className="text-sm font-bold text-[var(--foreground)]">{option.label}</p>
                        <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">{option.desc}</p>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">근무유형 체크</p>
                        <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                          현재 패턴: {wizardPattern} · 필요한 근무유형 {wizardRequiredShiftCount}개
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {orderedWizardShiftIds.map((shiftId, index) => (
                          <span
                            key={shiftId}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getShiftBadgeClass(getShiftNameById(shiftId, workShifts))}`}
                          >
                            {index + 1}순위 · {getShiftNameById(shiftId, workShifts)} · {getShiftCode(getShiftNameById(shiftId, workShifts))}
                          </span>
                        ))}
                      </div>
                    </div>

                    {workingShifts.length === 0 ? (
                      <div className="mt-4 rounded-[16px] border border-dashed border-[var(--toss-border)] bg-white p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                        이 사업체에는 아직 활성화된 근무유형이 없습니다.
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {workingShifts.map((shift) => {
                          const checked = wizardShiftIds.includes(shift.id);
                          const rank = orderedWizardShiftIds.findIndex((shiftId) => shiftId === shift.id);
                          return (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() => toggleWizardShiftId(shift.id)}
                              className={`rounded-[18px] border p-4 text-left transition-all ${checked ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--toss-blue)]/20' : 'border-[var(--toss-border)] bg-white hover:border-[var(--toss-blue)]/50'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-bold text-[var(--foreground)]">{shift.name}</p>
                                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">{formatShiftHours(shift)}</p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${getShiftBadgeClass(shift.name)}`}>
                                  {checked ? `${rank + 1}순위` : getShiftCode(shift.name)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">시작 오프셋</span>
                      <input
                        type="number"
                        min={0}
                        value={wizardStartOffset}
                        onChange={(e) => setWizardStartOffset(Number(e.target.value) || 0)}
                        className="rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">월간 나이트 횟수</span>
                      <input
                        type="number"
                        min={0}
                        max={monthDates.length}
                        value={wizardNightShiftCount}
                        disabled={!isNightPattern(wizardPattern)}
                        onChange={(e) => setWizardNightShiftCount(clampNightShiftCount(Number(e.target.value) || 0, monthDates.length))}
                        className="rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                      />
                    </label>
                    <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">생성 대상</p>
                      <p className="mt-2 text-lg font-bold text-[var(--foreground)]">{wizardSelectedStaffIds.length}명</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{selectedDepartment}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--toss-border)] px-6 py-4">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={closeWizard}
                  className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                >
                  닫기
                </button>
                <div className="flex flex-wrap justify-end gap-2">
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setWizardStep((prev) => (prev - 1) as WizardStep)}
                      className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                    >
                      이전
                    </button>
                  )}
                  {wizardStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (wizardStep === 1 && (!selectedCompany || !selectedDepartment)) {
                          alert('사업체와 팀을 먼저 선택하세요.');
                          return;
                        }
                        if (wizardStep === 2 && wizardSelectedStaffIds.length === 0) {
                          alert('직원을 한 명 이상 선택하세요.');
                          return;
                        }
                        setWizardStep((prev) => (prev + 1) as WizardStep);
                      }}
                      className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white"
                    >
                      다음
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={applyWizard}
                      className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white"
                    >
                      근무표 생성
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

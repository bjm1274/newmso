'use client';
import { toast } from '@/lib/toast';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type WorkShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  company_name?: string | null;
  is_active?: boolean | null;
};

type StaffMember = {
  id: string;
  name?: string;
  position?: string;
  department?: string;
  team?: string;
  company?: string;
  status?: string;
  [key: string]: unknown;
};

type ScheduleMap = Record<string, Record<number, string>>;
type ShiftOption = {
  token: string;
  label: string;
  shortLabel: string;
  color: string;
  hours: string;
  companyName?: string;
};

const OFF_TOKEN = 'OFF';
const LEAVE_TOKEN = 'LEAVE';
const TRAINING_TOKEN = 'TRAINING';

const SPECIAL_SHIFT_OPTIONS: ShiftOption[] = [
  { token: OFF_TOKEN, label: '휴무', shortLabel: '휴', color: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]', hours: '-' },
  { token: LEAVE_TOKEN, label: '휴가', shortLabel: '휴가', color: 'bg-green-100 text-green-600', hours: '-' },
  { token: TRAINING_TOKEN, label: '교육', shortLabel: '교육', color: 'bg-yellow-100 text-yellow-700', hours: '-' },
];

const PATTERN_OPTIONS = [
  { value: '상근', label: '상근', desc: '평일 주 근무, 주말 휴무' },
  { value: '2교대', label: '2교대', desc: '주 근무와 보조 근무를 교차 배치' },
  { value: '3교대', label: '3교대', desc: '주/보조/야간 근무를 순환 배치' },
  { value: '2일근무1일휴무', label: '2일근무 1일휴무', desc: '근무 2일 후 휴무 1일' },
  { value: '1일근무1일휴무', label: '1일근무 1일휴무', desc: '근무 1일 후 휴무 1일' },
  { value: '야간전담', label: '야간전담', desc: '야간 근무 중심으로 순환 배치' },
] as const;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getDay();
}

function buildShiftToken(shiftId: string) {
  return `SHIFT:${shiftId}`;
}

function extractShiftId(token: string) {
  return token.startsWith('SHIFT:') ? token.slice(6) : '';
}

function sortByKorean(a: string, b: string) {
  return a.localeCompare(b, 'ko');
}

function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

function getStaffDepartment(staff: any) {
  return staff?.department || staff?.team || '';
}

function sortWorkShifts(list: WorkShift[]) {
  return [...list].sort((a, b) => {
    const companyCompare = sortByKorean(a.company_name || '', b.company_name || '');
    if (companyCompare !== 0) return companyCompare;
    const startCompare = String(a.start_time || '').localeCompare(String(b.start_time || ''));
    if (startCompare !== 0) return startCompare;
    return sortByKorean(a.name || '', b.name || '');
  });
}

function getShiftColorClass(name: string) {
  const normalized = normalizeShiftName(name);
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]';
  if (normalized.includes('휴가') || normalized.includes('연차')) return 'bg-green-100 text-green-600';
  if (normalized.includes('교육')) return 'bg-yellow-100 text-yellow-700';
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근')) return 'bg-blue-100 text-blue-700';
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || normalized.includes('오후')) return 'bg-orange-100 text-orange-700';
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간')) return 'bg-purple-100 text-purple-700';
  return 'bg-emerald-100 text-emerald-700';
}

function getShiftShortLabel(name: string) {
  const normalized = normalizeShiftName(name);
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근')) return 'D';
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || normalized.includes('오후')) return 'E';
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간')) return 'N';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return '휴';
  if (normalized.includes('휴가') || normalized.includes('연차')) return '휴가';
  if (normalized.includes('교육')) return '교육';
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed.length <= 2 ? trimmed : trimmed.slice(0, 2);
}

function getLegacyShiftInfo(code: string): ShiftOption | null {
  switch (code) {
    case 'D':
      return { token: code, label: '데이', shortLabel: 'D', color: 'bg-blue-100 text-blue-700', hours: '-' };
    case 'E':
      return { token: code, label: '이브닝', shortLabel: 'E', color: 'bg-orange-100 text-orange-700', hours: '-' };
    case 'N':
      return { token: code, label: '나이트', shortLabel: 'N', color: 'bg-purple-100 text-purple-700', hours: '-' };
    case 'O':
      return { token: code, label: '휴무', shortLabel: '휴', color: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]', hours: '-' };
    case 'H':
      return { token: code, label: '휴가', shortLabel: '휴가', color: 'bg-green-100 text-green-600', hours: '-' };
    case 'S':
      return { token: code, label: '교육', shortLabel: '교육', color: 'bg-yellow-100 text-yellow-700', hours: '-' };
    default:
      return null;
  }
}

function resolveShiftInfo(token: string, workShifts: WorkShift[]) {
  const special = SPECIAL_SHIFT_OPTIONS.find((option) => option.token === token);
  if (special) return special;
  const legacy = getLegacyShiftInfo(token);
  if (legacy) return legacy;

  const shiftId = extractShiftId(token);
  if (!shiftId) {
    return { token, label: token || '미지정', shortLabel: token || '?', color: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]', hours: '-' };
  }

  const shift = workShifts.find((item) => item.id === shiftId);
  if (!shift) {
    return { token, label: '삭제된 근무유형', shortLabel: '?', color: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]', hours: '-' };
  }

  return {
    token,
    label: shift.name,
    shortLabel: getShiftShortLabel(shift.name),
    color: getShiftColorClass(shift.name),
    hours: shift.start_time && shift.end_time ? `${shift.start_time}~${shift.end_time}` : '-',
    companyName: shift.company_name || undefined,
  };
}

function getScheduleCategory(token: string) {
  if ([OFF_TOKEN, 'O'].includes(token)) return 'OFF';
  if ([LEAVE_TOKEN, 'H'].includes(token)) return 'LEAVE';
  if ([TRAINING_TOKEN, 'S'].includes(token)) return 'TRAINING';
  return 'WORK';
}

function buildPatternToken({
  pattern,
  primaryToken,
  secondaryToken,
  tertiaryToken,
  startOffset,
  dateIndex,
  dayOfWeek,
}: {
  pattern: string;
  primaryToken: string;
  secondaryToken: string;
  tertiaryToken: string;
  startOffset: number;
  dateIndex: number;
  dayOfWeek: number;
}) {
  const primary = primaryToken || OFF_TOKEN;
  const secondary = secondaryToken || primary;
  const tertiary = tertiaryToken || secondary || primary;

  switch (pattern) {
    case '상근':
      return dayOfWeek === 0 || dayOfWeek === 6 ? OFF_TOKEN : primary;
    case '2교대': {
      const sequence = [primary, secondary, OFF_TOKEN, OFF_TOKEN];
      return sequence[(dateIndex + startOffset) % sequence.length];
    }
    case '3교대': {
      const sequence = [primary, secondary, tertiary, OFF_TOKEN];
      return sequence[(dateIndex + startOffset) % sequence.length];
    }
    case '2일근무1일휴무': {
      const sequence = [primary, secondary, OFF_TOKEN];
      return sequence[(dateIndex + startOffset) % sequence.length];
    }
    case '1일근무1일휴무': {
      const sequence = [primary, OFF_TOKEN];
      return sequence[(dateIndex + startOffset) % sequence.length];
    }
    case '야간전담': {
      const nightToken = tertiary || secondary || primary;
      const sequence = [nightToken, nightToken, OFF_TOKEN, OFF_TOKEN];
      return sequence[(dateIndex + startOffset) % sequence.length];
    }
    default:
      return primary;
  }
}

function isNightPattern(pattern: string) {
  return pattern === '3교대' || pattern === '야간전담';
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

function getNightFallbackToken({
  pattern,
  primaryToken,
  secondaryToken,
  nightToken,
}: {
  pattern: string;
  primaryToken: string;
  secondaryToken: string;
  nightToken: string;
}) {
  if (pattern === '야간전담') return OFF_TOKEN;
  return [secondaryToken, primaryToken, OFF_TOKEN].find((token) => token && token !== nightToken) || OFF_TOKEN;
}

function buildWizardScheduleRow({
  days,
  year,
  month,
  pattern,
  primaryToken,
  secondaryToken,
  tertiaryToken,
  startOffset,
  nightShiftCount,
}: {
  days: number;
  year: number;
  month: number;
  pattern: string;
  primaryToken: string;
  secondaryToken: string;
  tertiaryToken: string;
  startOffset: number;
  nightShiftCount: number;
}) {
  const row: Record<number, string> = {};

  for (let day = 1; day <= days; day += 1) {
    row[day] = buildPatternToken({
      pattern,
      primaryToken,
      secondaryToken,
      tertiaryToken,
      startOffset,
      dateIndex: day - 1,
      dayOfWeek: getDayOfWeek(year, month, day),
    });
  }

  if (!isNightPattern(pattern)) return row;

  const normalizedNightCount = clampNightShiftCount(nightShiftCount, days);
  const nightToken = tertiaryToken || secondaryToken || primaryToken;
  const fallbackToken = getNightFallbackToken({ pattern, primaryToken, secondaryToken, nightToken });
  const baseNightDays = Array.from({ length: days }, (_, index) => index + 1).filter((day) => row[day] === nightToken);
  const desiredNightDays = new Set<number>();
  const baseKeepCount = Math.min(normalizedNightCount, baseNightDays.length);

  selectDistributedDays({
    candidateDays: baseNightDays,
    days,
    targetCount: baseKeepCount,
    seed: startOffset,
  }).forEach((day) => {
    desiredNightDays.add(day);
  });

  if (desiredNightDays.size < normalizedNightCount) {
    const remaining = normalizedNightCount - desiredNightDays.size;
    const allDays = Array.from({ length: days }, (_, index) => index + 1);
    const preferredCandidates =
      pattern === '야간전담'
        ? allDays.filter((day) => !desiredNightDays.has(day) && row[day] === OFF_TOKEN)
        : allDays.filter((day) => !desiredNightDays.has(day) && row[day] !== OFF_TOKEN && row[day] !== nightToken);
    const extraPreferred = selectDistributedDays({
      candidateDays: preferredCandidates,
      days,
      targetCount: Math.min(remaining, preferredCandidates.length),
      seed: startOffset + 1,
    });

    extraPreferred.forEach((day) => {
      desiredNightDays.add(day);
    });

    if (desiredNightDays.size < normalizedNightCount) {
      const fallbackCandidates = allDays.filter((day) => !desiredNightDays.has(day));
      selectDistributedDays({
        candidateDays: fallbackCandidates,
        days,
        targetCount: normalizedNightCount - desiredNightDays.size,
        seed: startOffset + 2,
      }).forEach((day) => {
        desiredNightDays.add(day);
      });
    }
  }

  for (let day = 1; day <= days; day += 1) {
    if (desiredNightDays.has(day)) {
      row[day] = nightToken;
      continue;
    }

    if (row[day] === nightToken) {
      row[day] = fallbackToken;
    }
  }

  return row;
}

function inferDefaultPattern(shiftCount: number) {
  if (shiftCount >= 3) return '3교대';
  if (shiftCount >= 2) return '2교대';
  return '상근';
}

export default function NurseSchedule({ staffs = [], selectedCo }: { staffs: StaffMember[]; selectedCo: string; user?: unknown }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [schedule, setSchedule] = useState<ScheduleMap>({});
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dept, setDept] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardDept, setWizardDept] = useState('');
  const [wizardPattern, setWizardPattern] = useState('3교대');
  const [wizardPrimaryToken, setWizardPrimaryToken] = useState('');
  const [wizardSecondaryToken, setWizardSecondaryToken] = useState('');
  const [wizardTertiaryToken, setWizardTertiaryToken] = useState('');
  const [wizardStartOffset, setWizardStartOffset] = useState(0);
  const [wizardNightShiftCount, setWizardNightShiftCount] = useState(0);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  const scopedStaffs = (staffs || []).filter((staff: StaffMember) => {
    if (staff?.status === '퇴사') return false;
    return selectedCo === '전체' || staff?.company === selectedCo;
  });
  const depts = Array.from(new Set(scopedStaffs.map((staff: StaffMember) => getStaffDepartment(staff)).filter(Boolean))).sort(sortByKorean);
  const days = getDaysInMonth(year, month);
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const getRelevantWorkShifts = (targetStaffs: StaffMember[]) => {
    const companySet = new Set(targetStaffs.map((staff) => staff?.company).filter(Boolean));
    const filtered = workShifts.filter((shift) => companySet.size && companySet.has(shift.company_name || ''));
    return sortWorkShifts(filtered);
  };

  const getShiftOptionsForStaffs = (targetStaffs: StaffMember[]) => {
    const dynamicOptions = getRelevantWorkShifts(targetStaffs).map((shift) => ({
      token: buildShiftToken(shift.id),
      label: shift.name,
      shortLabel: getShiftShortLabel(shift.name),
      color: getShiftColorClass(shift.name),
      hours: shift.start_time && shift.end_time ? `${shift.start_time}~${shift.end_time}` : '-',
      companyName: shift.company_name || undefined,
    }));
    return [...dynamicOptions, ...SPECIAL_SHIFT_OPTIONS];
  };

  useEffect(() => {
    if (depts.length === 0) {
      setDept('');
      return;
    }
    if (!dept || !depts.includes(dept)) {
      const nursingDept = depts.find((item) => item.includes('간호')) || depts[0];
      setDept(nursingDept);
    }
  }, [dept, depts]);

  const visibleStaffs = scopedStaffs.filter((staff: StaffMember) => getStaffDepartment(staff) === dept);
  const legendOptions = getShiftOptionsForStaffs(visibleStaffs);

  useEffect(() => {
    const fetchSchedule = async () => {
      const { data } = await supabase.from('nurse_schedules').select('*').eq('year_month', ym);
      const mapped: ScheduleMap = {};
      (data || []).forEach((row: Record<string, unknown>) => {
        const staffId = String(row.staff_id ?? '');
        const day = Number(row.day);
        const shiftCode = String(row.shift_code ?? '');
        if (!mapped[staffId]) mapped[staffId] = {};
        mapped[staffId][day] = shiftCode;
      });
      setSchedule(mapped);
    };
    fetchSchedule();
  }, [ym]);

  useEffect(() => {
    const fetchWorkShifts = async () => {
      let query = supabase
        .from('work_shifts')
        .select('id, name, start_time, end_time, company_name, is_active')
        .eq('is_active', true);

      if (selectedCo !== '전체') {
        query = query.eq('company_name', selectedCo);
      }

      const { data } = await query.order('company_name').order('start_time');
      setWorkShifts(sortWorkShifts((data || []) as WorkShift[]));
    };
    fetchWorkShifts();
  }, [selectedCo]);

  const wizardTargetStaffs = scopedStaffs.filter((staff: StaffMember) => getStaffDepartment(staff) === wizardDept);
  const wizardWorkingShiftOptions = getRelevantWorkShifts(wizardTargetStaffs).map((shift) => ({
    token: buildShiftToken(shift.id),
    label: shift.name,
    shortLabel: getShiftShortLabel(shift.name),
    color: getShiftColorClass(shift.name),
    hours: shift.start_time && shift.end_time ? `${shift.start_time}~${shift.end_time}` : '-',
    companyName: shift.company_name || undefined,
  }));

  useEffect(() => {
    if (!wizardOpen) return;

    const validStaffIds = new Set(wizardTargetStaffs.map((staff: StaffMember) => String(staff.id)));
    const defaultStaffIds = wizardTargetStaffs.map((staff: StaffMember) => String(staff.id));
    const validShiftTokens = new Set(wizardWorkingShiftOptions.map((option) => option.token));
    const defaultPrimary = wizardWorkingShiftOptions[0]?.token || '';
    const defaultSecondary = wizardWorkingShiftOptions[1]?.token || defaultPrimary;
    const defaultTertiary = wizardWorkingShiftOptions[2]?.token || defaultSecondary || defaultPrimary;

    setSelectedStaffIds((prev) => {
      const next = prev.filter((id) => validStaffIds.has(String(id)));
      return next.length ? next : defaultStaffIds;
    });
    setWizardPrimaryToken((prev) => (validShiftTokens.has(prev) ? prev : defaultPrimary));
    setWizardSecondaryToken((prev) => (validShiftTokens.has(prev) ? prev : defaultSecondary));
    setWizardTertiaryToken((prev) => (validShiftTokens.has(prev) ? prev : defaultTertiary));
    setWizardPattern((prev) => {
      if (prev === '3교대' && wizardWorkingShiftOptions.length < 3) return inferDefaultPattern(wizardWorkingShiftOptions.length);
      if (prev === '2교대' && wizardWorkingShiftOptions.length < 2) return inferDefaultPattern(wizardWorkingShiftOptions.length);
      return prev;
    });
  }, [wizardDept, wizardOpen, wizardTargetStaffs, wizardWorkingShiftOptions]);

  useEffect(() => {
    if (!wizardOpen || !isNightPattern(wizardPattern)) return;
    setWizardNightShiftCount((prev) => {
      const normalized = clampNightShiftCount(prev, days);
      return normalized > 0 ? normalized : inferDefaultNightShiftCount(wizardPattern, days);
    });
  }, [days, wizardOpen, wizardPattern]);

  const setShift = (staffId: string, day: number, token: string) => {
    if (!editMode) return;
    setSchedule((prev) => ({ ...prev, [staffId]: { ...(prev[staffId] || {}), [day]: token } }));
  };

  const cycleShift = (staff: any, day: number) => {
    if (!editMode) return;
    const options = [
      SPECIAL_SHIFT_OPTIONS[0],
      ...getRelevantWorkShifts([staff]).map((shift) => ({
        token: buildShiftToken(shift.id),
        label: shift.name,
        shortLabel: getShiftShortLabel(shift.name),
        color: getShiftColorClass(shift.name),
        hours: shift.start_time && shift.end_time ? `${shift.start_time}~${shift.end_time}` : '-',
        companyName: shift.company_name || undefined,
      })),
      SPECIAL_SHIFT_OPTIONS[1],
      SPECIAL_SHIFT_OPTIONS[2],
    ];
    if (options.length === 0) return;

    const current = schedule[staff.id]?.[day] || OFF_TOKEN;
    const currentIndex = options.findIndex((option) => option.token === current);
    const nextOption = currentIndex === -1 ? options[0] : options[(currentIndex + 1) % options.length];
    setShift(staff.id, day, nextOption.token);
  };

  const saveSchedule = async () => {
    const staffIds = scopedStaffs.map((staff: StaffMember) => staff.id).filter(Boolean);
    if (staffIds.length === 0) return toast('저장할 직원이 없습니다.', 'success');

    setSaving(true);
    try {
      const rows: Record<string, unknown>[] = [];
      staffIds.forEach((staffId: string) => {
        Object.entries(schedule[staffId] || {}).forEach(([dayStr, token]) => {
          rows.push({ staff_id: staffId, year_month: ym, day: Number(dayStr), shift_code: token });
        });
      });

      await supabase.from('nurse_schedules').delete().eq('year_month', ym).in('staff_id', staffIds);
      if (rows.length > 0) await supabase.from('nurse_schedules').insert(rows);
      setEditMode(false);
      toast('근무표가 저장되었습니다.', 'success');
    } catch {
      toast('저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openWizard = () => {
    const targetDept = dept || depts[0] || '';
    const targetStaffs = scopedStaffs.filter((staff: StaffMember) => getStaffDepartment(staff) === targetDept);
    const shiftOptions = getRelevantWorkShifts(targetStaffs);
    const defaultPattern = inferDefaultPattern(shiftOptions.length);
    const primary = shiftOptions[0]?.id ? buildShiftToken(shiftOptions[0].id) : '';
    const secondary = shiftOptions[1]?.id ? buildShiftToken(shiftOptions[1].id) : primary;
    const tertiary = shiftOptions[2]?.id ? buildShiftToken(shiftOptions[2].id) : secondary || primary;

    setWizardDept(targetDept);
    setSelectedStaffIds(targetStaffs.map((staff: StaffMember) => String(staff.id)));
    setWizardPattern(defaultPattern);
    setWizardPrimaryToken(primary);
    setWizardSecondaryToken(secondary);
    setWizardTertiaryToken(tertiary);
    setWizardStartOffset(0);
    setWizardNightShiftCount(inferDefaultNightShiftCount(defaultPattern, days));
    setWizardOpen(true);
  };

  const applyWizard = () => {
    if (!wizardDept) return toast('생성할 팀을 선택하세요.', 'warning');
    if (!selectedStaffIds.length) return toast('생성할 직원을 한 명 이상 선택하세요.', 'warning');
    if (!wizardPrimaryToken) return toast('주 근무유형을 선택하세요.', 'warning');
    if ((wizardPattern === '2교대' || wizardPattern === '3교대' || wizardPattern === '2일근무1일휴무') && !wizardSecondaryToken) return toast('보조 근무유형을 선택하세요.', 'warning');
    if ((wizardPattern === '3교대' || wizardPattern === '야간전담') && !wizardTertiaryToken) return toast('야간/3차 근무유형을 선택하세요.', 'warning');

    const targetStaffs = wizardTargetStaffs.filter((staff: StaffMember) => selectedStaffIds.includes(String(staff.id)));
    if (!targetStaffs.length) return toast('생성 대상 직원이 없습니다.');
    if (!confirm(`${wizardDept} 팀 ${targetStaffs.length}명의 ${ym} 간호 근무표를 생성하시겠습니까?\n선택한 직원의 기존 편성은 덮어씁니다.`)) return;

    setGenerating(true);
    setSchedule((prev) => {
      const next = { ...prev };
      targetStaffs.forEach((staff: any, staffIndex: number) => {
        const row = buildWizardScheduleRow({
          days,
          year,
          month,
          pattern: wizardPattern,
          primaryToken: wizardPrimaryToken,
          secondaryToken: wizardSecondaryToken || wizardPrimaryToken,
          tertiaryToken: wizardTertiaryToken || wizardSecondaryToken || wizardPrimaryToken,
          startOffset: wizardStartOffset + staffIndex,
          nightShiftCount: wizardNightShiftCount,
        });
        next[staff.id] = row;
      });
      return next;
    });
    setDept(wizardDept);
    setEditMode(true);
    setWizardOpen(false);
    setGenerating(false);
    toast(`${wizardDept} 팀 ${targetStaffs.length}명의 근무표가 생성되었습니다. 저장 버튼으로 확정하세요.`, 'success');
  };

  const countByCategory = (day: number, category: string) =>
    visibleStaffs.filter((staff: StaffMember) => getScheduleCategory(schedule[staff.id]?.[day] || OFF_TOKEN) === category).length;

  const staffCategoryCount = (staffId: string, category: string) =>
    Object.values(schedule[staffId] || {}).filter((token) => getScheduleCategory(token) === category).length;

  const totalCategoryCount = (category: string) =>
    visibleStaffs.reduce((sum: number, staff: any) => sum + staffCategoryCount(staff.id, category), 0);

  const prevMonth = () => {
    if (month === 1) {
      setYear((value) => value - 1);
      setMonth(12);
      return;
    }
    setMonth((value) => value - 1);
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear((value) => value + 1);
      setMonth(1);
      return;
    }
    setMonth((value) => value + 1);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 md:p-4 border-b border-[var(--border)] bg-[var(--card)] flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold">‹</button>
            <div>
              <h2 className="text-base font-bold text-[var(--foreground)]">{year}년 {month}월 간호 근무표</h2>
              <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">
                현재 팀: <span className="font-bold text-[var(--foreground)]">{dept || '-'}</span> · 표시 직원 {visibleStaffs.length}명
              </p>
            </div>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold">›</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="px-3 py-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-bold bg-[var(--card)] outline-none">
              {depts.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button onClick={openWizard} disabled={generating || scopedStaffs.length === 0} className="px-3 py-1.5 bg-purple-500 text-white rounded-[var(--radius-md)] text-xs font-bold disabled:opacity-50">
              생성 마법사
            </button>
            <button onClick={() => setEditMode((value) => !value)} className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold ${editMode ? 'bg-orange-500 text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>
              {editMode ? '편집 중' : '편집'}
            </button>
            {editMode && <button onClick={saveSchedule} disabled={saving} className="px-3 py-1.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-bold disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">근무표 범위</p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">{days}일</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">팀 인원</p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">{visibleStaffs.length}명</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">근무유형</p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">{Math.max(legendOptions.length - SPECIAL_SHIFT_OPTIONS.length, 0)}개</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">저장 범위</p>
            <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{selectedCo === '전체' ? '전체 사업체' : selectedCo}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-[var(--border)] shrink-0 bg-[var(--card)]">
        {legendOptions.map((option) => (
          <span key={option.token} className={`px-2 py-0.5 rounded-[var(--radius-md)] text-[9px] font-bold ${option.color}`}>
            {option.shortLabel} {option.label} {option.hours !== '-' ? option.hours : ''}
          </span>
        ))}
      </div>

      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">Shift Wizard</p>
                <h3 className="mt-1 text-lg font-bold text-[var(--foreground)]">팀별 간호 근무표 생성 마법사</h3>
                <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">팀, 직원, 근무유형, 생성 패턴을 선택해서 월간 근무표를 자동 생성합니다.</p>
              </div>
              <button onClick={() => setWizardOpen(false)} className="rounded-[var(--radius-md)] p-2 text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">✕</button>
            </div>

            <div className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-5">
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">1. 생성 대상</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">팀 선택</span>
                      <select value={wizardDept} onChange={(e) => setWizardDept(e.target.value)} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none">
                        {depts.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                      <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">생성 월</p>
                      <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{ym}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2 flex-wrap">
                    <button type="button" onClick={() => setSelectedStaffIds(wizardTargetStaffs.map((staff: StaffMember) => String(staff.id)))} className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--foreground)] text-white text-[11px] font-bold">
                      전체 선택
                    </button>
                    <button type="button" onClick={() => setSelectedStaffIds([])} className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-bold">
                      전체 해제
                    </button>
                  </div>

                  <div className="mt-4 max-h-[260px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
                    {wizardTargetStaffs.length === 0 ? (
                      <div className="px-4 py-5 text-center text-sm font-bold text-[var(--toss-gray-3)]">선택한 팀에 직원이 없습니다.</div>
                    ) : (
                      <div className="divide-y divide-[var(--border)]">
                        {wizardTargetStaffs.map((staff: StaffMember) => {
                          const checked = selectedStaffIds.includes(String(staff.id));
                          return (
                            <label key={staff.id} className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--muted)]/60">
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    setSelectedStaffIds((prev) => {
                                      if (event.target.checked) return [...new Set([...prev, String(staff.id)])];
                                      return prev.filter((id) => id !== String(staff.id));
                                    });
                                  }}
                                />
                                <div>
                                  <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                                  <p className="text-[11px] text-[var(--toss-gray-3)]">{staff.position || '-'} · {staff.company || '-'}</p>
                                </div>
                              </div>
                              <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{resolveShiftInfo(schedule[staff.id]?.[1] || OFF_TOKEN, workShifts).label}</p>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">2. 생성 방식</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">패턴</span>
                      <select value={wizardPattern} onChange={(e) => setWizardPattern(e.target.value)} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none">
                        {PATTERN_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">시작 오프셋</span>
                      <input type="number" min={0} value={wizardStartOffset} onChange={(e) => setWizardStartOffset(Number(e.target.value) || 0)} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">월간 나이트 횟수</span>
                      <input
                        type="number"
                        min={0}
                        max={days}
                        value={wizardNightShiftCount}
                        disabled={!isNightPattern(wizardPattern)}
                        onChange={(e) => setWizardNightShiftCount(clampNightShiftCount(Number(e.target.value) || 0, days))}
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:bg-[var(--muted)] disabled:text-[var(--toss-gray-3)]"
                      />
                    </label>
                  </div>

                  <p className="mt-3 text-[11px] leading-5 text-[var(--toss-gray-3)]">
                    월간 나이트 횟수는 선택한 직원 1인당 목표 횟수로 반영됩니다. 3교대와 야간전담 패턴에서만 적용됩니다.
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주 근무유형</span>
                      <select value={wizardPrimaryToken} onChange={(e) => setWizardPrimaryToken(e.target.value)} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none">
                        <option value="">선택하세요</option>
                        {wizardWorkingShiftOptions.map((option) => (
                          <option key={option.token} value={option.token}>
                            {option.label}{option.hours !== '-' ? ` (${option.hours})` : ''}{selectedCo === '전체' && option.companyName ? ` · ${option.companyName}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">보조 근무유형</span>
                      <select value={wizardSecondaryToken} onChange={(e) => setWizardSecondaryToken(e.target.value)} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none">
                        <option value="">선택하세요</option>
                        {wizardWorkingShiftOptions.map((option) => (
                          <option key={option.token} value={option.token}>
                            {option.label}{option.hours !== '-' ? ` (${option.hours})` : ''}{selectedCo === '전체' && option.companyName ? ` · ${option.companyName}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">야간/3차 근무유형</span>
                      <select value={wizardTertiaryToken} onChange={(e) => setWizardTertiaryToken(e.target.value)} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none">
                        <option value="">선택하세요</option>
                        {wizardWorkingShiftOptions.map((option) => (
                          <option key={option.token} value={option.token}>
                            {option.label}{option.hours !== '-' ? ` (${option.hours})` : ''}{selectedCo === '전체' && option.companyName ? ` · ${option.companyName}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">3. 생성 요약</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[var(--radius-lg)] bg-[var(--card)] p-4">
                      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">선택 직원</p>
                      <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{selectedStaffIds.length}명</p>
                    </div>
                    <div className="rounded-[var(--radius-lg)] bg-[var(--card)] p-4">
                      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">사용 근무유형</p>
                      <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{wizardWorkingShiftOptions.length}개</p>
                    </div>
                    <div className="rounded-[var(--radius-lg)] bg-[var(--card)] p-4">
                      <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">월간 나이트</p>
                      <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{isNightPattern(wizardPattern) ? `${wizardNightShiftCount}회` : '미적용'}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--card)] p-4">
                    <p className="text-[11px] font-bold text-[var(--foreground)]">패턴 설명</p>
                    <p className="mt-2 text-[12px] leading-6 text-[var(--toss-gray-3)]">
                      {PATTERN_OPTIONS.find((option) => option.value === wizardPattern)?.desc || '패턴 설명이 없습니다.'}
                    </p>
                  </div>

                  <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--card)] p-4">
                    <p className="text-[11px] font-bold text-[var(--foreground)]">생성 근무유형 조합</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[wizardPrimaryToken, wizardSecondaryToken, wizardTertiaryToken].filter(Boolean).map((token) => {
                        const info = resolveShiftInfo(token, workShifts);
                        return (
                          <span key={token} className={`px-3 py-1 rounded-[var(--radius-md)] text-[11px] font-bold ${info.color}`}>
                            {info.shortLabel} {info.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="flex gap-2">
                    <button onClick={() => setWizardOpen(false)} className="flex-1 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] text-sm font-bold">
                      취소
                    </button>
                    <button onClick={applyWizard} disabled={generating || wizardTargetStaffs.length === 0 || wizardWorkingShiftOptions.length === 0} className="flex-[1.3] px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50">
                      {generating ? '생성 중...' : '근무표 생성'}
                    </button>
                  </div>
                  {wizardWorkingShiftOptions.length === 0 && (
                    <p className="mt-3 text-[11px] font-bold text-red-500">선택한 팀에 연결된 활성 근무유형이 없습니다. 먼저 근무형태를 등록해 주세요.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {visibleStaffs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[var(--toss-gray-3)] font-bold text-sm">
          선택한 팀에 직원이 없습니다. 팀 필터를 변경해보세요.
        </div>
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="text-left border-collapse" style={{ minWidth: `${220 + days * 42}px` }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[var(--card)] border-b border-[var(--border)]">
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--toss-gray-3)] w-40 sticky left-0 bg-[var(--card)] z-30">이름</th>
                {Array.from({ length: days }, (_, index) => index + 1).map((day) => {
                  const dayOfWeek = getDayOfWeek(year, month, day);
                  const isSun = dayOfWeek === 0;
                  const isSat = dayOfWeek === 6;
                  const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();
                  return (
                    <th key={day} className={`w-10 py-2 text-center text-[9px] font-semibold ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-[var(--toss-gray-3)]'} ${isToday ? 'bg-[var(--toss-blue-light)]' : ''}`}>
                      <div>{day}</div>
                      <div className="text-[8px]">{'일월화수목금토'[dayOfWeek]}</div>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-10">근무</th>
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-10">휴무</th>
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-10">휴가</th>
                <th className="px-2 py-2 text-[9px] font-semibold text-[var(--toss-gray-3)] text-center w-10">교육</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visibleStaffs.map((staff: StaffMember) => (
                <tr key={staff.id} className="hover:bg-[var(--muted)]/30">
                  <td className="px-3 py-1.5 sticky left-0 bg-[var(--card)] border-r border-[var(--border)] z-10">
                    <p className="text-xs font-bold text-[var(--foreground)]">{staff.name}</p>
                    <p className="text-[9px] text-[var(--toss-gray-3)]">{staff.position || '-'} · {staff.company || '-'}</p>
                  </td>
                  {Array.from({ length: days }, (_, index) => index + 1).map((day) => {
                    const token = schedule[staff.id]?.[day] || OFF_TOKEN;
                    const info = resolveShiftInfo(token, workShifts);
                    return (
                      <td key={day} className="p-0.5 text-center">
                        <button onClick={() => cycleShift(staff, day)} className={`w-9 h-8 rounded-md text-[9px] font-bold transition-all ${info.color} ${editMode ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`} title={`${staff.name} ${day}일: ${info.label}${info.hours !== '-' ? ` (${info.hours})` : ''}`}>
                          {info.shortLabel}
                        </button>
                      </td>
                    );
                  })}
                  {['WORK', 'OFF', 'LEAVE', 'TRAINING'].map((category) => (
                    <td key={category} className="text-center text-[10px] font-bold text-[var(--toss-gray-4)]">
                      {staffCategoryCount(staff.id, category)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-[var(--muted)]/50 border-t-2 border-[var(--border)]">
                <td className="px-3 py-1.5 sticky left-0 bg-[var(--muted)]/80 text-[9px] font-bold text-[var(--toss-gray-3)]">일별 근무/휴무</td>
                {Array.from({ length: days }, (_, index) => index + 1).map((day) => (
                  <td key={day} className="text-center py-1">
                    <div className="text-[8px] text-blue-600 font-bold">{countByCategory(day, 'WORK')}</div>
                    <div className="text-[8px] text-[var(--toss-gray-4)] font-bold">{countByCategory(day, 'OFF')}</div>
                  </td>
                ))}
                <td className="text-center text-[10px] font-bold text-[var(--toss-gray-4)]">{totalCategoryCount('WORK')}</td>
                <td className="text-center text-[10px] font-bold text-[var(--toss-gray-4)]">{totalCategoryCount('OFF')}</td>
                <td className="text-center text-[10px] font-bold text-[var(--toss-gray-4)]">{totalCategoryCount('LEAVE')}</td>
                <td className="text-center text-[10px] font-bold text-[var(--toss-gray-4)]">{totalCategoryCount('TRAINING')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

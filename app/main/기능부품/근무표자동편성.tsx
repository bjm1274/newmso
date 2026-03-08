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

const PATTERN_OPTIONS = [
  { value: '상근', label: '상근', desc: '평일 근무, 주말 휴무' },
  { value: '2교대', label: '2교대', desc: '주/야 또는 A/B 2개 근무 순환' },
  { value: '3교대', label: '3교대', desc: '데이/이브닝/나이트 + 휴무 순환' },
  { value: '2일근무1일휴무', label: '2일근무 1일휴무', desc: '이틀 근무 후 하루 휴무' },
  { value: '1일근무1일휴무', label: '1일근무 1일휴무', desc: '하루 근무 후 하루 휴무' },
  { value: '야간전담', label: '야간전담', desc: '야간 위주 편성 + 휴무 순환' },
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

function buildInitialConfig(staff: any, index: number, shifts: WorkShift[]) {
  const primary = shifts.find((shift) => shift.id === staff?.shift_id)?.id || shifts[0]?.id || '';
  const secondary = shifts[1]?.id || primary;
  const tertiary = shifts[2]?.id || secondary || primary;

  return {
    enabled: true,
    pattern: inferPattern(staff, shifts),
    primaryShiftId: primary,
    secondaryShiftId: secondary,
    tertiaryShiftId: tertiary,
    startOffset: index,
  };
}

function getPatternShiftId(config: StaffConfig, date: string, dateIndex: number) {
  const primary = config.primaryShiftId;
  const secondary = config.secondaryShiftId || primary;
  const tertiary = config.tertiaryShiftId || secondary || primary;
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
      const sequence = [primary, primary, OFF_SHIFT_TOKEN];
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
}

function getShiftCode(name: string) {
  const normalized = normalizeShiftName(name);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return '휴';
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

export default function AutoRosterPlanner({
  user,
  staffs = [],
}: {
  user?: any;
  staffs?: any[];
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
  const [bulkPattern, setBulkPattern] = useState('3교대');
  const [bulkPrimaryShiftId, setBulkPrimaryShiftId] = useState('');
  const [bulkSecondaryShiftId, setBulkSecondaryShiftId] = useState('');
  const [bulkTertiaryShiftId, setBulkTertiaryShiftId] = useState('');
  const [bulkStartOffset, setBulkStartOffset] = useState(0);

  useEffect(() => {
    if (!companyOptions.length) return;
    if (!isAdmin) {
      setSelectedCompany(user?.company || companyOptions[0]);
      setSelectedDepartment(ownDepartment);
      return;
    }
    if (!selectedCompany || !companyOptions.includes(selectedCompany)) {
      setSelectedCompany(user?.company && user.company !== 'SY INC.' ? user.company : companyOptions[0]);
    }
  }, [companyOptions, isAdmin, ownDepartment, selectedCompany, user?.company]);

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
      return ownDepartment ? [ownDepartment] : list;
    }
    return ['전체 부서', ...list];
  }, [activeStaffs, isAdmin, ownDepartment, selectedCompany]);

  useEffect(() => {
    if (!departmentOptions.length) return;
    if (!isAdmin) {
      setSelectedDepartment(ownDepartment || departmentOptions[0]);
      return;
    }
    if (!selectedDepartment || !departmentOptions.includes(selectedDepartment)) {
      setSelectedDepartment(departmentOptions[0]);
    }
  }, [departmentOptions, isAdmin, ownDepartment, selectedDepartment]);

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

  const targetStaffs = useMemo(() => {
    return activeStaffs.filter((staff: any) => {
      if (selectedCompany && staff.company !== selectedCompany) return false;
      if (!isAdmin && ownDepartment) {
        return getDepartmentName(staff) === ownDepartment;
      }
      if (selectedDepartment && selectedDepartment !== '전체 부서') {
        return getDepartmentName(staff) === selectedDepartment;
      }
      return true;
    });
  }, [activeStaffs, isAdmin, ownDepartment, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (!targetStaffs.length || !defaultShiftOrder.length) return;
    const validShiftIds = new Set(workingShifts.map((shift) => shift.id));
    const fallbackPrimary = defaultShiftOrder[0]?.id || '';
    const fallbackSecondary = defaultShiftOrder[1]?.id || fallbackPrimary;
    const fallbackTertiary = defaultShiftOrder[2]?.id || fallbackSecondary || fallbackPrimary;

    setStaffConfigs((prev) => {
      const next: Record<string, StaffConfig> = {};
      targetStaffs.forEach((staff: any, index: number) => {
        const current = prev[staff.id];
        next[staff.id] = current
          ? {
            ...current,
            primaryShiftId: validShiftIds.has(current.primaryShiftId) ? current.primaryShiftId : fallbackPrimary,
            secondaryShiftId: validShiftIds.has(current.secondaryShiftId) ? current.secondaryShiftId : fallbackSecondary,
            tertiaryShiftId: validShiftIds.has(current.tertiaryShiftId) ? current.tertiaryShiftId : fallbackTertiary,
          }
          : buildInitialConfig(staff, index, defaultShiftOrder);
      });
      return next;
    });

    setBulkPrimaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackPrimary : prev));
    setBulkSecondaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackSecondary : prev));
    setBulkTertiaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackTertiary : prev));
  }, [defaultShiftOrder, targetStaffs, workingShifts]);

  const previewRows = useMemo(() => {
    return targetStaffs
      .filter((staff: any) => staffConfigs[staff.id]?.enabled)
      .map((staff: any) => {
        const config = staffConfigs[staff.id];
        const cells = monthDates.map((date, index) => {
          const shiftId = getPatternShiftId(config, date, index);
          const shiftName = shiftId === OFF_SHIFT_TOKEN ? '휴무' : workShifts.find((shift) => shift.id === shiftId)?.name || '미지정';
          return {
            date,
            shiftId,
            shiftName,
            code: getShiftCode(shiftName),
            badgeClass: getShiftBadgeClass(shiftName),
          };
        });

        return { staff, config, cells };
      });
  }, [monthDates, staffConfigs, targetStaffs, workShifts]);

  const summary = useMemo(() => {
    const enabledConfigs = Object.values(staffConfigs).filter((config) => config.enabled);
    return {
      staffCount: targetStaffs.length,
      enabledCount: enabledConfigs.length,
      patternCount: new Set(enabledConfigs.map((config) => config.pattern)).size,
      shiftCount: workingShifts.length,
    };
  }, [staffConfigs, targetStaffs.length, workingShifts.length]);

  const updateConfig = (staffId: string, patch: Partial<StaffConfig>) => {
    setStaffConfigs((prev) => ({
      ...prev,
      [staffId]: {
        ...prev[staffId],
        ...patch,
      },
    }));
  };

  const applyBulkConfig = () => {
    if (!targetStaffs.length) return;
    setStaffConfigs((prev) => {
      const next = { ...prev };
      targetStaffs.forEach((staff: any, index: number) => {
        const current = next[staff.id] || buildInitialConfig(staff, index, defaultShiftOrder);
        next[staff.id] = {
          ...current,
          enabled: true,
          pattern: bulkPattern,
          primaryShiftId: bulkPrimaryShiftId || current.primaryShiftId,
          secondaryShiftId: bulkSecondaryShiftId || current.secondaryShiftId,
          tertiaryShiftId: bulkTertiaryShiftId || current.tertiaryShiftId,
          startOffset: bulkStartOffset + index,
        };
      });
      return next;
    });
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
    if (!enabledRows.length) return alert('저장할 대상 직원이 없습니다.');
    if (!confirm(`${selectedMonth} 근무표를 저장하시겠습니까?\n기존 월간 편성은 덮어씁니다.`)) return;

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

      alert(`${enabledRows.length}명의 ${selectedMonth} 근무표를 저장했습니다.`);
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
        부서장 이상만 근무표 자동편성 메뉴를 사용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--toss-blue)]">Auto Roster</p>
            <h3 className="mt-2 text-xl font-bold text-[var(--foreground)]">근무표 자동편성</h3>
            <p className="mt-2 text-[12px] text-[var(--toss-gray-3)]">
              2교대, 3교대, 2일근무 1일휴무, 1일근무 1일휴무 패턴을 월 단위로 생성하고 기존 근무표에 바로 반영합니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">기준 월</span>
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
                disabled={!isAdmin}
                className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-50"
              >
                {companyOptions.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">대상 부서</span>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                disabled={!isAdmin}
                className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-50"
              >
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={saveAssignments}
                disabled={saving || loadingShifts || previewRows.length === 0}
                className="w-full rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '저장 중...' : '월간 근무표 저장'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">대상 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.staffCount}명</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">편성 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.enabledCount}명</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">사용 패턴</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.patternCount}개</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">근무형태</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.shiftCount}개</p>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h4 className="text-base font-bold text-[var(--foreground)]">일괄 편성 규칙</h4>
          <p className="text-[12px] text-[var(--toss-gray-3)]">
            부서 전체에 같은 패턴을 빠르게 적용한 뒤, 아래 표에서 직원별로 세부 조정할 수 있습니다.
          </p>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">패턴</span>
            <select
              value={bulkPattern}
              onChange={(e) => setBulkPattern(e.target.value)}
              className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
            >
              {PATTERN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주 근무</span>
            <select
              value={bulkPrimaryShiftId}
              onChange={(e) => setBulkPrimaryShiftId(e.target.value)}
              className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
            >
              {workingShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">보조 근무</span>
            <select
              value={bulkSecondaryShiftId}
              onChange={(e) => setBulkSecondaryShiftId(e.target.value)}
              className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
            >
              {workingShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">야간/3차 근무</span>
            <select
              value={bulkTertiaryShiftId}
              onChange={(e) => setBulkTertiaryShiftId(e.target.value)}
              className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
            >
              {workingShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">시작 오프셋</span>
            <input
              type="number"
              min={0}
              value={bulkStartOffset}
              onChange={(e) => setBulkStartOffset(Number(e.target.value) || 0)}
              className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PATTERN_OPTIONS.map((option) => (
            <span
              key={option.value}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                bulkPattern === option.value
                  ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                  : 'border-[var(--toss-border)] bg-white text-[var(--toss-gray-3)]'
              }`}
            >
              {option.label} · {option.desc}
            </span>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={applyBulkConfig}
            disabled={loadingShifts || workingShifts.length === 0 || targetStaffs.length === 0}
            className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--toss-blue)] hover:text-[var(--toss-blue)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            부서 전체에 규칙 적용
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">직원별 편성 설정</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              각 직원의 교대 패턴과 순환 시작점을 개별로 수정할 수 있습니다.
            </p>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--toss-blue)]">근무형태 불러오는 중...</span>}
        </div>

        {workingShifts.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 사업체에 등록된 근무형태가 없습니다. 먼저 근무형태 관리에서 주간/야간/휴무 코드를 등록하세요.
          </div>
        ) : targetStaffs.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 조건에 맞는 직원이 없습니다.
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
                  <th className="px-3 py-2">오프셋</th>
                </tr>
              </thead>
              <tbody>
                {targetStaffs.map((staff: any, index: number) => {
                  const config = staffConfigs[staff.id] || buildInitialConfig(staff, index, defaultShiftOrder);
                  return (
                    <tr key={staff.id} className="rounded-[18px] bg-[var(--toss-gray-1)]">
                      <td className="rounded-l-[18px] px-3 py-3">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => updateConfig(staff.id, { enabled: e.target.checked })}
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
                          onChange={(e) => updateConfig(staff.id, { pattern: e.target.value })}
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
                          onChange={(e) => updateConfig(staff.id, { primaryShiftId: e.target.value })}
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
                          onChange={(e) => updateConfig(staff.id, { secondaryShiftId: e.target.value })}
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
                          value={config.tertiaryShiftId}
                          onChange={(e) => updateConfig(staff.id, { tertiaryShiftId: e.target.value })}
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="rounded-r-[18px] px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          value={config.startOffset}
                          onChange={(e) => updateConfig(staff.id, { startOffset: Number(e.target.value) || 0 })}
                          className="w-24 rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">월간 미리보기</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              저장 전 편성 결과를 일자별로 확인할 수 있습니다. 휴무 코드는 없으면 자동으로 생성됩니다.
            </p>
          </div>
          <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
            {previewRows.length}명 표시 중
          </span>
        </div>

        {previewRows.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            적용된 직원이 없어서 미리보기를 표시할 수 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: `${220 + monthDates.length * 42}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[220px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                    직원
                  </th>
                  {monthDates.map((date) => {
                    const day = Number(date.slice(-2));
                    const weekday = '일월화수목금토'[new Date(`${date}T00:00:00`).getDay()];
                    return (
                      <th
                        key={date}
                        className="min-w-[42px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
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
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} className="px-1 py-2 text-center">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] border text-[11px] font-black ${cell.badgeClass}`}
                          title={`${row.staff.name} ${cell.date} ${cell.shiftName}`}
                        >
                          {cell.code}
                        </span>
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
  );
}

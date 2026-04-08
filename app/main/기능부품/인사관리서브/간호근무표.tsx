'use client';
import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';

// ─────────────────────── 타입 ───────────────────────
type WorkShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  company_name?: string | null;
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

type ShiftRole = 'D' | 'E' | 'N' | 'OFF' | 'LEAVE' | 'TRAINING';
type StaffShiftType = 'rotation' | 'day_fixed' | 'evening_fixed' | 'night_fixed';
type Violation = 'N_THEN_D' | 'CONSECUTIVE_N';

type StaffConfig = {
  staffId: string;
  shiftType: StaffShiftType;
  preferredOffDays: number[];
};

type MinStaffConfig = { D: number; E: number; N: number };
type ScheduleMap = Record<string, Record<number, ShiftRole>>;
type WizardStep = 1 | 2 | 3 | 4;

// ─────────────────────── 상수 ───────────────────────
const ROLE_META: Record<ShiftRole, { label: string; short: string; color: string; hours: number }> = {
  D:        { label: '데이',   short: 'D',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         hours: 8 },
  E:        { label: '이브닝', short: 'E',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', hours: 8 },
  N:        { label: '나이트', short: 'N',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', hours: 8 },
  OFF:      { label: '휴무',   short: '휴',  color: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]',                            hours: 0 },
  LEAVE:    { label: '휴가',   short: '휴가', color: 'bg-green-100 text-green-700',                                             hours: 0 },
  TRAINING: { label: '교육',   short: '교육', color: 'bg-yellow-100 text-yellow-700',                                           hours: 0 },
};

const SHIFT_TYPE_OPTIONS: Array<{ value: StaffShiftType; label: string; desc: string; color: string }> = [
  { value: 'rotation',      label: '순환', desc: 'D→E→N 8일 주기 순환',  color: 'bg-[var(--accent)] text-white' },
  { value: 'day_fixed',     label: 'D전담', desc: '데이 근무 고정',        color: 'bg-blue-600 text-white' },
  { value: 'evening_fixed', label: 'E전담', desc: '이브닝 근무 고정',      color: 'bg-orange-500 text-white' },
  { value: 'night_fixed',   label: 'N전담', desc: 'N N 휴 휴 반복',       color: 'bg-purple-600 text-white' },
];

const CYCLE_SEQ: ShiftRole[] = ['D', 'D', 'E', 'E', 'N', 'N', 'OFF', 'OFF'];
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// ─────────────────────── 유틸 ───────────────────────
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getDay();
}
function getStaffDept(s: StaffMember) {
  return s.department || s.team || '';
}
function isWardDept(dept: string) {
  return /병동|ward|icu|중환자|응급|간호|nicu|picu/i.test(dept);
}
function sortByKo(a: string, b: string) {
  return a.localeCompare(b, 'ko');
}
function normalizeShiftCode(code: string): ShiftRole {
  if (code === 'O') return 'OFF';
  if (code === 'H') return 'LEAVE';
  if (code === 'S') return 'TRAINING';
  if (['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'].includes(code)) return code as ShiftRole;
  return 'OFF';
}

// ─────────────────────── 자동생성 엔진 ───────────────────────
function generateSchedule(params: {
  staffs: StaffMember[];
  staffConfigs: StaffConfig[];
  year: number;
  month: number;
  days: number;
  minStaff: MinStaffConfig;
}): ScheduleMap {
  const { staffs, staffConfigs, year, month, days, minStaff } = params;
  const schedule: ScheduleMap = {};
  const configMap = new Map(staffConfigs.map(c => [c.staffId, c]));
  const rotationSids: string[] = [];

  // 1단계: 전담자 배치
  for (const staff of staffs) {
    const sid = String(staff.id);
    const cfg = configMap.get(sid) ?? { staffId: sid, shiftType: 'rotation' as StaffShiftType, preferredOffDays: [] };
    schedule[sid] = {};

    if (cfg.shiftType === 'day_fixed') {
      for (let d = 1; d <= days; d++) {
        schedule[sid][d] = cfg.preferredOffDays.includes(d) ? 'OFF' : 'D';
      }
    } else if (cfg.shiftType === 'evening_fixed') {
      for (let d = 1; d <= days; d++) {
        schedule[sid][d] = cfg.preferredOffDays.includes(d) ? 'OFF' : 'E';
      }
    } else if (cfg.shiftType === 'night_fixed') {
      // N N OFF OFF 반복 패턴
      const seq: ShiftRole[] = ['N', 'N', 'OFF', 'OFF'];
      for (let d = 1; d <= days; d++) {
        schedule[sid][d] = cfg.preferredOffDays.includes(d) ? 'OFF' : seq[(d - 1) % seq.length];
      }
    } else {
      rotationSids.push(sid);
    }
  }

  // 2단계: 순환자 배치 (D D E E N N OFF OFF, 각자 2일씩 stagger)
  rotationSids.forEach((sid, idx) => {
    const cfg = configMap.get(sid) ?? { staffId: sid, shiftType: 'rotation' as StaffShiftType, preferredOffDays: [] };
    const offset = idx * 2;
    for (let d = 1; d <= days; d++) {
      if (cfg.preferredOffDays.includes(d)) {
        schedule[sid][d] = 'OFF';
      } else {
        schedule[sid][d] = CYCLE_SEQ[(d - 1 + offset) % CYCLE_SEQ.length];
      }
    }
  });

  // 3단계: 법적 제약 보정 (순환자만)
  for (const sid of rotationSids) {
    // N 다음날 D → OFF 전환 (11시간 휴식 보장)
    for (let d = 2; d <= days; d++) {
      if (schedule[sid][d - 1] === 'N' && schedule[sid][d] === 'D') {
        schedule[sid][d] = 'OFF';
      }
    }
    // 연속 N 4일 이상 → 4일째부터 OFF
    let consN = 0;
    for (let d = 1; d <= days; d++) {
      if (schedule[sid][d] === 'N') {
        consN++;
        if (consN >= 4) schedule[sid][d] = 'OFF';
      } else {
        consN = 0;
      }
    }
  }

  // 4단계: 최소인원 보정
  for (let d = 1; d <= days; d++) {
    const counts = { D: 0, E: 0, N: 0 };
    for (const sid of Object.keys(schedule)) {
      const r = schedule[sid][d];
      if (r === 'D' || r === 'E' || r === 'N') counts[r]++;
    }

    for (const role of ['D', 'E', 'N'] as const) {
      const shortage = minStaff[role] - counts[role];
      if (shortage <= 0) continue;

      // OFF 상태인 순환자 중 법적 제약 없는 사람 차출
      const candidates = rotationSids.filter(sid => {
        if (schedule[sid][d] !== 'OFF') return false;
        const cfg = configMap.get(sid);
        if (cfg?.preferredOffDays.includes(d)) return false;
        // N→D 제약
        if (role === 'D' && d > 1 && schedule[sid][d - 1] === 'N') return false;
        // N 배치 시 다음날 D인 경우 방지
        if (role === 'N' && d < days && schedule[sid][d + 1] === 'D') return false;
        return true;
      });

      for (let i = 0; i < Math.min(shortage, candidates.length); i++) {
        schedule[candidates[i]][d] = role;
      }
    }
  }

  // 사용된 year, month suppress unused warning
  void year; void month;
  return schedule;
}

// ─────────────────────── 위반 감지 ───────────────────────
function getViolations(row: Record<number, ShiftRole>, days: number): Record<number, Violation[]> {
  const v: Record<number, Violation[]> = {};
  const add = (d: number, type: Violation) => { v[d] = [...(v[d] ?? []), type]; };
  for (let d = 2; d <= days; d++) {
    if (row[d - 1] === 'N' && row[d] === 'D') add(d, 'N_THEN_D');
  }
  let consN = 0;
  for (let d = 1; d <= days; d++) {
    if (row[d] === 'N') { consN++; if (consN >= 4) add(d, 'CONSECUTIVE_N'); }
    else consN = 0;
  }
  return v;
}

function countRoles(row: Record<number, ShiftRole>): Record<ShiftRole, number> {
  const r: Record<ShiftRole, number> = { D: 0, E: 0, N: 0, OFF: 0, LEAVE: 0, TRAINING: 0 };
  Object.values(row).forEach(role => { if (role in r) r[role]++; });
  return r;
}

function getMinStaffViolations(schedule: ScheduleMap, days: number, minStaff: MinStaffConfig) {
  const result: Record<number, Partial<Record<'D' | 'E' | 'N', boolean>>> = {};
  for (let d = 1; d <= days; d++) {
    const c = { D: 0, E: 0, N: 0 };
    Object.values(schedule).forEach(row => {
      const r = row[d];
      if (r === 'D' || r === 'E' || r === 'N') c[r]++;
    });
    const dayV: Partial<Record<'D' | 'E' | 'N', boolean>> = {};
    if (c.D < minStaff.D) dayV.D = true;
    if (c.E < minStaff.E) dayV.E = true;
    if (c.N < minStaff.N) dayV.N = true;
    if (Object.keys(dayV).length > 0) result[d] = dayV;
  }
  return result;
}

// ─────────────────────── 컴포넌트 ───────────────────────
export default function NurseSchedule({
  staffs = [],
  selectedCo,
}: {
  staffs: StaffMember[];
  selectedCo: string;
  user?: unknown;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [schedule, setSchedule] = useState<ScheduleMap>({});
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dept, setDept] = useState('');
  const [activeMinStaff, setActiveMinStaff] = useState<MinStaffConfig>({ D: 2, E: 2, N: 2 });

  // 마법사 상태
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardDept, setWizardDept] = useState('');
  const [wizardDShiftId, setWizardDShiftId] = useState('');
  const [wizardEShiftId, setWizardEShiftId] = useState('');
  const [wizardNShiftId, setWizardNShiftId] = useState('');
  const [staffConfigs, setStaffConfigs] = useState<StaffConfig[]>([]);
  const [wizardMinStaff, setWizardMinStaff] = useState<MinStaffConfig>({ D: 2, E: 2, N: 2 });
  const [generating, setGenerating] = useState(false);
  const [preferredOffStaffId, setPreferredOffStaffId] = useState('');

  const days = getDaysInMonth(year, month);
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const scopedStaffs = useMemo(
    () => staffs.filter(s => isActiveStaff(s) && (selectedCo === '전체' || s.company === selectedCo)),
    [staffs, selectedCo]
  );

  const wardDepts = useMemo(
    () => Array.from(new Set(scopedStaffs.map(s => getStaffDept(s)).filter(d => d && isWardDept(d)))).sort(sortByKo),
    [scopedStaffs]
  );
  const allDepts = useMemo(
    () => Array.from(new Set(scopedStaffs.map(s => getStaffDept(s)).filter(Boolean))).sort(sortByKo),
    [scopedStaffs]
  );
  const availableDepts = wardDepts.length > 0 ? wardDepts : allDepts;

  const visibleStaffs = useMemo(
    () => scopedStaffs.filter(s => getStaffDept(s) === dept),
    [scopedStaffs, dept]
  );
  const wizardStaffs = useMemo(
    () => scopedStaffs.filter(s => getStaffDept(s) === wizardDept),
    [scopedStaffs, wizardDept]
  );
  const wizardShifts = useMemo(() => {
    const companies = new Set(wizardStaffs.map(s => s.company).filter(Boolean));
    return workShifts.filter(s => companies.size === 0 || companies.has(s.company_name ?? ''));
  }, [workShifts, wizardStaffs]);

  // 위반 감지
  const violationMap = useMemo(() => {
    const result: Record<string, Record<number, Violation[]>> = {};
    for (const staff of visibleStaffs) {
      const sid = String(staff.id);
      result[sid] = getViolations(schedule[sid] ?? {}, days);
    }
    return result;
  }, [schedule, visibleStaffs, days]);

  const minStaffViolations = useMemo(() => {
    const visible: ScheduleMap = {};
    visibleStaffs.forEach(s => { visible[String(s.id)] = schedule[String(s.id)] ?? {}; });
    return getMinStaffViolations(visible, days, activeMinStaff);
  }, [schedule, visibleStaffs, days, activeMinStaff]);

  const dayRoleCounts = useMemo(() => {
    const result: Record<number, Record<ShiftRole, number>> = {};
    for (let d = 1; d <= days; d++) {
      result[d] = { D: 0, E: 0, N: 0, OFF: 0, LEAVE: 0, TRAINING: 0 };
      for (const staff of visibleStaffs) {
        const r: ShiftRole = (schedule[String(staff.id)]?.[d] as ShiftRole) ?? 'OFF';
        result[d][r]++;
      }
    }
    return result;
  }, [schedule, visibleStaffs, days]);

  const totalViolations = useMemo(
    () => Object.values(violationMap).reduce((sum, v) => sum + Object.keys(v).length, 0),
    [violationMap]
  );
  const minViolationDays = Object.keys(minStaffViolations).length;

  // 부서 초기화
  useEffect(() => {
    if (availableDepts.length === 0) { setDept(''); return; }
    if (!dept || !availableDepts.includes(dept)) setDept(availableDepts[0]);
  }, [availableDepts, dept]);

  // DB 로드
  useEffect(() => {
    supabase.from('nurse_schedules').select('*').eq('year_month', ym).then(({ data }) => {
      const mapped: ScheduleMap = {};
      (data ?? []).forEach((row: Record<string, unknown>) => {
        const sid = String(row.staff_id ?? '');
        const d = Number(row.day);
        const code = String(row.shift_code ?? '');
        if (!mapped[sid]) mapped[sid] = {};
        mapped[sid][d] = normalizeShiftCode(code);
      });
      setSchedule(mapped);
    });
  }, [ym]);

  // 근무유형 로드
  useEffect(() => {
    let q = supabase.from('work_shifts').select('id, name, start_time, end_time, company_name').eq('is_active', true);
    if (selectedCo !== '전체') q = q.eq('company_name', selectedCo);
    q.order('start_time').then(({ data }) => setWorkShifts((data ?? []) as WorkShift[]));
  }, [selectedCo]);

  // 마법사 팀 변경 시 인력 설정 초기화
  useEffect(() => {
    if (!wizardOpen) return;
    setStaffConfigs(
      wizardStaffs.map(s => ({
        staffId: String(s.id),
        shiftType: 'rotation' as StaffShiftType,
        preferredOffDays: [],
      }))
    );
    setPreferredOffStaffId('');
    // D/E/N 자동 매핑 시도
    const autoD = wizardShifts.find(s => /데이|day|주간/i.test(s.name));
    const autoE = wizardShifts.find(s => /이브|evening|eve|오후/i.test(s.name));
    const autoN = wizardShifts.find(s => /나이트|night|야간/i.test(s.name));
    setWizardDShiftId(prev => prev || autoD?.id || wizardShifts[0]?.id || '');
    setWizardEShiftId(prev => prev || autoE?.id || wizardShifts[1]?.id || '');
    setWizardNShiftId(prev => prev || autoN?.id || wizardShifts[2]?.id || '');
  }, [wizardDept, wizardOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 저장
  const saveSchedule = async () => {
    const staffIds = visibleStaffs.map(s => s.id).filter(Boolean);
    if (!staffIds.length) return;
    setSaving(true);
    try {
      const rows = staffIds.flatMap(sid =>
        Object.entries(schedule[String(sid)] ?? {}).map(([d, r]) => ({
          staff_id: sid, year_month: ym, day: Number(d), shift_code: r,
        }))
      );
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

  // 셀 클릭 사이클
  const cycleRole = (sid: string, day: number) => {
    if (!editMode) return;
    const roles: ShiftRole[] = ['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'];
    const cur: ShiftRole = (schedule[sid]?.[day] as ShiftRole) ?? 'OFF';
    const next = roles[(roles.indexOf(cur) + 1) % roles.length];
    setSchedule(prev => ({ ...prev, [sid]: { ...(prev[sid] ?? {}), [day]: next } }));
  };

  // 마법사 열기
  const openWizard = () => {
    const targetDept = dept || availableDepts[0] || '';
    setWizardDept(targetDept);
    setWizardStep(1);
    setWizardDShiftId('');
    setWizardEShiftId('');
    setWizardNShiftId('');
    setWizardMinStaff({ D: 2, E: 2, N: 2 });
    setWizardOpen(true);
  };

  // 자동 생성 실행
  const applyWizard = () => {
    if (!wizardDShiftId || !wizardEShiftId || !wizardNShiftId) {
      return toast('D / E / N 근무유형을 모두 선택해주세요.', 'warning');
    }
    if (wizardStaffs.length === 0) return toast('선택한 병동에 직원이 없습니다.', 'warning');
    if (!confirm(`${wizardDept} ${ym} 3교대 근무표를 자동 생성합니다.\n선택한 직원의 기존 편성은 덮어씁니다.`)) return;

    setGenerating(true);
    try {
      const generated = generateSchedule({
        staffs: wizardStaffs,
        staffConfigs,
        year,
        month,
        days,
        minStaff: wizardMinStaff,
      });
      setSchedule(prev => ({ ...prev, ...generated }));
      setActiveMinStaff({ ...wizardMinStaff });
      setDept(wizardDept);
      setEditMode(true);
      setWizardOpen(false);
      toast(`${wizardDept} ${wizardStaffs.length}명의 3교대 근무표가 생성되었습니다. 검토 후 저장하세요.`, 'success');
    } finally {
      setGenerating(false);
    }
  };

  const updateStaffConfig = (staffId: string, partial: Partial<StaffConfig>) => {
    setStaffConfigs(prev => prev.map(c => c.staffId === staffId ? { ...c, ...partial } : c));
  };

  const togglePreferredOff = (staffId: string, day: number) => {
    setStaffConfigs(prev => prev.map(c => {
      if (c.staffId !== staffId) return c;
      const next = c.preferredOffDays.includes(day)
        ? c.preferredOffDays.filter(d => d !== day)
        : [...c.preferredOffDays, day].sort((a, b) => a - b);
      return { ...c, preferredOffDays: next };
    }));
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // ─────────────────────── 렌더 ───────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── 헤더 ── */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold text-lg">‹</button>
            <div>
              <h2 className="text-base font-bold text-[var(--foreground)]">{year}년 {month}월 병동 3교대 근무표</h2>
              <p className="text-[11px] text-[var(--toss-gray-3)]">
                {dept || '팀 미선택'} · {visibleStaffs.length}명
                {totalViolations > 0 && <span className="ml-2 text-red-500 font-bold">⚠ 법적위반 {totalViolations}건</span>}
                {minViolationDays > 0 && <span className="ml-2 text-orange-500 font-bold">▼ 최소인원미달 {minViolationDays}일</span>}
              </p>
            </div>
            <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold text-lg">›</button>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <select value={dept} onChange={e => setDept(e.target.value)}
              className="px-3 py-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-bold bg-[var(--card)] outline-none">
              {availableDepts.map(d => <option key={d}>{d}</option>)}
              {availableDepts.length === 0 && <option value="">병동 없음</option>}
            </select>
            <button onClick={openWizard} disabled={scopedStaffs.length === 0}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-[var(--radius-md)] text-xs font-bold disabled:opacity-50 flex items-center gap-1 transition-colors">
              ✦ 3교대 마법사
            </button>
            <button onClick={() => setEditMode(v => !v)}
              className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold transition-colors ${editMode ? 'bg-orange-500 text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>
              {editMode ? '✎ 편집 중' : '편집'}
            </button>
            {editMode && (
              <button onClick={saveSchedule} disabled={saving}
                className="px-3 py-1.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-bold disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            )}
          </div>
        </div>

        {/* 범례 */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'] as ShiftRole[]).map(role => (
            <span key={role} className={`px-2 py-0.5 rounded text-[9px] font-bold ${ROLE_META[role].color}`}>
              {ROLE_META[role].short} {ROLE_META[role].label}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-600">⚠ 법적위반</span>
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-600">▼ 최소인원미달</span>
          {editMode && <span className="ml-1 text-[9px] text-[var(--toss-gray-3)] font-bold">· 셀 클릭으로 교대 변경</span>}
        </div>
      </div>

      {/* ── 근무표 ── */}
      {visibleStaffs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <p className="text-2xl">🏥</p>
          <p className="text-sm font-bold text-[var(--toss-gray-3)]">
            {availableDepts.length === 0 ? '병동 소속 직원이 없습니다.' : '선택한 병동에 직원이 없습니다.'}
          </p>
          <button onClick={openWizard} disabled={availableDepts.length === 0}
            className="px-4 py-2 bg-violet-600 text-white rounded-[var(--radius-md)] text-sm font-bold disabled:opacity-50">
            ✦ 3교대 마법사로 근무표 생성
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="text-left border-collapse" style={{ minWidth: `${220 + days * 36}px` }}>
            <thead className="sticky top-0 z-20 bg-[var(--card)]">
              <tr className="border-b border-[var(--border)]">
                <th className="sticky left-0 z-30 bg-[var(--card)] w-36 px-3 py-2 text-[10px] font-semibold text-[var(--toss-gray-3)] border-r border-[var(--border)]">이름</th>
                {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                  const dow = getDayOfWeek(year, month, d);
                  const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate();
                  const hasMinViol = !!minStaffViolations[d];
                  return (
                    <th key={d} className={`w-9 py-1 text-center text-[9px] font-semibold
                      ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-[var(--toss-gray-3)]'}
                      ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                      ${hasMinViol ? 'bg-orange-50/80 dark:bg-orange-900/10' : ''}`}>
                      <div className="font-bold">{d}</div>
                      <div className="text-[8px]">{WEEKDAY_KO[dow]}</div>
                      {hasMinViol && <div className="text-[7px] text-orange-500 leading-none">▼</div>}
                    </th>
                  );
                })}
                <th className="px-1 text-[9px] font-bold text-center text-blue-600 w-7">D</th>
                <th className="px-1 text-[9px] font-bold text-center text-orange-600 w-7">E</th>
                <th className="px-1 text-[9px] font-bold text-center text-purple-600 w-7">N</th>
                <th className="px-1 text-[9px] font-bold text-center text-[var(--toss-gray-4)] w-7">휴</th>
                <th className="px-1 text-[9px] font-bold text-center text-[var(--toss-gray-3)] w-10">시간</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visibleStaffs.map(staff => {
                const sid = String(staff.id);
                const row = schedule[sid] ?? {};
                const counts = countRoles(row);
                const viols = violationMap[sid] ?? {};
                const totalHours = (counts.D + counts.E + counts.N) * 8;

                return (
                  <tr key={sid} className="hover:bg-[var(--muted)]/30">
                    <td className="sticky left-0 z-10 bg-[var(--card)] border-r border-[var(--border)] px-3 py-1.5">
                      <p className="text-[11px] font-bold text-[var(--foreground)] truncate">{staff.name}</p>
                      <p className="text-[9px] text-[var(--toss-gray-3)]">{staff.position || '-'}</p>
                    </td>
                    {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                      const role: ShiftRole = (row[d] as ShiftRole) ?? 'OFF';
                      const meta = ROLE_META[role];
                      const dayViols = viols[d] ?? [];
                      const hasViol = dayViols.length > 0;
                      const violTitle = dayViols.map(v =>
                        v === 'N_THEN_D' ? '⚠ 나이트 다음날 데이 근무 (11시간 휴식 위반)' : '⚠ 연속 나이트 4일 이상 (법적 위반)'
                      ).join('\n');

                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button
                            onClick={() => cycleRole(sid, d)}
                            title={hasViol ? violTitle : `${staff.name} ${d}일: ${meta.label}`}
                            className={`w-8 h-7 rounded text-[9px] font-bold transition-all
                              ${hasViol ? 'bg-red-100 text-red-700 ring-2 ring-red-400 ring-inset dark:bg-red-900/30 dark:text-red-300' : meta.color}
                              ${editMode ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}>
                            {hasViol ? '⚠' : meta.short}
                          </button>
                        </td>
                      );
                    })}
                    <td className="text-center text-[10px] font-bold text-blue-600">{counts.D}</td>
                    <td className="text-center text-[10px] font-bold text-orange-600">{counts.E}</td>
                    <td className="text-center text-[10px] font-bold text-purple-600">{counts.N}</td>
                    <td className="text-center text-[10px] font-bold text-[var(--toss-gray-4)]">{counts.OFF + counts.LEAVE}</td>
                    <td className="text-center text-[10px] font-bold text-[var(--toss-gray-3)]">{totalHours}h</td>
                  </tr>
                );
              })}

              {/* 교대별 인원 집계 행 (D / E / N) */}
              {(['D', 'E', 'N'] as const).map(role => {
                const rowColor = role === 'D' ? 'text-blue-600' : role === 'E' ? 'text-orange-600' : 'text-purple-600';
                const bgColor = role === 'D' ? 'bg-blue-50/60 dark:bg-blue-900/10' : role === 'E' ? 'bg-orange-50/60 dark:bg-orange-900/10' : 'bg-purple-50/60 dark:bg-purple-900/10';
                return (
                  <tr key={role} className={`${bgColor} border-t border-[var(--border)]`}>
                    <td className={`sticky left-0 ${bgColor} border-r border-[var(--border)] px-3 py-1 text-[9px] font-black ${rowColor}`}>
                      일별 {ROLE_META[role].label}
                    </td>
                    {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                      const cnt = dayRoleCounts[d]?.[role] ?? 0;
                      const isViol = !!minStaffViolations[d]?.[role];
                      return (
                        <td key={d} className="text-center py-0.5">
                          <span className={`text-[9px] font-bold ${isViol ? 'text-orange-600 font-black' : rowColor}`}>
                            {cnt}{isViol ? '▼' : ''}
                          </span>
                        </td>
                      );
                    })}
                    <td colSpan={5} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════
          3교대 마법사 모달
      ══════════════════════════════════════════ */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[94vh] flex flex-col rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-2xl">

            {/* 마법사 헤더 */}
            <div className="shrink-0 flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-600">3-Shift Wizard</p>
                <h3 className="mt-0.5 text-base font-bold text-[var(--foreground)]">병동 3교대 근무표 자동 생성</h3>
              </div>
              <button onClick={() => setWizardOpen(false)}
                className="rounded-[var(--radius-md)] p-2 hover:bg-[var(--muted)] text-[var(--toss-gray-3)] transition-colors">✕</button>
            </div>

            {/* 스텝 인디케이터 */}
            <div className="shrink-0 flex border-b border-[var(--border)]">
              {([
                { n: 1 as WizardStep, label: '① 기본 설정' },
                { n: 2 as WizardStep, label: '② 근무 매핑' },
                { n: 3 as WizardStep, label: '③ 인력 설정' },
                { n: 4 as WizardStep, label: '④ 최소인원' },
              ]).map(({ n, label }) => (
                <button key={n}
                  onClick={() => n < wizardStep && setWizardStep(n)}
                  className={`flex-1 py-2.5 text-[11px] font-bold transition-all border-b-2
                    ${wizardStep === n
                      ? 'border-violet-600 text-violet-600 bg-violet-50 dark:bg-violet-900/10'
                      : wizardStep > n
                        ? 'border-green-500 text-green-600 cursor-pointer hover:bg-[var(--muted)]'
                        : 'border-transparent text-[var(--toss-gray-3)] cursor-default'}`}>
                  {wizardStep > n ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>

            {/* 마법사 콘텐츠 */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* ── Step 1: 기본 설정 ── */}
              {wizardStep === 1 && (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">병동 / 팀</span>
                      <select value={wizardDept} onChange={e => setWizardDept(e.target.value)}
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none">
                        {availableDepts.map(d => <option key={d}>{d}</option>)}
                      </select>
                      {wardDepts.length === 0 && allDepts.length > 0 && (
                        <p className="text-[10px] text-orange-500 font-bold">※ 병동으로 인식된 부서가 없어 전체 부서를 표시합니다.</p>
                      )}
                    </label>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">생성 연월</span>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-sm font-bold text-[var(--foreground)]">
                        {ym} ({days}일)
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/50 p-4">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2">대상 인원 ({wizardStaffs.length}명)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {wizardStaffs.map(s => (
                        <span key={s.id} className="px-2 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[11px] font-bold text-[var(--foreground)]">
                          {s.name} <span className="text-[var(--toss-gray-3)] font-medium">{s.position || ''}</span>
                        </span>
                      ))}
                      {wizardStaffs.length === 0 && (
                        <p className="text-[11px] text-red-500 font-bold">선택한 병동에 직원이 없습니다.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4">
                    <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-2">📋 자동 적용 법적 제약</p>
                    <ul className="space-y-1 text-[11px] text-amber-700 dark:text-amber-400">
                      <li>• <strong>N → D 금지</strong>: 나이트 다음날 데이 근무 불가 (11시간 휴식 보장, 근기법 §54)</li>
                      <li>• <strong>연속 나이트 최대 3일</strong>: 4일째 자동 OFF 전환</li>
                      <li>• <strong>기본 사이클</strong>: D D E E N N OFF OFF (8일 주기) 순환 배치</li>
                      <li>• <strong>전담자</strong>: D전담은 매일 D, E전담은 매일 E, N전담은 N N 휴 휴 반복</li>
                      <li>• <strong>최소인원 미달 시</strong>: 순환자 OFF에서 우선 차출하여 보충</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* ── Step 2: 근무유형 매핑 ── */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-[var(--foreground)]">D / E / N 교대에 사용할 실제 근무유형을 선택하세요</p>

                  {(['D', 'E', 'N'] as const).map(role => {
                    const shiftId = role === 'D' ? wizardDShiftId : role === 'E' ? wizardEShiftId : wizardNShiftId;
                    const setShiftId = role === 'D' ? setWizardDShiftId : role === 'E' ? setWizardEShiftId : setWizardNShiftId;
                    const selectedShift = wizardShifts.find(s => s.id === shiftId);
                    const defaultTime = role === 'D' ? '07:00~15:00' : role === 'E' ? '15:00~23:00' : '23:00~07:00';

                    return (
                      <div key={role} className={`rounded-[var(--radius-xl)] border-2 p-4 transition-colors ${shiftId ? 'border-violet-400 dark:border-violet-600' : 'border-[var(--border)]'}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`w-10 h-10 flex items-center justify-center rounded-[var(--radius-lg)] text-base font-black ${ROLE_META[role].color}`}>
                            {role}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-[var(--foreground)]">{ROLE_META[role].label} 교대</p>
                            <p className="text-[11px] text-[var(--toss-gray-3)]">통상 {defaultTime} · 8시간 근무</p>
                          </div>
                          {selectedShift && (
                            <span className="ml-auto text-[10px] text-violet-600 font-bold bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded">✓ 매핑됨</span>
                          )}
                        </div>
                        <select value={shiftId} onChange={e => setShiftId(e.target.value)}
                          className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none">
                          <option value="">— 선택하세요 —</option>
                          {wizardShifts.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}{s.start_time && s.end_time ? ` (${s.start_time}~${s.end_time})` : ''}
                            </option>
                          ))}
                        </select>
                        {!shiftId && <p className="mt-1.5 text-[10px] text-red-500 font-bold">필수 선택</p>}
                      </div>
                    );
                  })}

                  {wizardShifts.length === 0 && (
                    <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 dark:bg-red-900/10 p-4 text-[12px] text-red-600 font-bold">
                      선택한 병동에 연결된 활성 근무유형이 없습니다. 먼저 근무형태를 등록해 주세요.
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 3: 인력별 설정 ── */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[var(--foreground)]">직원별 교대 유형 · 희망 OFF 설정</p>
                    <div className="flex gap-1">
                      {SHIFT_TYPE_OPTIONS.map(opt => (
                        <button key={opt.value}
                          onClick={() => setStaffConfigs(prev => prev.map(c => ({ ...c, shiftType: opt.value })))}
                          className="px-2 py-1 rounded text-[10px] font-bold bg-[var(--muted)] text-[var(--toss-gray-3)] hover:bg-[var(--foreground)] hover:text-white transition-colors"
                          title={opt.desc}>
                          전체 {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                    {wizardStaffs.map(staff => {
                      const sid = String(staff.id);
                      const cfg = staffConfigs.find(c => c.staffId === sid) ?? { staffId: sid, shiftType: 'rotation' as StaffShiftType, preferredOffDays: [] };
                      const isExpanded = preferredOffStaffId === sid;

                      return (
                        <div key={sid} className="bg-[var(--card)]">
                          <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-[var(--foreground)]">
                                {staff.name}
                                <span className="ml-1.5 text-[10px] font-medium text-[var(--toss-gray-3)]">{staff.position || ''}</span>
                              </p>
                              {cfg.preferredOffDays.length > 0 && (
                                <p className="text-[10px] text-orange-600 font-bold mt-0.5">
                                  희망OFF: {cfg.preferredOffDays.join(', ')}일
                                </p>
                              )}
                            </div>

                            <div className="flex gap-1 shrink-0">
                              {SHIFT_TYPE_OPTIONS.map(opt => (
                                <button key={opt.value}
                                  onClick={() => updateStaffConfig(sid, { shiftType: opt.value })}
                                  title={opt.desc}
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${cfg.shiftType === opt.value ? opt.color : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'}`}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>

                            <button
                              onClick={() => setPreferredOffStaffId(isExpanded ? '' : sid)}
                              className={`px-2.5 py-1 rounded text-[10px] font-bold shrink-0 transition-all ${isExpanded ? 'bg-orange-500 text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'}`}>
                              희망OFF {cfg.preferredOffDays.length > 0 ? `(${cfg.preferredOffDays.length})` : ''}
                            </button>
                          </div>

                          {/* 희망 OFF 달력 */}
                          {isExpanded && (
                            <div className="px-4 pb-4 bg-[var(--muted)]/30 border-t border-[var(--border)]">
                              <div className="flex items-center justify-between mb-2 pt-3">
                                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">날짜 클릭으로 희망 OFF 설정</p>
                                <button onClick={() => updateStaffConfig(sid, { preferredOffDays: [] })}
                                  className="text-[10px] font-bold text-[var(--toss-gray-3)] hover:text-red-500 transition-colors">
                                  초기화
                                </button>
                              </div>
                              <div className="grid grid-cols-7 gap-1 text-center">
                                {WEEKDAY_KO.map(d => (
                                  <div key={d} className="text-[9px] font-bold text-[var(--toss-gray-3)] py-0.5">{d}</div>
                                ))}
                                {Array.from({ length: getDayOfWeek(year, month, 1) }, (_, i) => <div key={`b${i}`} />)}
                                {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                                  const dow = getDayOfWeek(year, month, d);
                                  const isOff = cfg.preferredOffDays.includes(d);
                                  return (
                                    <button key={d} onClick={() => togglePreferredOff(sid, d)}
                                      className={`rounded py-1.5 text-[10px] font-bold transition-all
                                        ${isOff ? 'bg-orange-500 text-white' : `bg-[var(--card)] border border-[var(--border)] hover:border-orange-400 ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-[var(--foreground)]'}`}`}>
                                      {d}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Step 4: 최소인원 설정 ── */}
              {wizardStep === 4 && (
                <div className="space-y-5">
                  <p className="text-sm font-bold text-[var(--foreground)]">교대별 최소 필요 인원 (1일 기준)</p>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {(['D', 'E', 'N'] as const).map(role => (
                      <div key={role} className={`rounded-[var(--radius-xl)] border p-5 ${ROLE_META[role].color} border-current/20`}>
                        <div className="flex items-center gap-2 mb-4">
                          <span className={`w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] font-black text-sm ${ROLE_META[role].color}`}>{role}</span>
                          <div>
                            <p className="font-bold text-sm">{ROLE_META[role].label}</p>
                            <p className="text-[10px] opacity-70">
                              {role === 'D' ? '07:00~15:00' : role === 'E' ? '15:00~23:00' : '23:00~07:00'}
                            </p>
                          </div>
                        </div>
                        <input
                          type="number" min={0} max={wizardStaffs.length}
                          value={wizardMinStaff[role]}
                          onChange={e => setWizardMinStaff(prev => ({ ...prev, [role]: Math.max(0, Number(e.target.value) || 0) }))}
                          className="w-full rounded-[var(--radius-lg)] border border-current/20 bg-white/50 dark:bg-black/20 px-3 py-2.5 text-2xl font-black text-center outline-none"
                        />
                        <p className="mt-1.5 text-[10px] text-center opacity-60">최소 {wizardMinStaff[role]}명 / 전체 {wizardStaffs.length}명</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4">
                    <p className="text-[11px] font-bold text-[var(--foreground)] mb-3">📊 생성 예상 요약</p>
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      {[
                        ['대상 병동', wizardDept],
                        ['생성 월', ym],
                        ['전체 인원', `${wizardStaffs.length}명`],
                        ['순환 교대', `${staffConfigs.filter(c => c.shiftType === 'rotation').length}명`],
                        ['D전담 / E전담 / N전담', `${staffConfigs.filter(c => c.shiftType === 'day_fixed').length} / ${staffConfigs.filter(c => c.shiftType === 'evening_fixed').length} / ${staffConfigs.filter(c => c.shiftType === 'night_fixed').length}명`],
                        ['희망OFF 설정 인원', `${staffConfigs.filter(c => c.preferredOffDays.length > 0).length}명`],
                        ['최소인원 (D/E/N)', `${wizardMinStaff.D} / ${wizardMinStaff.E} / ${wizardMinStaff.N}명`],
                        ['D 근무유형', wizardShifts.find(s => s.id === wizardDShiftId)?.name || '—'],
                        ['E 근무유형', wizardShifts.find(s => s.id === wizardEShiftId)?.name || '—'],
                        ['N 근무유형', wizardShifts.find(s => s.id === wizardNShiftId)?.name || '—'],
                      ].map(([label, val]) => (
                        <div key={label} className="flex gap-1.5">
                          <span className="text-[var(--toss-gray-3)] shrink-0">{label}:</span>
                          <span className="font-bold text-[var(--foreground)]">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(!wizardDShiftId || !wizardEShiftId || !wizardNShiftId) && (
                    <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 dark:bg-red-900/10 p-3 text-[12px] text-red-600 font-bold">
                      ⚠ D / E / N 근무유형이 모두 선택되지 않았습니다. 2단계로 돌아가 설정해 주세요.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 마법사 하단 버튼 */}
            <div className="shrink-0 flex items-center justify-between border-t border-[var(--border)] px-5 py-4 gap-3">
              <button
                onClick={() => wizardStep > 1 ? setWizardStep(s => (s - 1) as WizardStep) : setWizardOpen(false)}
                className="px-5 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] text-sm font-bold">
                {wizardStep === 1 ? '취소' : '← 이전'}
              </button>

              <div className="flex items-center gap-1.5">
                {([1, 2, 3, 4] as WizardStep[]).map(n => (
                  <div key={n} className={`w-2 h-2 rounded-full transition-all ${wizardStep === n ? 'bg-violet-600 w-5' : wizardStep > n ? 'bg-green-500' : 'bg-[var(--border)]'}`} />
                ))}
              </div>

              {wizardStep < 4 ? (
                <button
                  onClick={() => setWizardStep(s => (s + 1) as WizardStep)}
                  disabled={wizardStep === 1 && wizardStaffs.length === 0}
                  className="px-5 py-2 rounded-[var(--radius-md)] bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50 transition-colors">
                  다음 →
                </button>
              ) : (
                <button
                  onClick={applyWizard}
                  disabled={generating || wizardStaffs.length === 0 || !wizardDShiftId || !wizardEShiftId || !wizardNShiftId}
                  className="px-6 py-2 rounded-[var(--radius-md)] bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50 transition-colors">
                  {generating ? '생성 중...' : '✦ 근무표 자동 생성'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

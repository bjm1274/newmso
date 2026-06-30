'use client';
import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { isActiveStaff } from '@/lib/active-staff';
import { MatrixTable, type MatrixColumn, type MatrixCellTone } from '@/app/components/MatrixTable';
import { generateAutoSchedule } from '@/lib/shift-auto-scheduler';

// ─────────────────────── 타입 ───────────────────────
type StaffMember = {
  id: string;
  name?: string | null;
  position?: string | null;
  department?: string | null;
  team?: string | null;
  company?: string | null;
  status?: string | null;
  [key: string]: unknown;
};
type ShiftRole = 'D' | 'E' | 'N' | 'OFF' | 'LEAVE' | 'TRAINING';
type StaffShiftType = 'rotation' | 'day_fixed' | 'evening_fixed' | 'night_fixed';
type Violation = 'N_THEN_D' | 'CONSECUTIVE_N';
type MinStaffConfig = { D: number; E: number; N: number };
type ScheduleMap = Record<string, Record<number, ShiftRole>>;

// ─────────────────────── 상수 ───────────────────────
const ROLE_META: Record<ShiftRole, { label: string; short: string; bg: string; text: string; hours: number }> = {
  D:        { label: '데이',   short: 'D',   bg: 'bg-sky-500',      text: 'text-white',              hours: 8 },
  E:        { label: '이브닝', short: 'E',   bg: 'bg-amber-400',    text: 'text-amber-900',          hours: 8 },
  N:        { label: '나이트', short: 'N',   bg: 'bg-indigo-700',   text: 'text-indigo-100',         hours: 8 },
  OFF:      { label: '오프',   short: '오프', bg: 'bg-transparent',  text: 'text-[var(--toss-gray-3)]', hours: 0 },
  LEAVE:    { label: '휴가',   short: '휴가', bg: 'bg-emerald-400',  text: 'text-white',              hours: 0 },
  TRAINING: { label: '교육',   short: '교육', bg: 'bg-yellow-400',   text: 'text-yellow-900',         hours: 0 } };

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// ─────────────────────── 유틸 ───────────────────────
function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }
function getDayOfWeek(year: number, month: number, day: number) { return new Date(year, month - 1, day).getDay(); }
function getStaffDept(s: StaffMember) { return s.department || s.team || ''; }
function isWardDept(dept: string) { return /병동|ward|icu|중환자|응급|간호|nicu|picu/i.test(dept); }
function sortByKo(a: string, b: string) { return a.localeCompare(b, 'ko'); }
function normalizeShiftCode(code: string): ShiftRole {
  if (code === 'O') return 'OFF';
  if (code === 'H') return 'LEAVE';
  if (code === 'S') return 'TRAINING';
  if (['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'].includes(code)) return code as ShiftRole;
  return 'OFF';
}
function getInitials(name?: string | null) { return name ? name.slice(0, 1) : '?'; }

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

// ─────────────────────── 셀 컴포넌트 ───────────────────────
function ShiftBlock({
  role, violations, editMode, onClick }: {
  role: ShiftRole | undefined;
  violations?: Violation[];
  editMode: boolean;
  onClick?: () => void;
}) {
  const r = role ?? 'OFF';
  const meta = ROLE_META[r];
  const hasViolation = (violations?.length ?? 0) > 0;
  const violationLabel = hasViolation
    ? violations?.map(v => v === 'N_THEN_D' ? 'N→D 위반' : '연속야간 위반').join(', ')
    : '';
  const ariaLabel = `${meta.label}${hasViolation ? ` (${violationLabel})` : ''}${editMode ? ' - 클릭하여 변경' : ''}`;
  const baseFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1';

  if (r === 'OFF') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!editMode}
        aria-label={ariaLabel}
        title={hasViolation ? violationLabel : ''}
        className={`w-8 h-9 rounded-md flex items-center justify-center mx-auto ${baseFocus}
          ${editMode ? 'cursor-pointer hover:bg-[var(--muted)] transition-colors' : 'cursor-default'}
          ${hasViolation ? 'ring-2 ring-red-500' : ''}`}
      >
        <span className="text-[9px] text-[var(--toss-gray-3)] font-bold">—</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editMode}
      aria-label={ariaLabel}
      title={hasViolation ? violationLabel : meta.label}
      className={`w-8 h-9 rounded-md flex items-center justify-center mx-auto font-black text-[11px] tracking-tight ${baseFocus}
        ${meta.bg} ${meta.text}
        ${editMode ? 'cursor-pointer hover:opacity-80 active:scale-95 transition-all' : 'cursor-default'}
        ${hasViolation ? 'ring-2 ring-red-500 ring-offset-1' : ''}
        shadow-sm`}
    >
      {meta.short}
    </button>
  );
}

// ─────────────────────── 메인 컴포넌트 ───────────────────────
export default function NurseSchedule({
  staffs = [],
  selectedCo }: {
  staffs: StaffMember[];
  selectedCo: string;
  user?: unknown;
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => today.getFullYear());
  const [month, setMonth] = useState(() => today.getMonth() + 1);
  const [schedule, setSchedule] = useState<ScheduleMap>({});
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dept, setDept] = useState('');
  const [activeMinStaff, setActiveMinStaff] = useState<MinStaffConfig>({ D: 2, E: 2, N: 2 });

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
    () => scopedStaffs.filter(s => {
      if (getStaffDept(s) !== dept) return false;
      const shiftType = s.shiftType as StaffShiftType | undefined;
      if (shiftType === 'day_fixed') return false;
      return true;
    }),
    [scopedStaffs, dept]
  );

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

  useEffect(() => {
    if (availableDepts.length === 0) { setDept(''); return; }
    if (!dept || !availableDepts.includes(dept)) setDept(availableDepts[0]);
  }, [availableDepts, dept]);

  useEffect(() => {
    db.from('nurse_schedules').select('*').eq('year_month', ym).then(({ data }) => {
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

  const saveSchedule = async () => {
    const staffIds = visibleStaffs.map(s => s.id).filter(Boolean);
    if (!staffIds.length) return;
    setSaving(true);
    try {
      const rows = staffIds.flatMap(sid =>
        Object.entries(schedule[String(sid)] ?? {}).map(([d, r]) => ({
          staff_id: sid, year_month: ym, day: Number(d), shift_code: r }))
      );
      await db.from('nurse_schedules').delete().eq('year_month', ym).in('staff_id', staffIds);
      if (rows.length > 0) await db.from('nurse_schedules').insert(rows);
      setEditMode(false);
      toast('근무표가 저장되었습니다.', 'success');
    } catch {
      toast('저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const [aiLoading, setAiLoading] = useState(false);
  const [dbShifts, setDbShifts] = useState<any[]>([]);
  const [activeShiftIds, setActiveShiftIds] = useState<string[]>([]);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [updatingConfig, setUpdatingConfig] = useState(false);

  useEffect(() => {
    db.from('work_shifts')
      .select('*')
      .eq('is_active', true)
      .eq('company_name', selectedCo || '')
      .then(({ data }) => {
        setDbShifts(data || []);
      });
  }, [selectedCo]);

  useEffect(() => {
    if (!dept || !selectedCo) {
      setActiveShiftIds([]);
      return;
    }
    db.from('org_teams')
      .select('applicable_shifts')
      .eq('company_name', selectedCo)
      .eq('team_name', dept)
      .single()
      .then(({ data }) => {
        if (data && data.applicable_shifts) {
          try {
            const parsed = JSON.parse(data.applicable_shifts);
            if (Array.isArray(parsed)) {
              setActiveShiftIds(parsed.map(String));
              return;
            }
          } catch (e) {
            console.error('Failed to parse applicable_shifts', e);
          }
        }
        setActiveShiftIds([]);
      });
  }, [dept, selectedCo]);

  const handleSaveConfig = async (selectedIds: string[]) => {
    if (!dept || !selectedCo) return;
    setUpdatingConfig(true);
    try {
      const { error } = await db.from('org_teams')
        .update({ applicable_shifts: JSON.stringify(selectedIds) })
        .eq('company_name', selectedCo)
        .eq('team_name', dept);
      if (error) throw error;
      setActiveShiftIds(selectedIds);
      toast('부서 근무유형 설정이 저장되었습니다.', 'success');
      setIsConfigModalOpen(false);
    } catch (e) {
      console.error(e);
      toast('설정 저장 실패', 'error');
    } finally {
      setUpdatingConfig(false);
    }
  };

  const handleAiAutoSchedule = async () => {
    const staffIds = visibleStaffs.map(s => String(s.id));
    if (staffIds.length === 0) {
      toast('배정할 직원이 없습니다.', 'error');
      return;
    }
    
    setAiLoading(true);
    try {
      const filteredShifts = activeShiftIds.length > 0
        ? dbShifts.filter(s => activeShiftIds.includes(String(s.id)))
        : dbShifts;

      const shiftsPayload = filteredShifts.length > 0 ? filteredShifts.map(s => ({
        id: String(s.id),
        name: s.name,
        start_time: s.start_time,
        end_time: s.end_time,
        shift_type: s.shift_type || 'rotation',
        description: s.description
      })) : [
        { id: 'shift_d', name: '데이', shift_type: 'day' },
        { id: 'shift_e', name: '이브닝', shift_type: 'evening' },
        { id: 'shift_n', name: '나이트', shift_type: 'night' }
      ];

      const staffsPayload = visibleStaffs.map(s => ({
        id: String(s.id),
        name: s.name || '직원',
        department: s.department || dept,
        position: s.position || '',
        role: s.role || '',
        employmentType: s.employmentType || '정규직',
        preferredOffDates: []
      }));

      const body = {
        selectedMonth: ym,
        selectedCompany: selectedCo,
        selectedDepartment: dept,
        monthDates: dayArr.map(d => `${ym}-${String(d).padStart(2, '0')}`),
        workShifts: shiftsPayload,
        staffs: staffsPayload,
        constraints: {
          targetOffDays: 8,
          targetNightDays: 4,
          minDayReq: activeMinStaff.D,
          minEveReq: activeMinStaff.E,
          minNightReq: activeMinStaff.N,
          enableSkillMix: true,
          avoidDayAfterNight: true,
          maxConsecutiveWorkDays: 5
        }
      };

      const res = await fetch('/api/ai/roster-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'AI 추천 실패');
      }

      const data = await res.json();
      if (!data || !Array.isArray(data.staffPlans)) {
        throw new Error('올바르지 않은 응답 데이터 구조');
      }

      const newSchedule: ScheduleMap = { ...schedule };
      
      data.staffPlans.forEach((plan: any) => {
        const sid = String(plan.staffId);
        if (!newSchedule[sid]) newSchedule[sid] = {};
        
        plan.assignments.forEach((assignment: string, idx: number) => {
          const dayNum = idx + 1;
          if (dayNum > days) return;

          let resolvedRole: ShiftRole = 'OFF';
          const cleanVal = String(assignment).trim().toUpperCase();
          if (['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'].includes(cleanVal)) {
            resolvedRole = cleanVal as ShiftRole;
          } else if (cleanVal === '__OFF__' || cleanVal === 'OFF') {
            resolvedRole = 'OFF';
          } else {
            const targetShift = dbShifts.find(s => String(s.id) === assignment);
            if (targetShift) {
              const name = String(targetShift.name || '').toLowerCase();
              const type = String(targetShift.shift_type || '').toLowerCase();
              if (name.includes('나이트') || name.includes('야간') || type.includes('night')) {
                resolvedRole = 'N';
              } else if (name.includes('이브닝') || name.includes('오후') || type.includes('evening')) {
                resolvedRole = 'E';
              } else if (name.includes('오프') || name.includes('휴무') || type.includes('off')) {
                resolvedRole = 'OFF';
              } else {
                resolvedRole = 'D';
              }
            } else {
              resolvedRole = 'OFF';
            }
          }

          newSchedule[sid][dayNum] = resolvedRole;
        });
      });

      setSchedule(newSchedule);
      setEditMode(true);
      toast(data.summary || 'AI 근무표 추천 편성이 완료되었습니다. 저장해 주세요!', 'success');
    } catch (err) {
      console.error('[NurseSchedule] AI 추천 실패:', err);
      toast('AI 추천 편성 중 실패가 발생했습니다.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAutoSchedule = () => {
    const staffIds = visibleStaffs.map(s => String(s.id));
    if (staffIds.length === 0) {
      toast('배정할 직원이 없습니다.', 'error');
      return;
    }
    const newSchedule = generateAutoSchedule({
      yearMonth: ym,
      staffIds,
      daysInMonth: days,
      minStaff: activeMinStaff,
      existingSchedule: schedule });
    setSchedule(newSchedule);
    setEditMode(true);
    toast('자동 편성이 완료되었습니다. 내역을 확인 후 저장해주세요.', 'success');
  };

  const cycleRole = (sid: string, day: number) => {
    if (!editMode) return;
    const roles: ShiftRole[] = ['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'];
    const curr = schedule[sid]?.[day] ?? 'OFF';
    const next = roles[(roles.indexOf(curr) + 1) % roles.length];
    setSchedule(prev => ({
      ...prev,
      [sid]: { ...(prev[sid] ?? {}), [day]: next } }));
  };

  const changeMonth = (offset: number) => {
    let m = month + offset;
    let y = year;
    if (m > 12) { m = 1; y++; }
    else if (m < 1) { m = 12; y--; }
    setYear(y); setMonth(m);
  };

  const dayArr = useMemo(() => Array.from({ length: days }, (_, i) => i + 1), [days]);

  // ─────────────── MatrixTable 컬럼 (일자 동적) ───────────────
  type DayCol = { day: number; dow: number; isSun: boolean; isSat: boolean; isToday: boolean };
  const matrixColumns: MatrixColumn<DayCol>[] = useMemo(
    () => dayArr.map((d) => {
      const dow = getDayOfWeek(year, month, d);
      const isSun = dow === 0;
      const isSat = dow === 6;
      const isToday = year === today.getFullYear()
        && month === (today.getMonth() + 1)
        && d === today.getDate();
      return {
        id: `day-${d}`,
        label: (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`text-[11px] font-black ${isToday ? 'text-[var(--accent)]' : ''}`}>{d}</span>
            <span className={`text-[9px] font-bold ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'opacity-60'}`}>
              {WEEKDAY_KO[dow]}
            </span>
          </div>
        ),
        shortLabel: `${d}일(${WEEKDAY_KO[dow]})`,
        data: { day: d, dow, isSun, isSat, isToday } };
    }),
    [year, month, days, dayArr, today]
  );

  const getCellTone = (sid: string, day: number): MatrixCellTone => {
    const viols = violationMap[sid]?.[day];
    if (viols && viols.length > 0) return 'danger';
    return 'normal';
  };

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* 메인 레이아웃 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* ── 헤더 배너 ── */}
        <div className="shrink-0 bg-[var(--foreground)] text-[var(--card)] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.15em] uppercase opacity-50">병동 3교대 근무표</p>
              <div className="flex items-center gap-3 mt-0.5">
                <button type="button" onClick={() => changeMonth(-1)}
                  className="text-white/60 hover:text-white font-black text-sm transition-colors">◀</button>
                <span className="text-xl font-black tracking-tight">{year}년 {month}월</span>
                <button type="button" onClick={() => changeMonth(1)}
                  className="text-white/60 hover:text-white font-black text-sm transition-colors">▶</button>
              </div>
            </div>
            {/* 뱃지 */}
            <div className="flex gap-2">
              {totalViolations > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[10px] font-black">
                  ⚠ 위반 {totalViolations}건
                </span>
              )}
              {minViolationDays > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-orange-400 text-white text-[10px] font-black">
                  ▼ 인원 부족 {minViolationDays}일
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!editMode ? (
              <>
                <button
                  type="button" onClick={() => setIsConfigModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 transition-all mr-1"
                  title="부서 근무유형 설정"
                >
                  ⚙️ 근무유형 설정
                </button>
                <button
                  type="button" onClick={() => void handleAiAutoSchedule()} disabled={aiLoading}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-[12px] font-bold hover:bg-purple-700 disabled:opacity-55 transition-all"
                >
                  {aiLoading ? '✨ AI 추천 편성 중...' : '✨ AI 추천 편성 (Gemini)'}
                </button>
                <button
                  type="button" onClick={handleAutoSchedule}
                  className="px-4 py-2 rounded-xl bg-blue-500/80 text-white text-[12px] font-bold hover:bg-blue-500 transition-all"
                >
                  🤖 자동 편성 실행
                </button>
                <button
                  type="button" onClick={() => setEditMode(true)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 transition-all"
                >
                  ✏ 수동 편집
                </button>
              </>
            ) : (
              <>
                <button
                  type="button" onClick={saveSchedule} disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-[12px] font-bold hover:opacity-90 disabled:opacity-60 transition-all"
                >
                  {saving ? '저장 중...' : '💾 저장'}
                </button>
                <button
                  type="button" onClick={() => setEditMode(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 transition-all"
                >
                  취소
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── 병동 탭 ── */}
        {availableDepts.length > 0 && (
          <div className="shrink-0 flex gap-0 border-b border-[var(--border)] overflow-x-auto bg-[var(--tab-bg)]">
            {availableDepts.map(d => (
              <button
                key={d} type="button" onClick={() => setDept(d)}
                className={`px-5 py-3 text-[12px] font-bold whitespace-nowrap border-b-2 transition-all
                  ${dept === d
                    ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--card)]'
                    : 'border-transparent text-[var(--toss-gray-4)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
              >
                🏥 {d}
              </button>
            ))}
          </div>
        )}

        {/* ── 교대근무자 안내 ── */}
        <div className="shrink-0 px-4 py-1.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900">
          <p className="text-[11px] text-blue-700 dark:text-blue-300 font-bold">
            교대근무자(D/E/N 순환·야간전담·이브닝전담)만 표시됩니다. 상근직(day_fixed)은 근무유형대로 출퇴근하므로 근무표에서 제외됩니다.
          </p>
        </div>

        {/* ── 범례 + 편집 안내 ── */}
        <div className="shrink-0 flex items-center gap-4 px-4 py-2 bg-[var(--card)] border-b border-[var(--border)] flex-wrap">
          {(['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'] as ShiftRole[]).map(r => {
            const m = ROLE_META[r];
            return (
              <div key={r} className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded text-[9px] font-black flex items-center justify-center ${m.bg} ${m.text} ${r === 'OFF' ? 'border border-dashed border-[var(--border)]' : ''}`}>
                  {m.short.length > 1 ? m.short[0] : m.short}
                </div>
                <span className="text-[11px] text-[var(--toss-gray-4)] font-bold">{m.label}</span>
              </div>
            );
          })}
          {editMode && (
            <span className="ml-auto text-[11px] text-[var(--accent)] font-bold animate-pulse">
              ✏ 편집 모드 — 셀 클릭으로 근무 변경
            </span>
          )}
        </div>

        {/* ── 스케줄 보드 ── */}
        <div className="flex-1 overflow-auto p-3">
          {visibleStaffs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--toss-gray-3)]">
              <div className="text-6xl">🏥</div>
              <p className="text-base font-bold">
                {availableDepts.length === 0
                  ? '병동(ward) 계열 부서가 없습니다'
                  : `${dept} 에 소속된 직원이 없습니다`}
              </p>
              <p className="text-sm">인사관리에서 직원의 부서와 근무유형을 확인하세요.</p>
            </div>
          ) : (
            <>
              <MatrixTable<StaffMember, DayCol>
                rows={visibleStaffs}
                columns={matrixColumns}
                rowKey={(staff) => String(staff.id)}
                rowHeaderLabel="직원"
                ariaLabel={`${year}년 ${month}월 ${dept} 근무표`}
                minWidth={200 + days * 40}
                cellTone={(staff, col) => getCellTone(String(staff.id), col.data.day)}
                rowHeader={(staff) => (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center shrink-0 text-[var(--accent)] font-black text-sm">
                      {getInitials(staff.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-[var(--foreground)] truncate leading-tight">{staff.name}</p>
                      <p className="text-[10px] text-[var(--toss-gray-3)] font-bold truncate">{staff.position || '—'}</p>
                    </div>
                  </div>
                )}
                renderCell={(staff, col) => {
                  const sid = String(staff.id);
                  const role = schedule[sid]?.[col.data.day] as ShiftRole | undefined;
                  const viols = violationMap[sid]?.[col.data.day];
                  return (
                    <ShiftBlock
                      role={role}
                      violations={viols}
                      editMode={editMode}
                      onClick={() => cycleRole(sid, col.data.day)}
                    />
                  );
                }}
                rowSummary={(staff) => {
                  const row = schedule[String(staff.id)] ?? {};
                  const counts = countRoles(row);
                  const totalHours = counts.D * 8 + counts.E * 8 + counts.N * 8;
                  const isOverwork = totalHours > 208;
                  return (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black">
                      <span className="text-sky-600">D {counts.D}</span>
                      <span className="text-amber-600">E {counts.E}</span>
                      <span className="text-indigo-600">N {counts.N}</span>
                      <span className={isOverwork ? 'text-red-500 animate-pulse' : 'text-[var(--toss-gray-5)]'}>
                        {totalHours}h
                      </span>
                    </span>
                  );
                }}
                rowSummaryLabel="D/E/N/시간"
              />

              {/* ── 일별 인원 합계 (모바일=세로 카드 그리드 / 데스크톱=가로 스크롤) ── */}
              <section
                className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3"
                aria-label="일별 D/E/N 인원 합계"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-black tracking-widest uppercase text-[var(--toss-gray-4)]">
                    일별 인원 (D / E / N)
                  </h3>
                  {minViolationDays > 0 && (
                    <span className="badge badge-red text-[10px]">최소 인원 미달 {minViolationDays}일</span>
                  )}
                </div>
                <div className="grid grid-cols-7 sm:grid-cols-10 md:flex md:flex-nowrap md:overflow-x-auto gap-1.5">
                  {dayArr.map(d => {
                    const c = dayRoleCounts[d] ?? { D: 0, E: 0, N: 0, OFF: 0, LEAVE: 0, TRAINING: 0 };
                    const minV = minStaffViolations[d];
                    const dow = getDayOfWeek(year, month, d);
                    const isSun = dow === 0;
                    const isSat = dow === 6;
                    return (
                      <div
                        key={d}
                        className="flex flex-col items-center shrink-0 min-w-[44px] px-1.5 py-1 rounded-[var(--radius-md)] border border-[var(--border)]"
                      >
                        <span className={`text-[10px] font-black ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-[var(--foreground)]'}`}>
                          {d}({WEEKDAY_KO[dow]})
                        </span>
                        <div className="flex flex-col gap-0.5 items-center mt-0.5">
                          <span className={`text-[9px] font-black w-7 text-center rounded ${minV?.D ? 'bg-red-500 text-white' : 'text-sky-600'}`}>{c.D}</span>
                          <span className={`text-[9px] font-black w-7 text-center rounded ${minV?.E ? 'bg-red-500 text-white' : 'text-amber-600'}`}>{c.E}</span>
                          <span className={`text-[9px] font-black w-7 text-center rounded ${minV?.N ? 'bg-red-500 text-white' : 'text-indigo-600'}`}>{c.N}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      
      <RosterConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        shifts={dbShifts}
        initialActiveIds={activeShiftIds}
        onSave={handleSaveConfig}
        updating={updatingConfig}
        deptName={dept}
      />
    </div>
  );
}

interface RosterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  shifts: any[];
  initialActiveIds: string[];
  onSave: (ids: string[]) => void;
  updating: boolean;
  deptName: string;
}

function RosterConfigModal({
  isOpen,
  onClose,
  shifts,
  initialActiveIds,
  onSave,
  updating,
  deptName }: RosterConfigModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialActiveIds);
    }
  }, [isOpen, initialActiveIds]);

  if (!isOpen) return null;

  const toggleShift = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    onSave(selectedIds);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className="animate-in fade-in duration-200"
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-5 w-[90%] max-w-[480px]"
        style={{
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-extrabold text-foreground">
            ⚙️ [{deptName}] 적용 근무유형 지정
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--toss-gray-4)] hover:text-foreground"
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <p className="text-[11px] text-[var(--toss-gray-4)] mb-3 leading-relaxed">
          선택된 근무유형만 AI 자동 근무표 추천 및 편성 대상에 반영됩니다. 미선택 시 회사 전체 기본 근무유형이 적용됩니다.
        </p>

        <div className="flex-1 overflow-y-auto max-h-[260px] space-y-2 py-1 pr-1 custom-scrollbar">
          {shifts.map(shift => {
            const isChecked = selectedIds.includes(String(shift.id));
            return (
              <label
                key={shift.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none
                  ${isChecked
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-foreground font-bold'
                    : 'border-[var(--border)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px]">{shift.name}</span>
                  {shift.description && (
                    <span className="text-[10px] text-[var(--toss-gray-3)] font-normal">{shift.description}</span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleShift(String(shift.id))}
                  className="w-4 h-4 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                />
              </label>
            );
          })}
          {shifts.length === 0 && (
            <p className="text-[11px] text-center text-[var(--toss-gray-3)] py-8">등록된 근무유형이 없습니다.</p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[12px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-all"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updating}
            className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[12px] font-bold hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {updating ? '저장 중...' : '적용 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

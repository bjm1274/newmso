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
type StaffConfig = { staffId: string; shiftType: StaffShiftType; preferredOffDays: number[] };
type MinStaffConfig = { D: number; E: number; N: number };
type ScheduleMap = Record<string, Record<number, ShiftRole>>;
type WizardStep = 1 | 2 | 3 | 4;

// ─────────────────────── 상수 ───────────────────────
const ROLE_META: Record<ShiftRole, { label: string; short: string; bg: string; text: string; hours: number }> = {
  D:        { label: '데이',   short: 'D',   bg: 'bg-sky-500',      text: 'text-white',              hours: 8 },
  E:        { label: '이브닝', short: 'E',   bg: 'bg-amber-400',    text: 'text-amber-900',          hours: 8 },
  N:        { label: '나이트', short: 'N',   bg: 'bg-indigo-700',   text: 'text-indigo-100',         hours: 8 },
  OFF:      { label: '오프',   short: '오프', bg: 'bg-transparent',  text: 'text-[var(--toss-gray-3)]', hours: 0 },
  LEAVE:    { label: '휴가',   short: '휴가', bg: 'bg-emerald-400',  text: 'text-white',              hours: 0 },
  TRAINING: { label: '교육',   short: '교육', bg: 'bg-yellow-400',   text: 'text-yellow-900',         hours: 0 },
};

const SHIFT_TYPE_OPTIONS: Array<{ value: StaffShiftType; label: string; desc: string }> = [
  { value: 'rotation',      label: '순환',  desc: 'D→D→E→E→N→N→오프→오프 8일 주기' },
  { value: 'day_fixed',     label: 'D전담', desc: '데이 근무 고정 (희망 오프만 쉼)' },
  { value: 'evening_fixed', label: 'E전담', desc: '이브닝 고정 (희망 오프만 쉼)' },
  { value: 'night_fixed',   label: 'N전담', desc: 'N→N→오프→오프 4일 반복' },
];

const CYCLE_SEQ: ShiftRole[] = ['D', 'D', 'E', 'E', 'N', 'N', 'OFF', 'OFF'];
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

const WIZARD_STEPS = [
  { num: 1, title: '대상 병동', desc: '3교대 적용 병동 선택' },
  { num: 2, title: '근무 매핑', desc: 'D/E/N 근무유형 연결' },
  { num: 3, title: '인력 설정', desc: '근무유형 및 희망 오프' },
  { num: 4, title: '최소 인원', desc: '교대별 최소 투입 인원' },
];

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
function getInitials(name?: string) { return name ? name.slice(0, 1) : '?'; }

// ─────────────────────── 자동생성 엔진 ───────────────────────
function generateSchedule(params: {
  staffs: StaffMember[];
  staffConfigs: StaffConfig[];
  year: number; month: number; days: number;
  minStaff: MinStaffConfig;
}): ScheduleMap {
  const { staffs, staffConfigs, days, minStaff } = params;
  const schedule: ScheduleMap = {};
  const configMap = new Map(staffConfigs.map(c => [c.staffId, c]));
  const rotationSids: string[] = [];

  for (const staff of staffs) {
    const sid = String(staff.id);
    const cfg = configMap.get(sid) ?? { staffId: sid, shiftType: 'rotation' as StaffShiftType, preferredOffDays: [] };
    schedule[sid] = {};
    if (cfg.shiftType === 'day_fixed') {
      for (let d = 1; d <= days; d++) schedule[sid][d] = cfg.preferredOffDays.includes(d) ? 'OFF' : 'D';
    } else if (cfg.shiftType === 'evening_fixed') {
      for (let d = 1; d <= days; d++) schedule[sid][d] = cfg.preferredOffDays.includes(d) ? 'OFF' : 'E';
    } else if (cfg.shiftType === 'night_fixed') {
      const seq: ShiftRole[] = ['N', 'N', 'OFF', 'OFF'];
      for (let d = 1; d <= days; d++) schedule[sid][d] = cfg.preferredOffDays.includes(d) ? 'OFF' : seq[(d - 1) % seq.length];
    } else {
      rotationSids.push(sid);
    }
  }

  rotationSids.forEach((sid, idx) => {
    const cfg = configMap.get(sid) ?? { staffId: sid, shiftType: 'rotation' as StaffShiftType, preferredOffDays: [] };
    const offset = idx * 2;
    for (let d = 1; d <= days; d++) {
      schedule[sid][d] = cfg.preferredOffDays.includes(d) ? 'OFF' : CYCLE_SEQ[(d - 1 + offset) % CYCLE_SEQ.length];
    }
  });

  for (const sid of rotationSids) {
    for (let d = 2; d <= days; d++) {
      if (schedule[sid][d - 1] === 'N' && schedule[sid][d] === 'D') schedule[sid][d] = 'OFF';
    }
    let consN = 0;
    for (let d = 1; d <= days; d++) {
      if (schedule[sid][d] === 'N') { consN++; if (consN >= 4) schedule[sid][d] = 'OFF'; }
      else consN = 0;
    }
  }

  for (let d = 1; d <= days; d++) {
    const counts = { D: 0, E: 0, N: 0 };
    for (const sid of Object.keys(schedule)) {
      const r = schedule[sid][d];
      if (r === 'D' || r === 'E' || r === 'N') counts[r]++;
    }
    for (const role of ['D', 'E', 'N'] as const) {
      const shortage = minStaff[role] - counts[role];
      if (shortage <= 0) continue;
      const candidates = rotationSids.filter(sid => {
        if (schedule[sid][d] !== 'OFF') return false;
        const cfg = configMap.get(sid);
        if (cfg?.preferredOffDays.includes(d)) return false;
        if (role === 'D' && d > 1 && schedule[sid][d - 1] === 'N') return false;
        if (role === 'N' && d < days && schedule[sid][d + 1] === 'D') return false;
        return true;
      });
      for (let i = 0; i < Math.min(shortage, candidates.length); i++) schedule[candidates[i]][d] = role;
    }
  }
  return schedule;
}

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
  role, violations, editMode, onClick,
}: {
  role: ShiftRole | undefined;
  violations?: Violation[];
  editMode: boolean;
  onClick?: () => void;
}) {
  const r = role ?? 'OFF';
  const meta = ROLE_META[r];
  const hasViolation = (violations?.length ?? 0) > 0;

  if (r === 'OFF') {
    return (
      <div
        onClick={onClick}
        title={hasViolation ? violations?.map(v => v === 'N_THEN_D' ? 'N→D 위반' : '연속야간 위반').join(', ') : ''}
        className={`w-8 h-9 rounded-md flex items-center justify-center mx-auto
          ${editMode ? 'cursor-pointer hover:bg-[var(--muted)] transition-colors' : ''}
          ${hasViolation ? 'ring-2 ring-red-500' : ''}`}
      >
        <span className="text-[9px] text-[var(--toss-gray-3)] font-bold">—</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      title={hasViolation ? violations?.map(v => v === 'N_THEN_D' ? 'N→D 위반' : '연속야간 위반').join(', ') : meta.label}
      className={`w-8 h-9 rounded-md flex items-center justify-center mx-auto font-black text-[11px] tracking-tight
        ${meta.bg} ${meta.text}
        ${editMode ? 'cursor-pointer hover:opacity-80 active:scale-95 transition-all' : ''}
        ${hasViolation ? 'ring-2 ring-red-500 ring-offset-1' : ''}
        shadow-sm`}
    >
      {meta.short}
    </div>
  );
}

// ─────────────────────── 마법사 (전체화면 오버레이) ───────────────────────
function WizardOverlay({
  step, setStep, wizardDept, setWizardDept, availableDepts, wardDepts,
  wizardShifts, wizardDShiftId, setWizardDShiftId,
  wizardEShiftId, setWizardEShiftId, wizardNShiftId, setWizardNShiftId,
  wizardStaffs, staffConfigs, setStaffConfigs,
  preferredOffStaffId, setPreferredOffStaffId,
  wizardMinStaff, setWizardMinStaff, generating,
  onGenerate, onClose, year, month,
}: {
  step: WizardStep; setStep: (s: WizardStep) => void;
  wizardDept: string; setWizardDept: (d: string) => void;
  availableDepts: string[]; wardDepts: string[];
  wizardShifts: WorkShift[];
  wizardDShiftId: string; setWizardDShiftId: (s: string) => void;
  wizardEShiftId: string; setWizardEShiftId: (s: string) => void;
  wizardNShiftId: string; setWizardNShiftId: (s: string) => void;
  wizardStaffs: StaffMember[];
  staffConfigs: StaffConfig[]; setStaffConfigs: (c: StaffConfig[]) => void;
  preferredOffStaffId: string; setPreferredOffStaffId: (s: string) => void;
  wizardMinStaff: MinStaffConfig; setWizardMinStaff: (m: MinStaffConfig) => void;
  generating: boolean; onGenerate: () => void; onClose: () => void;
  year: number; month: number;
}) {
  const days = getDaysInMonth(year, month);
  const selStaffCfg = staffConfigs.find(c => c.staffId === preferredOffStaffId);

  const toggleOffDay = (day: number) => {
    setStaffConfigs(staffConfigs.map(c =>
      c.staffId !== preferredOffStaffId ? c : {
        ...c,
        preferredOffDays: c.preferredOffDays.includes(day)
          ? c.preferredOffDays.filter(d => d !== day)
          : [...c.preferredOffDays, day],
      }
    ));
  };

  const updateShiftType = (staffId: string, shiftType: StaffShiftType) => {
    setStaffConfigs(staffConfigs.map(c => c.staffId === staffId ? { ...c, shiftType } : c));
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm">
      {/* 왼쪽: 스텝 사이드바 */}
      <div className="w-64 shrink-0 bg-[var(--foreground)] text-[var(--card)] flex flex-col py-10 px-6">
        <div className="mb-10">
          <p className="text-[11px] font-black tracking-[0.15em] uppercase opacity-50 mb-1">3교대 마법사</p>
          <p className="text-lg font-black leading-snug">병동 근무표<br/>자동 생성</p>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          {WIZARD_STEPS.map((s, i) => {
            const isDone = step > s.num;
            const isCurrent = step === s.num;
            return (
              <div key={s.num} className="flex gap-3 items-start py-3 relative">
                {i < WIZARD_STEPS.length - 1 && (
                  <div className={`absolute left-[15px] top-[40px] w-px h-full ${isDone ? 'bg-[var(--card)]' : 'bg-white/20'}`} />
                )}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black shrink-0 transition-colors
                  ${isCurrent ? 'bg-[var(--accent)] text-white' : isDone ? 'bg-white text-[var(--foreground)]' : 'bg-white/10 text-white/40'}`}>
                  {isDone ? '✓' : s.num}
                </div>
                <div className={`pt-1 transition-opacity ${isCurrent ? 'opacity-100' : isDone ? 'opacity-70' : 'opacity-30'}`}>
                  <p className="text-[13px] font-bold leading-tight">{s.title}</p>
                  <p className="text-[11px] opacity-60 mt-0.5">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button" onClick={onClose}
          className="mt-6 text-[11px] text-white/40 hover:text-white/70 font-bold transition-colors text-left"
        >
          ✕ 닫기
        </button>
      </div>

      {/* 오른쪽: 콘텐츠 */}
      <div className="flex-1 bg-[var(--card)] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8 md:p-12">

          {/* STEP 1: 대상 병동 선택 */}
          {step === 1 && (
            <div className="max-w-xl">
              <h2 className="text-2xl font-black text-[var(--foreground)] mb-1">대상 병동을 선택하세요</h2>
              <p className="text-sm text-[var(--toss-gray-3)] mb-8">
                3교대 근무표를 생성할 병동(팀)을 선택합니다. 병동 계열 부서만 표시됩니다.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {wardDepts.map(d => {
                  const isSelected = wizardDept === d;
                  return (
                    <button
                      key={d} type="button"
                      onClick={() => setWizardDept(d)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all
                        ${isSelected
                          ? 'border-[var(--accent)] bg-blue-50 dark:bg-blue-950/30'
                          : 'border-[var(--border)] bg-[var(--tab-bg)] hover:border-[var(--accent)]/40'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0
                        ${isSelected ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)]'}`}>
                        🏥
                      </div>
                      <div>
                        <p className="font-black text-[13px] text-[var(--foreground)]">{d}</p>
                        <p className="text-[11px] text-emerald-600 mt-0.5 font-bold">✅ 병동 3교대 대상</p>
                      </div>
                    </button>
                  );
                })}
                {wardDepts.length === 0 && (
                  <div className="col-span-2 p-10 text-center text-[var(--toss-gray-3)] text-sm">
                    <div className="text-4xl mb-3">🏥</div>
                    <p className="font-bold mb-1">병동 계열 부서가 없습니다</p>
                    <p className="text-[12px] opacity-70">
                      인사관리 &gt; 직원정보에서 부서명에<br/>
                      <span className="font-bold text-[var(--foreground)]">병동, ICU, 중환자, 응급, 간호, NICU, PICU</span> 등의<br/>
                      키워드를 포함해 주세요.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: 근무유형 매핑 */}
          {step === 2 && (
            <div className="max-w-xl">
              <h2 className="text-2xl font-black text-[var(--foreground)] mb-1">근무유형을 연결하세요</h2>
              <p className="text-sm text-[var(--toss-gray-3)] mb-8">
                시스템의 근무유형을 데이/이브닝/나이트 교대에 매핑합니다.
              </p>
              <div className="flex flex-col gap-4">
                {[
                  { label: '데이 (D)', color: 'bg-sky-500', time: '07:00 ~ 15:00', val: wizardDShiftId, set: setWizardDShiftId },
                  { label: '이브닝 (E)', color: 'bg-amber-400', time: '15:00 ~ 23:00', val: wizardEShiftId, set: setWizardEShiftId },
                  { label: '나이트 (N)', color: 'bg-indigo-700', time: '23:00 ~ 07:00', val: wizardNShiftId, set: setWizardNShiftId },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-4 p-4 rounded-xl bg-[var(--tab-bg)] border border-[var(--border)]">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0 ${item.color}`}>
                      {item.label.split(' ')[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-black text-[var(--foreground)]">{item.label}</p>
                      <p className="text-[11px] text-[var(--toss-gray-3)]">{item.time}</p>
                    </div>
                    <select
                      value={item.val}
                      onChange={e => item.set(e.target.value)}
                      className="flex-1 min-w-[140px] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] font-bold bg-[var(--card)] text-[var(--foreground)]"
                    >
                      <option value="">-- 선택 --</option>
                      {wizardShifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {wizardShifts.length === 0 && (
                <p className="mt-4 text-sm text-orange-500">
                  ⚠ {wizardDept} 소속 근무유형이 없습니다. [근무형태] 메뉴에서 등록 후 다시 시도하세요.
                </p>
              )}
            </div>
          )}

          {/* STEP 3: 인력 설정 + 희망 오프 */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-black text-[var(--foreground)] mb-1">인력별 근무유형 설정</h2>
              <p className="text-sm text-[var(--toss-gray-3)] mb-6">
                각 직원의 교대 유형과 희망 오프 날짜를 설정합니다.
              </p>
              <div className="flex gap-6">
                {/* 왼쪽: 직원 목록 */}
                <div className="flex-1 flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
                  {wizardStaffs.map(staff => {
                    const cfg = staffConfigs.find(c => c.staffId === String(staff.id));
                    const shiftType = cfg?.shiftType ?? 'rotation';
                    const offCount = cfg?.preferredOffDays.length ?? 0;
                    const isSelected = preferredOffStaffId === String(staff.id);
                    return (
                      <div
                        key={staff.id}
                        onClick={() => setPreferredOffStaffId(isSelected ? '' : String(staff.id))}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer
                          ${isSelected ? 'border-[var(--accent)] bg-blue-50 dark:bg-blue-950/30' : 'border-[var(--border)] bg-[var(--tab-bg)] hover:border-[var(--accent)]/40'}`}
                      >
                        <div className="w-9 h-9 rounded-full bg-[var(--muted)] flex items-center justify-center shrink-0 font-black text-base text-[var(--toss-gray-4)]">
                          {getInitials(staff.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-black text-[var(--foreground)] truncate">{staff.name}</p>
                          <p className="text-[11px] text-[var(--toss-gray-3)] truncate">{staff.position || ''}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <select
                            value={shiftType}
                            onClick={e => e.stopPropagation()}
                            onChange={e => updateShiftType(String(staff.id), e.target.value as StaffShiftType)}
                            className="text-[11px] font-bold border border-[var(--border)] rounded-lg px-2 py-1 bg-[var(--card)] text-[var(--foreground)]"
                          >
                            {SHIFT_TYPE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          {offCount > 0 && (
                            <span className="text-[10px] text-[var(--accent)] font-bold">희망오프 {offCount}일</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {wizardStaffs.length === 0 && (
                    <div className="p-8 text-center text-sm text-[var(--toss-gray-3)]">
                      {wizardDept ? '해당 병동에 직원이 없습니다.' : '1단계에서 병동을 선택하세요.'}
                    </div>
                  )}
                </div>

                {/* 오른쪽: 희망 오프 달력 */}
                {preferredOffStaffId && selStaffCfg && (
                  <div className="w-72 shrink-0">
                    <p className="text-[12px] font-black text-[var(--foreground)] mb-2">
                      {wizardStaffs.find(s => String(s.id) === preferredOffStaffId)?.name}의 희망 오프
                    </p>
                    <div className="grid grid-cols-7 gap-0.5 text-[10px] font-bold text-center mb-1">
                      {['일','월','화','수','목','금','토'].map(d => (
                        <div key={d} className="text-[var(--toss-gray-3)] py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {/* 첫째 날 요일 빈칸 */}
                      {Array.from({ length: getDayOfWeek(year, month, 1) }).map((_, i) => <div key={i} />)}
                      {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                        const isOff = selStaffCfg.preferredOffDays.includes(d);
                        const dow = getDayOfWeek(year, month, d);
                        return (
                          <button
                            key={d} type="button" onClick={() => toggleOffDay(d)}
                            className={`h-8 w-full rounded-lg text-[11px] font-bold transition-all
                              ${isOff ? 'bg-[var(--accent)] text-white' : `hover:bg-[var(--muted)] ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-[var(--foreground)]'}`}`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[10px] text-[var(--toss-gray-3)]">날짜를 클릭하면 희망 오프 지정/해제</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: 최소 인원 */}
          {step === 4 && (
            <div className="max-w-lg">
              <h2 className="text-2xl font-black text-[var(--foreground)] mb-1">교대별 최소 투입 인원</h2>
              <p className="text-sm text-[var(--toss-gray-3)] mb-8">
                각 교대 시간대에 반드시 근무해야 하는 최소 인원입니다. 부족 시 자동 보정됩니다.
              </p>
              <div className="flex flex-col gap-4">
                {(['D', 'E', 'N'] as const).map(role => {
                  const meta = ROLE_META[role];
                  return (
                    <div key={role} className="flex items-center gap-5 p-5 rounded-xl bg-[var(--tab-bg)] border border-[var(--border)]">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 ${meta.bg} ${meta.text}`}>
                        {role}
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-[var(--foreground)] text-base">{meta.label}</p>
                        <p className="text-[12px] text-[var(--toss-gray-3)]">
                          {role === 'D' ? '07:00~15:00' : role === 'E' ? '15:00~23:00' : '23:00~07:00'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setWizardMinStaff({ ...wizardMinStaff, [role]: Math.max(1, wizardMinStaff[role] - 1) })}
                          className="w-9 h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] text-lg font-black hover:bg-[var(--muted)] transition-colors"
                        >−</button>
                        <span className="w-10 text-center text-2xl font-black text-[var(--foreground)]">
                          {wizardMinStaff[role]}
                        </span>
                        <button
                          type="button"
                          onClick={() => setWizardMinStaff({ ...wizardMinStaff, [role]: wizardMinStaff[role] + 1 })}
                          className="w-9 h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] text-lg font-black hover:bg-[var(--muted)] transition-colors"
                        >+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-[12px] text-blue-700 dark:text-blue-300">
                <p className="font-black mb-1">⚙ 자동생성 규칙 안내</p>
                <ul className="list-disc list-inside space-y-0.5 opacity-80">
                  <li>순환자: D→D→E→E→N→N→오프→오프 (8일 주기, 2일씩 엇갈림)</li>
                  <li>나이트 전담: N→N→오프→오프 반복</li>
                  <li>N 다음날 D 배치 금지 (근기법 §54, 11시간 연속 휴식)</li>
                  <li>3일 초과 연속 야간 배치 금지</li>
                  <li>최소 인원 부족 시 OFF 인원 자동 차출</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* 하단 네비게이션 */}
        <div className="shrink-0 border-t border-[var(--border)] px-8 py-5 flex justify-between items-center bg-[var(--tab-bg)]">
          <button
            type="button"
            onClick={() => step > 1 ? setStep((step - 1) as WizardStep) : onClose()}
            className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-[13px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-colors"
          >
            {step === 1 ? '취소' : '← 이전'}
          </button>
          <div className="flex gap-1.5">
            {WIZARD_STEPS.map(s => (
              <div key={s.num} className={`h-1.5 rounded-full transition-all ${step === s.num ? 'w-6 bg-[var(--accent)]' : step > s.num ? 'w-3 bg-[var(--accent)]/40' : 'w-3 bg-[var(--border)]'}`} />
            ))}
          </div>
          {step < 4 ? (
            <button
              type="button"
              disabled={step === 1 && !wizardDept}
              onClick={() => setStep((step + 1) as WizardStep)}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition-all"
            >
              다음 →
            </button>
          ) : (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-60 transition-all flex items-center gap-2"
            >
              {generating ? (
                <><span className="animate-spin">⏳</span> 생성 중...</>
              ) : (
                <>✨ 근무표 자동생성</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── 메인 컴포넌트 ───────────────────────
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

  useEffect(() => {
    let q = supabase.from('work_shifts').select('id, name, start_time, end_time, company_name').eq('is_active', true);
    if (selectedCo !== '전체') q = q.eq('company_name', selectedCo);
    q.order('start_time').then(({ data }) => setWorkShifts((data ?? []) as WorkShift[]));
  }, [selectedCo]);

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
    const autoD = wizardShifts.find(s => /데이|day|주간/i.test(s.name));
    const autoE = wizardShifts.find(s => /이브|evening|eve|오후/i.test(s.name));
    const autoN = wizardShifts.find(s => /나이트|night|야간/i.test(s.name));
    setWizardDShiftId(prev => prev || autoD?.id || wizardShifts[0]?.id || '');
    setWizardEShiftId(prev => prev || autoE?.id || wizardShifts[1]?.id || '');
    setWizardNShiftId(prev => prev || autoN?.id || wizardShifts[2]?.id || '');
  }, [wizardDept, wizardOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const cycleRole = (sid: string, day: number) => {
    if (!editMode) return;
    const roles: ShiftRole[] = ['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'];
    const curr = schedule[sid]?.[day] ?? 'OFF';
    const next = roles[(roles.indexOf(curr) + 1) % roles.length];
    setSchedule(prev => ({
      ...prev,
      [sid]: { ...(prev[sid] ?? {}), [day]: next },
    }));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 400));
    const result = generateSchedule({
      staffs: wizardStaffs,
      staffConfigs,
      year, month,
      days: getDaysInMonth(year, month),
      minStaff: wizardMinStaff,
    });
    setSchedule(prev => ({ ...prev, ...result }));
    setDept(wizardDept);
    setActiveMinStaff(wizardMinStaff);
    setWizardOpen(false);
    setWizardStep(1);
    setGenerating(false);
    toast(`${wizardDept} 근무표가 자동 생성되었습니다.`, 'success');
  };

  const changeMonth = (offset: number) => {
    let m = month + offset;
    let y = year;
    if (m > 12) { m = 1; y++; }
    else if (m < 1) { m = 12; y--; }
    setYear(y); setMonth(m);
  };

  const dayArr = Array.from({ length: days }, (_, i) => i + 1);

  return (
    <>
      {/* 마법사 오버레이 (전체화면) */}
      {wizardOpen && (
        <WizardOverlay
          step={wizardStep} setStep={setWizardStep}
          wizardDept={wizardDept} setWizardDept={setWizardDept}
          availableDepts={availableDepts} wardDepts={wardDepts}
          wizardShifts={wizardShifts}
          wizardDShiftId={wizardDShiftId} setWizardDShiftId={setWizardDShiftId}
          wizardEShiftId={wizardEShiftId} setWizardEShiftId={setWizardEShiftId}
          wizardNShiftId={wizardNShiftId} setWizardNShiftId={setWizardNShiftId}
          wizardStaffs={wizardStaffs}
          staffConfigs={staffConfigs} setStaffConfigs={setStaffConfigs}
          preferredOffStaffId={preferredOffStaffId} setPreferredOffStaffId={setPreferredOffStaffId}
          wizardMinStaff={wizardMinStaff} setWizardMinStaff={setWizardMinStaff}
          generating={generating} onGenerate={handleGenerate}
          onClose={() => { setWizardOpen(false); setWizardStep(1); }}
          year={year} month={month}
        />
      )}

      {/* 메인 레이아웃 */}
      <div className="h-full flex flex-col gap-0 overflow-hidden">

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
            <button
              type="button"
              onClick={() => { setWizardDept(wardDepts.includes(dept) ? dept : (wardDepts[0] ?? '')); setWizardOpen(true); setWizardStep(1); }}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-[12px] font-bold hover:opacity-90 transition-all flex items-center gap-1.5"
            >
              ✨ 3교대 마법사
            </button>
            {!editMode ? (
              <button
                type="button" onClick={() => setEditMode(true)}
                className="px-4 py-2 rounded-xl bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 transition-all"
              >
                ✏ 수동 편집
              </button>
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
        <div className="flex-1 overflow-auto">
          {visibleStaffs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--toss-gray-3)]">
              <div className="text-6xl">🏥</div>
              <p className="text-base font-bold">
                {availableDepts.length === 0
                  ? '병동(ward) 계열 부서가 없습니다'
                  : `${dept} 에 소속된 직원이 없습니다`}
              </p>
              <p className="text-sm">✨ 3교대 마법사로 근무표를 생성하거나, 인사관리에서 부서를 확인하세요.</p>
              <button
                type="button"
                onClick={() => { setWizardOpen(true); setWizardStep(1); }}
                className="mt-2 px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:opacity-90 transition-all"
              >
                ✨ 3교대 마법사 시작
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse" style={{ minWidth: `${200 + days * 40}px` }}>
              {/* 날짜 헤더 */}
              <thead className="sticky top-0 z-20">
                <tr className="bg-[var(--foreground)]">
                  {/* 직원 열 */}
                  <th className="sticky left-0 z-30 bg-[var(--foreground)] w-44 min-w-[176px] px-4 py-3 text-left text-[11px] font-black text-white/60 tracking-widest uppercase border-r border-white/10">
                    직원
                  </th>
                  {dayArr.map(d => {
                    const dow = getDayOfWeek(year, month, d);
                    const isSun = dow === 0;
                    const isSat = dow === 6;
                    const isToday = year === today.getFullYear() && month === (today.getMonth() + 1) && d === today.getDate();
                    return (
                      <th key={d}
                        className={`w-10 min-w-[40px] px-1 py-2 text-center border-r border-white/10
                          ${isToday ? 'bg-[var(--accent)]' : isSun ? 'bg-red-900/40' : isSat ? 'bg-blue-900/20' : ''}`}
                      >
                        <div className="text-[11px] font-black text-white/90">{d}</div>
                        <div className={`text-[9px] font-bold mt-0.5 ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-white/40'}`}>
                          {WEEKDAY_KO[dow]}
                        </div>
                      </th>
                    );
                  })}
                  {/* 통계 열들 */}
                  <th className="px-2 py-3 text-center text-[10px] font-black text-white/50 min-w-[36px]">D</th>
                  <th className="px-2 py-3 text-center text-[10px] font-black text-white/50 min-w-[36px]">E</th>
                  <th className="px-2 py-3 text-center text-[10px] font-black text-white/50 min-w-[36px]">N</th>
                  <th className="px-2 py-3 text-center text-[10px] font-black text-white/50 min-w-[44px]">합계</th>
                </tr>
              </thead>

              <tbody>
                {/* 직원 행들 */}
                {visibleStaffs.map((staff, staffIdx) => {
                  const sid = String(staff.id);
                  const row = schedule[sid] ?? {};
                  const violations = violationMap[sid] ?? {};
                  const counts = countRoles(row);
                  const totalHours = counts.D * 8 + counts.E * 8 + counts.N * 8;
                  const isOverwork = totalHours > 208;

                  return (
                    <tr key={sid}
                      className={`border-b border-[var(--border-subtle)] transition-colors
                        ${staffIdx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--tab-bg)]/40'}
                        hover:bg-blue-50/40 dark:hover:bg-blue-950/20`}
                    >
                      {/* 직원 정보 */}
                      <td className={`sticky left-0 z-10 border-r border-[var(--border-subtle)] px-3 py-2
                        ${staffIdx % 2 === 0 ? 'bg-[var(--card)]' : 'bg-[var(--tab-bg)]/40'} transition-colors`}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center shrink-0 text-[var(--accent)] font-black text-sm">
                            {getInitials(staff.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-black text-[var(--foreground)] truncate leading-tight">{staff.name}</p>
                            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold truncate">{staff.position || '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* 날짜별 셀 */}
                      {dayArr.map(d => {
                        const role = row[d] as ShiftRole | undefined;
                        const viols = violations[d];
                        const dow = getDayOfWeek(year, month, d);
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <td key={d}
                            className={`border-r border-[var(--border-subtle)] py-1 px-0.5
                              ${isWeekend ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}
                          >
                            <ShiftBlock
                              role={role}
                              violations={viols}
                              editMode={editMode}
                              onClick={() => cycleRole(sid, d)}
                            />
                          </td>
                        );
                      })}

                      {/* 통계 */}
                      <td className="px-1 py-2 text-center">
                        <span className="text-[11px] font-black text-sky-600">{counts.D}</span>
                      </td>
                      <td className="px-1 py-2 text-center">
                        <span className="text-[11px] font-black text-amber-600">{counts.E}</span>
                      </td>
                      <td className="px-1 py-2 text-center">
                        <span className="text-[11px] font-black text-indigo-600">{counts.N}</span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-[11px] font-black ${isOverwork ? 'text-red-500 animate-pulse' : 'text-[var(--toss-gray-5)]'}`}>
                          {totalHours}h
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* 일별 합계 행 */}
                <tr className="sticky bottom-0 z-10 bg-[var(--foreground)] border-t-2 border-[var(--border)]">
                  <td className="sticky left-0 z-20 bg-[var(--foreground)] px-3 py-2 border-r border-white/10">
                    <span className="text-[10px] font-black text-white/60 tracking-widest uppercase">일별 인원</span>
                  </td>
                  {dayArr.map(d => {
                    const c = dayRoleCounts[d] ?? { D: 0, E: 0, N: 0, OFF: 0, LEAVE: 0, TRAINING: 0 };
                    const minV = minStaffViolations[d];
                    return (
                      <td key={d} className="border-r border-white/10 py-1 px-0.5">
                        <div className="flex flex-col gap-0.5 items-center">
                          <span className={`text-[9px] font-black w-6 text-center rounded ${minV?.D ? 'bg-red-500 text-white' : 'text-sky-400'}`}>{c.D}</span>
                          <span className={`text-[9px] font-black w-6 text-center rounded ${minV?.E ? 'bg-red-500 text-white' : 'text-amber-400'}`}>{c.E}</span>
                          <span className={`text-[9px] font-black w-6 text-center rounded ${minV?.N ? 'bg-red-500 text-white' : 'text-indigo-400'}`}>{c.N}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td colSpan={4} className="px-3 py-2 text-[10px] text-white/40 font-bold">
                    D / E / N
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

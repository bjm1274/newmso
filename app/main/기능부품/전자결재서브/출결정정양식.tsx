'use client';
import { toast } from '@/lib/toast';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isMissingColumnError } from '@/lib/supabase-compat';

type ProblemReason = '미체크' | '지각' | '결근' | '미출근';

type ProblemDateItem = {
  date: string;
  reason: ProblemReason;
  label: string;
  checkIn?: string | null;
  checkOut?: string | null;
};

type AttendanceCorrectionFormProps = {
  user: any;
  staffs?: any;
  initialSelectedDates?: string[];
  onConsumeInitialSelectedDates?: () => void;
  setExtraData?: (data: Record<string, unknown>) => void;
  setFormTitle?: (title: string) => void;
};

const REQUEST_VIEW = '신청';
const STATUS_VIEW = '현황';
const DEFAULT_CORRECTION_TYPE = '정상반영';

const DEFAULT_CORRECTION_STATUS = '대기';

function isAttendanceCorrectionsLegacySchemaError(error: any) {
  return [
    'attendance_date',
    'requested_at',
    'approval_status',
    'approved_by',
    'approved_at',
  ].some((column) => isMissingColumnError(error, column));
}

async function withAttendanceCorrectionsFallback<T>(
  primary: () => PromiseLike<{ data: T | null; error: any }>,
  fallback: () => PromiseLike<{ data: T | null; error: any }>,
) {
  const result = await primary();
  if (isAttendanceCorrectionsLegacySchemaError(result.error)) {
    return fallback();
  }
  return result;
}

function getCorrectionDate(correction: any) {
  return String(correction?.attendance_date || correction?.original_date || '').slice(0, 10);
}

function getCorrectionStatus(correction: any) {
  return correction?.approval_status || correction?.status || DEFAULT_CORRECTION_STATUS;
}

const REASON_BADGE: Record<string, { bg: string; text: string; icon: string }> = {
  결근:   { bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-600 dark:text-red-400',    icon: '🚫' },
  지각:   { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: '⏰' },
  미체크: { bg: 'bg-slate-100 dark:bg-slate-800',    text: 'text-slate-600 dark:text-slate-400', icon: '❓' },
  미출근: { bg: 'bg-orange-100 dark:bg-orange-900/30',text: 'text-orange-600 dark:text-orange-400',icon: '⚠️' },
};

export default function AttendanceCorrectionForm({
  user,
  initialSelectedDates = [],
  onConsumeInitialSelectedDates,
  setExtraData,
  setFormTitle,
}: AttendanceCorrectionFormProps) {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [problemDates, setProblemDates] = useState<ProblemDateItem[]>([]);
  const [problemDatesLoading, setProblemDatesLoading] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [correctionType, setCorrectionType] = useState(DEFAULT_CORRECTION_TYPE);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState(REQUEST_VIEW);

  const fetchCorrections = useCallback(async () => {
    const { data } = await withAttendanceCorrectionsFallback<any[]>(
      () =>
        supabase
          .from('attendance_corrections')
          .select('*')
          .order('requested_at', { ascending: false }),
      () =>
        supabase
          .from('attendance_corrections')
          .select('*')
          .order('created_at', { ascending: false }),
    );

    if (data) {
      setCorrections(data as any[]);
    }
  }, []);

  const fetchProblemDates = useCallback(async () => {
    if (!user?.id) return;

    setProblemDatesLoading(true);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 60);

      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      /* ── 병렬 조회 ── */
      const [
        { data: attendanceRows },
        { data: attendancesRows },
        { data: myCorrections },
        { data: staffRow },
        { data: assignmentRows },
      ] = await Promise.all([
        supabase.from('attendance').select('date, check_in, check_out, status').eq('staff_id', user.id).gte('date', startStr).lte('date', endStr),
        supabase.from('attendances').select('work_date, status').eq('staff_id', user.id).gte('work_date', startStr).lte('work_date', endStr),
        withAttendanceCorrectionsFallback<any[]>(
          () => supabase.from('attendance_corrections').select('attendance_date, original_date').eq('staff_id', user.id),
          () => supabase.from('attendance_corrections').select('original_date').eq('staff_id', user.id),
        ).then((r) => r),
        supabase.from('staff_members').select('id, shift_id').eq('id', user.id).maybeSingle(),
        supabase.from('shift_assignments').select('work_date, shift_id').eq('staff_id', user.id).gte('work_date', startStr).lte('work_date', endStr),
      ]);

      /* ── 날짜별 배정 Map ── */
      const assignmentByDate = new Map<string, string | null>(
        (assignmentRows || []).map((a: any) => [String(a.work_date).slice(0, 10), a.shift_id ?? null])
      );

      /* ── 관련된 shift_id 목록 수집 → work_shifts 조회 ── */
      const defaultShiftId: string | null = (staffRow as any)?.shift_id ?? null;
      const shiftIdSet = new Set<string>(
        [...(assignmentRows || []).map((a: any) => a.shift_id).filter(Boolean), defaultShiftId].filter(Boolean) as string[]
      );
      const shiftsMap = new Map<string, any>();
      if (shiftIdSet.size > 0) {
        const { data: shiftRows } = await supabase
          .from('work_shifts')
          .select('id, name, shift_type, weekly_work_days, is_weekend_work')
          .in('id', Array.from(shiftIdSet));
        (shiftRows || []).forEach((s: any) => shiftsMap.set(s.id, s));
      }

      /* ── OFF shift 판단 ── */
      const OFF_KEYWORDS = ['휴무', 'off', '비번', '오프'];
      const isOffShift = (shiftId: string | null | undefined): boolean => {
        if (!shiftId) return true; // shift_id가 null이면 OFF
        const shift = shiftsMap.get(shiftId);
        if (!shift) return false;
        const name = String(shift.name || '').toLowerCase();
        return OFF_KEYWORDS.some((kw) => name.includes(kw));
      };

      /* ── 근무유형 → 근무일 모드 ── */
      const resolveWorkDayMode = (shiftId: string | null | undefined): 'all_days' | 'weekdays' => {
        if (!shiftId) return 'weekdays';
        const shift = shiftsMap.get(shiftId);
        if (!shift) return 'weekdays';
        if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
        if (shift.is_weekend_work === true || Number(shift.weekly_work_days) >= 7) return 'all_days';
        return 'weekdays';
      };

      /* ── 해당 날짜가 근무일인지 판단 ── */
      const isWorkDay = (dateStr: string): boolean => {
        const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay(); // 0=일, 6=토
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (assignmentByDate.has(dateStr)) {
          // 근무표에 배정된 날짜
          const assignedShiftId = assignmentByDate.get(dateStr);
          if (isOffShift(assignedShiftId)) return false; // OFF 배정 → 근무 없음
          return true; // 실제 근무 배정됨
        } else {
          // 근무표 배정 없음 → 기본 근무유형으로 판단
          const mode = resolveWorkDayMode(defaultShiftId);
          if (mode === 'all_days') return true;
          return !isWeekend; // weekdays: 토/일 제외
        }
      };

      /* ── 이미 신청한 날짜 Set ── */
      const alreadyRequested = new Set(
        (myCorrections || [])
          .map((item: any) => getCorrectionDate(item))
          .filter(Boolean)
      );

      const attendanceByDate = new Map((attendanceRows || []).map((item: any) => [item.date, item]));
      const attendancesByDate = new Map((attendancesRows || []).map((item: any) => [item.work_date, item]));
      const nextProblemDates = new Map<string, ProblemDateItem>();

      for (let offset = 0; offset <= 60; offset += 1) {
        const current = new Date(start);
        current.setDate(current.getDate() + offset);
        if (current > end) break;

        const dateStr = current.toISOString().slice(0, 10);
        if (alreadyRequested.has(dateStr)) continue;

        // 근무 없는 날(휴무/주말 등)은 건너뜀
        if (!isWorkDay(dateStr)) continue;

        const attendance = attendanceByDate.get(dateStr);
        const attendances = attendancesByDate.get(dateStr);
        const status = attendances?.status;

        if (status === 'absent') {
          nextProblemDates.set(dateStr, { date: dateStr, reason: '결근', label: '결근', checkIn: attendance?.check_in, checkOut: attendance?.check_out });
          continue;
        }

        if (status === 'late' || attendance?.status === '지각') {
          nextProblemDates.set(dateStr, { date: dateStr, reason: '지각', label: '지각', checkIn: attendance?.check_in, checkOut: attendance?.check_out });
          continue;
        }

        if (!attendance) {
          nextProblemDates.set(dateStr, { date: dateStr, reason: '미체크', label: '출퇴근 미체크', checkIn: null, checkOut: null });
          continue;
        }

        if (!attendance.check_in) {
          nextProblemDates.set(dateStr, { date: dateStr, reason: '미출근', label: '출근 미기록', checkIn: null, checkOut: attendance?.check_out });
        }
      }

      setProblemDates(Array.from(nextProblemDates.values()).sort((a, b) => b.date.localeCompare(a.date)));
    } finally {
      setProblemDatesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCorrections();
  }, [fetchCorrections]);

  useEffect(() => {
    fetchProblemDates();
  }, [fetchProblemDates]);

  useEffect(() => {
    if (!Array.isArray(initialSelectedDates) || initialSelectedDates.length === 0) return;

    const nextDates = Array.from(
      new Set(
        initialSelectedDates
          .map((value) => String(value || '').slice(0, 10))
          .filter(Boolean)
      )
    );

    if (nextDates.length === 0) return;

    setViewMode(REQUEST_VIEW);
    setSelectedDates(nextDates);
    onConsumeInitialSelectedDates?.();
  }, [initialSelectedDates, onConsumeInitialSelectedDates]);

  // 부모(전자결재.tsx)에 선택 데이터 동기화 → approvals 기안함에 표시
  useEffect(() => {
    if (!setExtraData) return;
    setExtraData({
      form_slug: 'attendance_fix',
      form_name: '출결정정',
      correction_dates: selectedDates,
      correction_type: correctionType,
      correction_reason: reason,
    });
  }, [selectedDates, correctionType, reason, setExtraData]);

  useEffect(() => {
    if (!setFormTitle || selectedDates.length === 0) return;
    const sorted = [...selectedDates].sort();
    const preview = sorted.slice(0, 2).join(', ') + (sorted.length > 2 ? ` 외 ${sorted.length - 2}건` : '');
    setFormTitle(`출결정정 신청 - ${preview}`);
  }, [selectedDates, setFormTitle]);

  const toggleSelectedDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((item) => item !== date) : [...prev, date]
    );
  };

  const selectAll = () => setSelectedDates(problemDates.map((item) => item.date));
  const clearAll = () => setSelectedDates([]);

  const handleSubmitCorrection = async () => {
    if (selectedDates.length === 0 || !reason.trim()) {
      toast('정정할 날짜를 선택하고 사유를 입력해주세요.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const requestedAt = new Date().toISOString();
      const rows = selectedDates.map((selectedDate) => ({
        staff_id: user.id,
        attendance_date: selectedDate,
        original_date: selectedDate,
        reason: reason.trim(),
        correction_type: correctionType,
        requested_at: requestedAt,
        approval_status: '대기',
        status: '대기',
      }));

      const { error } = await withAttendanceCorrectionsFallback<null>(
        () => supabase.from('attendance_corrections').insert(rows),
        () => {
          const legacyRows = rows.map(
            ({ attendance_date, requested_at, approval_status, ...rest }) => rest
          );
          return supabase.from('attendance_corrections').insert(legacyRows);
        }
      );
      if (error) throw error;

      toast('출결 정정 신청이 완료되었습니다.', 'success');
      setSelectedDates([]);
      setReason('');
      setCorrectionType(DEFAULT_CORRECTION_TYPE);
      fetchCorrections();
      fetchProblemDates();
    } catch (error) {
      console.error('출결 정정 신청 실패:', error);
      toast('출결 정정 신청 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyCorrectionToAttendance = async (
    staffId: string,
    dateStr: string,
    correctionTypeValue: string
  ) => {
    const statusMap: Record<string, { att: string; atts: string }> = {
      정상반영: { att: '정상', atts: 'present' },
      지각처리: { att: '지각', atts: 'late' },
      결근처리: { att: '결근', atts: 'absent' },
    };

    const { att, atts } = statusMap[correctionTypeValue] || statusMap[DEFAULT_CORRECTION_TYPE];

    await supabase.from('attendance').upsert(
      { staff_id: staffId, date: dateStr, status: att },
      { onConflict: 'staff_id,date' }
    );

    await supabase.from('attendances').upsert(
      { staff_id: staffId, work_date: dateStr, status: atts },
      { onConflict: 'staff_id,work_date' }
    );
  };

  const myCorrections = corrections.filter((item) => item.staff_id === user.id);

  /* ── 날짜 포맷 헬퍼 ── */
  const fmtDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return { short: `${mm}/${dd}`, day: days[d.getDay()] };
  };

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    try { return new Date(iso).toTimeString().slice(0, 5); } catch { return null; }
  };

  return (
    <div
      className="custom-scrollbar flex h-full flex-col overflow-y-auto bg-[var(--tab-bg)]/30 p-4"
      data-testid="attendance-correction-view"
    >
      <div className="space-y-4">
        <header>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)] md:text-2xl">
            출결 정정 신청
          </h2>
          <p className="mt-1 text-[11px] font-bold uppercase text-[var(--toss-gray-3)] md:text-xs">
            지각 또는 미기록 사유 제출 및 신청 현황
          </p>
        </header>

        {/* 탭 */}
        <div className="flex flex-wrap gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
          {[
            { id: REQUEST_VIEW, label: '신청하기' },
            { id: STATUS_VIEW, label: '신청 현황' },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewMode(id)}
              className={`rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold transition-all ${
                viewMode === id
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── 신청하기 탭 ── */}
        {viewMode === REQUEST_VIEW && (
          <div className="space-y-4">

            {/* 비정상 출근 기록 자동 연동 */}
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[var(--foreground)]">정정 필요 날짜</span>
                  <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">최근 60일</span>
                  {!problemDatesLoading && problemDates.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold">
                      {problemDates.length}건
                    </span>
                  )}
                </div>
                {problemDates.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-[10px] font-bold text-[var(--accent)] hover:underline"
                    >
                      전체 선택
                    </button>
                    {selectedDates.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAll}
                        className="text-[10px] font-bold text-[var(--toss-gray-3)] hover:underline"
                      >
                        선택 해제
                      </button>
                    )}
                  </div>
                )}
              </div>

              {problemDatesLoading ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm font-bold text-[var(--toss-gray-3)]">
                  <span className="animate-spin text-base">⏳</span> 출퇴근 기록 불러오는 중...
                </div>
              ) : problemDates.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-8 text-[var(--toss-gray-3)]">
                  <span className="text-2xl">✅</span>
                  <p className="text-sm font-bold">최근 60일 내 정정 대상 기록이 없습니다.</p>
                </div>
              ) : (
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {problemDates.map((item) => {
                    const isSelected = selectedDates.includes(item.date);
                    const badge = REASON_BADGE[item.reason] ?? REASON_BADGE['미체크'];
                    const { short, day } = fmtDate(item.date);
                    const checkInTime = fmtTime(item.checkIn);
                    const checkOutTime = fmtTime(item.checkOut);
                    return (
                      <button
                        key={item.date}
                        type="button"
                        data-testid={`attendance-correction-date-${item.date}`}
                        onClick={() => toggleSelectedDate(item.date)}
                        className={`relative flex flex-col gap-1.5 p-2.5 rounded-[var(--radius-md)] border-2 text-left transition-all ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] dark:bg-blue-900/20'
                            : 'border-[var(--border)] bg-[var(--muted)] hover:border-[var(--toss-gray-3)]'
                        }`}
                      >
                        {/* 체크박스 (우상단) */}
                        <div className={`absolute top-2 right-2 w-4 h-4 rounded flex items-center justify-center border-2 transition-all ${
                          isSelected
                            ? 'bg-[var(--accent)] border-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--card)]'
                        }`}>
                          {isSelected && (
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>

                        {/* 날짜 */}
                        <div>
                          <p className="text-sm font-black text-[var(--foreground)] leading-none">{short}</p>
                          <p className={`text-[10px] font-bold mt-0.5 ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-[var(--toss-gray-3)]'}`}>{day}요일</p>
                        </div>

                        {/* 사유 뱃지 */}
                        <span className={`self-start px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 ${badge.bg} ${badge.text}`}>
                          {badge.icon} {item.label}
                        </span>

                        {/* 출퇴근 시간 */}
                        <div className="text-[10px] text-[var(--toss-gray-3)] font-medium leading-tight">
                          {checkInTime && <div>↑ {checkInTime}</div>}
                          {checkOutTime && <div>↓ {checkOutTime}</div>}
                          {!checkInTime && !checkOutTime && <div>기록 없음</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 선택된 항목이 있을 때만 신청 양식 표시 */}
            {selectedDates.length > 0 && (
              <div className="rounded-[var(--radius-md)] border-2 border-[var(--accent)] bg-[var(--card)] p-4 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  <p className="text-sm font-bold text-[var(--foreground)]">
                    선택한 날짜 <span className="text-[var(--accent)]">{selectedDates.length}건</span> 정정 신청
                  </p>
                </div>

                {/* 선택된 날짜 요약 태그 */}
                <div className="flex flex-wrap gap-1.5">
                  {selectedDates.sort().map((date) => {
                    const { short, day } = fmtDate(date);
                    const problemItem = problemDates.find((p) => p.date === date);
                    const badge = problemItem ? (REASON_BADGE[problemItem.reason] ?? REASON_BADGE['미체크']) : REASON_BADGE['미체크'];
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => toggleSelectedDate(date)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all hover:opacity-70 ${badge.bg} ${badge.text} border-current/20`}
                        title="클릭하여 선택 해제"
                      >
                        {short}({day}) ×
                      </button>
                    );
                  })}
                </div>

                {/* 정정 유형 */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
                    정정 유형
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: '정상반영', label: '정상 반영', desc: '지각·결근 아님' },
                      { value: '지각처리', label: '지각 처리', desc: '지각 인정' },
                      { value: '결근처리', label: '결근 처리', desc: '결근 인정' },
                    ].map(({ value, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCorrectionType(value)}
                        className={`flex flex-col items-start px-3 py-2 rounded-[var(--radius-md)] border-2 text-left transition-all text-xs font-bold ${
                          correctionType === value
                            ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] dark:bg-blue-900/20 text-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] hover:border-[var(--toss-gray-3)]'
                        }`}
                      >
                        {label}
                        <span className={`text-[10px] font-medium mt-0.5 ${correctionType === value ? 'text-[var(--accent)]/70' : 'text-[var(--toss-gray-3)]'}`}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 사유 입력 */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
                    사유 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    data-testid="attendance-correction-reason-input"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="예: 외근으로 인해 출근 체크가 누락되었습니다."
                    className="h-24 w-full resize-none rounded-[var(--radius-md)] bg-[var(--muted)] p-3 text-sm font-bold leading-relaxed outline-none focus:ring-2 focus:ring-[var(--accent)]/20 border border-[var(--border)] transition-all"
                  />
                </div>

                <button
                  type="button"
                  data-testid="attendance-correction-submit"
                  onClick={handleSubmitCorrection}
                  disabled={loading || !reason.trim()}
                  className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-sm font-bold text-white shadow-sm transition-all hover:scale-[0.98] disabled:opacity-40"
                >
                  {loading ? '신청 중...' : `${selectedDates.length}건 결재 상신`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 신청 현황 탭 ── */}
        {viewMode === STATUS_VIEW && (
          <div className="space-y-3">
            {myCorrections.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm font-bold text-[var(--toss-gray-3)] shadow-sm">
                신청한 출결 정정 문서가 없습니다.
              </div>
            ) : (
              myCorrections.map((correction, index) => {
                const status = getCorrectionStatus(correction);
                const badge =
                  status === '승인' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                  status === '거절' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                  'bg-orange-100 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400';
                return (
                  <div
                    key={correction.id || `${getCorrectionDate(correction)}-${index}`}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">
                          {getCorrectionDate(correction)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--toss-gray-3)]">{correction.reason}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${badge}`}>
                        {status}
                      </span>
                    </div>
                    <div className="border-t border-[var(--border)] pt-2 mt-2">
                      <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                        정정 유형: {correction.correction_type}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
};

const REQUEST_VIEW = '신청';
const STATUS_VIEW = '현황';
const APPROVAL_VIEW = '결재';
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
}: AttendanceCorrectionFormProps) {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [problemDates, setProblemDates] = useState<ProblemDateItem[]>([]);
  const [problemDatesLoading, setProblemDatesLoading] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [correctionType, setCorrectionType] = useState(DEFAULT_CORRECTION_TYPE);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState(REQUEST_VIEW);

  const canApprove = user?.department === '행정팀' || user?.role === 'admin';

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

      const { data: attendanceRows } = await supabase
        .from('attendance')
        .select('date, check_in, check_out, status')
        .eq('staff_id', user.id)
        .gte('date', startStr)
        .lte('date', endStr);

      const { data: attendancesRows } = await supabase
        .from('attendances')
        .select('work_date, status')
        .eq('staff_id', user.id)
        .gte('work_date', startStr)
        .lte('work_date', endStr);

      const { data: myCorrections } = await withAttendanceCorrectionsFallback<any[]>(
        () =>
          supabase
            .from('attendance_corrections')
            .select('attendance_date, original_date')
            .eq('staff_id', user.id),
        () =>
          supabase
            .from('attendance_corrections')
            .select('original_date')
            .eq('staff_id', user.id),
      );

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

  const handleApprove = async (correction: any, newStatus: string) => {
    const dateStr = getCorrectionDate(correction);
    const approvedAt = new Date().toISOString();
    const { error } = await withAttendanceCorrectionsFallback<null>(
      () =>
        supabase
          .from('attendance_corrections')
          .update({ approval_status: newStatus, status: newStatus, approved_by: user.id, approved_at: approvedAt })
          .eq('id', correction.id),
      () =>
        supabase
          .from('attendance_corrections')
          .update({ status: newStatus })
          .eq('id', correction.id)
    );

    if (error) {
      toast('처리 중 오류가 발생했습니다.', 'error');
      return;
    }

    if (newStatus === '승인' && dateStr && correction.staff_id) {
      await applyCorrectionToAttendance(
        correction.staff_id,
        dateStr,
        correction.correction_type || DEFAULT_CORRECTION_TYPE
      );
    }

    toast(newStatus === '승인' ? '승인되었으며 근태에 반영되었습니다.' : '처리되었습니다.', 'success');
    fetchCorrections();
    fetchProblemDates();
  };

  const myCorrections = corrections.filter((item) => item.staff_id === user.id);
  const pendingCorrections = corrections.filter(
    (item) => getCorrectionStatus(item) === DEFAULT_CORRECTION_STATUS
  );

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
            지각 또는 미기록 사유 제출 및 결재
          </p>
        </header>

        {/* 탭 */}
        <div className="flex flex-wrap gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
          {[
            { id: REQUEST_VIEW, label: '신청하기' },
            { id: STATUS_VIEW, label: '신청 현황' },
            ...(canApprove ? [{ id: APPROVAL_VIEW, label: `결재 대기${pendingCorrections.length > 0 ? ` (${pendingCorrections.length})` : ''}` }] : []),
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
                <div className="divide-y divide-[var(--border)]">
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
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                          isSelected
                            ? 'bg-[var(--toss-blue-light)] dark:bg-blue-900/20'
                            : 'hover:bg-[var(--muted)]'
                        }`}
                      >
                        {/* 체크박스 */}
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
                          isSelected
                            ? 'bg-[var(--accent)] border-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--card)]'
                        }`}>
                          {isSelected && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>

                        {/* 날짜 */}
                        <div className="w-12 shrink-0 text-center">
                          <p className="text-sm font-black text-[var(--foreground)]">{short}</p>
                          <p className={`text-[10px] font-bold ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-[var(--toss-gray-3)]'}`}>{day}요일</p>
                        </div>

                        {/* 사유 뱃지 */}
                        <span className={`shrink-0 px-2 py-1 rounded-[var(--radius-md)] text-[11px] font-bold flex items-center gap-1 ${badge.bg} ${badge.text}`}>
                          {badge.icon} {item.label}
                        </span>

                        {/* 출퇴근 시간 */}
                        <div className="flex-1 flex items-center gap-2 text-[11px] text-[var(--toss-gray-3)] font-medium">
                          {checkInTime && <span>출근 {checkInTime}</span>}
                          {checkOutTime && <span>퇴근 {checkOutTime}</span>}
                          {!checkInTime && !checkOutTime && (
                            <span className="text-[var(--toss-gray-3)]">기록 없음</span>
                          )}
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

        {/* ── 결재 대기 탭 ── */}
        {viewMode === APPROVAL_VIEW && canApprove && (
          <div className="space-y-3">
            {pendingCorrections.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm font-bold text-[var(--toss-gray-3)] shadow-sm">
                결재 대기 중인 출결 정정 문서가 없습니다.
              </div>
            ) : (
              pendingCorrections.map((correction, index) => (
                <div
                  key={correction.id || `${getCorrectionDate(correction)}-${index}`}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {getCorrectionDate(correction)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--toss-gray-3)]">{correction.reason}</p>
                    </div>
                    <span className="rounded-full bg-orange-100 dark:bg-orange-900/30 px-3 py-1 text-[11px] font-semibold text-orange-500">
                      대기
                    </span>
                  </div>
                  <div className="space-y-2 border-t border-[var(--border)] pt-3">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                      정정 유형: {correction.correction_type}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(correction, '승인')}
                        className="flex-1 rounded-[var(--radius-md)] bg-green-600 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:scale-[0.98]"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(correction, '거절')}
                        className="flex-1 rounded-[var(--radius-md)] bg-red-600 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:scale-[0.98]"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

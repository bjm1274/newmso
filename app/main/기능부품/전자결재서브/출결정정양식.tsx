'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ProblemReason = '미체크' | '지각' | '결근' | '미출근';

type ProblemDateItem = {
  date: string;
  reason: ProblemReason;
  label: string;
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

export default function AttendanceCorrectionForm({
  user,
  initialSelectedDates = [],
  onConsumeInitialSelectedDates,
}: AttendanceCorrectionFormProps) {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [problemDates, setProblemDates] = useState<ProblemDateItem[]>([]);
  const [problemDatesLoading, setProblemDatesLoading] = useState(false);
  const [showNewCorrection, setShowNewCorrection] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [correctionType, setCorrectionType] = useState(DEFAULT_CORRECTION_TYPE);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState(REQUEST_VIEW);

  const canApprove = user?.department === '행정팀' || user?.role === 'admin';

  const fetchCorrections = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_corrections')
      .select('*')
      .order('requested_at', { ascending: false });

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

      const { data: myCorrections } = await supabase
        .from('attendance_corrections')
        .select('attendance_date, original_date')
        .eq('staff_id', user.id);

      const alreadyRequested = new Set(
        (myCorrections || [])
          .map((item: any) => (item.attendance_date || item.original_date)?.toString().slice(0, 10))
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
          nextProblemDates.set(dateStr, { date: dateStr, reason: '결근', label: '결근' });
          continue;
        }

        if (status === 'late' || attendance?.status === '지각') {
          nextProblemDates.set(dateStr, { date: dateStr, reason: '지각', label: '지각' });
          continue;
        }

        if (!attendance) {
          nextProblemDates.set(dateStr, { date: dateStr, reason: '미체크', label: '출퇴근 미체크' });
          continue;
        }

        if (!attendance.check_in) {
          nextProblemDates.set(dateStr, { date: dateStr, reason: '미출근', label: '출근 미기록' });
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
    setShowNewCorrection(true);
    setSelectedDates(nextDates);
    onConsumeInitialSelectedDates?.();
  }, [initialSelectedDates, onConsumeInitialSelectedDates]);

  const toggleSelectedDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((item) => item !== date) : [...prev, date]
    );
  };

  const handleSubmitCorrection = async () => {
    if (selectedDates.length === 0 || !reason.trim()) {
      alert('정정할 날짜를 선택하고 사유를 입력해주세요.');
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

      const { error } = await supabase.from('attendance_corrections').insert(rows);
      if (error) throw error;

      alert('출결 정정 신청이 완료되었습니다.');
      setSelectedDates([]);
      setReason('');
      setCorrectionType(DEFAULT_CORRECTION_TYPE);
      setShowNewCorrection(false);
      fetchCorrections();
      fetchProblemDates();
    } catch (error) {
      console.error('출결 정정 신청 실패:', error);
      alert('출결 정정 신청 중 오류가 발생했습니다.');
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
      {
        staff_id: staffId,
        date: dateStr,
        status: att,
      },
      { onConflict: 'staff_id,date' }
    );

    await supabase.from('attendances').upsert(
      {
        staff_id: staffId,
        work_date: dateStr,
        status: atts,
      },
      { onConflict: 'staff_id,work_date' }
    );
  };

  const handleApprove = async (correction: any, newStatus: string) => {
    const dateStr = (correction.attendance_date || correction.original_date)?.toString().slice(0, 10);
    const { error } = await supabase
      .from('attendance_corrections')
      .update({
        approval_status: newStatus,
        status: newStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', correction.id);

    if (error) {
      alert('처리 중 오류가 발생했습니다.');
      return;
    }

    if (newStatus === '승인' && dateStr && correction.staff_id) {
      await applyCorrectionToAttendance(
        correction.staff_id,
        dateStr,
        correction.correction_type || DEFAULT_CORRECTION_TYPE
      );
    }

    alert(newStatus === '승인' ? '승인되었으며 근태에 반영되었습니다.' : '처리되었습니다.');
    fetchCorrections();
    fetchProblemDates();
  };

  const myCorrections = corrections.filter((item) => item.staff_id === user.id);
  const pendingCorrections = corrections.filter(
    (item) => (item.approval_status || item.status) === '대기'
  );

  return (
    <div className="custom-scrollbar flex h-full flex-col overflow-y-auto bg-[var(--tab-bg)]/30 p-4 md:p-8">
      <div className="space-y-6 md:space-y-8">
        <header>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)] md:text-2xl">
            출결 정정 신청
          </h2>
          <p className="mt-1 text-[11px] font-bold uppercase text-[var(--toss-gray-3)] md:text-xs">
            지각 또는 미기록 사유 제출 및 결재
          </p>
        </header>

        <div className="flex flex-wrap gap-2 rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-3 shadow-sm md:p-4">
          <button
            type="button"
            onClick={() => setViewMode(REQUEST_VIEW)}
            className={`rounded-[16px] px-4 py-2.5 text-xs font-semibold transition-all md:px-6 md:py-3 ${
              viewMode === REQUEST_VIEW
                ? 'bg-[var(--toss-blue)] text-white shadow-lg'
                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]/80'
            }`}
          >
            신청하기
          </button>
          <button
            type="button"
            onClick={() => setViewMode(STATUS_VIEW)}
            className={`rounded-[16px] px-4 py-2.5 text-xs font-semibold transition-all md:px-6 md:py-3 ${
              viewMode === STATUS_VIEW
                ? 'bg-[var(--toss-blue)] text-white shadow-lg'
                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]/80'
            }`}
          >
            신청 현황
          </button>
          {canApprove ? (
            <button
              type="button"
              onClick={() => setViewMode(APPROVAL_VIEW)}
              className={`rounded-[16px] px-4 py-2.5 text-xs font-semibold transition-all md:px-6 md:py-3 ${
                viewMode === APPROVAL_VIEW
                  ? 'bg-[var(--toss-blue)] text-white shadow-lg'
                  : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]/80'
              }`}
            >
              결재 대기
            </button>
          ) : null}
        </div>

        {viewMode === REQUEST_VIEW ? (
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => setShowNewCorrection((prev) => !prev)}
              className="rounded-[16px] bg-black px-5 py-3 text-xs font-semibold text-white shadow-lg transition-all hover:scale-[0.98]"
            >
              {showNewCorrection ? '✕ 취소' : '+ 새 신청'}
            </button>

            {showNewCorrection ? (
              <div className="space-y-6 rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm md:p-8">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">출결 정정 신청</h3>
                  <p className="mt-1 text-xs font-bold text-[var(--toss-gray-3)]">
                    출퇴근 미체크, 지각, 결근이 있는 날짜를 선택한 뒤 정정 유형과 사유를 입력하세요.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
                      정정할 날짜 선택
                    </label>
                    {problemDatesLoading ? (
                      <p className="py-4 text-sm font-bold text-[var(--toss-gray-3)]">조회 중...</p>
                    ) : problemDates.length === 0 ? (
                      <p className="rounded-[16px] bg-[var(--toss-gray-1)] px-4 py-4 text-sm font-bold text-[var(--toss-gray-3)]">
                        최근 60일 이내 정정 대상 일자가 없습니다.
                      </p>
                    ) : (
                      <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                        {problemDates.map((item) => (
                          <button
                            key={item.date}
                            type="button"
                            onClick={() => toggleSelectedDate(item.date)}
                            className={`rounded-[16px] border-2 p-3 text-left text-xs font-bold transition-all ${
                              selectedDates.includes(item.date)
                                ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                                : 'border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-[var(--foreground)] hover:border-[var(--toss-gray-3)]'
                            }`}
                          >
                            <span className="block text-[11px] text-[var(--toss-gray-3)]">{item.date}</span>
                            <span
                              className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
                                item.reason === '결근'
                                  ? 'bg-red-100 text-red-600'
                                  : item.reason === '지각'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-[var(--toss-card)] text-[var(--toss-gray-4)]'
                              }`}
                            >
                              {item.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedDates.length > 0 ? (
                      <p className="mt-2 text-[11px] font-bold text-[var(--toss-blue)]">
                        선택한 날짜 {selectedDates.length}건
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
                      정정 유형
                    </label>
                    <select
                      value={correctionType}
                      onChange={(event) => setCorrectionType(event.target.value)}
                      className="w-full rounded-[16px] bg-[var(--toss-gray-1)] p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                    >
                      <option value="정상반영">정상 반영 (지각 아님)</option>
                      <option value="지각처리">지각 처리 (인정)</option>
                      <option value="결근처리">결근 처리 (인정)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
                      사유
                    </label>
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="지각 또는 미기록 사유를 자세히 입력해주세요."
                      className="h-32 w-full resize-none rounded-[16px] bg-[var(--toss-gray-1)] p-4 text-sm font-bold leading-relaxed outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitCorrection}
                  disabled={loading}
                  className="w-full rounded-[16px] bg-[var(--toss-blue)] py-4 text-sm font-semibold text-white shadow-lg transition-all hover:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? '신청 중...' : '결재 상신'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {viewMode === STATUS_VIEW ? (
          <div className="space-y-4">
            {myCorrections.length === 0 ? (
              <div className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 text-sm font-bold text-[var(--toss-gray-3)] shadow-sm">
                신청한 출결 정정 문서가 없습니다.
              </div>
            ) : (
              myCorrections.map((correction, index) => (
                <div
                  key={correction.id || `${correction.attendance_date}-${index}`}
                  className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {correction.attendance_date || correction.original_date}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[var(--toss-gray-3)]">{correction.reason}</p>
                    </div>
                    <span
                      className={`rounded-[12px] px-3 py-1 text-[11px] font-semibold ${
                        (correction.approval_status || correction.status) === '승인'
                          ? 'bg-green-100 text-green-600'
                          : (correction.approval_status || correction.status) === '거절'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-orange-100 text-orange-500'
                      }`}
                    >
                      {correction.approval_status ?? correction.status}
                    </span>
                  </div>
                  <div className="border-t border-[var(--toss-border)] pt-4">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                      정정 유형: {correction.correction_type}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {viewMode === APPROVAL_VIEW && canApprove ? (
          <div className="space-y-4">
            {pendingCorrections.length === 0 ? (
              <div className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 text-sm font-bold text-[var(--toss-gray-3)] shadow-sm">
                결재 대기 중인 출결 정정 문서가 없습니다.
              </div>
            ) : (
              pendingCorrections.map((correction, index) => (
                <div
                  key={correction.id || `${correction.attendance_date}-${index}`}
                  className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {correction.attendance_date || correction.original_date}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[var(--toss-gray-3)]">{correction.reason}</p>
                    </div>
                    <span className="rounded-[12px] bg-orange-100 px-3 py-1 text-[11px] font-semibold text-orange-500">
                      대기
                    </span>
                  </div>

                  <div className="space-y-3 border-t border-[var(--toss-border)] pt-4">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                      정정 유형: {correction.correction_type}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(correction, '승인')}
                        className="flex-1 rounded-[12px] bg-green-600 py-2 text-xs font-semibold text-white shadow-lg transition-all hover:scale-[0.98]"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(correction, '거절')}
                        className="flex-1 rounded-[12px] bg-red-600 py-2 text-xs font-semibold text-white shadow-lg transition-all hover:scale-[0.98]"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

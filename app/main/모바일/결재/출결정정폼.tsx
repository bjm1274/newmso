'use client';

/**
 * SApprovalAttendanceFixForm — 모바일 출결정정 신청 폼.
 *
 * 최근 60일간의 근태 데이터 중 지각/조퇴/결근/미체크 기록을 조회하여
 * 터치 기반의 카드로 노출하고 체크박스로 다중 선택하여 기안합니다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { isMissingColumnError } from '@/lib/db-compat';
import { getPrimaryShift } from '@/lib/staff-shift-resolver';
import { formatKoreanDateKey, formatKoreanTimeLabel } from '@/lib/seoul-time';
import type { ErpUser, StaffMember } from '@/types';
import MAvatar from '../공통/MAvatar';
import MCard from '../공통/MCard';
import MBtn from '../공통/MBtn';
import { MFormHeader, MField, MSegRow, useFieldIdPrefix } from '../인사관리/form-helpers';
import SApprovalApproverPicker from './결재선피커';
import SApprovalCcPicker, { type CcPick } from './참조피커';
import { useApprovalFormBase } from './useApprovalFormBase';

type ProblemReason = '미체크' | '지각' | '조퇴' | '결근' | '미출근';

type ProblemDateItem = {
  date: string;
  reason: ProblemReason;
  label: string;
  checkIn?: string | null;
  checkOut?: string | null;
  scheduledStart?: string | null;
};

type SApprovalAttendanceFixFormProps = {
  user: ErpUser;
  onCancel: () => void;
  onSubmitted: () => void;
};

const DEFAULT_CORRECTION_TYPE = '정상반영';

async function withAttendanceCorrectionsFallback<T>(
  primary: () => PromiseLike<{ data: T | null; error: any }>,
  fallback: () => PromiseLike<{ data: T | null; error: any }>,
) {
  const result = await primary();
  if (
    result.error &&
    [
      'attendance_date',
      'requested_at',
      'approval_status',
      'approved_by',
      'approved_at',
    ].some((column) => isMissingColumnError(result.error, column))
  ) {
    return fallback();
  }
  return result;
}

function getCorrectionDate(correction: any) {
  return String(correction?.attendance_date || correction?.original_date || '').slice(0, 10);
}

const REASON_BADGE: Record<string, { bg: string; text: string; icon: string }> = {
  결근: { bg: 'bg-red-100', text: 'text-red-600', icon: '🚫' },
  지각: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '⏰' },
  조퇴: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '🚶' },
  미체크: { bg: 'bg-slate-100', text: 'text-slate-600', icon: '❓' },
  미출근: { bg: 'bg-orange-100', text: 'text-orange-600', icon: '⚠️' } };

export default function SApprovalAttendanceFixForm({
  user,
  onCancel,
  onSubmitted }: SApprovalAttendanceFixFormProps) {
  const staffId = typeof user.id === 'string' && user.id.trim() !== '' ? user.id : null;
  const company = typeof user.company === 'string' ? user.company.trim() : '';
  const fieldId = useFieldIdPrefix('appr-attfix');

  const [problemDates, setProblemDates] = useState<ProblemDateItem[]>([]);
  const [problemDatesLoading, setProblemDatesLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [correctionType, setCorrectionType] = useState(DEFAULT_CORRECTION_TYPE);
  const [ccUsers, setCcUsers] = useState<CcPick[]>([]);
  const [ccPickerOpen, setCcPickerOpen] = useState(false);

  const base = useApprovalFormBase({ user, staffId, company });
  const {
    submitting,
    setSubmitting,
    approverDefaults,
    approverLine,
    approverLoading,
    approverManual,
    pickerOpen,
    setPickerOpen,
    handleApproverApply,
    submitApproval } = base;

  const fetchProblemDates = useCallback(async () => {
    if (!staffId) return;

    setProblemDatesLoading(true);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 60);

      const startStr = formatKoreanDateKey(start);
      const endStr = formatKoreanDateKey(end);

      const [
        { data: attendanceRows },
        { data: attendancesRows },
        { data: myCorrections },
        { data: assignmentRows },
        primaryShiftId,
      ] = await Promise.all([
        db
          .from('attendance')
          .select('staff_id, date, check_in, check_out, status')
          .eq('staff_id', staffId)
          .gte('date', startStr)
          .lte('date', endStr),
        db
          .from('attendances')
          .select('staff_id, work_date, status, check_in_time, check_out_time')
          .eq('staff_id', staffId)
          .gte('work_date', startStr)
          .lte('work_date', endStr),
        withAttendanceCorrectionsFallback<any[]>(
          () =>
            db
              .from('attendance_corrections')
              .select('attendance_date, original_date')
              .eq('staff_id', staffId),
          () =>
            db
              .from('attendance_corrections')
              .select('original_date')
              .eq('staff_id', staffId),
        ),
        db
          .from('shift_assignments')
          .select('work_date, shift_id')
          .eq('staff_id', staffId)
          .gte('work_date', startStr)
          .lte('work_date', endStr),
        getPrimaryShift(String(staffId)),
      ]);

      const assignmentByDate = new Map<string, string | null>(
        (assignmentRows || []).map((a: any) => [
          String(a.work_date).slice(0, 10),
          a.shift_id ?? null,
        ]),
      );

      const defaultShiftId: string | null = primaryShiftId;
      const shiftIdSet = new Set<string>(
        [
          ...(assignmentRows || []).map((a: any) => a.shift_id).filter(Boolean),
          defaultShiftId,
        ].filter(Boolean) as string[],
      );
      const shiftsMap = new Map<string, any>();
      if (shiftIdSet.size > 0) {
        const { data: shiftRows } = await db
          .from('work_shifts')
          .select('id, name, shift_type, start_time, weekly_work_days, is_weekend_work')
          .in('id', Array.from(shiftIdSet));
        (shiftRows || []).forEach((s: any) => shiftsMap.set(s.id, s));
      }

      const OFF_KEYWORDS = ['휴무', 'off', '비번', '오프'];
      const isOffShift = (sid: string | null | undefined): boolean => {
        if (!sid) return true;
        const shift = shiftsMap.get(sid);
        if (!shift) return false;
        const name = String(shift.name || '').toLowerCase();
        return OFF_KEYWORDS.some((kw) => name.includes(kw));
      };

      const resolveWorkDayMode = (sid: string | null | undefined): 'all_days' | 'weekdays' => {
        if (!sid) return 'weekdays';
        const shift = shiftsMap.get(sid);
        if (!shift) return 'weekdays';
        if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
        if (shift.is_weekend_work === true || Number(shift.weekly_work_days) >= 7) return 'all_days';
        return 'weekdays';
      };

      const isWorkDay = (dateStr: string): boolean => {
        const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (assignmentByDate.has(dateStr)) {
          const assignedShiftId = assignmentByDate.get(dateStr);
          if (isOffShift(assignedShiftId)) return false;
          return true;
        } else {
          const mode = resolveWorkDayMode(defaultShiftId);
          if (mode === 'all_days') return true;
          return !isWeekend;
        }
      };

      const alreadyRequested = new Set(
        (myCorrections || []).map((item: any) => getCorrectionDate(item)).filter(Boolean),
      );

      const attendanceByDate = new Map<string, any>(
        (attendanceRows || []).map((item: any) => [item.date, item]),
      );
      const attendancesByDate = new Map<string, any>(
        (attendancesRows || []).map((item: any) => [item.work_date, item]),
      );
      const nextProblemDates = new Map<string, ProblemDateItem>();

      const toMinutes = (hhmm: string): number => {
        const [h, m] = String(hhmm || '')
          .slice(0, 5)
          .split(':')
          .map(Number);
        return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
      };

      const resolveScheduledStartMin = (dateStr: string): number | null => {
        const sid = assignmentByDate.has(dateStr) ? assignmentByDate.get(dateStr) : defaultShiftId;
        if (!sid || isOffShift(sid)) return null;
        const startTime = String(shiftsMap.get(sid)?.start_time || '').trim();
        return startTime ? toMinutes(startTime) : null;
      };

      const resolveScheduledStartTime = (dateStr: string): string | null => {
        const sid = assignmentByDate.has(dateStr) ? assignmentByDate.get(dateStr) : defaultShiftId;
        if (!sid || isOffShift(sid)) return null;
        return String(shiftsMap.get(sid)?.start_time || '').trim() || null;
      };

      // 저장된 status에만 의존하지 않고, 실제 체크인(KST)이 예정 시작시각을 지났으면 지각으로 우선 표시.
      const isCheckInLate = (dateStr: string, checkInIso: string | null): boolean => {
        if (!checkInIso) return false;
        const startMin = resolveScheduledStartMin(dateStr);
        if (startMin === null) return false;
        const checkInDate = new Date(checkInIso);
        if (Number.isNaN(checkInDate.getTime())) return false;
        return toMinutes(formatKoreanTimeLabel(checkInDate)) > startMin;
      };

      for (let offset = 0; offset <= 60; offset += 1) {
        const current = new Date(start);
        current.setDate(current.getDate() + offset);
        if (current > end) break;

        const dateStr = formatKoreanDateKey(current);
        if (alreadyRequested.has(dateStr)) continue;
        if (!isWorkDay(dateStr)) continue;

        const attendance = attendanceByDate.get(dateStr);
        const attendances = attendancesByDate.get(dateStr);
        const status = attendances?.status;
        const checkInIso = attendances?.check_in_time || attendance?.check_in || null;
        const checkOutIso = attendances?.check_out_time || attendance?.check_out || null;
        const scheduledStart = resolveScheduledStartTime(dateStr);

        if (status !== 'absent' && attendance?.status !== '결근' && isCheckInLate(dateStr, checkInIso)) {
          nextProblemDates.set(dateStr, {
            date: dateStr,
            reason: '지각',
            label: '지각',
            checkIn: checkInIso,
            checkOut: checkOutIso,
            scheduledStart });
          continue;
        }

        if (status === 'present') {
          if (checkInIso) continue;
          if (!attendance) {
            nextProblemDates.set(dateStr, {
              date: dateStr,
              reason: '미체크',
              label: '출퇴근 미체크',
              checkIn: null,
              checkOut: null,
              scheduledStart });
            continue;
          }
        }
        if (
          !status &&
          attendance &&
          (attendance.status === '정상' || attendance.status === 'present') &&
          attendance.check_in
        )
          continue;

        if (status === 'absent') {
          nextProblemDates.set(dateStr, {
            date: dateStr,
            reason: '결근',
            label: '결근',
            checkIn: checkInIso,
            checkOut: checkOutIso,
            scheduledStart });
          continue;
        }

        if (status === 'late' || attendance?.status === '지각') {
          nextProblemDates.set(dateStr, {
            date: dateStr,
            reason: '지각',
            label: '지각',
            checkIn: checkInIso,
            checkOut: checkOutIso,
            scheduledStart });
          continue;
        }

        if (status === 'early_leave' || attendance?.status === '조퇴') {
          nextProblemDates.set(dateStr, {
            date: dateStr,
            reason: '조퇴',
            label: '조퇴',
            checkIn: checkInIso,
            checkOut: checkOutIso,
            scheduledStart });
          continue;
        }

        if (!attendance && !attendances) {
          nextProblemDates.set(dateStr, {
            date: dateStr,
            reason: '미체크',
            label: '출퇴근 미체크',
            checkIn: null,
            checkOut: null,
            scheduledStart });
          continue;
        }

        if (!checkInIso) {
          nextProblemDates.set(dateStr, {
            date: dateStr,
            reason: '미출근',
            label: '출근 미기록',
            checkIn: null,
            checkOut: checkOutIso,
            scheduledStart });
        }
      }

      setProblemDates(
        Array.from(nextProblemDates.values()).sort((a, b) => b.date.localeCompare(a.date)),
      );
      setHasQueried(true);
    } catch (err) {
      console.error(err);
    } finally {
      setProblemDatesLoading(false);
    }
  }, [staffId]);

  const toggleSelectedDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((item) => item !== date) : [...prev, date],
    );
  };

  const handleSelectAll = () => setSelectedDates(problemDates.map((item) => item.date));
  const handleClearAll = () => setSelectedDates([]);

  const handleSubmit = useCallback(async () => {
    if (!staffId) {
      toast('계정 정보를 확인할 수 없습니다.', 'error');
      return;
    }
    if (selectedDates.length === 0) {
      toast('정정할 날짜를 선택해 주세요.', 'warning');
      return;
    }
    if (!reason.trim()) {
      toast('정정 사유를 입력해 주세요.', 'warning');
      return;
    }
    if (approverLine.length === 0) {
      toast('결재자를 지정해 주세요.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const sorted = [...selectedDates].sort();
      const preview =
        sorted.slice(0, 2).join(', ') + (sorted.length > 2 ? ` 외 ${sorted.length - 2}건` : '');
      const resolvedTitle = `출결정정 신청 - ${preview}`;

      const outLines = [`[출결 정정 신청]`, ``, `정정유형: ${correctionType}`];
      sorted.forEach((d) => {
        const item = problemDates.find((p) => p.date === d);
        outLines.push(`- ${d} (${item?.label || '미체크'})`);
      });
      outLines.push(``, `[정정 사유]`, reason.trim());
      const resolvedContent = outLines.join('\n');

      const extraMeta: Record<string, unknown> = {
        form_slug: 'attendance_fix',
        form_name: '출결정정',
        correction_dates: sorted,
        correction_type: correctionType,
        correction_reason: reason.trim(),
        content: resolvedContent };

      await submitApproval({
        typeName: '출결정정',
        title: resolvedTitle,
        content: resolvedContent,
        formSlug: 'attendance_fix',
        formDisplayName: '출결정정 신청',
        ccUsers: ccUsers.map((c) => ({ id: c.id, name: c.name })),
        extraMeta });

      // 신청 완료 후, attendance_corrections 테이블에 병렬 insert (PC 동작 동기화)
      const requestedAt = new Date().toISOString();
      const rows = sorted.map((selectedDate) => ({
        staff_id: staffId,
        attendance_date: selectedDate,
        original_date: selectedDate,
        reason: reason.trim(),
        correction_type: correctionType,
        requested_at: requestedAt,
        status: '대기' }));

      await withAttendanceCorrectionsFallback<null>(
        () => db.from('attendance_corrections').insert(rows),
        () => {
          const legacyRows = rows.map(({ attendance_date, requested_at, ...rest }) => rest);
          return db.from('attendance_corrections').insert(legacyRows);
        },
      );

      toast('출결 정정 기안이 상신되었습니다.', 'success');
      onSubmitted();
    } catch (err) {
      console.error(err);
      toast('상신 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [
    staffId,
    selectedDates,
    reason,
    correctionType,
    problemDates,
    approverLine,
    ccUsers,
    submitApproval,
    setSubmitting,
    onSubmitted,
  ]);

  const canSubmit = selectedDates.length > 0 && reason.trim() !== '' && approverLine.length > 0;

  const fmtDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return { short: `${mm}/${dd}`, day: days[d.getDay()] };
  };

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toTimeString().slice(0, 5);
    } catch {
      return null;
    }
  };

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MFormHeader
        onCancel={onCancel}
        title="출결정정 신청"
        sub="모바일 인라인 작성"
        saveLabel={submitting ? '상신 중...' : '상신'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />

      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div className="m-section" style={{ background: 'transparent' }}>
          <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', background: 'transparent', padding: '8px 16px 4px' }}>
            <div className="lbl" style={{ flex: 1, fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>정정 필요 날짜 (최근 60일)</div>
            {hasQueried && !problemDatesLoading && problemDates.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="transition-all active:scale-95"
                  onClick={handleSelectAll}
                  style={{ fontSize: 11, fontWeight: 900, color: 'var(--m-accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  전체 선택
                </button>
                <button
                  type="button"
                  className="transition-all active:scale-95"
                  onClick={handleClearAll}
                  style={{ fontSize: 11, fontWeight: 900, color: 'var(--z-500)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  해제
                </button>
              </div>
            )}
          </div>

          {!hasQueried && !problemDatesLoading ? (
            <MCard
              className="macos-glass macos-squircle"
              style={{
                margin: '0 16px',
                padding: '24px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12 }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(0, 122, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22 }}
              >
                ⏰
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>출결 정정 대상 조회하기</div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 4, fontWeight: 800, lineHeight: 1.5 }}>
                  최근 60일간의 근태 기록을 분석하여 지각·조퇴·미체크 등 정정이 필요한 날짜들을 조회합니다.
                </div>
              </div>
              <button
                type="button"
                onClick={fetchProblemDates}
                style={{
                  marginTop: 4,
                  padding: '10px 24px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 900,
                  color: '#fff',
                  background: '#007AFF',
                  border: 'none',
                  cursor: 'pointer' }}
                className="transition-all active:scale-95 duration-100"
              >
                조회하기
              </button>
            </MCard>
          ) : problemDatesLoading ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
              출퇴근 기록 불러오는 중...
            </div>
          ) : problemDates.length === 0 ? (
            <MCard
              className="macos-glass macos-squircle"
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                margin: '0 16px' }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-500)' }}>
                정정 대상 기록이 없습니다.
              </div>
            </MCard>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '0 16px' }}>
              {problemDates.map((item) => {
                const isSelected = selectedDates.includes(item.date);
                const badge = REASON_BADGE[item.reason] ?? REASON_BADGE['미체크'];
                const { short, day } = fmtDate(item.date);
                const checkInTime = fmtTime(item.checkIn);
                const checkOutTime = fmtTime(item.checkOut);
                const schedStart = item.scheduledStart ? item.scheduledStart.slice(0, 5) : null;

                let displayLabel = item.label;
                if (item.reason === '지각' && schedStart && checkInTime) {
                  displayLabel = `지각 (예정: ${schedStart} / 출근: ${checkInTime})`;
                } else if (item.reason === '조퇴' && checkOutTime) {
                  displayLabel = `조퇴 (퇴근: ${checkOutTime})`;
                }

                return (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => toggleSelectedDate(item.date)}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 12,
                      borderRadius: 12,
                      border: isSelected
                        ? '2px solid #007AFF'
                        : '1px solid rgba(255, 255, 255, 0.35)',
                      background: isSelected
                        ? 'rgba(0, 122, 255, 0.06)'
                        : 'rgba(255, 255, 255, 0.45)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                      textAlign: 'left',
                      cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--z-900)' }}>{short} ({day})</span>
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          border: '1px solid var(--m-border)',
                          background: isSelected ? '#007AFF' : 'transparent' }}
                      />
                    </div>
                    <span
                      className={badge.bg}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 900,
                        alignSelf: 'flex-start',
                        color: 'inherit' }}
                    >
                      {badge.icon} {displayLabel}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 800, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {schedStart && <div style={{ color: '#007AFF', fontWeight: 900 }}>예정: {schedStart}</div>}
                      {checkInTime && <div>출근: {checkInTime}</div>}
                      {checkOutTime && <div>퇴근: {checkOutTime}</div>}
                      {!checkInTime && !checkOutTime && <div>기록 없음</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedDates.length > 0 && (
          <>
            <div
              className="macos-glass macos-squircle"
              style={{
                margin: '16px',
                overflow: 'hidden' }}
            >
              <MField label="정정 유형">
                <MSegRow
                  value={correctionType}
                  onPick={setCorrectionType}
                  options={[
                    { id: '정상반영', label: '정상 반영' },
                    { id: '지각처리', label: '지각 처리' },
                    { id: '결근처리', label: '결근 처리' },
                  ]}
                  ariaLabel="정정 유형"
                />
              </MField>

              <MField label="사유" required htmlFor={fieldId('reason')}>
                <textarea
                  id={fieldId('reason')}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 외근으로 인해 출근 체크가 누락되었습니다."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    resize: 'none',
                    color: 'var(--z-900)',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none' }}
                />
              </MField>
            </div>

            {/* 결재선 미리보기 */}
            <div className="m-section" style={{ background: 'transparent' }}>
              <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', padding: '8px 16px 4px' }}>
                <div className="lbl" style={{ flex: 1, fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>
                  결재선 ({approverManual ? '직접 지정' : '자동 매핑'})
                </div>
                <button
                  type="button"
                  className="transition-all active:scale-95"
                  onClick={() => setPickerOpen(true)}
                  aria-label="결재선 변경"
                  style={{ fontSize: 12, fontWeight: 900, color: 'var(--m-accent)', padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  변경
                </button>
              </div>
              <MCard
                className="macos-glass macos-squircle"
                style={{
                  overflow: 'hidden',
                  margin: '0 16px',
                  padding: 0 }}
              >
                {approverLoading ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
                    결재선을 불러오는 중...
                  </div>
                ) : approverLine.length === 0 ? (
                  <div
                    style={{
                      padding: '14px 16px',
                      background: 'var(--m-warning-soft)',
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--m-warning)',
                      lineHeight: 1.55 }}
                  >
                    결재자를 직접 지정해 주세요.
                  </div>
                ) : (
                  <ol style={{ listStyle: 'none' }} aria-label="결재 진행 순서">
                    {approverLine.map((a, i) => {
                      const dept = [a.department, a.position].filter(Boolean).join(' / ');
                      const stepLabel =
                        i === approverLine.length - 1 ? '최종 결재' : i === 0 ? '1차 검토' : `${i + 1}차 검토`;
                      return (
                        <li
                          key={String(a.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '40px 1fr auto',
                            gap: 12,
                            padding: '12px 16px',
                            borderBottom: i < approverLine.length - 1 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                            alignItems: 'center' }}
                        >
                          <MAvatar tone="violet" size="sm">
                            {(a.name || '?').charAt(0)}
                          </MAvatar>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>{stepLabel}</div>
                            <div style={{ fontSize: 14, fontWeight: 900, marginTop: 1, color: 'var(--z-900)' }}>{a.name}</div>
                            {dept && (
                              <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1, fontWeight: 700 }}>{dept}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 800 }}>대기</div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </MCard>
            </div>

            {/* 참조(CC) — 선택 사항 */}
            <div className="m-section" style={{ background: 'transparent' }}>
              <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', padding: '8px 16px 4px' }}>
                <div className="lbl" style={{ flex: 1, fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>참조 ({ccUsers.length})</div>
                <button
                  type="button"
                  className="transition-all active:scale-95"
                  onClick={() => setCcPickerOpen(true)}
                  aria-label="참조자 추가 또는 변경"
                  style={{ fontSize: 12, fontWeight: 900, color: 'var(--m-accent)', padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  {ccUsers.length > 0 ? '변경' : '추가'}
                </button>
              </div>
              <MCard
                className="macos-glass macos-squircle"
                style={{
                  overflow: 'hidden',
                  margin: '0 16px',
                  padding: 0 }}
              >
                {ccUsers.length === 0 ? (
                  <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--z-500)', fontWeight: 800, lineHeight: 1.55 }}>
                    참조 지정 시 문서가 참조로 공유됩니다.
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px' }} aria-label="참조자 목록">
                    {ccUsers.map((c) => {
                      const dept = [c.department, c.position].filter(Boolean).join(' / ');
                      return (
                        <li
                          key={c.id}
                          className="macos-glass"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 12px 6px 6px',
                            borderRadius: 999 }}
                        >
                          <MAvatar tone="cyan" size="sm">{(c.name || '?').charAt(0)}</MAvatar>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{c.name}</span>
                            {dept && <span style={{ fontSize: 11, color: 'var(--z-500)', marginLeft: 6, fontWeight: 800 }}>{dept}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </MCard>
            </div>
          </>
        )}

        <div style={{ height: 32 }} />
      </div>

      <SApprovalApproverPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selfId={staffId}
        company={company || null}
        current={approverLine}
        defaultLine={approverDefaults}
        onApply={handleApproverApply}
      />

      <SApprovalCcPicker
        open={ccPickerOpen}
        onClose={() => setCcPickerOpen(false)}
        selfId={staffId}
        company={company || null}
        current={ccUsers}
        onApply={setCcUsers}
      />
    </div>
  );
}

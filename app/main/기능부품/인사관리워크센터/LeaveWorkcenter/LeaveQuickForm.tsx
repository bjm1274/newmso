'use client';

/**
 * 빠른 연차 신청 폼 (LeaveQuickForm)
 *
 * - 표 행 클릭 시 staff prefill, 본인은 user prop
 * - 시작일 / 종료일 / 유형 / 일수 / 사유
 * - 제출 → submitLeaveRequest → toast → onSubmitted 콜백
 * - JM3: try/catch + 사용자 토스트 + console.error
 * - JM6: label / input 매칭, type=date, submit 버튼
 */

import { useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import { toast } from '@/lib/toast';
import { submitLeaveRequest, type LeaveStaffRow } from './data';
import { getKoreanTodayString } from '@/lib/seoul-time';

const LEAVE_TYPES = ['연차', '연차(부여)', '연차(과거사용)', '오전반차', '오후반차', '경조', '병가', '특별휴가'] as const;
type LeaveTypeOption = (typeof LEAVE_TYPES)[number];

interface Props {
  picked: LeaveStaffRow | null;
  user: StaffMember | null;
  staffs: StaffMember[];
  onSubmitted: () => void;
}

function todayIso(): string {
  return getKoreanTodayString();
}

function computeDays(start: string, end: string, leaveType: LeaveTypeOption): number {
  if (!start) return 0;
  if (leaveType === '오전반차' || leaveType === '오후반차') return 0.5;
  const startDate = new Date(start);
  const endDate = new Date(end || start);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1;
  const diff = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.round(diff / (24 * 3600 * 1000)) + 1);
}

export default function LeaveQuickForm({ picked, user, staffs, onSubmitted }: Props) {
  const defaultStaffId = useMemo(() => {
    if (picked) return String(picked.staff.id);
    if (user?.id) return String(user.id);
    if (staffs[0]?.id) return String(staffs[0].id);
    return '';
  }, [picked, user, staffs]);

  const [staffId, setStaffId] = useState<string>(defaultStaffId);
  const [dateRanges, setDateRanges] = useState<{ id: number; startDate: string; endDate: string }[]>([
    { id: Date.now(), startDate: todayIso(), endDate: todayIso() },
  ]);
  const [leaveType, setLeaveType] = useState<LeaveTypeOption>('연차');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // 표에서 행을 선택하면 폼 prefill
  useEffect(() => {
    if (picked) {
      setStaffId(String(picked.staff.id));
    }
  }, [picked]);

  const addDateRange = () => {
    setDateRanges((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), startDate: todayIso(), endDate: todayIso() },
    ]);
  };

  const removeDateRange = (id: number) => {
    setDateRanges((prev) => prev.filter((r) => r.id !== id));
  };

  const updateDateRange = (id: number, key: 'startDate' | 'endDate', value: string) => {
    setDateRanges((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r))
    );
  };

  const totalDays = useMemo(() => {
    return dateRanges.reduce((sum, range) => sum + computeDays(range.startDate, range.endDate, leaveType), 0);
  }, [dateRanges, leaveType]);

  const remaining = picked?.remaining ?? 0;
  const remainingAfter = useMemo(() => {
    if (leaveType === '연차(부여)') {
      return remaining + totalDays;
    }
    return Math.max(0, remaining - totalDays);
  }, [remaining, totalDays, leaveType]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!staffId) {
      toast('직원을 선택해 주세요.', 'error');
      return;
    }
    const invalidRange = dateRanges.find((r) => !r.startDate);
    if (invalidRange) {
      toast('모든 시작일을 올바르게 선택해 주세요.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await Promise.all(
        dateRanges.map((range) =>
          submitLeaveRequest({
            staffId,
            leaveType,
            startDate: range.startDate,
            endDate: range.endDate || range.startDate,
            days: computeDays(range.startDate, range.endDate, leaveType),
            reason,
          })
        )
      );
      toast(`${dateRanges.length}건의 연차/휴가 신청을 상신했습니다.`, 'success');
      setReason('');
      setDateRanges([{ id: Date.now(), startDate: todayIso(), endDate: todayIso() }]);
      onSubmitted();
    } catch (error) {
      console.error('휴가 신청 실패:', error);
      const message = error instanceof Error ? error.message : '신청 처리 중 오류가 발생했습니다.';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const targetName = picked?.staff.name ?? user?.name ?? '직원';

  return (
    <section className="app-card flex flex-col gap-3 p-3 md:p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[var(--foreground)]">연차 사용기록</h3>
        <span className="badge badge-blue">{targetName}</span>
      </header>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">대상 직원</span>
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
          >
            {staffs.map((staff) => (
              <option key={String(staff.id)} value={String(staff.id)}>
                {staff.name}
              </option>
            ))}
          </select>
        </label>

        {/* Dynamic date ranges */}
        <div className="flex flex-col gap-2">
          {dateRanges.map((range, index) => (
            <div key={range.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <label className="flex flex-col gap-1 text-left w-full min-w-0">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)] truncate">
                  시작일 {dateRanges.length > 1 ? `#${index + 1}` : ''}
                </span>
                <input
                  type="date"
                  value={range.startDate}
                  onChange={(e) => updateDateRange(range.id, 'startDate', e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-left w-full min-w-0">
                <span className="text-[11px] font-bold text-[var(--toss-gray-4)] truncate">
                  종료일 {dateRanges.length > 1 ? `#${index + 1}` : ''}
                </span>
                <input
                  type="date"
                  value={range.endDate}
                  onChange={(e) => updateDateRange(range.id, 'endDate', e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
                  required
                />
              </label>
              {dateRanges.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDateRange(range.id)}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-600 font-bold px-2 py-1.5 text-[10px] rounded-[var(--radius-md)] transition shadow-sm h-[32px] flex items-center justify-center border border-red-500/20 shrink-0"
                  title="날짜 제거"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addDateRange}
            className="w-full bg-[var(--muted)] hover:bg-[var(--toss-blue-light)] text-[var(--accent)] border border-dashed border-[var(--accent)]/30 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold transition-all mt-1 cursor-pointer"
          >
            + 날짜 범위 추가
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-left">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">유형</span>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveTypeOption)}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
            >
              {LEAVE_TYPES.map((type) => {
                let label: string = type;
                if (type === '연차') label = '연차 사용 신청';
                if (type === '연차(부여)') label = '연차 신규 부여 (+)';
                if (type === '연차(과거사용)') label = '도입 전 사용 소급 (-)';
                return (
                  <option key={type} value={type}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-left">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">총 일수</span>
            <input
              value={totalDays}
              readOnly
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-right text-[12px] tnum font-bold"
              aria-label="자동 계산된 총 일수"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-left">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">사유</span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="간단한 사유"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px]"
          />
        </label>

        <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[12px]">
          <span className="text-[var(--toss-gray-4)]">
            {leaveType === '연차(부여)' ? '부여 후 잔여' : '사용 후 잔여'}
          </span>
          <span className="font-bold">
            <span className="tnum text-[var(--foreground)]">{remainingAfter}</span>
            <span className="ml-1 text-[11px] text-[var(--toss-gray-4)]">일</span>
          </span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-label="휴가 신청 상신"
          className="rounded-[var(--radius-md)] bg-[var(--accent)] py-2 text-[12px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? '상신 중...' : '신청 상신'}
        </button>
      </form>
    </section>
  );
}

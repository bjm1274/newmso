'use client';

/**
 * 연차신청시트 — Phase3 §3 (근태 통합 3/3) 신청 폼
 *
 * 모바일 본인 연차 신청용 BottomSheet 폼.
 * 별도 파일로 분리하여 모바일연차.tsx의 책임(잔여/내역 조회)과 격리.
 *
 * JM:  ~200줄 단일 책임 — 입력 검증 + supabase insert 만 담당
 * JM3: 검증 실패는 인라인 메시지, 네트워크 실패는 toast로 분리
 * JM4: props 타입 명시, any 금지 (Supabase 응답은 좁은 타입으로 단정)
 * JM5: 시작일/종료일/사유 검증, 과거 일자 차단, leave_type 화이트리스트
 * JM6: 시트 키보드 trap(BottomSheet 내장), 모든 input에 label 연결
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BottomSheet } from '@/app/components/BottomSheet';
import StickyFormFooter from '@/app/components/StickyFormFooter';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { calculateLeaveDays, getLeaveUnit } from '@/lib/annual-leave-ledger';

export type 연차신청시트Props = {
  open: boolean;
  onClose: () => void;
  staffId: string;
  /** 신청 성공 후 부모에서 재조회 트리거 */
  onSubmitted?: () => void;
};

const LEAVE_TYPE_OPTIONS = ['연차', '반차', '특별휴가', '병가', '경조'] as const;
type LeaveTypeOption = (typeof LEAVE_TYPE_OPTIONS)[number];

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function 연차신청시트({
  open,
  onClose,
  staffId,
  onSubmitted,
}: 연차신청시트Props) {
  const [leaveType, setLeaveType] = useState<LeaveTypeOption>('연차');
  const [startDate, setStartDate] = useState<string>(todayKey());
  const [endDate, setEndDate] = useState<string>(todayKey());
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // 시트가 닫혔다 다시 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setError('');
      setSubmitting(false);
    } else {
      // 닫힌 다음 폼 잔존값 정리(다음 신청 영향 방지)
      setLeaveType('연차');
      setStartDate(todayKey());
      setEndDate(todayKey());
      setReason('');
    }
  }, [open]);

  const isHalf = useMemo(() => getLeaveUnit(leaveType) === 0.5, [leaveType]);
  const computedDays = useMemo(() => {
    if (isHalf) return 0.5;
    return calculateLeaveDays(startDate, endDate);
  }, [isHalf, startDate, endDate]);

  // 반차로 전환 시 종료일을 시작일로 강제 — 반차는 단일 일자만 의미가 있다.
  useEffect(() => {
    if (isHalf && endDate !== startDate) {
      setEndDate(startDate);
    }
  }, [isHalf, startDate, endDate]);

  const validate = (): string => {
    if (!staffId) return '직원 계정 정보를 확인할 수 없습니다.';
    if (!startDate) return '시작일을 입력해 주세요.';
    if (!isHalf && !endDate) return '종료일을 입력해 주세요.';

    const today = todayKey();
    if (startDate < today) return '과거 일자는 신청할 수 없습니다.';
    if (!isHalf && endDate < startDate) return '종료일은 시작일보다 빠를 수 없습니다.';

    if (!reason.trim()) return '사유를 입력해 주세요.';
    if (reason.trim().length > 500) return '사유는 500자 이내로 입력해 주세요.';

    return '';
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        staff_id: staffId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: isHalf ? startDate : endDate,
        reason: reason.trim(),
        status: '대기',
      };
      const { error: insertError } = await supabase.from('leave_requests').insert([payload]);
      if (insertError) throw insertError;
      toast('연차 신청이 접수되었습니다. 승인까지 잠시 기다려 주세요.', 'success');
      onSubmitted?.();
      onClose();
    } catch (err) {
      const detail = err instanceof Error ? err.message : '알 수 없는 오류';
      toast(`연차 신청에 실패했습니다: ${detail}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="연차 신청"
      footer={
        <StickyFormFooter
          withSpacer={false}
          secondary={
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--toss-gray-4)] disabled:opacity-50"
            >
              취소
            </button>
          }
          primary={
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="h-11 rounded-[var(--radius-md)] bg-[var(--accent)] px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? '신청 중...' : '신청 제출'}
            </button>
          }
        />
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold text-[var(--foreground)]">종류</span>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as LeaveTypeOption)}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            disabled={submitting}
          >
            {LEAVE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold text-[var(--foreground)]">시작일</span>
          <input
            type="date"
            value={startDate}
            min={todayKey()}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            disabled={submitting}
            required
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold text-[var(--foreground)]">
            종료일 {isHalf && <span className="text-xs font-normal text-[var(--toss-gray-3)]">(반차는 시작일과 동일)</span>}
          </span>
          <input
            type="date"
            value={isHalf ? startDate : endDate}
            min={startDate || todayKey()}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm disabled:opacity-50"
            disabled={submitting || isHalf}
          />
        </label>

        <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-xs font-semibold text-[var(--toss-gray-3)]">
          신청 일수: <span className="font-black text-[var(--accent)]">{computedDays.toFixed(1)}일</span>
        </div>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold text-[var(--foreground)]">사유</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="휴가 사유를 입력해 주세요. (500자 이내)"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            disabled={submitting}
            maxLength={500}
            required
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
          >
            {error}
          </p>
        ) : null}
      </form>
    </BottomSheet>
  );
}

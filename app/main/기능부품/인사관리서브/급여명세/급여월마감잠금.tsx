'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { isAdminUser, isPrivilegedUser } from '@/lib/access-control';

type PayrollLockRow = {
  id: string;
  year_month: string;
  company_name: string;
  locked_at?: string | null;
  locked_by?: string | null;
  memo?: string | null;
  reopen_requested_at?: string | null;
  reopen_requested_by?: string | null;
  reopen_request_comment?: string | null;
  reopen_request_status?: 'pending' | 'approved' | 'rejected' | null;
  reopen_reviewed_at?: string | null;
  reopen_reviewed_by?: string | null;
  reopen_review_comment?: string | null;
};

function readStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('erp_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getCompanyScope(companyName?: unknown) {
  return typeof companyName === 'string' && companyName.trim() ? companyName : '전체';
}

function formatLockError(error: unknown) {
  const message = (error as { message?: string; code?: string })?.message || '';
  if (/reopen_request_status|reopen_requested_at|reopen_reviewed_at/i.test(message)) {
    return '급여 마감 잠금 확장 컬럼이 아직 적용되지 않았습니다. 마이그레이션을 먼저 적용해 주세요.';
  }
  return message || '급여 마감 잠금 처리 중 오류가 발생했습니다.';
}

export default function PayrollLockPanel({
  yearMonth,
  companyName,
  onLockChange,
}: {
  yearMonth?: unknown;
  companyName?: unknown;
  onLockChange?: () => void;
}) {
  const [viewer, setViewer] = useState<any>(null);
  const [lockRow, setLockRow] = useState<PayrollLockRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestComment, setRequestComment] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  const companyScope = getCompanyScope(companyName);

  useEffect(() => {
    setViewer(readStoredUser());
  }, []);

  const loadLock = async () => {
    const { data, error } = await supabase
      .from('payroll_locks')
      .select('id, year_month, company_name, locked_at, locked_by, memo, reopen_requested_at, reopen_requested_by, reopen_request_comment, reopen_request_status, reopen_reviewed_at, reopen_reviewed_by, reopen_review_comment')
      .eq('year_month', yearMonth)
      .eq('company_name', companyScope)
      .maybeSingle();
    if (error) throw error;
    setLockRow((data as PayrollLockRow | null) ?? null);
  };

  useEffect(() => {
    if (!yearMonth) return;
    loadLock().catch((error) => {
      console.error('payroll lock load failed:', error);
      setLockRow(null);
    });
  }, [yearMonth, companyScope]);

  const canApproveReopen = useMemo(() => isAdminUser(viewer) || isPrivilegedUser(viewer), [viewer]);
  const hasPendingRequest = lockRow?.reopen_request_status === 'pending';

  const createLock = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payroll_locks')
        .insert({
          year_month: yearMonth,
          company_name: companyScope,
          locked_by: viewer?.id || null,
          memo: '급여 마감 잠금',
        })
        .select('id, year_month, company_name, locked_at, locked_by, memo, reopen_requested_at, reopen_requested_by, reopen_request_comment, reopen_request_status, reopen_reviewed_at, reopen_reviewed_by, reopen_review_comment')
        .single();
      if (error) throw error;
      setLockRow(data as PayrollLockRow);
      toast('급여 마감 잠금이 설정되었습니다.', 'success');
      onLockChange?.();
    } catch (error) {
      console.error('payroll lock create failed:', error);
      toast(formatLockError(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const requestReopen = async () => {
    if (!lockRow) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payroll_locks')
        .update({
          reopen_requested_at: new Date().toISOString(),
          reopen_requested_by: viewer?.id || null,
          reopen_request_comment: requestComment.trim() || null,
          reopen_request_status: 'pending',
          reopen_reviewed_at: null,
          reopen_reviewed_by: null,
          reopen_review_comment: null,
        })
        .eq('id', lockRow.id)
        .select('id, year_month, company_name, locked_at, locked_by, memo, reopen_requested_at, reopen_requested_by, reopen_request_comment, reopen_request_status, reopen_reviewed_at, reopen_reviewed_by, reopen_review_comment')
        .single();
      if (error) throw error;
      setLockRow(data as PayrollLockRow);
      setRequestComment('');
      toast('재오픈 요청을 등록했습니다.', 'success');
      onLockChange?.();
    } catch (error) {
      console.error('payroll reopen request failed:', error);
      toast(formatLockError(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const reviewReopen = async (approved: boolean) => {
    if (!lockRow) return;
    setLoading(true);
    try {
      if (approved) {
        const { error } = await supabase.from('payroll_locks').delete().eq('id', lockRow.id);
        if (error) throw error;
        setLockRow(null);
        setReviewComment('');
        toast('급여 마감 재오픈을 승인했습니다.', 'success');
      } else {
        const { data, error } = await supabase
          .from('payroll_locks')
          .update({
            reopen_request_status: 'rejected',
            reopen_reviewed_at: new Date().toISOString(),
            reopen_reviewed_by: viewer?.id || null,
            reopen_review_comment: reviewComment.trim() || null,
          })
          .eq('id', lockRow.id)
          .select('id, year_month, company_name, locked_at, locked_by, memo, reopen_requested_at, reopen_requested_by, reopen_request_comment, reopen_request_status, reopen_reviewed_at, reopen_reviewed_by, reopen_review_comment')
          .single();
        if (error) throw error;
        setLockRow(data as PayrollLockRow);
        setReviewComment('');
        toast('재오픈 요청을 반려했습니다.', 'success');
      }
      onLockChange?.();
    } catch (error) {
      console.error('payroll reopen review failed:', error);
      toast(formatLockError(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--foreground)]">급여 월 마감 잠금</h3>
          <p className="text-xs text-[var(--toss-gray-3)]">
            {String(yearMonth || '')} · {companyScope}
          </p>
        </div>
        {!lockRow ? (
          <button
            type="button"
            onClick={createLock}
            disabled={loading}
            className="rounded-[var(--radius-md)] bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {loading ? '처리 중...' : '마감 잠금'}
          </button>
        ) : (
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            잠금됨
          </span>
        )}
      </div>

      {lockRow && (
        <div className="mt-4 space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3 text-sm text-[var(--foreground)]">
            <p>잠금일: {lockRow.locked_at ? new Date(lockRow.locked_at).toLocaleString('ko-KR') : '-'}</p>
            <p>재오픈 상태: {lockRow.reopen_request_status || '요청 없음'}</p>
            {lockRow.reopen_request_comment ? (
              <p className="mt-1 text-xs text-[var(--toss-gray-3)]">요청 사유: {lockRow.reopen_request_comment}</p>
            ) : null}
            {lockRow.reopen_review_comment ? (
              <p className="mt-1 text-xs text-[var(--toss-gray-3)]">검토 메모: {lockRow.reopen_review_comment}</p>
            ) : null}
          </div>

          {!hasPendingRequest && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
              <label className="mb-2 block text-xs font-semibold text-[var(--toss-gray-4)]">재오픈 요청 메모</label>
              <textarea
                value={requestComment}
                onChange={(event) => setRequestComment(event.target.value)}
                rows={3}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm outline-none"
                placeholder="재오픈이 필요한 이유를 남겨 주세요."
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={requestReopen}
                  disabled={loading}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {loading ? '처리 중...' : '재오픈 요청'}
                </button>
              </div>
            </div>
          )}

          {hasPendingRequest && canApproveReopen && (
            <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3">
              <label className="mb-2 block text-xs font-semibold text-amber-800">재오픈 검토 메모</label>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                rows={3}
                className="w-full rounded-[var(--radius-md)] border border-amber-200 bg-white px-3 py-2 text-sm outline-none"
                placeholder="승인 또는 반려 메모를 남겨 주세요."
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => reviewReopen(false)}
                  disabled={loading}
                  className="rounded-[var(--radius-md)] border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                >
                  반려
                </button>
                <button
                  type="button"
                  onClick={() => reviewReopen(true)}
                  disabled={loading}
                  className="rounded-[var(--radius-md)] bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  승인 후 잠금 해제
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

import SalarySlipContainer from './급여명세서';
import MyCertificates from './증명서관리';
import { db, d1 } from '@/lib/db-client';
import { resolveIssuedPayrollRecords } from '@/lib/payroll-records';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { LucideIcon } from '../조직도서브/조직도측면창';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

export type ProfileSummary = {
  id: string | null;
  name: string;
  position: string;
  department: string;
  avatarUrl: string | null;
  employeeNo: string;
};

export function buildProfileSummary(source: Record<string, unknown> | null | undefined): ProfileSummary {
  return {
    id: typeof source?.id === 'string' ? source.id : null,
    name: typeof source?.name === 'string' ? source.name : '',
    position: typeof source?.position === 'string' ? source.position : '',
    department: typeof source?.department === 'string' ? source.department : '',
    avatarUrl: getProfilePhotoUrl(source),
    employeeNo: typeof source?.employee_no === 'string' ? source.employee_no : '' };
}

export function PayrollAndCertificatesHub({
  user,
  activeView,
  onBack,
  onChangeView }: {
  user: Record<string, unknown> | null | undefined;
  activeView: 'salary' | 'certificates';
  onBack?: () => void;
  onChangeView?: (view: 'salary' | 'certificates') => void;
}) {
  const resolvedStaffId = useResolvedStaffId(user as Record<string, unknown> | null);
  const [summary, setSummary] = useState({ salaryCount: 0, certificateCount: 0 });

  useEffect(() => {
    if (!resolvedStaffId) {
      setSummary({ salaryCount: 0, certificateCount: 0 });
      return;
    }

    const fetchSummary = async () => {
      try {
        const [salaryRecordsRes, salaryNotiRes, certRes, approvedDocsRes] = await Promise.all([
          // 명세서 뷰어와 동일 기준으로 집계하도록 레코드와 발송 알림을 함께 조회한다.
          db
            .from('payroll_records')
            .select('record_type, status, year_month')
            .eq('staff_id', resolvedStaffId),
          d1.from('notifications')
            .select('title, body')
            .eq('user_id', resolvedStaffId)
            .eq('type', '급여명세'),
          db
            .from('certificate_issuances')
            .select('id', { count: 'exact', head: true })
            .eq('staff_id', resolvedStaffId),
          db
            .from('approvals')
            .select('id', { count: 'exact', head: true })
            .eq('sender_id', resolvedStaffId)
            .eq('status', '승인')
            // 기존 '양식신청' 레코드와 신규 '증명서발급' 레코드 모두 집계
            .in('type', ['양식신청', '증명서발급']),
        ]);

        const issuedSalaryRecords = resolveIssuedPayrollRecords(
          (salaryRecordsRes.data ?? []) as { record_type?: unknown; status?: unknown; year_month?: unknown }[],
          (salaryNotiRes.data ?? []) as { title?: unknown; body?: unknown }[],
        );

        setSummary({
          salaryCount: issuedSalaryRecords.length,
          certificateCount: (certRes.count || 0) + (approvedDocsRes.count || 0) });
      } catch (error) {
        console.error('[마이페이지공통섹션] 급여·증명서 요약 조회 실패:', error);
        setSummary({ salaryCount: 0, certificateCount: 0 });
      }
    };

    void fetchSummary();
  }, [resolvedStaffId]);

  return (
    <div className="space-y-4 p-3 md:p-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm animate-premium-fade">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="truncate text-xl font-bold tracking-tight text-[var(--foreground)]">급여·증명서</h2>
            </div>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--toss-gray-4)] transition-all hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <LucideIcon name="ArrowLeft" size={14} />
                내 정보
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              aria-label="월별 정산 카드"
              onClick={() => onChangeView?.('salary')}
              className={`rounded-[var(--radius-xl)] border px-5 py-4 text-left transition-all ${
                activeView === 'salary'
                  ? 'border-[var(--accent)] bg-[var(--accent-light)]/60 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">급여명세서</p>
                  <p className="mt-1 text-[13px] font-bold text-[var(--foreground)]">월별 명세서 및 정산 내역</p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-1 text-sm font-black text-[var(--accent)] shadow-sm">
                  {summary.salaryCount}건
                </span>
              </div>
            </button>
            <button
              type="button"
              aria-label="발급 문서 카드"
              onClick={() => onChangeView?.('certificates')}
              className={`rounded-[var(--radius-xl)] border px-5 py-4 text-left transition-all ${
                activeView === 'certificates'
                  ? 'border-[var(--accent)] bg-[var(--accent-light)]/60 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">발급된 증명서</p>
                  <p className="mt-1 text-[13px] font-bold text-[var(--foreground)]">발급 완료 및 승인 문서 확인</p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-1 text-sm font-black text-[var(--accent)] shadow-sm">
                  {summary.certificateCount}건
                </span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {activeView === 'salary' ? (
        <div data-testid="mypage-salary-tab">
          <SalarySlipContainer user={user} />
        </div>
      ) : (
        <div data-testid="mypage-certificates-tab">
          <MyCertificates user={user} />
        </div>
      )}
    </div>
  );
}

export function TabButton({
  isActive,
  onClick,
  label,
  icon,
  ariaLabel }: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={`flex min-h-[44px] items-center gap-0.5 whitespace-nowrap rounded-[var(--radius-md)] px-2.5 py-2 text-[11px] font-semibold transition-all md:min-h-0 md:flex-row md:gap-1.5 md:px-4 md:py-2.5 md:text-[12px]
        ${isActive ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'}
      `}
    >
      <LucideIcon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );
}

export function QuickFavoriteButton({
  label,
  icon,
  onClick,
  active,
  onRemove }: {
  label: string;
  icon: string;
  onClick: () => void;
  active: boolean;
  onRemove?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[11px] font-semibold transition-all
        ${active ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)]'}
      `}
    >
      <LucideIcon name={icon} size={13} />
      <span>{label}</span>
      {onRemove && (
        <span
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="ml-1 inline-flex text-[11px] text-[var(--toss-gray-3)] hover:text-red-500"
        >
          <LucideIcon name="X" size={12} />
        </span>
      )}
    </button>
  );
}

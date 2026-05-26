'use client';

import { useEffect, useState } from 'react';

import SalarySlipContainer from './급여명세서';
import MyCertificates from './증명서관리';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { supabase } from '@/lib/supabase';
import { resolveIssuedPayrollRecords } from '@/lib/payroll-records';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { LucideIcon } from '../조직도서브/조직도측면창';

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
    employeeNo: typeof source?.employee_no === 'string' ? source.employee_no : '',
  };
}

export function ProfileHeaderSummary({
  user,
  showSecret,
  isEditing,
  onToggleSecret,
  onToggleEdit,
}: {
  user: ProfileSummary;
  showSecret: boolean;
  isEditing: boolean;
  onToggleSecret: () => void;
  onToggleEdit: () => void;
}) {
  return (
    <section className="h-[128px] w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm xl:max-w-[340px]">
      <div className="flex h-full items-center justify-between gap-3">
        <div className="relative shrink-0">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--muted)] shadow-sm">
            <ProfilePhotoThumbnail
              src={user.avatarUrl}
              name={user.name}
              alt="프로필 사진"
              className="h-full w-full"
              fallback={<span className="text-3xl text-[var(--toss-gray-3)]">👤</span>}
              previewTitle={user.name ? `${user.name} 사진` : '프로필 사진'}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-keep text-[28px] font-bold leading-tight tracking-tight text-[var(--foreground)]">
            {user.name} {user.position}
          </p>
          <p className="mt-2 truncate text-sm font-bold text-[var(--accent)]">
            {user.department || '소속 정보 없음'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={onToggleSecret}
            className="rounded-[var(--radius-md)] border border-transparent bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-3)] transition-all hover:border-[var(--toss-blue-light)] hover:text-[var(--accent)]"
          >
            {showSecret ? '민감 정보 숨기기' : '민감 정보 확인'}
          </button>
          <button
            type="button"
            onClick={onToggleEdit}
            data-testid="mypage-profile-edit-toggle"
            className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold transition-all ${
              isEditing
                ? 'border-red-100 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)] text-[var(--accent)] hover:bg-[var(--toss-blue-light)]'
            }`}
          >
            {isEditing ? '수정 취소' : '정보 수정'}
          </button>
        </div>
      </div>
    </section>
  );
}

export function PayrollAndCertificatesHub({
  user,
  activeView,
  onBack,
}: {
  user: Record<string, unknown> | null | undefined;
  activeView: 'salary' | 'certificates';
  onBack?: () => void;
}) {
  const [summary, setSummary] = useState({ salaryCount: 0, certificateCount: 0 });
  const activeTitle = activeView === 'salary' ? '급여명세서' : '증명서';
  const activeCount = activeView === 'salary' ? summary.salaryCount : summary.certificateCount;

  useEffect(() => {
    if (!user?.id) {
      setSummary({ salaryCount: 0, certificateCount: 0 });
      return;
    }

    const fetchSummary = async () => {
      const [salaryRecordsRes, salaryNotiRes, certRes, approvedDocsRes] = await Promise.all([
        // 명세서 뷰어와 동일 기준으로 집계하도록 레코드와 발송 알림을 함께 조회한다.
        supabase
          .from('payroll_records')
          .select('record_type, status, year_month')
          .eq('staff_id', user.id),
        supabase
          .from('notifications')
          .select('title, body')
          .eq('user_id', user.id)
          .eq('type', '급여명세'),
        supabase
          .from('certificate_issuances')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', user.id),
        supabase
          .from('approvals')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', user.id)
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
        certificateCount: (certRes.count || 0) + (approvedDocsRes.count || 0),
      });
    };

    void fetchSummary();
  }, [user?.id]);

  return (
    <div className="space-y-4 p-3 md:p-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-xl font-bold tracking-tight text-[var(--foreground)]">{activeTitle}</h2>
            <span className="rounded-[var(--radius-md)] bg-[var(--accent-light)] px-3 py-1 text-sm font-black text-[var(--accent)]">
              {activeCount}건
            </span>
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
  ariaLabel,
}: {
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
  onRemove,
}: {
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

'use client';

import { useEffect, useState } from 'react';

import SalarySlipContainer from './급여명세서';
import MyCertificates from './증명서관리';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { supabase } from '@/lib/supabase';
import { getProfilePhotoUrl } from '@/lib/profile-photo';

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
            {showSecret ? '민감 정보 숨기기' : '보안 정보 보기'}
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
            {isEditing ? '수정 취소' : '내 정보 수정'}
          </button>
        </div>
      </div>
    </section>
  );
}

export function PayrollAndCertificatesHub({
  user,
  activeView,
  onChangeView,
}: {
  user: Record<string, unknown> | null | undefined;
  activeView: 'salary' | 'certificates';
  onChangeView: (view: 'salary' | 'certificates') => void;
}) {
  const [summary, setSummary] = useState({ salaryCount: 0, certificateCount: 0 });

  useEffect(() => {
    if (!user?.id) {
      setSummary({ salaryCount: 0, certificateCount: 0 });
      return;
    }

    const fetchSummary = async () => {
      const [salaryRes, certRes, approvedDocsRes] = await Promise.all([
        supabase
          .from('payroll_records')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', user.id),
        supabase
          .from('certificate_issuances')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', user.id),
        supabase
          .from('approvals')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', user.id)
          .eq('status', '승인')
          .eq('type', '양식신청'),
      ]);

      setSummary({
        salaryCount: salaryRes.count || 0,
        certificateCount: (certRes.count || 0) + (approvedDocsRes.count || 0),
      });
    };

    void fetchSummary();
  }, [user?.id]);

  return (
    <div className="space-y-4 p-3 md:p-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">급여·증명서</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              aria-label="월별 정산 카드"
              onClick={() => onChangeView('salary')}
              className={`rounded-[var(--radius-xl)] border px-5 py-4 text-left transition-all ${
                activeView === 'salary'
                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">급여명세서</p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-1 text-sm font-black text-[var(--accent)] shadow-sm">
                  {summary.salaryCount}건
                </span>
              </div>
            </button>
            <button
              type="button"
              aria-label="발급 문서 카드"
              onClick={() => onChangeView('certificates')}
              className={`rounded-[var(--radius-xl)] border px-5 py-4 text-left transition-all ${
                activeView === 'certificates'
                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">발급된 증명서</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">발급 완료 및 승인 문서 확인</p>
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
      <span className="text-[13px]">{icon}</span>
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
      <span>{icon}</span>
      <span>{label}</span>
      {onRemove && (
        <span
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="ml-1 text-[11px] text-[var(--toss-gray-3)] hover:text-red-500"
        >
          ✕
        </span>
      )}
    </button>
  );
}

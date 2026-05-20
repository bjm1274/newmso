'use client';

/**
 * MemberWorkcenter — 직원 프로필 드로어 (우측)
 *
 * - 직원 헤더 (이름·부서·직급·고용)
 * - 인사 이력 타임라인 (`인사이력타임라인.tsx` 재사용)
 * - 빠른 액션 (서류보관함 진입)
 *
 * JM2: 타임라인 컴포넌트는 lazy mount (선택된 직원이 있을 때만 로드)
 * JM6: role="dialog" + aria-labelledby + 닫기 버튼 키보드 접근
 */

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { StaffMember } from '@/types';
import {
  formatJoinDate,
  formatTenure,
  pickHireDate,
  pickToneForStaff,
} from './data';

const StaffHistoryTimeline = dynamic(
  () => import('../../인사관리서브/인사이력타임라인'),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-6 text-center text-[12px] text-[var(--toss-gray-4)]">
        인사 이력을 불러오는 중…
      </div>
    ),
  },
);

const TONE_BG: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  warn: 'bg-amber-500/15 text-amber-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

interface StaffDrawerProps {
  staff: StaffMember | null;
  onClose?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
}

export default function StaffDrawer({
  staff,
  onClose,
  onOpenDocumentRepoForStaff,
}: StaffDrawerProps) {
  if (!staff) {
    return (
      <aside className="app-card flex h-full items-center justify-center px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        좌측에서 직원을 선택하면<br />상세 프로필이 표시됩니다.
      </aside>
    );
  }
  return <StaffDrawerInner staff={staff} onClose={onClose} onOpenDocumentRepoForStaff={onOpenDocumentRepoForStaff} />;
}

function StaffDrawerInner({
  staff,
  onClose,
  onOpenDocumentRepoForStaff,
}: { staff: StaffMember; onClose?: () => void; onOpenDocumentRepoForStaff?: (staff: StaffMember) => void }) {
  const tone = pickToneForStaff(staff.name ?? '');
  const hire = pickHireDate(staff);
  const initial = (staff.name ?? '?').charAt(0);

  const labelId = useMemo(() => `member-drawer-title-${staff.id}`, [staff.id]);
  const status = staff.status ?? '재직';
  const employ = (() => {
    const raw = (staff as Record<string, unknown>).employ_type;
    return typeof raw === 'string' ? raw : '정규직';
  })();
  const licenseSummary = (() => {
    const raw = (staff as Record<string, unknown>).license_name;
    return typeof raw === 'string' ? raw : null;
  })();

  return (
    <aside
      role="dialog"
      aria-labelledby={labelId}
      className="app-card flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="flex items-start gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-[20px] font-bold ${TONE_BG[tone]}`}
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={labelId} className="truncate text-[15px] font-bold text-[var(--foreground)]">
            {staff.name}
            {staff.employee_no && (
              <span className="ml-2 text-[11px] font-medium text-[var(--toss-gray-4)]">
                · {staff.employee_no}
              </span>
            )}
          </h3>
          <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--toss-gray-4)]">
            {staff.department || '부서 미지정'} · {staff.position || '직급 미지정'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip tone={status === '퇴사' ? 'warn' : 'success'}>{status}</Chip>
            <Chip tone="accent">{employ}</Chip>
            {licenseSummary && <Chip tone="muted">{licenseSummary}</Chip>}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="프로필 닫기"
            className="rounded-[var(--radius-md)] p-1 text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3 md:px-4 md:py-4">
        <dl className="grid grid-cols-3 gap-3 rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-2.5">
          <MetaCell label="입사일" value={formatJoinDate(hire)} />
          <MetaCell label="근속" value={formatTenure(hire)} />
          <MetaCell label="소속" value={staff.department || '-'} />
        </dl>

        <section>
          <div className="section-title mb-2">인사 이력 타임라인</div>
          <StaffHistoryTimeline staffId={String(staff.id)} staffName={staff.name ?? ''} />
        </section>

        {onOpenDocumentRepoForStaff && (
          <section>
            <div className="section-title mb-2">빠른 액션</div>
            <button
              type="button"
              onClick={() => onOpenDocumentRepoForStaff(staff)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              서류보관함 열기 →
            </button>
          </section>
        )}
      </div>
    </aside>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12px] font-semibold text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}

type ChipTone = 'success' | 'warn' | 'accent' | 'muted';
const CHIP_CLS: Record<ChipTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};
function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP_CLS[tone]}`}>
      {children}
    </span>
  );
}

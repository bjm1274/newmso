'use client';

/**
 * PageSkeleton — dynamic import 로딩 중 표시되는 페이지 형태의 스켈레톤.
 *
 * - 카드 그리드 형태로 일반적인 화면 레이아웃을 흉내낸다.
 * - `prefers-reduced-motion: reduce` 사용자에게는 애니메이션을 제거한다 (JM6).
 * - 외부 데이터 의존 없이 순수 표시 컴포넌트로 동작 (JM, JM2).
 */

interface PageSkeletonProps {
  label?: string;
  rows?: number;
}

const ROW_WIDTHS = ['w-3/4', 'w-2/3', 'w-5/6', 'w-1/2', 'w-4/5', 'w-3/5'] as const;

export default function PageSkeleton({ label, rows = 4 }: PageSkeletonProps) {
  const safeRows = Math.max(1, Math.min(rows, 8));

  return (
    <div
      className="page-skeleton min-h-[320px] w-full space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 md:p-6"
      role="status"
      aria-live="polite"
      aria-label={label ? `${label} 불러오는 중` : '화면을 불러오는 중'}
    >
      <div className="flex items-center gap-3">
        <div className="skeleton-bar h-9 w-9 rounded-[var(--radius-md)] bg-[var(--muted)]" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-bar h-4 w-1/3 rounded-[var(--radius-md)] bg-[var(--muted)]" />
          <div className="skeleton-bar h-3 w-1/5 rounded-[var(--radius-md)] bg-[var(--muted)]" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: safeRows }).map((_, idx) => (
          <div
            key={idx}
            className="skeleton-bar h-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]"
          />
        ))}
      </div>

      <div className="space-y-2 pt-2">
        {ROW_WIDTHS.slice(0, safeRows).map((w, idx) => (
          <div
            key={idx}
            className={`skeleton-bar h-3 ${w} rounded-[var(--radius-md)] bg-[var(--muted)]`}
          />
        ))}
      </div>

      <span className="sr-only">{label ? `${label} 화면을 불러오는 중입니다.` : '화면을 불러오는 중입니다.'}</span>

      <style jsx>{`
        .skeleton-bar {
          animation: skeleton-pulse 1.4s ease-in-out infinite;
        }
        @keyframes skeleton-pulse {
          0% { opacity: 0.55; }
          50% { opacity: 0.95; }
          100% { opacity: 0.55; }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-bar {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

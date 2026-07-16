'use client';

/**
 * Welfare*Summary 공용 카드 셸 — header + loading/error/empty + children.
 */

import type { ReactNode } from 'react';

export type WelfareSummaryShellProps = {
  titleId: string;
  title: string;
  meta?: ReactNode;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
  className?: string;
};

export default function WelfareSummaryShell({
  titleId,
  title,
  meta,
  loading,
  error,
  empty,
  emptyText,
  children,
  className,
}: WelfareSummaryShellProps) {
  return (
    <section
      className={`app-card flex flex-col p-3 md:p-4${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 id={titleId} className="text-[13px] font-bold text-[var(--foreground)]">
          {title}
        </h3>
        {!loading && meta != null ? meta : null}
      </header>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800"
        >
          {error}
        </div>
      ) : empty ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">{emptyText}</div>
      ) : (
        children
      )}
    </section>
  );
}

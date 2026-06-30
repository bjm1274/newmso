'use client';

import type { PermissionReview, PermissionReviewItem } from './types';

function PermissionDiffList({
  title,
  items,
  tone }: {
  title: string;
  items: PermissionReviewItem[];
  tone: 'added' | 'removed' | 'changed';
}) {
  const toneClass =
    tone === 'added'
      ? 'text-success'
      : tone === 'removed'
        ? 'text-danger'
        : 'text-warning';

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2.5">
      <p className={`text-[11px] font-black ${toneClass}`}>{title} {items.length.toLocaleString('ko-KR')}</p>
      {items.length > 0 ? (
        <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto pr-1">
          {items.slice(0, 12).map((item) => (
            <div key={`${item.key}-${item.before}-${item.after}`} className="rounded-[var(--radius-md)] bg-[var(--muted)]/70 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[10px] font-bold text-[var(--foreground)]">{item.label}</p>
                {item.tone === 'critical' ? (
                  <span className="shrink-0 rounded-full bg-danger/15 px-1.5 py-0.5 text-[9px] font-bold text-danger">
                    고위험
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[9px] font-semibold text-[var(--toss-gray-3)]">
                {item.before} → {item.after}
              </p>
            </div>
          ))}
          {items.length > 12 ? (
            <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
              외 {items.length - 12}건 더 있음
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[10px] font-semibold text-[var(--toss-gray-3)]">해당 변경 없음</p>
      )}
    </div>
  );
}

export function PermissionDiffPanel({ review, mode }: { review: PermissionReview; mode: 'preview' | 'saved' }) {
  const totalChanges = review.added.length + review.removed.length + review.changed.length;
  const hasChanges = totalChanges > 0;

  return (
    <section
      className={`rounded-[var(--radius-md)] border p-3 shadow-sm ${
        mode === 'preview'
          ? 'border-[var(--accent)]/20 bg-[var(--accent)]/6'
          : 'border-warning/20 bg-warning/10'
      }`}
      data-testid={`staff-permission-diff-${mode}`}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[13px] font-black text-[var(--foreground)]">{review.title}</p>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-4)]">
            {review.summary}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] ring-1 ring-[var(--border)]">
            대상 {review.targetName}
          </span>
          <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] ring-1 ring-[var(--border)]">
            변경 {totalChanges.toLocaleString('ko-KR')}건
          </span>
          <span className={`rounded-[var(--radius-md)] px-2 py-1 text-[10px] font-bold ${review.riskCount > 0 ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'}`}>
            고위험 {review.riskCount.toLocaleString('ko-KR')}건
          </span>
        </div>
      </div>

      {review.affectedGroups.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.affectedGroups.map((group) => (
            <span key={group} className="rounded-full bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--foreground)] ring-1 ring-[var(--border)]">
              {group}
            </span>
          ))}
        </div>
      ) : null}

      {hasChanges ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          <PermissionDiffList title="추가 허용" items={review.added} tone="added" />
          <PermissionDiffList title="해제" items={review.removed} tone="removed" />
          <PermissionDiffList title="설정 변경" items={review.changed} tone="changed" />
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
          권한 값 차이가 없습니다.
        </div>
      )}
    </section>
  );
}

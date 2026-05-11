'use client';
/**
 * app/main-v2/ops/discharge-review/[id]/page.tsx
 * 퇴원심사 상세 페이지 — 좌측 환자 정보 + 우측 3스텝 패널
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DUMMY_REVIEWS, REVIEW_STATUS_LABELS } from '../dummy-data';
import type { ReviewStatus } from '../dummy-data';
import DischargeReviewDetailClient from './DischargeReviewDetailClient';

import { use } from 'react';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_BADGE_CLASS: Record<ReviewStatus, string> = {
  wait: 'badge-gray',
  progress: 'badge-blue',
  done: 'badge-green',
  reject: 'badge-red',
};

export default function DischargeReviewDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const review = DUMMY_REVIEWS.find((r) => r.id === id);
  if (!review) notFound();

  const badgeClass = STATUS_BADGE_CLASS[review.status];
  const statusLabel = REVIEW_STATUS_LABELS[review.status];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* ── 좌측: 환자 정보 패널 ─────────────────────────────────────────── */}
      <aside
        className="w-full shrink-0 border-b border-[var(--border)] bg-[var(--card)] lg:w-72 lg:border-b-0 lg:border-r lg:overflow-y-auto"
        aria-label="환자 정보"
      >
        {/* 뒤로가기 */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Link
            href="/main-v2/ops/discharge-review"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="목록으로 돌아가기"
          >
            ←
          </Link>
          <h1 className="text-base font-bold text-[var(--foreground)]">
            퇴원심사 상세
          </h1>
        </div>

        <div className="p-4 space-y-4">
          {/* 환자 헤더 */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-[var(--foreground)]">
                {review.patientName}
              </p>
              <p className="text-sm text-[var(--toss-gray-3)]">
                {review.age}세 · {review.sex}성
              </p>
            </div>
            <span className={`badge ${badgeClass}`} aria-label={`심사 상태: ${statusLabel}`}>
              {statusLabel}
            </span>
          </div>

          {/* 상세 정보 */}
          <dl className="space-y-2.5">
            <InfoRow label="환자 번호" value={review.patientId} />
            <InfoRow label="진료과" value={review.department} />
            <InfoRow label="병실" value={review.room} />
            <InfoRow label="담당 의사" value={review.doctorName} />
            <InfoRow label="입원일" value={review.admitDate} />
            <InfoRow label="퇴원 예정일" value={review.dischargeDate} />
            <InfoRow label="심사 요청" value={review.requestedAt} />
            {review.completedAt && (
              <InfoRow label="완료일시" value={review.completedAt} />
            )}
          </dl>

          {/* 인쇄 버튼 */}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="심사 결과서 인쇄"
          >
            <span aria-hidden="true">🖨</span> 인쇄
          </button>
        </div>
      </aside>

      {/* ── 우측: 스텝 패널 ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--muted)]">
        <DischargeReviewDetailClient review={review} />
      </div>
    </div>
  );
}

// ── 정보 행 ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-xs font-semibold text-[var(--toss-gray-3)]">
        {label}
      </dt>
      <dd className="text-right text-xs text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

'use client';

/**
 * DischargeReviewListClient.tsx — 퇴원심사 목록 인터랙션
 * JM2: 검색/탭 필터는 클라이언트 상태, API 호출 없음
 * JM4: ReviewStatus union 사용
 * JM6: role="listbox", aria-selected, 키보드 이동 (Enter)
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DischargeReview, ReviewStatus } from './dummy-data';
import { DUMMY_REVIEWS, REVIEW_STATUS_LABELS } from './dummy-data';

type TabFilter = 'all' | ReviewStatus;

const TABS: { id: TabFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'wait', label: '대기' },
  { id: 'progress', label: '진행' },
  { id: 'done', label: '완료' },
  { id: 'reject', label: '반려' },
];

const STATUS_BADGE_CLASS: Record<ReviewStatus, string> = {
  wait: 'badge-gray',
  progress: 'badge-blue',
  done: 'badge-green',
  reject: 'badge-red',
};

export default function DischargeReviewListClient() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const filtered = useMemo(() => {
    return DUMMY_REVIEWS.filter((r) => {
      const matchTab = activeTab === 'all' || r.status === activeTab;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        r.patientName.toLowerCase().includes(q) ||
        r.room.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [search, activeTab]);

  return (
    <section
      className="flex h-full flex-col bg-[var(--card)]"
      aria-label="퇴원심사 목록"
    >
      {/* 헤더 */}
      <div className="border-b border-[var(--border)] px-4 pb-3 pt-5">
        <h1 className="mb-3 text-[17px] font-bold text-[var(--foreground)]">
          퇴원심사
        </h1>
        <div className="flex gap-2">
          <label htmlFor="dr-search" className="sr-only">
            환자명 또는 병실로 검색
          </label>
          <input
            id="dr-search"
            type="search"
            className="form-input min-w-0 flex-1"
            placeholder="환자명 · 병실 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="환자명 또는 병실로 검색"
          />
        </div>
      </div>

      {/* 탭 필터 */}
      <div
        className="flex gap-1 border-b border-[var(--border)] px-4 py-2"
        role="tablist"
        aria-label="심사 상태 필터"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--toss-gray-3)] hover:bg-[var(--muted)]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--toss-gray-4)]">
          <span className="text-4xl" aria-hidden="true">📋</span>
          <p className="text-sm">검색 결과가 없습니다</p>
        </div>
      ) : (
        <ul
          role="listbox"
          aria-label="환자 목록"
          className="flex flex-1 flex-col gap-1 overflow-y-auto p-2"
        >
          {filtered.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}

      {/* 새 심사 등록 버튼 */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => alert('새 퇴원심사 등록 (더미)')}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label="새 퇴원심사 등록"
        >
          ＋ 새 심사 등록
        </button>
      </div>
    </section>
  );
}

// ── 환자 카드 ─────────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: DischargeReview }) {
  const badgeClass = STATUS_BADGE_CLASS[review.status];
  const statusLabel = REVIEW_STATUS_LABELS[review.status];

  return (
    <li role="option" aria-selected={false}>
      <Link
        href={`/main-v2/ops/discharge-review/${review.id}`}
        className="block rounded-[var(--radius-md)] border border-[var(--border)] p-3 transition-all hover:border-[var(--accent)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label={`${review.patientName}, ${statusLabel}, ${review.department} ${review.room}`}
      >
        <div className="mb-1 flex items-start justify-between">
          <span className="text-sm font-semibold text-[var(--foreground)]">
            {review.patientName}{' '}
            <span className="font-normal text-[var(--toss-gray-3)]">
              ({review.age}세, {review.sex})
            </span>
          </span>
          <span className={`badge ${badgeClass} ml-2 shrink-0`}>
            {statusLabel}
          </span>
        </div>
        <p className="text-xs text-[var(--toss-gray-3)]">
          {review.department} · {review.room} · 퇴원 예정: {review.dischargeDate}
        </p>
        <p className="mt-1 text-[11px] text-[var(--toss-gray-4)]">
          {review.completedAt
            ? `완료: ${review.completedAt}`
            : `심사 요청: ${review.requestedAt}`}{' '}
          · 담당: {review.doctorName}
        </p>
      </Link>
    </li>
  );
}

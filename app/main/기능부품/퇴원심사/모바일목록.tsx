'use client';

import { useMemo, useState } from 'react';
import { stayDays, isDischargeApproved } from './공통';

export type DischargeReviewSummary = {
  id: string;
  patient_name: string;
  department: string;
  diagnosis: string;
  admission_date: string;
  discharge_date: string;
  status: string;
  items: { id: string; checked: boolean }[];
  created_at: string;
};

export type 퇴원심사모바일목록Props = {
  reviews: DischargeReviewSummary[];
  loading: boolean;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onOpenTemplate: () => void;
};

type StatusFilter = 'all' | 'pending' | 'approved';

/**
 * 퇴원심사 모바일 목록 화면.
 * - 검색(환자명/진단명) + 상태 필터 + 카드 리스트.
 * - 카드 클릭 시 상세로 이동(부모가 selectedReview 갱신).
 * - 신규 등록 / 템플릿 설정은 헤더 버튼으로 노출.
 */
export default function 퇴원심사모바일목록({
  reviews,
  loading,
  onSelect,
  onCreateNew,
  onOpenTemplate,
}: 퇴원심사모바일목록Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reviews.filter((r) => {
      if (statusFilter === 'pending' && isDischargeApproved(r.status)) return false;
      if (statusFilter === 'approved' && !isDischargeApproved(r.status)) return false;
      if (!normalized) return true;
      const haystack = `${r.patient_name} ${r.diagnosis} ${r.department}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, statusFilter, reviews]);

  return (
    <div className="space-y-3" data-testid="discharge-mobile-list">
      {/* 헤더 액션 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCreateNew}
          className="flex-1 py-2.5 text-xs font-bold text-[var(--card)] bg-[var(--foreground)] rounded-[var(--radius-md)] active:scale-[0.98] transition-all"
        >
          새 심사 등록
        </button>
        <button
          type="button"
          onClick={onOpenTemplate}
          aria-label="기본 항목 설정"
          className="px-3 py-2.5 text-xs font-bold text-[var(--toss-gray-4)] bg-[var(--tab-bg)] rounded-[var(--radius-md)] active:scale-[0.98] transition-all"
        >
          설정
        </button>
      </div>

      {/* 검색 */}
      <div>
        <label htmlFor="discharge-mobile-search" className="sr-only">
          환자명/진단명 검색
        </label>
        <input
          id="discharge-mobile-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="환자명 / 진단명 검색"
          className="w-full px-3 py-2.5 bg-[var(--tab-bg)] border-none rounded-[var(--radius-md)] text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
        />
      </div>

      {/* 상태 필터 */}
      <div role="tablist" aria-label="상태 필터" className="flex gap-1.5">
        {(
          [
            { v: 'all', label: '전체' },
            { v: 'pending', label: '심사 중' },
            { v: 'approved', label: '승인' },
          ] as { v: StatusFilter; label: string }[]
        ).map((f) => (
          <button
            key={f.v}
            type="button"
            role="tab"
            aria-selected={statusFilter === f.v}
            onClick={() => setStatusFilter(f.v)}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-[var(--radius-md)] transition-colors ${
              statusFilter === f.v
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 목록 본문 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[var(--border-subtle)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <div className="text-4xl opacity-30">🏥</div>
          <p className="text-sm font-bold text-[var(--toss-gray-4)]">
            {reviews.length === 0 ? '등록된 퇴원심사가 없습니다' : '검색 결과가 없습니다'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const total = r.items.length;
            const checked = r.items.filter((i) => i.checked).length;
            const ratio = total > 0 ? Math.round((checked / total) * 100) : 0;
            const isApproved = isDischargeApproved(r.status);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid={`discharge-mobile-card-${r.id}`}
                  onClick={() => onSelect(r.id)}
                  className="w-full text-left p-3 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] active:scale-[0.99] transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isApproved
                              ? 'bg-green-500/15 text-green-700'
                              : 'bg-orange-500/15 text-orange-700'
                          }`}
                        >
                          {isApproved ? '승인' : '심사 중'}
                        </span>
                        <span className="text-sm font-bold text-[var(--foreground)] truncate">
                          {r.patient_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-medium truncate">
                        {r.department} · {stayDays(r.admission_date, r.discharge_date)}일 · {total}개 항목
                      </p>
                      {r.diagnosis && (
                        <p className="text-[10px] font-bold text-purple-500 truncate">
                          {r.diagnosis}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right space-y-0.5">
                      <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-[10px] text-[var(--toss-gray-3)]">
                        {checked}/{total}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 bg-[var(--tab-bg)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isApproved ? 'bg-green-500' : 'bg-[var(--accent)]'
                      }`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

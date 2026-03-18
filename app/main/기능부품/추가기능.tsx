'use client';

import { useEffect, useState } from 'react';
import { canAccessExtraFeature } from '@/lib/access-control';
import ThemeToggle from '@/app/components/ThemeToggle';
import GlobalSearch from '@/app/components/GlobalSearch';
import DepartmentInventoryView from './재고관리서브/부서별물품장비현황';
import WorkStatusView from './근무현황';
import HandoverNotesView from './인계노트';
import DischargeReviewView from './퇴원심사';
import ClosingReportView from './마감보고';
import StaffEvaluationView from './직원평가시스템';

const EXTERNAL_LINKS = [
  { id: 'km-park', label: 'KM Park', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: '🏥' },
  { id: 'webfax', label: 'U+ 웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: '📠' },
];

type FeatureCard = {
  id: string;
  label: string;
  icon: string;
  subView: string | null;
  isOrgChart?: boolean;
};

const FEATURE_CARDS: FeatureCard[] = [
  { id: '조직도', label: '조직도', icon: '🏢', subView: null, isOrgChart: true },
  { id: '부서별재고', label: '부서별 재고', icon: '📦', subView: '부서별재고' },
  { id: '근무현황', label: '근무현황', icon: '📅', subView: '근무현황' },
  { id: '인계노트', label: '인계노트', icon: '📝', subView: '인계노트' },
  { id: '퇴원심사', label: '퇴원심사', icon: '🏥', subView: '퇴원심사' },
  { id: '마감보고', label: '마감보고', icon: '💰', subView: '마감보고' },
  { id: '직원평가', label: '직원평가', icon: '✍️', subView: '직원평가' },
];

const FEATURE_CARD_TEST_IDS = [
  'org-chart',
  'department-inventory',
  'work-status',
  'handover-note',
  'discharge-review',
  'closing-report',
  'staff-evaluation',
] as const;

const MAX_RECENT = 5;
const LS_FAVORITES = 'erp_favorites';
const LS_RECENT = 'erp_recent_features';

export default function ExtraFeatures({
  user,
  staffs = [],
  posts = [],
  onSearchSelect,
  onOpenOrgChart,
}: {
  user?: any;
  staffs?: any[];
  posts?: any[];
  onSearchSelect?: (type: string, id: string) => void;
  onOpenOrgChart?: () => void;
}) {
  const [subView, setSubView] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentFeatures, setRecentFeatures] = useState<string[]>([]);

  useEffect(() => {
    try {
      const storedFav = localStorage.getItem(LS_FAVORITES);
      const storedRecent = localStorage.getItem(LS_RECENT);
      if (storedFav) setFavorites(JSON.parse(storedFav));
      if (storedRecent) setRecentFeatures(JSON.parse(storedRecent));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!subView) return;
    const activeCard = FEATURE_CARDS.find((card) => card.subView === subView);
    if (activeCard && !canAccessExtraFeature(user, activeCard.id)) {
      setSubView(null);
    }
  }, [subView, user]);

  const toggleFavorite = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem(LS_FAVORITES, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleFeatureClick = (featureId: string, targetSubView: string | null, isOrgChart?: boolean) => {
    if (!canAccessExtraFeature(user, featureId)) return;

    setRecentFeatures((prev) => {
      const filtered = prev.filter((item) => item !== featureId);
      const next = [featureId, ...filtered].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(LS_RECENT, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    if (isOrgChart && onOpenOrgChart) {
      onOpenOrgChart();
      return;
    }

    if (targetSubView) {
      setSubView(targetSubView);
    }
  };

  const visibleCards = FEATURE_CARDS.filter((card) => {
    if (card.isOrgChart && !onOpenOrgChart) return false;
    if (!canAccessExtraFeature(user, card.id)) return false;
    return true;
  });

  const getFeatureCardTestId = (card: FeatureCard) => {
    const cardIndex = FEATURE_CARDS.findIndex((item) => item.id === card.id);
    return FEATURE_CARD_TEST_IDS[cardIndex] || `feature-${cardIndex}`;
  };

  const favoriteCards = visibleCards.filter((card) => favorites.includes(card.id));
  const normalCards = visibleCards.filter((card) => !favorites.includes(card.id));

  const compactToolbar = (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 shadow-sm">
        <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">모드</span>
        <ThemeToggle compact />
      </div>
      {onSearchSelect ? (
        <div className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-1 py-1 shadow-sm">
          <GlobalSearch
            user={user}
            staffs={staffs}
            posts={posts}
            onSelect={(type, id) => {
              if (type === 'handover') {
                if (canAccessExtraFeature(user, '인계노트')) {
                  setSubView('인계노트');
                }
                return;
              }
              onSearchSelect(type, id);
            }}
            variant="icon"
            compact
          />
        </div>
      ) : null}
    </div>
  );

  const getCardStyle = (id: string) => {
    if (id === '인계노트') return 'bg-red-50 text-red-500 group-hover:bg-red-100';
    if (id === '퇴원심사') return 'bg-purple-50 text-purple-500 group-hover:bg-purple-100';
    return 'bg-[var(--muted)] group-hover:bg-[var(--toss-blue-light)]';
  };

  const renderCard = (card: FeatureCard) => (
    <div
      key={card.id}
      data-testid={`extra-card-shell-${getFeatureCardTestId(card)}`}
      className="relative flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/50 group"
    >
      <button
        type="button"
        data-testid={`extra-card-${getFeatureCardTestId(card)}`}
        onClick={() => handleFeatureClick(card.id, card.subView, card.isOrgChart)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] text-xl transition-colors ${getCardStyle(card.id)}`}>
          {card.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{card.label}</h3>
        </div>
        <span className="mr-1 text-[var(--toss-gray-3)] group-hover:text-[var(--accent)]">→</span>
      </button>
      <button
        type="button"
        data-testid={`extra-favorite-${getFeatureCardTestId(card)}`}
        onClick={(event) => toggleFavorite(card.id, event)}
        className="shrink-0 text-lg leading-none transition-transform hover:scale-110"
        title={favorites.includes(card.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      >
        {favorites.includes(card.id) ? '⭐' : '☆'}
      </button>
    </div>
  );

  if (subView === '부서별재고') {
    return (
      <div data-testid="extra-subview" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          <button data-testid="extra-back-button" type="button" onClick={() => setSubView(null)} className="text-[11px] font-bold text-[var(--accent)] hover:underline">
            ← 목록으로
          </button>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <DepartmentInventoryView user={user || {}} />
          </div>
        </div>
      </div>
    );
  }

  if (subView === '근무현황') {
    return (
      <div data-testid="extra-subview" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          <button data-testid="extra-back-button" type="button" onClick={() => setSubView(null)} className="text-[11px] font-bold text-[var(--accent)] hover:underline">
            ← 목록으로
          </button>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <WorkStatusView user={user || {}} />
          </div>
        </div>
      </div>
    );
  }

  if (subView === '인계노트') {
    return (
      <div data-testid="extra-subview" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          <button data-testid="extra-back-button" type="button" onClick={() => setSubView(null)} className="text-[11px] font-bold text-[var(--accent)] hover:underline">
            ← 목록으로
          </button>
          <HandoverNotesView user={user || {}} />
        </div>
      </div>
    );
  }

  if (subView === '퇴원심사') {
    return (
      <div data-testid="extra-subview" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          <button data-testid="extra-back-button" type="button" onClick={() => setSubView(null)} className="text-[11px] font-bold text-[var(--accent)] hover:underline">
            ← 목록으로
          </button>
          <DischargeReviewView user={user || {}} />
        </div>
      </div>
    );
  }

  if (subView === '마감보고') {
    return (
      <div data-testid="extra-subview" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          <button data-testid="extra-back-button" type="button" onClick={() => setSubView(null)} className="text-[11px] font-bold text-[var(--accent)] hover:underline">
            ← 목록으로
          </button>
          <ClosingReportView user={user || {}} />
        </div>
      </div>
    );
  }

  if (subView === '직원평가') {
    return (
      <div data-testid="extra-subview" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          <button data-testid="extra-back-button" type="button" onClick={() => setSubView(null)} className="text-[11px] font-bold text-[var(--accent)] hover:underline">
            ← 목록으로
          </button>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <StaffEvaluationView user={user || {}} staffs={staffs} />
          </div>
        </div>
      </div>
    );
  }

  if (visibleCards.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4 text-center">
        <div className="mb-4 text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">추가기능 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
          메인 메뉴 권한과 추가기능 세부 권한을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="extra-features-list" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="mb-1 text-lg font-bold text-[var(--foreground)]">추가 기능</h2>

        <div className="space-y-3">
          {favoriteCards.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">즐겨찾기</p>
              <div className="grid gap-3 md:grid-cols-2">
                {favoriteCards.map(renderCard)}
              </div>
            </div>
          ) : null}

          {recentFeatures.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">최근 방문</p>
              <div className="flex flex-wrap items-center gap-2">
                {recentFeatures.map((featureId) => {
                  const card = FEATURE_CARDS.find((item) => item.id === featureId);
                  if (!card || !canAccessExtraFeature(user, card.id)) return null;
                  if (card.isOrgChart && !onOpenOrgChart) return null;

                  return (
                    <button
                      key={featureId}
                      type="button"
                      onClick={() => handleFeatureClick(card.id, card.subView, card.isOrgChart)}
                      className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)]/50"
                    >
                      <span>{card.icon}</span>
                      <span>{card.label}</span>
                    </button>
                  );
                })}
                <div className="md:ml-auto">{compactToolbar}</div>
              </div>
            </div>
          ) : (
            <div className="mb-1 flex justify-end">{compactToolbar}</div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {normalCards.map(renderCard)}

            {EXTERNAL_LINKS.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/50 group"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-xl transition-colors group-hover:bg-[var(--toss-blue-light)]">
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{item.label}</h3>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--toss-gray-3)]">{item.url}</p>
                </div>
                <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--accent)]">↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { startTransition, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';

import ThemeToggle from '@/app/components/ThemeToggle';
import GlobalSearch from '@/app/components/GlobalSearch';
import { canAccessExtraFeature } from '@/lib/access-control';

import {
  EXTERNAL_LINKS,
  EXTRA_FEATURE_LOADERS,
  ExtraFeatureSubview,
  FEATURE_CARDS,
  FontSizeControl,
  type FeatureCard,
} from './추가기능공통';

const prefetchedExtraFeatureModules = new Set<string>();
const MAX_RECENT = 5;
const LS_FAVORITES = 'erp_favorites';
const LS_RECENT = 'erp_recent_features';

type ExtraFeaturesProps = {
  user?: any;
  staffs?: any[];
  posts?: any[];
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
  onSearchSelect?: (type: string, id: string) => void;
};

export default function ExtraFeatures({
  user,
  staffs = [],
  posts = [],
  selectedCo,
  selectedCompanyId,
  onSearchSelect,
}: ExtraFeaturesProps) {
  const [subView, setSubView] = useState<string | null>(null);
  const [orgChartCompany, setOrgChartCompany] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentFeatures, setRecentFeatures] = useState<string[]>([]);

  useEffect(() => {
    try {
      const storedFav = localStorage.getItem(LS_FAVORITES);
      const storedRecent = localStorage.getItem(LS_RECENT);
      if (storedFav) setFavorites(JSON.parse(storedFav));
      if (storedRecent) setRecentFeatures(JSON.parse(storedRecent));
    } catch {
      // ignore local storage failures
    }
  }, []);

  const activeSubViewCard = useMemo(
    () => FEATURE_CARDS.find((card) => card.subView === subView) || null,
    [subView]
  );

  const resolvedSubView =
    activeSubViewCard && !canAccessExtraFeature(user, activeSubViewCard.id) ? null : subView;

  useEffect(() => {
    if (!subView) return;
    if (activeSubViewCard && !canAccessExtraFeature(user, activeSubViewCard.id)) {
      startTransition(() => {
        setSubView(null);
      });
    }
  }, [activeSubViewCard, subView, user]);

  const persistRecent = useCallback((next: string[]) => {
    try {
      localStorage.setItem(LS_RECENT, JSON.stringify(next));
    } catch {
      // ignore local storage failures
    }
  }, []);

  const persistFavorites = useCallback((next: string[]) => {
    try {
      localStorage.setItem(LS_FAVORITES, JSON.stringify(next));
    } catch {
      // ignore local storage failures
    }
  }, []);

  const toggleFavorite = useCallback((id: string, event: MouseEvent) => {
    event.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      persistFavorites(next);
      return next;
    });
  }, [persistFavorites]);

  const handleFeatureClick = useCallback((featureId: string, targetSubView: string | null) => {
    if (!canAccessExtraFeature(user, featureId)) return;

    setRecentFeatures((prev) => {
      const filtered = prev.filter((item) => item !== featureId);
      const next = [featureId, ...filtered].slice(0, MAX_RECENT);
      persistRecent(next);
      return next;
    });

    if (targetSubView === '조직도') {
      setOrgChartCompany(null);
    }

    if (targetSubView) {
      startTransition(() => {
        setSubView(targetSubView);
      });
    }
  }, [persistRecent, user]);

  const visibleCards = useMemo(
    () => FEATURE_CARDS.filter((card) => canAccessExtraFeature(user, card.id)),
    [user]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingLoaders = visibleCards
      .map((card) => [card.subView, EXTRA_FEATURE_LOADERS[card.subView]] as const)
      .filter((entry): entry is readonly [string, () => Promise<unknown>] => {
        const [nextSubView, loader] = entry;
        return typeof loader === 'function' && !prefetchedExtraFeatureModules.has(nextSubView);
      });

    if (pendingLoaders.length === 0) return;

    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    let cancelled = false;
    let timeoutId: number | null = null;

    const prefetchNext = (index: number) => {
      if (cancelled || index >= pendingLoaders.length) {
        return;
      }

      const [nextSubView, loader] = pendingLoaders[index];
      prefetchedExtraFeatureModules.add(nextSubView);
      void loader().finally(() => {
        if (cancelled) return;
        timeoutId = window.setTimeout(() => prefetchNext(index + 1), 120);
      });
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(() => {
        prefetchNext(0);
      });

      return () => {
        cancelled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleId);
        }
      };
    }

    timeoutId = window.setTimeout(() => prefetchNext(0), 300);
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [visibleCards]);

  const handleBack = useCallback(() => {
    startTransition(() => {
      setSubView(null);
    });
  }, []);

  const favoriteCards = useMemo(
    () => visibleCards.filter((card) => favorites.includes(card.id)),
    [favorites, visibleCards]
  );

  const normalCards = useMemo(
    () => visibleCards.filter((card) => !favorites.includes(card.id)),
    [favorites, visibleCards]
  );

  const recentCards = useMemo(
    () =>
      recentFeatures
        .map((featureId) => FEATURE_CARDS.find((item) => item.id === featureId))
        .filter((card): card is FeatureCard => Boolean(card && canAccessExtraFeature(user, card.id))),
    [recentFeatures, user]
  );

  const compactToolbar = (
    <div className="flex items-center gap-2">
      <FontSizeControl />
      <div className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 shadow-sm">
        <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">모드</span>
        <ThemeToggle compact />
      </div>
      {onSearchSelect ? (
        <div className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-1 shadow-sm">
          <GlobalSearch
            user={user}
            staffs={staffs}
            posts={posts}
            onSelect={(type, id) => {
              if (type === 'handover') {
                if (canAccessExtraFeature(user, '인계노트')) {
                  startTransition(() => {
                    setSubView('인계노트');
                  });
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

  const renderCard = useCallback((card: FeatureCard) => (
    <div
      key={card.id}
      data-testid={`extra-card-shell-${card.testId}`}
      className="group relative flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/50"
    >
      <button
        type="button"
        data-testid={`extra-card-${card.testId}`}
        onClick={() => handleFeatureClick(card.id, card.subView)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] text-xl transition-colors ${card.accentClass}`}>
          {card.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{card.label}</h3>
        </div>
        <span className="mr-1 text-[var(--toss-gray-3)] group-hover:text-[var(--accent)]">→</span>
      </button>
      <button
        type="button"
        data-testid={`extra-favorite-${card.testId}`}
        onClick={(event) => toggleFavorite(card.id, event)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-lg leading-none transition-all hover:scale-110 hover:bg-[var(--muted)]"
        title={favorites.includes(card.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        aria-label={favorites.includes(card.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      >
        {favorites.includes(card.id) ? '★' : '☆'}
      </button>
    </div>
  ), [favorites, handleFeatureClick, toggleFavorite]);

  if (resolvedSubView) {
    return (
      <ExtraFeatureSubview
        subView={resolvedSubView}
        onBack={handleBack}
        user={user || null}
        staffs={staffs}
        selectedCo={selectedCo}
        selectedCompanyId={selectedCompanyId}
        orgChartCompany={orgChartCompany}
        setOrgChartCompany={setOrgChartCompany}
      />
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
    <div data-testid="extra-features-list" className="custom-scrollbar flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4">
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

          {recentCards.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">최근 방문</p>
              <div className="flex flex-wrap items-center gap-2">
                {recentCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleFeatureClick(card.id, card.subView)}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--foreground)] transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)]/50"
                  >
                    <span>{card.icon}</span>
                    <span>{card.label}</span>
                  </button>
                ))}
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
                className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-xl transition-colors group-hover:bg-[var(--toss-blue-light)]">
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{item.label}</h3>
                </div>
                <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--accent)]">→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

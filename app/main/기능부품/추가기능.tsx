'use client';

import { startTransition, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';

import ThemeToggle from '@/app/components/ThemeToggle';
import GlobalSearch from '@/app/components/GlobalSearch';
import { canAccessExtraFeature } from '@/lib/access-control';
import { isActiveStaff } from '@/lib/active-staff';

import {
  EXTERNAL_LINKS,
  EXTRA_FEATURE_LOADERS,
  ExtraFeatureSubview,
  FEATURE_CARDS,
  FontFamilyControl,
  FontSizeControl,
  type FeatureCard,
} from './추가기능공통';
import { LucideIcon } from './조직도서브/조직도측면창';

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
  const userStorageSuffix = useMemo(() => {
    const userId = String(user?.id || user?.auth_user_id || user?.employee_no || user?.name || '').trim();
    return userId || 'anonymous';
  }, [user?.auth_user_id, user?.employee_no, user?.id, user?.name]);
  const favoritesStorageKey = `${LS_FAVORITES}:${userStorageSuffix}`;
  const recentStorageKey = `${LS_RECENT}:${userStorageSuffix}`;
  const activeStaffs = useMemo(() => staffs.filter((staff) => isActiveStaff(staff)), [staffs]);

  useEffect(() => {
    try {
      const storedFav = localStorage.getItem(favoritesStorageKey) || localStorage.getItem(LS_FAVORITES);
      const storedRecent = localStorage.getItem(recentStorageKey) || localStorage.getItem(LS_RECENT);
      if (storedFav) setFavorites(JSON.parse(storedFav));
      if (storedRecent) setRecentFeatures(JSON.parse(storedRecent));
    } catch {
      // ignore local storage failures
    }
  }, [favoritesStorageKey, recentStorageKey]);

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
      localStorage.setItem(recentStorageKey, JSON.stringify(next));
    } catch {
      // ignore local storage failures
    }
  }, [recentStorageKey]);

  const persistFavorites = useCallback((next: string[]) => {
    try {
      localStorage.setItem(favoritesStorageKey, JSON.stringify(next));
    } catch {
      // ignore local storage failures
    }
  }, [favoritesStorageKey]);

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
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <FontFamilyControl />
      <FontSizeControl />
      <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 shadow-sm">
        <span className="shrink-0 text-[10px] font-semibold text-[var(--toss-gray-3)]">모드</span>
        <ThemeToggle compact />
      </div>
      {onSearchSelect ? (
        <div className="inline-flex h-8 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-1 shadow-sm">
          <GlobalSearch
            user={user}
            staffs={activeStaffs}
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

  const renderCard = useCallback((card: FeatureCard) => {
    const isFav = favorites.includes(card.id);
    return (
      <div
        key={card.id}
        role="button"
        tabIndex={0}
        data-testid={`extra-card-shell-${card.testId}`}
        className="addon-card group"
        onClick={() => handleFeatureClick(card.id, card.subView)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleFeatureClick(card.id, card.subView);
          }
        }}
        aria-label={`${card.label} 열기 — ${card.desc}`}
      >
        <div className={`ac-ico ico-${card.iconKey}`} aria-hidden="true">
          <LucideIcon name={card.icon} size={20} strokeWidth={1.9} />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="ac-label">{card.label}</div>
          {card.external === 'chart' && <span className="ac-tag tone-warn">Chart 이관 예정</span>}
          {card.external === 'iframe' && <span className="ac-tag tone-muted">외부 연동</span>}
        </div>
        <div className="ac-desc">{card.desc}</div>
        <div className="ac-chev" aria-hidden="true">
          <LucideIcon name="ChevronRight" size={16} />
        </div>
        <button
          type="button"
          data-testid={`extra-favorite-${card.testId}`}
          onClick={(event) => toggleFavorite(card.id, event)}
          className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] opacity-0 transition-all hover:bg-[var(--muted)] hover:text-[var(--accent)] group-hover:opacity-100 focus:opacity-100"
          title={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          aria-label={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        >
          <LucideIcon
            name="Star"
            size={14}
            fill={isFav ? 'currentColor' : 'none'}
            className={isFav ? 'text-[var(--accent)]' : undefined}
          />
        </button>
      </div>
    );
  }, [favorites, handleFeatureClick, toggleFavorite]);

  if (resolvedSubView) {
    return (
      <ExtraFeatureSubview
        subView={resolvedSubView}
        onBack={handleBack}
        user={user || null}
        staffs={activeStaffs}
        selectedCo={selectedCo}
        selectedCompanyId={selectedCompanyId}
        orgChartCompany={orgChartCompany}
        setOrgChartCompany={setOrgChartCompany}
      />
    );
  }

  if (visibleCards.length === 0) {
    return (
      <div className="flex h-full flex-col bg-[var(--muted)] p-4">
        <div className="mb-3 flex justify-end">{compactToolbar}</div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--toss-blue-light)] text-[var(--accent)]">
            <LucideIcon name="Lock" size={24} />
          </div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">추가기능 접근 권한이 없습니다.</h2>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="extra-features-list" className="custom-scrollbar flex-1 overflow-y-auto bg-[var(--page-bg)] px-5 py-5 md:px-6">
      {/* §4-1 모듈 허브 hero 삭제 — 우상단 액션(컴팩트 툴바)만 유지 */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {compactToolbar}
      </div>

      <div className="w-full">
        {/* 라이브 정답: .addon-grid 단일 그리드. 즐겨찾기 → 최근 → 일반 → 외부연동 순. */}
        <div className="addon-grid">
          {favoriteCards.map(renderCard)}
          {recentCards
            .filter((card) => !favorites.includes(card.id))
            .map(renderCard)}
          {normalCards
            .filter((card) => !recentFeatures.includes(card.id))
            .map(renderCard)}
          {EXTERNAL_LINKS.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${item.label} — 외부 시스템 ${item.vendor} 새 창에서 열기`}
              className="addon-card group"
              style={{ textDecoration: 'none' }}
            >
              <div className={`ac-ico ico-${item.iconKey}`} aria-hidden="true">
                <LucideIcon name={item.icon} size={20} strokeWidth={1.8} />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="ac-label">{item.label}</div>
                <span className="ac-tag tone-muted">외부 연동</span>
              </div>
              <div className="ac-desc">{item.vendor}</div>
              <div className="ac-chev" aria-hidden="true">
                <LucideIcon name="ArrowUpRight" size={16} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

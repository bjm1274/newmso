'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { canAccessExtraFeature } from '@/lib/access-control';
import ThemeToggle from '@/app/components/ThemeToggle';
import GlobalSearch from '@/app/components/GlobalSearch';

// ─── 글씨 크기 조절 ────────────────────────────────────────────────────────────
const FONT_SIZES = [
  { label: '기본', value: 15 },
  { label: '하', value: 17 },
  { label: '중', value: 19 },
  { label: '대', value: 21 },
];
const FONT_SIZE_KEY = 'erp-font-size';

function applyFontSize(px: number) {
  document.documentElement.style.fontSize = `${px}px`;
}

function FontSizeControl() {
  const [current, setCurrent] = useState<number>(() => {
    if (typeof window === 'undefined') return 15;
    return Number(localStorage.getItem(FONT_SIZE_KEY) || 15);
  });

  useEffect(() => {
    applyFontSize(current);
  }, [current]);

  const change = (px: number) => {
    setCurrent(px);
    localStorage.setItem(FONT_SIZE_KEY, String(px));
    applyFontSize(px);
  };

  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 shadow-sm">
      <span className="text-[10px] font-semibold text-[var(--toss-gray-3)] mr-0.5">글씨</span>
      {FONT_SIZES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => change(s.value)}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
            current === s.value
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

const DepartmentInventoryView = dynamic(() => import('./재고관리서브/부서별물품장비현황'), {
  ssr: false,
  loading: () => <SubviewLoading label="부서별 재고" />,
});
const WorkStatusView = dynamic(() => import('./근무현황'), {
  ssr: false,
  loading: () => <SubviewLoading label="근무현황" />,
});
const HandoverNotesView = dynamic(() => import('./인계노트'), {
  ssr: false,
  loading: () => <SubviewLoading label="인계노트" />,
});
const DischargeReviewView = dynamic(() => import('./퇴원심사'), {
  ssr: false,
  loading: () => <SubviewLoading label="퇴원심사" />,
});
const ClosingReportView = dynamic(() => import('./마감보고'), {
  ssr: false,
  loading: () => <SubviewLoading label="마감보고" />,
});
const StaffEvaluationView = dynamic(() => import('./직원평가시스템'), {
  ssr: false,
  loading: () => <SubviewLoading label="직원평가" />,
});
const RealtimeDepositView = dynamic(() => import('./입금실시간조회'), {
  ssr: false,
  loading: () => <SubviewLoading label="입금 실시간 조회" />,
});
const SurgeryConsultationView = dynamic(() => import('./수술상담'), {
  ssr: false,
  loading: () => <SubviewLoading label="수술상담 AI 분석" />,
});
const OperationCheckView = dynamic(() => import('./OP체크'), {
  ssr: false,
  loading: () => <SubviewLoading label="OP체크" />,
});
const OrgChart = dynamic(() => import('./조직도서브/OrgChart'), {
  ssr: false,
  loading: () => <SubviewLoading label="조직도" />,
});

const EXTERNAL_LINKS = [
  { id: 'km-park', label: 'KM Park', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: '🔗' },
  { id: 'webfax', label: 'U+ 웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: '📠' },
];

type FeatureCard = {
  id: string;
  label: string;
  icon: string;
  subView: string;
};

const FEATURE_CARDS: FeatureCard[] = [
  { id: '조직도', label: '조직도', icon: '🏢', subView: '조직도' },
  { id: '부서별재고', label: '부서별 재고', icon: '📦', subView: '부서별재고' },
  { id: '근무현황', label: '근무현황', icon: '📅', subView: '근무현황' },
  { id: '인계노트', label: '인계노트', icon: '📝', subView: '인계노트' },
  { id: '퇴원심사', label: '퇴원심사', icon: '🏥', subView: '퇴원심사' },
  { id: '마감보고', label: '마감보고', icon: '💰', subView: '마감보고' },
  { id: '직원평가', label: '직원평가', icon: '✍️', subView: '직원평가' },
  { id: '입금실시간조회', label: '입금 실시간 조회', icon: '🏦', subView: '입금실시간조회' },
  { id: '수술상담', label: '수술상담 AI 분석', icon: '🎙️', subView: '수술상담' },
  { id: 'OP체크', label: 'OP체크', icon: '🩺', subView: 'OP체크' },
];

const FEATURE_CARD_TEST_IDS = [
  'org-chart',
  'department-inventory',
  'work-status',
  'handover-note',
  'discharge-review',
  'closing-report',
  'staff-evaluation',
  'realtime-deposit',
  'surgery-consultation',
  'op-check',
] as const;

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
  onOpenOrgChart?: () => void;
};

function SubviewLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-[var(--foreground)]">{label} 불러오는 중</p>
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">필요한 기능만 로드해서 반응성을 높이고 있습니다.</p>
        </div>
      </div>
    </div>
  );
}

function FeatureShell({
  children,
  onBack,
  maxWidth = 'max-w-5xl',
  boxed = false,
}: {
  children: ReactNode;
  onBack: () => void;
  maxWidth?: string;
  boxed?: boolean;
}) {
  const content = boxed ? (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      {children}
    </div>
  ) : (
    children
  );

  return (
    <div data-testid="extra-subview" className="flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4 custom-scrollbar">
      <div className={`mx-auto flex w-full flex-col gap-3 ${maxWidth}`}>
        <button
          data-testid="extra-back-button"
          type="button"
          onClick={onBack}
          className="self-start text-[11px] font-bold text-[var(--accent)] hover:underline"
        >
          ← 목록으로
        </button>
        {content}
      </div>
    </div>
  );
}

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

  useEffect(() => {
    if (!subView) return;
    const activeCard = FEATURE_CARDS.find((card) => card.subView === subView);
    if (activeCard && !canAccessExtraFeature(user, activeCard.id)) {
      setSubView(null);
    }
  }, [subView, user]);

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
      setSubView(targetSubView);
    }
  }, [persistRecent, user]);

  const visibleCards = useMemo(
    () => FEATURE_CARDS.filter((card) => canAccessExtraFeature(user, card.id)),
    [user]
  );

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

  const getFeatureCardTestId = useCallback((card: FeatureCard) => {
    const cardIndex = FEATURE_CARDS.findIndex((item) => item.id === card.id);
    return FEATURE_CARD_TEST_IDS[cardIndex] || `feature-${cardIndex}`;
  }, []);

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

  const getCardStyle = useCallback((id: string) => {
    if (id === '인계노트') return 'bg-red-500/10 text-red-500 group-hover:bg-red-500/20';
    if (id === '퇴원심사') return 'bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20';
    if (id === '조직도') return 'bg-sky-50 text-sky-600 group-hover:bg-sky-100';
    return 'bg-[var(--muted)] group-hover:bg-[var(--toss-blue-light)]';
  }, []);

  const renderCard = useCallback((card: FeatureCard) => (
    <div
      key={card.id}
      data-testid={`extra-card-shell-${getFeatureCardTestId(card)}`}
      className="relative flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/50 group"
    >
      <button
        type="button"
        data-testid={`extra-card-${getFeatureCardTestId(card)}`}
        onClick={() => handleFeatureClick(card.id, card.subView)}
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
        {favorites.includes(card.id) ? '★' : '☆'}
      </button>
    </div>
  ), [favorites, getCardStyle, getFeatureCardTestId, handleFeatureClick, toggleFavorite]);

  if (subView === '조직도') {
    return (
      <FeatureShell onBack={() => setSubView(null)} maxWidth="max-w-7xl">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-x-auto">
          <OrgChart
            user={user || null}
            staffs={staffs}
            selectedCo={orgChartCompany}
            setSelectedCo={setOrgChartCompany}
            compact
          />
        </div>
      </FeatureShell>
    );
  }

  if (subView === '부서별재고') {
    return (
      <FeatureShell onBack={() => setSubView(null)} boxed>
        <DepartmentInventoryView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '근무현황') {
    return (
      <FeatureShell onBack={() => setSubView(null)} boxed>
        <WorkStatusView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '인계노트') {
    return (
      <FeatureShell onBack={() => setSubView(null)}>
        <HandoverNotesView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '퇴원심사') {
    return (
      <FeatureShell onBack={() => setSubView(null)}>
        <DischargeReviewView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '마감보고') {
    return (
      <FeatureShell onBack={() => setSubView(null)}>
        <ClosingReportView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '직원평가') {
    return (
      <FeatureShell onBack={() => setSubView(null)} boxed>
        <StaffEvaluationView user={user || {}} staffs={staffs} />
      </FeatureShell>
    );
  }

  if (subView === '입금실시간조회') {
    return (
      <FeatureShell onBack={() => setSubView(null)} maxWidth="max-w-6xl">
        <RealtimeDepositView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '수술상담') {
    return (
      <FeatureShell onBack={() => setSubView(null)} maxWidth="max-w-4xl">
        <SurgeryConsultationView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === 'OP체크') {
    return (
      <FeatureShell onBack={() => setSubView(null)} maxWidth="max-w-7xl">
        <OperationCheckView
          user={user || {}}
          staffs={staffs}
          selectedCo={selectedCo}
          selectedCompanyId={selectedCompanyId}
        />
      </FeatureShell>
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

          {recentCards.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">최근 방문</p>
              <div className="flex flex-wrap items-center gap-2">
                {recentCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleFeatureClick(card.id, card.subView)}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)]/50"
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

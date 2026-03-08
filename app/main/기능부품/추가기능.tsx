'use client';

import { useState, useEffect } from 'react';
import ThemeToggle from '@/app/components/ThemeToggle';
import GlobalSearch from '@/app/components/GlobalSearch';
import 부서별물품장비현황 from './재고관리서브/부서별물품장비현황';
import 근무현황 from './근무현황';
import 인계노트 from './인계노트';
import 퇴원심사 from './퇴원심사';
import 마감보고 from './마감보고';
import 직원평가시스템 from './직원평가시스템';
import 근무표자동편성 from './근무표자동편성';

const EXTERNAL_LINKS = [
  { id: 'km-park', label: 'KM Park', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: '🏥' },
  { id: 'webfax', label: 'U+ 웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: '📠' },
];

const MANAGER_POSITION_KEYWORDS = ['팀장', '과장', '실장', '수간호사', '파트장', '센터장', '부장', '본부장', '이사', '원장', '병원장', '대표'];

const FEATURE_CARDS = [
  { id: '조직도', label: '조직도', icon: '🏢', desc: '조직 구성 및 연락처 보기', subView: null, isOrgChart: true },
  { id: '부서별재고', label: '부서별 재고', icon: '📦', desc: '우리 부서 물품·장비 현황', subView: '부서별재고' },
  { id: '근무현황', label: '근무현황', icon: '📅', desc: '이번 달 직원 근무표', subView: '근무현황' },
  { id: '인계노트', label: '인계노트', icon: '📝', desc: '3교대 근무자 필수 공유사항', subView: '인계노트', restricted: true },
  { id: '퇴원심사', label: '퇴원심사', icon: '🏥', desc: '퇴원 체크리스트 점검 및 AI 분석', subView: '퇴원심사' },
  { id: '마감보고', label: '마감보고', icon: '💰', desc: '원무과 일일 정산 및 시재 관리', subView: '마감보고', restricted: true },
  { id: '직원평가', label: '직원평가', icon: '✍️', desc: '부서장 전용 성과 및 문제사항 기록', subView: '직원평가', restricted: true },
  { id: '근무표자동편성', label: '근무표 자동편성', icon: '🧩', desc: '부서장 전용 2·3교대 자동 편성', subView: '근무표자동편성', managerOnly: true },
];

const MAX_RECENT = 5;
const LS_FAVORITES = 'erp_favorites';
const LS_RECENT = 'erp_recent_features';

// 컴포넌트 이름을 영문 대문자로 시작하는 형태로 지정하여
// React ESLint 규칙을 만족시킵니다. default export 이므로
// 외부에서의 import 이름(추가기능)은 그대로 사용할 수 있습니다.
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
  const isManagerOrHigher =
    user?.role === 'admin' ||
    user?.company === 'SY INC.' ||
    user?.permissions?.mso === true ||
    MANAGER_POSITION_KEYWORDS.some((keyword) => String(user?.position || '').includes(keyword));

  useEffect(() => {
    try {
      const storedFav = localStorage.getItem(LS_FAVORITES);
      if (storedFav) setFavorites(JSON.parse(storedFav));
      const storedRecent = localStorage.getItem(LS_RECENT);
      if (storedRecent) setRecentFeatures(JSON.parse(storedRecent));
    } catch {
      // localStorage 접근 불가 시 무시
    }
  }, []);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try { localStorage.setItem(LS_FAVORITES, JSON.stringify(next)); } catch { }
      return next;
    });
  };

  const handleFeatureClick = (featureId: string, targetSubView: string | null, isOrgChart?: boolean) => {
    setRecentFeatures((prev) => {
      const filtered = prev.filter((r) => r !== featureId);
      const next = [featureId, ...filtered].slice(0, MAX_RECENT);
      try { localStorage.setItem(LS_RECENT, JSON.stringify(next)); } catch { }
      return next;
    });
    if (isOrgChart && onOpenOrgChart) {
      onOpenOrgChart();
    } else if (targetSubView) {
      setSubView(targetSubView);
    }
  };

  const isRestricted = (card: typeof FEATURE_CARDS[number]) => {
    if (card.managerOnly) {
      return !isManagerOrHigher;
    }
    if (!card.restricted) return false;
    return !(
      user?.department === '병동팀' ||
      user?.team === '병동팀' ||
      user?.department?.includes('원무') ||
      user?.team?.includes('원무') ||
      user?.role === 'admin' ||
      user?.permissions?.mso ||
      user?.permissions?.handover_read ||
      // 부서장 이상 권한 체크 (직원평가용)
      isManagerOrHigher
    );
  };

  const visibleCards = FEATURE_CARDS.filter((card) => {
    if (card.isOrgChart && !onOpenOrgChart) return false;
    if (isRestricted(card)) return false;
    return true;
  });

  const favoriteCards = visibleCards.filter((c) => favorites.includes(c.id));
  const normalCards = visibleCards.filter((c) => !favorites.includes(c.id));

  const getCardStyle = (id: string) => {
    if (id === '인계노트') return 'bg-red-50 text-red-500 group-hover:bg-red-100';
    if (id === '퇴원심사') return 'bg-purple-50 text-purple-500 group-hover:bg-purple-100';
    if (id === '근무표자동편성') return 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100';
    return 'bg-[var(--toss-gray-1)] group-hover:bg-[var(--toss-blue-light)]';
  };

  const renderCard = (card: typeof FEATURE_CARDS[number]) => (
    <div
      key={card.id}
      className="relative flex items-center gap-3 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/30 transition-all group"
    >
      <button
        type="button"
        onClick={() => handleFeatureClick(card.id, card.subView ?? null, card.isOrgChart)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div className={`w-12 h-12 rounded-[12px] flex items-center justify-center text-xl transition-colors ${getCardStyle(card.id)}`}>
          {card.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--foreground)] text-sm">{card.label}</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">{card.desc}</p>
        </div>
        <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--toss-blue)] mr-1">→</span>
      </button>
      <button
        type="button"
        onClick={(e) => toggleFavorite(card.id, e)}
        className="shrink-0 text-lg leading-none hover:scale-110 transition-transform"
        title={favorites.includes(card.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      >
        {favorites.includes(card.id) ? '⭐' : '☆'}
      </button>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[var(--page-bg)]">
      <div className="max-w-5xl mx-auto w-full">
        <h2 className="text-lg font-bold text-[var(--foreground)] mb-1">추가 기능</h2>
        <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">모드 선택, 검색, 외부 서비스, 부서별 재고</p>

        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">모드</span>
            <ThemeToggle />
          </div>
          {onSearchSelect && (
            <div className="flex-1 min-w-0">
              <GlobalSearch user={user} staffs={staffs} posts={posts} onSelect={(type, id) => {
                if (type === 'handover') {
                  setSubView('인계노트');
                } else if (onSearchSelect) {
                  onSearchSelect(type, id);
                }
              }} variant="input" />
            </div>
          )}
        </div>

        {subView === '부서별재고' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-6 shadow-sm">
              <부서별물품장비현황 user={user || {}} />
            </div>
          </div>
        )}

        {subView === '근무현황' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-6 shadow-sm">
              <근무현황 user={user || {}} />
            </div>
          </div>
        )}

        {subView === '인계노트' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <인계노트 user={user || {}} />
          </div>
        )}

        {subView === '퇴원심사' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <퇴원심사 user={user || {}} />
          </div>
        )}

        {subView === '마감보고' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <마감보고 user={user || {}} />
          </div>
        )}

        {subView === '직원평가' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-6 shadow-sm">
              <직원평가시스템 user={user || {}} staffs={staffs} />
            </div>
          </div>
        )}

        {subView === '근무표자동편성' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSubView(null)}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              ← 목록으로
            </button>
            <근무표자동편성 user={user || {}} staffs={staffs} />
          </div>
        )}

        {!subView && (
          <div className="space-y-4">
            {/* 즐겨찾기 섹션 */}
            {favoriteCards.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2 px-1">즐겨찾기</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {favoriteCards.map(renderCard)}
                </div>
              </div>
            )}

            {/* 최근 방문 섹션 */}
            {recentFeatures.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2 px-1">최근 방문</p>
                <div className="flex flex-wrap gap-2">
                  {recentFeatures.map((featureId) => {
                    const card = FEATURE_CARDS.find((c) => c.id === featureId);
                    if (!card || isRestricted(card)) return null;
                    if (card.isOrgChart && !onOpenOrgChart) return null;
                    return (
                      <button
                        key={featureId}
                        type="button"
                        onClick={() => handleFeatureClick(card.id, card.subView ?? null, card.isOrgChart)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-full text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/40 transition-all"
                      >
                        <span>{card.icon}</span>
                        <span>{card.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 전체 기능 카드 목록 */}
            <div>
              {(favoriteCards.length > 0 || recentFeatures.length > 0) && (
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2 px-1">전체 기능</p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {normalCards.map(renderCard)}

                {EXTERNAL_LINKS.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm hover:bg-[var(--toss-blue-light)]/50 hover:border-[var(--toss-blue)]/30 transition-all group"
                  >
                    <div className="w-12 h-12 bg-[var(--toss-gray-1)] group-hover:bg-[var(--toss-blue-light)] rounded-[12px] flex items-center justify-center text-xl transition-colors">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[var(--foreground)] text-sm">{item.label}</h3>
                      <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5 truncate">{item.url}</p>
                    </div>
                    <span className="text-[var(--toss-gray-3)] group-hover:text-[var(--toss-blue)]">↗</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

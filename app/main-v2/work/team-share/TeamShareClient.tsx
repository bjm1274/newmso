'use client';

/**
 * TeamShareClient.tsx — 업무공유 협업센터 클라이언트 진입점
 *
 * JM:  500줄 이내, 상태 조율 단일 책임
 * JM2: 뷰 전환은 CSS transition + state, 페이지 이동 0회
 * JM4: TabId union, AnyItem 판별 유니온
 * JM6: nav aria-label="현재 위치", breadcrumb aria-current="page"
 */

import { useState, useCallback, useEffect } from 'react';
import type { TabId, AnyItem } from './dummy-data';
import { MasterList } from './MasterList';
import { DetailPanel } from './DetailPanel';
import { MobileTransition } from './MobileTransition';
import { CreateSheet } from './CreateSheet';

// ── 미디어 훅 (SSR safe) ──────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ── 빵부스러기 ────────────────────────────────────────────────────────────────

function Breadcrumb() {
  return (
    <nav
      aria-label="현재 위치"
      className="flex items-center gap-1.5 text-[13px]"
    >
      <a
        href="/main-v2"
        className="text-[var(--toss-gray-4)] hover:text-[var(--accent)] transition-colors"
      >
        MSO
      </a>
      <span className="text-[var(--toss-gray-3)] text-[12px]" aria-hidden="true">›</span>
      <a
        href="/main-v2/work"
        className="text-[var(--toss-gray-4)] hover:text-[var(--accent)] transition-colors"
      >
        업무공유
      </a>
      <span className="text-[var(--toss-gray-3)] text-[12px]" aria-hidden="true">›</span>
      <span className="font-semibold text-[var(--foreground)]" aria-current="page">
        외래팀
      </span>
    </nav>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function TeamShareClient() {
  const isMobile = useIsMobile();

  // 탭 상태
  const [activeTab, setActiveTab] = useState<TabId>('docs');
  // 선택된 아이템
  const [selectedItem, setSelectedItem] = useState<AnyItem | null>(null);
  // 모바일: 상세 뷰 표시 여부
  const [showDetail, setShowDetail] = useState(false);
  // 등록 시트 열림 여부
  const [createOpen, setCreateOpen] = useState(false);
  // 검색어
  const [query, setQuery] = useState('');

  const handleSelect = useCallback((item: AnyItem) => {
    setSelectedItem(item);
    if (isMobile) setShowDetail(true);
  }, [isMobile]);

  const handleBack = useCallback(() => {
    setShowDetail(false);
  }, []);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setSelectedItem(null);
    setQuery('');
    if (isMobile) setShowDetail(false);
  }, [isMobile]);

  const handleOpenCreate = useCallback(() => setCreateOpen(true), []);
  const handleCloseCreate = useCallback(() => setCreateOpen(false), []);

  // PC 뷰
  if (!isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* 상단바 */}
        <header className="flex items-center px-5 h-[52px] border-b border-[var(--border)] bg-[var(--card)] shrink-0 gap-3">
          <Breadcrumb />
          <div className="ml-auto flex items-center gap-2">
            <select
              aria-label="회사 필터"
              className="h-8 px-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-[12px] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
            >
              <option>전체 회사</option>
              <option>SY INC. (본사)</option>
              <option>산하 병원 A</option>
            </select>
            <select
              aria-label="팀 필터"
              className="h-8 px-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-[12px] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
            >
              <option>전체 팀</option>
              <option>간호팀</option>
              <option>행정팀</option>
              <option>원무팀</option>
            </select>
            <button
              type="button"
              onClick={handleOpenCreate}
              aria-label="새 자료 등록"
              className="flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-hover)] transition-colors"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              새 자료
            </button>
          </div>
        </header>

        {/* 마스터-디테일 split */}
        <div className="flex flex-1 overflow-hidden">
          <MasterList
            activeTab={activeTab}
            onTabChange={handleTabChange}
            selectedId={selectedItem?.id ?? null}
            onSelect={handleSelect}
            query={query}
            onQueryChange={setQuery}
          />
          <DetailPanel item={selectedItem} />
        </div>

        {/* 등록 모달 */}
        <CreateSheet open={createOpen} onClose={handleCloseCreate} isMobile={false} />
      </div>
    );
  }

  // 모바일 뷰
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--page-bg)]">
      {/* 상단 헤더 */}
      <header className="flex items-center px-4 h-[52px] border-b border-[var(--border)] bg-[var(--card)] shrink-0">
        <button
          type="button"
          onClick={handleOpenCreate}
          aria-label="새 자료 등록"
          className="ml-auto w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-5)] hover:bg-[var(--muted)] transition-colors"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      {/* 탭 바 (모바일) — 목록 화면에서만 표시 */}
      {!showDetail && (
        <div
          role="tablist"
          aria-label="업무공유 탭"
          className="flex border-b border-[var(--border)] bg-[var(--card)] px-4 shrink-0"
        >
          {([
            { id: 'docs' as TabId,     label: '자료',     badgeCls: 'bg-[var(--accent-light)] text-[var(--accent)]' },
            { id: 'handover' as TabId, label: '인수인계', badgeCls: 'bg-[var(--success-light)] text-[var(--success)]' },
            { id: 'todo' as TabId,     label: '팀할일',   badgeCls: 'bg-[var(--danger-light)] text-[var(--danger)]' },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(tab.id)}
                className={[
                  'flex items-center gap-1.5 px-3.5 py-2 border-b-2 text-[13px] font-medium transition-all',
                  isActive
                    ? 'text-[var(--accent)] border-[var(--accent)] font-bold'
                    : 'text-[var(--toss-gray-4)] border-transparent',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 전환 컨테이너 */}
      <MobileTransition
        showDetail={showDetail}
        onBack={handleBack}
        masterContent={
          <div className="p-4 flex flex-col gap-2">
            {/* 검색 */}
            <div className="relative mb-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)] pointer-events-none" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="검색…"
                aria-label="자료 검색"
                className="w-full h-9 pl-8 pr-3 border border-[var(--border)] rounded-[var(--radius-md)] text-[13px] bg-[var(--muted)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--card)] transition-colors"
              />
            </div>
            {/* 마스터 리스트 (모바일 인라인) */}
            <MobileMasterItems
              activeTab={activeTab}
              query={query}
              onSelect={handleSelect}
            />
          </div>
        }
        detailContent={
          selectedItem ? <MobileDetailContent item={selectedItem} /> : null
        }
      />

      {/* 등록 바텀시트 */}
      <CreateSheet open={createOpen} onClose={handleCloseCreate} isMobile />
    </div>
  );
}

// ── 모바일 전용 목록 (카드 형태) ──────────────────────────────────────────────

import { useMemo } from 'react';
import { DUMMY_DOCS, DUMMY_HANDOVERS, DUMMY_TODOS } from './dummy-data';
import type { DocItem, HandoverItem, TodoItem } from './dummy-data';

function MobileItemCard({ item, onClick }: { item: AnyItem; onClick: () => void }) {
  const cls = 'bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 cursor-pointer active:bg-[var(--muted)] transition-colors min-h-[44px]';

  if (item.type === 'doc') {
    return (
      <div className={cls} onClick={onClick} role="button" tabIndex={0}
        aria-label={`${item.title} 상세보기`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold bg-[var(--accent-light)] text-[var(--accent)] px-1.5 py-px rounded-[var(--radius-sm)]">{item.category}</span>
          <span className="ml-auto text-[11px] text-[var(--toss-gray-3)]">{item.date}</span>
        </div>
        <p className="text-[14px] font-semibold truncate mb-1.5 text-[var(--foreground)]">{item.title}</p>
        <div className="flex items-center gap-2 text-[11px] text-[var(--toss-gray-3)]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[8px] font-bold inline-flex items-center justify-center" aria-hidden="true">{item.authorInitial}</span>
            {item.author}
          </span>
          <span>댓글 {item.commentCount}</span>
          <span>첨부 {item.attachments.length}</span>
          <svg className="ml-auto text-[var(--toss-gray-3)]" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    );
  }

  if (item.type === 'handover') {
    const shiftCls = item.shift === '야간→주간'
      ? 'bg-[var(--success-light)] text-[var(--success)]'
      : 'bg-[var(--muted)] text-[var(--toss-gray-5)]';
    return (
      <div className={cls} onClick={onClick} role="button" tabIndex={0}
        aria-label={`${item.title} 상세보기`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-px rounded-[var(--radius-sm)] ${shiftCls}`}>{item.shift}</span>
          <span className="ml-auto text-[11px] text-[var(--toss-gray-3)]">{item.date}</span>
        </div>
        <p className="text-[14px] font-semibold truncate mb-1.5 text-[var(--foreground)]">{item.title}</p>
        <div className="flex items-center gap-2 text-[11px] text-[var(--toss-gray-3)]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[8px] font-bold inline-flex items-center justify-center" aria-hidden="true">{item.authorInitial}</span>
            {item.author}
          </span>
          <span>특이사항 {item.specialCount}건</span>
          <svg className="ml-auto text-[var(--toss-gray-3)]" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    );
  }

  const statusCls: Record<TodoItem['status'], string> = {
    '진행중': 'bg-[var(--warning-light)] text-[var(--warning)]',
    '지연':   'bg-[var(--danger-light)] text-[var(--danger)]',
    '완료':   'bg-[var(--success-light)] text-[var(--success)]',
  };

  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
      aria-label={`${item.title} 상세보기`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-px rounded-[var(--radius-sm)] ${statusCls[item.status]}`}>{item.status}</span>
        <span className="ml-auto text-[11px] text-[var(--toss-gray-3)]">{item.dueLabel}</span>
      </div>
      <p className="text-[14px] font-semibold truncate mb-1.5 text-[var(--foreground)]">{item.title}</p>
      <div className="flex items-center gap-2 text-[11px] text-[var(--toss-gray-3)]">
        <span>{item.doneCount}/{item.totalCount} 완료</span>
        <span>마감 {item.dueDate}</span>
        <svg className="ml-auto text-[var(--toss-gray-3)]" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>
  );
}

function MobileMasterItems({
  activeTab,
  query,
  onSelect,
}: {
  activeTab: TabId;
  query: string;
  onSelect: (item: AnyItem) => void;
}) {
  const allItems: AnyItem[] = useMemo(() => {
    if (activeTab === 'docs')     return DUMMY_DOCS;
    if (activeTab === 'handover') return DUMMY_HANDOVERS;
    return DUMMY_TODOS;
  }, [activeTab]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter((item) => item.title.toLowerCase().includes(q));
  }, [allItems, query]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--toss-gray-3)]">
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="opacity-30" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <p className="text-xs text-[var(--toss-gray-4)]">검색 결과가 없습니다</p>
      </div>
    );
  }

  return (
    <>
      {filtered.map((item) => (
        <MobileItemCard key={item.id} item={item} onClick={() => onSelect(item)} />
      ))}
    </>
  );
}

// ── 모바일 상세 컨텐츠 (DetailPanel 래핑) ────────────────────────────────────

function MobileDetailContent({ item }: { item: AnyItem }) {
  // DetailPanel은 section 태그 + flex-col 구조이므로 그대로 활용
  return <DetailPanel item={item} />;
}

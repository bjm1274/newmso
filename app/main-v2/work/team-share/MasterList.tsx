'use client';

/**
 * MasterList.tsx — 업무공유 좌측/전체 목록 패널
 *
 * JM:  500줄 이내, 목록 렌더 단일 책임
 * JM2: 검색은 useMemo 필터, 불필요한 리렌더 없음
 * JM4: TabId union, any 없음
 * JM6: role="tablist", role="option", aria-selected
 */

import { useMemo } from 'react';
import type { TabId, AnyItem, DocItem, HandoverItem, TodoItem } from './dummy-data';
import { DUMMY_DOCS, DUMMY_HANDOVERS, DUMMY_TODOS, TAB_COUNTS } from './dummy-data';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface MasterListProps {
  activeTab:   TabId;
  onTabChange: (tab: TabId) => void;
  selectedId:  string | null;
  onSelect:    (item: AnyItem) => void;
  query:       string;
  onQueryChange: (q: string) => void;
}

// ── 탭 메타 ───────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; badgeCls: string }[] = [
  { id: 'docs',     label: '자료',     badgeCls: 'bg-[var(--accent-light)] text-[var(--accent)]' },
  { id: 'handover', label: '인수인계', badgeCls: 'bg-[var(--success-light)] text-[var(--success)]' },
  { id: 'todo',     label: '팀할일',   badgeCls: 'bg-[var(--danger-light)] text-[var(--danger)]' },
];

// ── 상태별 스타일 헬퍼 ────────────────────────────────────────────────────────

function todoBadgeCls(status: TodoItem['status']): string {
  if (status === '지연')  return 'bg-[var(--danger-light)] text-[var(--danger)]';
  if (status === '완료')  return 'bg-[var(--success-light)] text-[var(--success)]';
  return 'bg-[var(--warning-light)] text-[var(--warning)]';
}

function handoverBadgeCls(shift: HandoverItem['shift']): string {
  return shift === '야간→주간'
    ? 'bg-[var(--success-light)] text-[var(--success)]'
    : 'bg-[var(--muted)] text-[var(--toss-gray-5)]';
}

// ── 아이템 행 ─────────────────────────────────────────────────────────────────

interface ListRowProps {
  item: AnyItem;
  isSelected: boolean;
  onClick: () => void;
}

function ListRow({ item, isSelected, onClick }: ListRowProps) {
  const base =
    'px-3 py-3 rounded-[var(--radius-md)] cursor-pointer border transition-colors mb-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';
  const cls = isSelected
    ? `${base} bg-[var(--accent-subtle)] border-[rgba(37,99,235,0.15)]`
    : `${base} border-transparent hover:bg-[var(--muted)]`;

  if (item.type === 'doc') {
    return (
      <div
        className={cls}
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold tracking-wide bg-[var(--accent-light)] text-[var(--accent)] px-1.5 py-px rounded-[var(--radius-sm)]">
            {item.category}
          </span>
          <span className="ml-auto text-[11px] text-[var(--toss-gray-3)]">{item.date}</span>
        </div>
        <p className="text-[13px] font-semibold truncate mb-1 text-[var(--foreground)]">{item.title}</p>
        <div className="flex items-center gap-2.5 text-[11px] text-[var(--toss-gray-3)]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[8px] font-bold inline-flex items-center justify-center" aria-hidden="true">
              {item.authorInitial}
            </span>
            {item.author}
          </span>
          <span>댓글 {item.commentCount}</span>
          <span>첨부 {item.attachments.length}</span>
        </div>
      </div>
    );
  }

  if (item.type === 'handover') {
    return (
      <div
        className={cls}
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold tracking-wide px-1.5 py-px rounded-[var(--radius-sm)] ${handoverBadgeCls(item.shift)}`}>
            {item.shift}
          </span>
          <span className="ml-auto text-[11px] text-[var(--toss-gray-3)]">{item.date}</span>
        </div>
        <p className="text-[13px] font-semibold truncate mb-1 text-[var(--foreground)]">{item.title}</p>
        <div className="flex items-center gap-2.5 text-[11px] text-[var(--toss-gray-3)]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[8px] font-bold inline-flex items-center justify-center" aria-hidden="true">
              {item.authorInitial}
            </span>
            {item.author}
          </span>
          <span>특이사항 {item.specialCount}건</span>
        </div>
      </div>
    );
  }

  // todo
  return (
    <div
      className={cls}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-bold tracking-wide px-1.5 py-px rounded-[var(--radius-sm)] ${todoBadgeCls(item.status)}`}>
          {item.status}
        </span>
        <span className="ml-auto text-[11px] text-[var(--toss-gray-3)]">{item.dueLabel}</span>
      </div>
      <p className="text-[13px] font-semibold truncate mb-1 text-[var(--foreground)]">{item.title}</p>
      <div className="flex items-center gap-2.5 text-[11px] text-[var(--toss-gray-3)]">
        <span>{item.doneCount}/{item.totalCount} 완료</span>
        <span>마감 {item.dueDate}</span>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function MasterList({
  activeTab,
  onTabChange,
  selectedId,
  onSelect,
  query,
  onQueryChange,
}: MasterListProps) {
  const allItems: AnyItem[] = useMemo(() => {
    if (activeTab === 'docs')     return DUMMY_DOCS;
    if (activeTab === 'handover') return DUMMY_HANDOVERS;
    return DUMMY_TODOS;
  }, [activeTab]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter((item) => item.title.toLowerCase().includes(q));
  }, [allItems, query]);

  return (
    <section
      className="flex flex-col border-r border-[var(--border)] bg-[var(--card)] overflow-hidden"
      style={{ width: '360px', flexShrink: 0 }}
      aria-label="자료 목록"
    >
      {/* 탭 바 */}
      <div className="px-4 pt-3.5 shrink-0">
        <div
          role="tablist"
          aria-label="업무공유 탭"
          className="flex gap-0.5 p-1 bg-[var(--tab-bg)] rounded-[var(--radius-md)] mb-3"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-btn-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={[
                  'flex-1 h-[30px] rounded-[var(--radius-sm)] border-none text-xs font-medium flex items-center justify-center gap-1.5 transition-all',
                  isActive
                    ? 'bg-[var(--card)] text-[var(--accent)] font-semibold shadow-[var(--shadow-xs)]'
                    : 'bg-transparent text-[var(--toss-gray-4)] hover:bg-black/[0.04]',
                ].join(' ')}
              >
                {tab.label}
                <span
                  className={`inline-flex items-center justify-center px-1.5 py-px rounded-full text-[10px] font-bold leading-[1.4] ${tab.badgeCls}`}
                  aria-label={`${TAB_COUNTS[tab.id]}건`}
                >
                  {TAB_COUNTS[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* 검색 */}
        <div className="mb-3 relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)] pointer-events-none"
            width="14" height="14" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2} aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="검색…"
            aria-label="자료 검색"
            className="w-full h-8 pl-8 pr-3 border border-[var(--border)] rounded-[var(--radius-md)] text-[13px] bg-[var(--muted)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--card)] transition-colors"
          />
        </div>
      </div>

      {/* 목록 */}
      <div
        id={`tabpanel-${activeTab}`}
        role="listbox"
        aria-labelledby={`tab-btn-${activeTab}`}
        aria-label={`${activeTab === 'docs' ? '자료' : activeTab === 'handover' ? '인수인계' : '팀할일'} 목록`}
        className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-[var(--border)]"
      >
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--toss-gray-3)]">
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="opacity-30" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-xs text-[var(--toss-gray-4)]">검색 결과가 없습니다</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <ListRow
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              onClick={() => onSelect(item)}
            />
          ))
        )}
      </div>
    </section>
  );
}

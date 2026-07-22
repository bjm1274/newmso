'use client';

/**
 * SApproval — 모바일 결재함 (받은 결재 / 진행 / 완료 3 segment)
 *   - 칩바 5뷰 (결재함/기안함/참조/작성/양식) — onNav로 라우팅 위임
 *   - segment 전환: inbox / progress / done
 *   - 상단 KPI 카드 2개 (대기 / 24h 초과) — inbox 탭에서만 노출
 *   - 카드 리스트: 긴급 좌측 띠 + 상태 칩 + 24h+ 칩 + 본문 + 기안자 + 금액
 *
 * JM(파일당 500줄), JM2(useMemo로 분류 캐싱), JM3(에러 toast), JM4(any 금지, kind/tone 유니온),
 * JM5(본인이 현재 결재자/결재선 안 사람만 노출 — classifyForStaff)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import { type ApprovalRow } from './data-hooks';
import SApprovalFilterSheet, {
  EMPTY_FILTER,
  countActiveFilters,
  resolvePeriodCutoff,
  type ApprovalFilterState } from './필터시트';
import { ApprovalCard, KpiCard, elapsedDays } from './결재함-cards';

type Seg = 'inbox' | 'progress' | 'done';

const SEG_LABEL: Record<Seg, string> = {
  inbox: '받은 결재',
  progress: '진행',
  done: '완료' };

export type SApprovalProps = {
  staffId: string | null;
  rows: ApprovalRow[];
  inbox: ApprovalRow[];
  progress: ApprovalRow[];
  done: ApprovalRow[];
  refCount: number;
  sentCount: number;
  loading: boolean;
  onOpen: (id: string) => void;
  onNavDocs: () => void;
  onNavSent: () => void;
  onNavRef: () => void;
  onNavWrite: () => void;
  onRefresh: () => void;
};

export default function SApproval({
  staffId,
  inbox,
  progress,
  done,
  refCount,
  sentCount,
  loading,
  onOpen,
  onNavDocs,
  onNavSent,
  onNavRef,
  onNavWrite,
  onRefresh }: SApprovalProps) {
  const [seg, setSeg] = useState<Seg>('inbox');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<ApprovalFilterState>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = useMemo(() => countActiveFilters(filter), [filter]);

  // 검색 debounce (150ms)
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const handle = window.setTimeout(() => setSearchQuery(searchInput), 150);
    return () => window.clearTimeout(handle);
  }, [searchInput, searchQuery]);

  // 검색 열림 시 자동 포커스
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    } else {
      setSearchInput('');
      setSearchQuery('');
    }
  }, [searchOpen]);

  const baseList: ApprovalRow[] = useMemo(() => {
    if (seg === 'inbox') return inbox;
    if (seg === 'progress') return progress;
    return done;
  }, [seg, inbox, progress, done]);

  const list: ApprovalRow[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cutoff = resolvePeriodCutoff(filter.period);
    const hasTypeFilter = filter.types.length > 0;
    const hasStatusFilter = filter.statuses.length > 0;

    return baseList.filter((row) => {
      // 검색
      if (q) {
        const meta = (row.meta_data as Record<string, unknown> | null) || {};
        const fields = [
          row.doc_number,
          row.title,
          row.sender_name,
          row.type,
          row.sender_department,
          row.content,
          meta.form_name,
          meta.form_slug,
          meta.reason,
        ];
        const matched = fields.some((f) => f != null && String(f).toLowerCase().includes(q));
        if (!matched) return false;
      }
      // type
      if (hasTypeFilter) {
        const rowType = String(row.type || '').trim();
        if (!filter.types.includes(rowType)) return false;
      }
      // status
      if (hasStatusFilter) {
        const rowStatus = String(row.status || '').trim();
        if (!filter.statuses.includes(rowStatus)) return false;
      }
      // 기간
      if (cutoff !== null && row.created_at) {
        const t = new Date(row.created_at).getTime();
        if (!Number.isNaN(t) && t < cutoff) return false;
      }
      return true;
    });
  }, [baseList, searchQuery, filter]);

  const overdueCount = useMemo(
    () => inbox.filter((row) => elapsedDays(row.created_at) >= 1).length,
    [inbox]
  );

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MobileHeader
        title="전자결재"
        sub={`내 결재 대기 ${inbox.length}건`}
        actions={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
              aria-label={searchOpen ? '검색 닫기' : '검색 열기'}
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                border: 'none',
                cursor: 'pointer' }}
            >
              <MIcon name="search" size={15} color="var(--z-600)" />
            </button>
            <button
              type="button"
              className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
              aria-label={`필터${activeFilterCount > 0 ? ` ${activeFilterCount}개 적용 중` : ''}`}
              aria-pressed={activeFilterCount > 0}
              onClick={() => setFilterOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                border: 'none',
                cursor: 'pointer',
                position: 'relative' }}
            >
              <MIcon name="filter" size={15} color="var(--z-600)" />
              {activeFilterCount > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    minWidth: 12,
                    height: 12,
                    borderRadius: 999,
                    background: 'var(--m-accent)',
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1 }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
              aria-label="새로고침"
              onClick={onRefresh}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                border: 'none',
                cursor: 'pointer' }}
            >
              <MIcon name="refresh" size={15} color="var(--z-600)" />
            </button>
            <button
              type="button"
              className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
              aria-label="결재 작성"
              onClick={onNavWrite}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                border: 'none',
                cursor: 'pointer' }}
            >
              <MIcon name="edit" size={15} color="var(--z-600)" />
            </button>
          </div>
        }
      />

      <SApprovalFilterSheet
        open={filterOpen}
        initial={filter}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => setFilter(next)}
      />

      {searchOpen && (
        <div
          className="macos-glass"
          style={{
            height: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px',
            borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}
        >
          <MIcon name="search" size={16} color="var(--z-500)" />
          <label htmlFor="m-approval-search" style={{ position: 'absolute', left: -10000 }}>
            결재 문서 검색
          </label>
          <input
            ref={searchInputRef}
            id="m-approval-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="문서번호 · 제목 · 기안자"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--z-900)',
              padding: '6px 0' }}
          />
          <button
            type="button"
            className="transition-all active:scale-90"
            aria-label="검색 닫기"
            onClick={() => setSearchOpen(false)}
            style={{ padding: 4, color: 'var(--z-500)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <MIcon name="x" size={18} />
          </button>
        </div>
      )}

      {/* 대 카테고리 가로 아크릴 칩 바 */}
      <div
        className="m-chip-bar macos-glass"
        style={{
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          padding: '8px 16px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          scrollbarWidth: 'none' }}
      >
        <button
          type="button"
          className="macos-squircle-sm transition-all active:scale-95 duration-100"
          onClick={() => setSeg('inbox')}
          aria-label="결재함"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 900,
            background: seg === 'inbox' ? '#007AFF' : 'rgba(255, 255, 255, 0.5)',
            color: seg === 'inbox' ? '#fff' : 'var(--z-700)',
            border: seg === 'inbox' ? 'none' : '1px solid rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: seg === 'inbox' ? '0 2px 8px rgba(0, 122, 255, 0.25)' : 'none' }}
        >
          결재함<span style={{ fontSize: 10, opacity: 0.8, marginLeft: 3 }}>{inbox.length}</span>
        </button>
        <button
          type="button"
          className="macos-squircle-sm transition-all active:scale-95 duration-100"
          onClick={onNavSent}
          aria-label="기안함"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 900,
            background: 'rgba(255, 255, 255, 0.5)',
            color: 'var(--z-700)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            whiteSpace: 'nowrap' }}
        >
          기안함<span style={{ fontSize: 10, opacity: 0.8, marginLeft: 3 }}>{sentCount}</span>
        </button>
        <button
          type="button"
          className="macos-squircle-sm transition-all active:scale-95 duration-100"
          onClick={onNavRef}
          aria-label="참조 문서함"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 900,
            background: 'rgba(255, 255, 255, 0.5)',
            color: 'var(--z-700)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            whiteSpace: 'nowrap' }}
        >
          참조<span style={{ fontSize: 10, opacity: 0.8, marginLeft: 3 }}>{refCount}</span>
        </button>
        <button
          type="button"
          className="macos-squircle-sm transition-all active:scale-95 duration-100"
          onClick={onNavDocs}
          aria-label="문서 조회"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 900,
            background: 'rgba(255, 255, 255, 0.5)',
            color: 'var(--z-700)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            whiteSpace: 'nowrap' }}
        >
          문서 조회
        </button>
        <button
          type="button"
          className="macos-squircle-sm transition-all active:scale-95 duration-100"
          onClick={onNavWrite}
          aria-label="작성하기"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 900,
            background: 'rgba(255, 255, 255, 0.5)',
            color: 'var(--z-700)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            whiteSpace: 'nowrap' }}
        >
          작성
        </button>
      </div>

      {/* 상태 세그먼트 전환 바 */}
      <div
        style={{
          padding: '10px 16px 6px',
          background: 'transparent',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}
      >
        <div
          role="tablist"
          className="macos-glass macos-squircle"
          style={{
            display: 'flex',
            padding: 3,
            gap: 2 }}
        >
          {(['inbox', 'progress', 'done'] as Seg[]).map((s) => {
            const on = seg === s;
            return (
              <button
                key={s}
                type="button"
                className="transition-all duration-150 active:scale-[0.98]"
                onClick={() => setSeg(s)}
                role="tab"
                aria-selected={on}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '7px 0',
                  fontSize: 12,
                  fontWeight: 900,
                  borderRadius: 16,
                  border: 'none',
                  background: on ? '#fff' : 'transparent',
                  color: on ? 'var(--z-900)' : 'var(--z-600)',
                  boxShadow: on ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                  cursor: 'pointer' }}
              >
                {SEG_LABEL[s]}{' '}
                <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 2, fontWeight: 800 }}>
                  {s === 'inbox' ? inbox.length : s === 'progress' ? progress.length : done.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {seg === 'inbox' && (
          <div style={{ padding: '12px 16px 0' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 12 }}
            >
              <KpiCard label="대기" value={inbox.length} tone="accent" icon="approval" />
              <KpiCard label="24h 초과" value={overdueCount} tone="danger" icon="clock" />
            </div>
          </div>
        )}

        <div
          style={{
            padding: '0 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10 }}
        >
          {loading && list.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
              불러오는 중…
            </div>
          )}
          {!loading && list.length === 0 && (
            <MCard className="macos-glass macos-squircle" style={{ textAlign: 'center', padding: '32px 16px' }}>
              <span style={{ display: 'inline-flex', marginBottom: 8 }}><MIcon
                name={searchQuery ? 'search' : activeFilterCount > 0 ? 'filter' : 'approval'}
                size={24}
                color="var(--z-400)"
              /></span>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-600)', lineHeight: 1.5 }}>
                {searchQuery
                  ? `'${searchQuery}' 에 대한 결과가 없습니다`
                  : activeFilterCount > 0
                    ? '필터 조건에 맞는 결재가 없습니다'
                    : seg === 'inbox'
                      ? '대기 중인 결재가 없습니다'
                      : seg === 'progress'
                        ? '진행 중인 결재가 없습니다'
                        : '완료된 결재가 없습니다'}
              </div>
            </MCard>
          )}
          {list.map((row) => (
            <ApprovalCard
              key={row.id}
              row={row}
              staffId={staffId}
              onOpen={() => onOpen(row.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * SStock — 모바일 재고관리: 재고 현황
 *
 * 핸드오프: handoff/newmso15/handoff_mobile/live-preview/mobile/m-screens-2.jsx §SStock
 *
 * 구성:
 *  - 카테고리 칩바 (전체/부족/주의/카테고리별)
 *  - 부족 1순위 알람 카드 (부족이 있을 때만)
 *  - 카드 리스트 (이름·상태칩·안전재고·현재고·progress)
 *  - 스티키 푸터 (입고/출고/발주)
 *
 * 데이터: useStatusData(company) — inventory 테이블
 *
 * JM: 단일 책임, ~280줄
 * JM2: status 데이터 메모이즈, 칩 카운트는 useMemo
 * JM4: tone union 사용, category id union
 * JM5: company 필터 client + RLS
 * JM6: chip-bar button + aria-current, 푸터 버튼 aria-label
 */

import { useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import {
  useStatusData,
  toMTone,
  type StockStatusRow,
  type MTone } from './data-hooks';

export type StockCatFilter = 'all' | 'shortage' | 'warn' | string; // 그 외는 cat 이름

export type 재고현황Props = {
  company?: string;
  onBack: () => void;
  onPlaceOrder: () => void;
  /** 입고/출고 등록 화면(입출고 뷰)으로 이동 */
  onGoInout?: () => void;
};

export default function 재고현황({ company, onBack, onPlaceOrder, onGoInout }: 재고현황Props) {
  const data = useStatusData(company);
  const { rows, loading, error, lowCount, zeroCount } = data;
  const [cat, setCat] = useState<StockCatFilter>('all');

  // 카테고리 분류 + 카운트
  const cats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const c = r.cat || '미분류';
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, cnt]) => ({ id, label: id, cnt }))
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 5);
  }, [rows]);

  // 필터된 행
  const filtered = useMemo(() => {
    if (cat === 'all') return rows;
    if (cat === 'shortage') return rows.filter((r) => r.tone === 'danger');
    if (cat === 'warn') return rows.filter((r) => r.tone === 'warn');
    return rows.filter((r) => r.cat === cat);
  }, [rows, cat]);

  // 부족 1순위 (알람 카드)
  const shortageTop = useMemo(() => {
    const list = rows.filter((r) => r.tone === 'danger' || r.tone === 'warn');
    return { count: list.length, first: list[0] ?? null };
  }, [rows]);

  const subText = `${company ?? '전체'} · ${rows.length}개 품목`;

  return (
    <div className="m-screen">
      <MobileHeader
        title="재고현황"
        sub={subText}
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="검색" disabled title="준비 중">
              <MIcon name="search" size={20} />
            </button>
            <button type="button" aria-label="QR 스캔" disabled title="준비 중">
              <MIcon name="qr" size={20} />
            </button>
          </>
        }
      />

      {/* 카테고리 칩바 */}
      <div className="m-chip-bar" role="tablist" aria-label="재고 카테고리">
        <ChipButton
          on={cat === 'all'}
          label="전체"
          count={rows.length}
          onClick={() => setCat('all')}
        />
        <ChipButton
          on={cat === 'shortage'}
          label="부족"
          count={zeroCount + lowCount}
          onClick={() => setCat('shortage')}
        />
        <ChipButton
          on={cat === 'warn'}
          label="주의"
          count={rows.filter((r) => r.tone === 'warn').length}
          onClick={() => setCat('warn')}
        />
        {cats.map((c) => (
          <ChipButton
            key={c.id}
            on={cat === c.id}
            label={c.label}
            count={c.cnt}
            onClick={() => setCat(c.id)}
          />
        ))}
      </div>

      {/* 부족 알람 카드 */}
      {shortageTop.first && (
        <div style={{ padding: '12px 16px 0' }}>
          <div
            className="m-card"
            style={{
              padding: '14px 16px',
              borderColor: 'transparent',
              background: 'var(--m-danger-soft)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--m-radius-md)',
                  background: 'var(--m-danger)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center' }}
              >
                <MIcon name="alertTri" size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--m-danger)' }}
                >
                  부족 품목 {shortageTop.count}개 · 자동 발주 권장
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--z-600)',
                    fontWeight: 600,
                    marginTop: 1 }}
                >
                  {shortageTop.first.name} — 안전재고 미달
                </div>
              </div>
              <MIcon name="chevR" size={18} color="var(--m-danger)" />
            </div>
          </div>
        </div>
      )}

      <div className="m-scroll">
        {loading && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--z-500)',
              fontSize: 13 }}
          >
            재고를 불러오는 중…
          </div>
        )}
        {!loading && error && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--m-danger)',
              fontSize: 13 }}
          >
            재고 로드 실패: {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--z-500)',
              fontSize: 13 }}
          >
            해당 분류의 품목이 없습니다.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ padding: '12px 16px 16px' }}>
            <div className="m-card flush">
              {filtered.map((r, i) => (
                <StatusRow key={`${r.name}-${i}`} row={r} last={i === filtered.length - 1} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="m-sticky-foot">
        <MBtn block icon="arrowDown" ariaLabel="입고 등록" onClick={onGoInout}>
          입고
        </MBtn>
        <MBtn block icon="arrowUp" ariaLabel="출고 등록" onClick={onGoInout}>
          출고
        </MBtn>
        <MBtn
          block
          variant="primary"
          icon="paperclip"
          ariaLabel="발주 작성"
          onClick={onPlaceOrder}
        >
          발주
        </MBtn>
      </div>
    </div>
  );
}

// ─── 칩 버튼 ──────────────────────────────────────────────────
function ChipButton({
  on,
  label,
  count,
  onClick }: {
  on: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={on ? 'on' : ''}
      onClick={onClick}
      role="tab"
      aria-selected={on}
    >
      {label}
      <span className="cnt">{count}</span>
    </button>
  );
}

// ─── 재고 한 행 ──────────────────────────────────────────────
function StatusRow({ row, last }: { row: StockStatusRow; last: boolean }) {
  const mTone: MTone = toMTone(row.tone);
  const pct = Math.min((row.stock / Math.max(row.min, 1)) * 100, 200);
  const barColor =
    row.tone === 'danger'
      ? 'var(--m-danger)'
      : row.tone === 'warn'
        ? 'var(--m-warning)'
        : 'var(--m-success)';
  return (
    <div
      style={{
        padding: '14px 16px',
        borderBottom: last ? 'none' : '1px solid var(--m-border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '-0.012em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 200 }}
            >
              {row.name}
            </span>
            <MChip tone={mTone}>{row.status}</MChip>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--z-500)',
              fontWeight: 600,
              marginTop: 2 }}
          >
            안전재고 {row.min}
            {row.unit} · {row.cat} · {row.loc}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            className="m-tnum"
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--z-900)',
              letterSpacing: '-0.02em' }}
          >
            {row.stock}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--z-500)',
              fontWeight: 700 }}
          >
            {row.unit} 현재고
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          height: 5,
          background: 'var(--z-100)',
          borderRadius: 999,
          overflow: 'hidden',
          position: 'relative' }}
      >
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: '100%',
            background: barColor,
            transition: 'width .3s' }}
        />
      </div>
    </div>
  );
}

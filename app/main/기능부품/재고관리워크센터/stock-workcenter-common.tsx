// 재고관리 워크센터 — 공통 UI 컴포넌트
//
// 이 파일은 4 워크센터(StatusWorkcenter / IOWorkcenter / ItemWorkcenter /
// AnalyzeWorkcenter)에서 공유하는 KPI, 톤 배지, 탭, 필터 칩, 백버튼,
// 우측 노트 패널을 제공한다.
//
// 인사관리 워크센터 공통 컴포넌트(`workcenter-common.tsx`)가 도입되면
// 적절히 마이그레이션 가능하도록 토큰·시그니처를 단순하게 유지한다.

'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Tone } from './stock-types';

// ─────────────────────────────────────────────────
// 톤별 색상 매핑 (CSS 변수 기반)
// ─────────────────────────────────────────────────

const TONE_BG: Record<Tone, string> = {
  success: 'var(--success-light)',
  warn: 'var(--warning-light)',
  danger: 'var(--danger-light)',
  accent: 'var(--accent-selected-subtle)',
  muted: 'var(--muted)' };

const TONE_FG: Record<Tone, string> = {
  success: 'var(--success)',
  warn: 'var(--warning)',
  danger: 'var(--danger)',
  accent: 'var(--accent)',
  muted: 'var(--muted-foreground)' };

// ─────────────────────────────────────────────────
// 톤 배지 (Chip)
// ─────────────────────────────────────────────────

export function StockChip({
  tone = 'muted',
  children }: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-[2px] text-[11px] font-bold whitespace-nowrap"
      style={{ background: TONE_BG[tone], color: TONE_FG[tone] }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────
// KPI 카드 + 4-col 행
// ─────────────────────────────────────────────────

export type KpiTone = Tone | 'plain';

export type KpiItem = {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: KpiTone;
};

export function KpiRow({ items }: { items: KpiItem[] }) {
  const cols =
    items.length >= 5
      ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5'
      : 'grid-cols-2 md:grid-cols-4';
  return (
    <div className={`grid gap-2.5 ${cols}`}>
      {items.map((it) => (
        <KpiCard key={it.label} item={it} />
      ))}
    </div>
  );
}

function KpiCard({ item }: { item: KpiItem }) {
  const tone = item.tone && item.tone !== 'plain' ? item.tone : null;
  const accentColor = tone ? TONE_FG[tone] : 'var(--foreground)';
  const accentBg = tone ? TONE_BG[tone] : 'transparent';

  return (
    <div
      className="app-card flex flex-col gap-1 px-4 py-3"
      style={{
        boxShadow: 'var(--shadow-xs)',
        borderLeft: tone ? `3px solid ${TONE_FG[tone]}` : undefined }}
    >
      <div className="text-[11px] font-bold tracking-tight text-[var(--toss-gray-3)]">
        {item.label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-2xl font-extrabold tabular-nums leading-none"
          style={{ color: accentColor }}
        >
          {item.value}
        </span>
        {item.unit && (
          <span className="text-xs font-bold text-[var(--toss-gray-4)]">{item.unit}</span>
        )}
      </div>
      {item.sub && (
        <div
          className="text-[11px] text-[var(--toss-gray-4)] line-clamp-1"
          style={tone ? { background: accentBg, padding: '2px 6px', borderRadius: 4 } : undefined}
        >
          {item.sub}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 탭 (role=tablist)
// ─────────────────────────────────────────────────

export type TabItem<T extends string> = {
  id: T;
  label: string;
  count?: number | string;
};

export function StockTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel }: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1 border-b border-[var(--border)]"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={
              'relative -mb-px inline-flex items-center gap-1.5 rounded-t-[var(--radius-md)] px-3 py-2 text-[12px] font-bold transition ' +
              (isActive
                ? 'text-[var(--accent)]'
                : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]')
            }
            style={
              isActive
                ? {
                    borderBottom: '2px solid var(--accent)',
                    background: 'var(--accent-selected-subtle)' }
                : undefined
            }
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className="rounded-[var(--radius-sm)] px-1.5 py-[1px] text-[10px] font-bold tabular-nums"
                style={{
                  background: isActive ? 'var(--accent)' : 'var(--muted)',
                  color: isActive ? '#fff' : 'var(--toss-gray-4)' }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 필터 칩 (segmented, role=tablist)
// ─────────────────────────────────────────────────

export type FilterChip<T extends string> = {
  id: T;
  label: string;
  count?: number | string;
  tone?: Tone;
};

export function FilterChips<T extends string>({
  chips,
  active,
  onChange,
  ariaLabel }: {
  chips: FilterChip<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {chips.map((c) => {
        const isActive = c.id === active;
        const toneColor = c.tone ? TONE_FG[c.tone] : 'var(--accent)';
        const toneBg = c.tone ? TONE_BG[c.tone] : 'var(--accent-selected-subtle)';
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(c.id)}
            className={
              'inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1 text-[11px] font-bold transition'
            }
            style={
              isActive
                ? {
                    background: c.tone ? toneColor : 'var(--accent)',
                    color: '#fff',
                    borderColor: c.tone ? toneColor : 'var(--accent)' }
                : {
                    background: toneBg,
                    color: toneColor,
                    borderColor: 'transparent' }
            }
          >
            {c.label}
            {c.count !== undefined && (
              <span className="tabular-nums opacity-90">{c.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 백버튼 (워크센터 → 모듈 상세에서 사용. 결정 #37)
// ─────────────────────────────────────────────────

export function WorkcenterBack({
  label = '워크센터 대시보드',
  onBack }: {
  label?: string;
  onBack: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[12px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition"
    >
      <ArrowLeft size={14} aria-hidden /> {label}
    </button>
  );
}

// ─────────────────────────────────────────────────
// 다크 배너 — 워크플로형 도구(QR 라벨 / 월마감 5단계 / EDI 신고)
// 결정 #38: dark + 명확한 CTA
// ─────────────────────────────────────────────────

export function StockDarkBanner({
  kicker,
  title,
  desc,
  children,
  style }: {
  kicker?: string;
  title: string;
  desc?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] px-4 py-3"
      style={{
        background: 'var(--zinc-900)',
        color: '#fff',
        ...style }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        {kicker && (
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/60">
            {kicker}
          </span>
        )}
        <div className="text-[14px] font-bold tracking-tight">{title}</div>
        {desc && <div className="text-[12px] text-white/70">{desc}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 우측 노트 패널 — 워크센터 우측 컨텍스트 메모
// ─────────────────────────────────────────────────

export function WorkcenterNotes({
  kicker,
  title,
  points,
  children }: {
  kicker: string;
  title: string;
  points: string[];
  children?: React.ReactNode;
}) {
  return (
    <aside className="app-card flex flex-col gap-2 p-4" aria-label="워크센터 노트">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--toss-gray-3)]">
        {kicker}
      </div>
      <div className="text-[13px] font-bold leading-snug text-[var(--foreground)]">
        {title}
      </div>
      <ul className="mt-1 space-y-1.5 text-[11.5px] leading-relaxed text-[var(--toss-gray-4)]">
        {points.map((p, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-[var(--accent)]" aria-hidden>
              •
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {children}
    </aside>
  );
}

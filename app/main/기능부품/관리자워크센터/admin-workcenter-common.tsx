'use client';

/**
 * 관리자 워크센터 — 공통 컴포넌트
 * JM: 공통 UI는 여기 모음. 각 워크센터 본체 500줄 이내 유지를 위해 분리.
 * JM6: button은 button 태그, table 헤더 scope, 토글은 role="switch"
 */

import { memo } from 'react';
import { chipClass, type AdminKpi, type ChipTone } from './admin-types';

// ─── 워크센터 헤더 ──────────────────────────────────────
export function WorkcenterHeader({
  title,
  subtitle,
  mergedCount: _mergedCount,
  mergedTitles: _mergedTitles,
  actions,
}: {
  title: string;
  subtitle?: string;
  mergedCount: number;
  mergedTitles: string[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--toss-gray-4)] mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ─── KPI 그리드 ─────────────────────────────────────────
export const KpiGrid = memo(function KpiGrid({ items, cols = 4 }: { items: AdminKpi[]; cols?: number }) {
  const colClass =
    cols === 8
      ? 'grid-cols-2 md:grid-cols-4 xl:grid-cols-8'
      : cols === 3
        ? 'grid-cols-1 md:grid-cols-3'
        : 'grid-cols-2 md:grid-cols-4';
  return (
    <div className={`grid ${colClass} gap-2 mb-4`}>
      {items.map((kpi, i) => (
        <div key={i} className="app-card px-3 py-2.5">
          <div className="text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">{kpi.label}</div>
          <div className="text-lg font-bold text-[var(--foreground)] tabular-nums">
            {kpi.value}
            {kpi.unit && <span className="text-[11px] font-semibold text-[var(--toss-gray-4)] ml-0.5">{kpi.unit}</span>}
          </div>
          {kpi.sub && <div className="text-[10px] text-[var(--toss-gray-4)] mt-0.5 truncate">{kpi.sub}</div>}
        </div>
      ))}
    </div>
  );
});

// ─── 칩 ─────────────────────────────────────────────────
export function Chip({ tone = 'muted', children }: { tone?: ChipTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-md)] text-[10.5px] font-semibold ${chipClass(tone)}`}>
      {children}
    </span>
  );
}

// ─── 카드 ───────────────────────────────────────────────
export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`app-card p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── 탭바 (작은) ────────────────────────────────────────
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar p-1.5 rounded-[var(--radius-lg)] bg-[var(--tab-bg,var(--muted))] border border-[var(--border)]"
      role="tablist"
    >
      {tabs.map((tab) => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-testid={`company-manager-tab-${tab.id}`}
            aria-selected={on}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
              on
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className={`ml-1.5 inline-block tabular-nums text-[10px] ${on ? 'text-white/80' : 'text-[var(--toss-gray-3)]'}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── 토글 (JM6: role=switch, aria-checked) ─────────────
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--toss-gray-3)]'
      }`}
    >
      <span
        className={`absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ─── 진행률 바 ──────────────────────────────────────────
export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: ChipTone }) {
  const color =
    tone === 'warn'
      ? 'bg-amber-500'
      : tone === 'danger'
        ? 'bg-rose-500'
        : tone === 'success'
          ? 'bg-emerald-500'
          : 'bg-[var(--accent)]';
  return (
    <div className="w-full h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ─── 작은 액션 버튼 ─────────────────────────────────────
export function SmBtn({
  primary,
  children,
  onClick,
  ariaLabel,
}: {
  primary?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[11px] font-bold transition-colors ${
        primary
          ? 'bg-[var(--accent)] text-white hover:opacity-90'
          : 'bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--card)]'
      }`}
    >
      {children}
    </button>
  );
}

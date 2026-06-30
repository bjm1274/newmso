'use client';

/**
 * 인사관리 워크센터 — 공통 컴포넌트·타입
 *
 * 6 워크센터 (member / attend / leave / abnormal / welfare / docs)에서 공통으로
 * 사용하는 Shell, KPI Row, Tab, BackButton, ErrorBoundary, 타입을 모은다.
 *
 * 결정 #36 워크센터 패턴 일관성: 4 KPI 행 + 메인(탭/split) + 우측 노트
 * 결정 #37 백버튼 패턴: ← 워크센터 대시보드 (sm 버튼, 좌상단)
 * 결정 #46 워크플로형 도구: 다크 배너 + accent CTA
 *
 * JM: 단일 책임 — 공통 UI 프리미티브만. 비즈니스 로직 X.
 * JM4: any 금지. union 타입 명시.
 * JM6: aria 속성 명시 (role/aria-selected/aria-label).
 */

import React from 'react';

// ─── 워크센터 ID (사이드바2 메뉴 id와 1:1 매칭) ─────────────────────
export type WorkcenterId =
  | 'member'
  | 'attend'
  | 'leave'
  | 'abnormal'
  | 'payroll'
  | 'welfare'
  | 'docs';

// ─── KPI 카드 톤 ───────────────────────────────────────────────────
export type KpiTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';

// ─── KPI 카드 정의 ────────────────────────────────────────────────
export interface WorkcenterKpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: KpiTone;
}

// ─── 워크센터 탭 정의 ─────────────────────────────────────────────
export interface WorkcenterTab<T extends string = string> {
  id: T;
  label: string;
  count?: number | string;
}

// ─── 토큰 ─────────────────────────────────────────────────────────
const KPI_TONE_BORDER: Record<KpiTone, string> = {
  neutral: 'border-[var(--border)]',
  accent: 'border-[var(--accent)]',
  success: 'border-[#10B981]',
  warn: 'border-[#F59E0B]',
  danger: 'border-[#EF4444]' };

const KPI_TONE_VALUE: Record<KpiTone, string> = {
  neutral: 'text-[var(--foreground)]',
  accent: 'text-[var(--accent)]',
  success: 'text-[#10B981]',
  warn: 'text-[#D97706]',
  danger: 'text-[#DC2626]' };

// ─── KPI Row (4-col grid, 반응형) ─────────────────────────────────
export function WorkcenterKpiRow({ items }: { items: WorkcenterKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      {items.map((kpi) => {
        const tone: KpiTone = kpi.tone || 'neutral';
        return (
          <div
            key={kpi.key}
            className={`app-card border-l-[3px] ${KPI_TONE_BORDER[tone]} px-3 py-2.5 md:px-4 md:py-3`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
              {kpi.label}
            </div>
            <div className={`mt-1 flex items-baseline gap-1 text-[20px] font-bold ${KPI_TONE_VALUE[tone]} md:text-[22px]`}>
              <span className="tnum">{kpi.value}</span>
              {kpi.unit && (
                <span className="text-[12px] font-semibold text-[var(--toss-gray-4)]">
                  {kpi.unit}
                </span>
              )}
            </div>
            {kpi.sub && (
              <div className="mt-0.5 text-[11px] font-medium text-[var(--toss-gray-4)]">
                {kpi.sub}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab Bar (a11y) ─────────────────────────────────────────────
export function WorkcenterTabBar<T extends string>({
  tabs,
  activeTab,
  onChange,
  label }: {
  tabs: WorkcenterTab<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label || '워크센터 탭'}
      className="flex gap-1 overflow-x-auto py-2 no-scrollbar"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`tab-item shrink-0 transition-colors ${
              active
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            <span>{tab.label}</span>
            {typeof tab.count !== 'undefined' && (
              <span
                className={`ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── 백버튼 (모듈 상세 → 워크센터 대시보드) ─────────────────────────
export function WorkcenterBackButton({
  onClick,
  label = '워크센터 대시보드' }: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}로 돌아가기`}
      className="pr-mod-back inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[12px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--muted)]"
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </button>
  );
}

// ─── 다크 배너 (워크플로형 도구 — AI 자동 편성·계약서 생성) ───────────
export function WorkcenterDarkBanner({
  kicker,
  title,
  description,
  actions }: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--zinc-900)] px-4 py-3.5 text-white md:px-5 md:py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="min-w-0">
          {kicker && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              {kicker}
            </div>
          )}
          <div className="mt-0.5 text-[14px] font-bold md:text-[15px]">{title}</div>
          {description && (
            <div className="mt-1 text-[12px] font-medium text-white/70">{description}</div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ─── 다크 배너 CTA 버튼 ──────────────────────────────────────────
export function WorkcenterDarkBannerCta({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  ariaLabel }: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  type?: 'button' | 'submit';
  ariaLabel?: string;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
      : 'bg-white/10 text-white hover:bg-white/15';
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-[12px] font-semibold transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

// ─── Workcenter Shell (헤더 + 본문 정렬) ────────────────────────
export function WorkcenterShell({
  children,
  headerExtra }: {
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:gap-4 md:p-4">
      {headerExtra}
      {children}
    </div>
  );
}

// ─── Embedded view wrapper (기존 한글 컴포넌트 import 시 안전 렌더) ───
//
// 기존 한글 파일(예: 근태관리메인.tsx)을 import해서 탭 본문으로 재사용한다.
// 만약 컴포넌트 내부에서 예외가 발생해도 워크센터 전체가 깨지지 않도록
// React Error Boundary로 감싼다. (JM3: 에러는 정상 흐름의 일부)

interface EmbedErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class WorkcenterEmbed extends React.Component<
  { label: string; children: React.ReactNode },
  EmbedErrorBoundaryState
> {
  constructor(props: { label: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): EmbedErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown) {
    // 사용자 메시지와 로그 분리 (JM3): 콘솔에는 상세, UI에는 짧게.
    // 운영 환경에서는 외부 로거(Sentry 등)로 보낼 위치.
    console.error(`[Workcenter:${this.props.label}] embed render failed`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="app-card mx-auto my-6 max-w-lg px-4 py-6 text-center"
        >
          <div className="text-[28px]" aria-hidden="true">⚠️</div>
          <div className="mt-2 text-[13px] font-bold text-[var(--foreground)]">
            {this.props.label} 화면을 불러오지 못했습니다.
          </div>
          <div className="mt-1 text-[11px] font-medium text-[var(--toss-gray-4)]">
            잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

// ─── 빈 상태 (탭 본문이 아직 없을 때 placeholder) ─────────────────
export function WorkcenterEmpty({
  title,
  description }: {
  title: string;
  description?: string;
}) {
  return (
    <div className="app-card flex flex-col items-center gap-2 px-4 py-12 text-center">
      <div className="text-[13px] font-bold text-[var(--foreground)]">{title}</div>
      {description && (
        <div className="text-[12px] font-medium text-[var(--toss-gray-4)]">
          {description}
        </div>
      )}
    </div>
  );
}

// ─── Workcenter Section Card ─────────────────────────────────────
//
// "탭 본문 + 우측 노트" 등 워크센터 메인 영역을 카드로 감쌀 때 사용.
// 헤더에 타이틀과 우측 액션 슬롯을 제공한다.

export function WorkcenterSection({
  title,
  rightSlot,
  children,
  padded = true }: {
  title?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={`app-card ${padded ? 'p-3 md:p-4' : ''}`}>
      {(title || rightSlot) && (
        <header className={`flex items-center justify-between gap-2 ${padded ? 'mb-2 md:mb-3' : 'border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3'}`}>
          {title && (
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">
              {title}
            </h3>
          )}
          {rightSlot && <div className="flex shrink-0 gap-1.5">{rightSlot}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

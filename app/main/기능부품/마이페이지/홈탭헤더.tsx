'use client';
import { memo, type KeyboardEvent } from 'react';
import { LucideIcon } from '../조직도서브/조직도측면창';

// 지시서 handoff/01-mypage-내정보 §3-2
// 프로필 좌·우 split 카드 + KPI 5장 단일 행. value 없는 카드는 chevron만.
// 카드 전체가 클릭 타깃. Enter/Space 키보드 활성화 (JM6 a11y).

export type HomeKpiTone = 'neutral' | 'success' | 'warn' | 'danger' | 'muted';

export interface HomeKpiCard {
  key: string;
  label: string;
  sub: string;
  icon: string;
  tone?: HomeKpiTone;
  /** 표시 값. 비어 있으면 chevron만 출력. */
  value?: { main: string; unit?: string; fraction?: string } | null;
  onClick?: () => void;
}

export interface HomeTabHeaderProps {
  name: string;
  positionAndDept: string;
  employeeNo: string;
  joinedAtLabel: string;
  tenureLabel: string;
  isRetired: boolean;
  initial: string;
  avatarUrl?: string | null;
  kpis: HomeKpiCard[];
}

const toneToIconClass: Record<HomeKpiTone, string> = {
  neutral: '',
  success: 'success',
  warn: 'warn',
  danger: 'danger',
  muted: 'muted',
};

function HomeTabHeader({
  name,
  positionAndDept,
  employeeNo,
  joinedAtLabel,
  tenureLabel,
  isRetired,
  initial,
  avatarUrl,
  kpis,
}: HomeTabHeaderProps) {
  return (
    <>
      {/* 프로필 카드 — 좌·우 split 1장 */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-xs,0_1px_2px_rgba(0,0,0,0.05))]">
        <div className="flex items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-white"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)' }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="프로필 사진" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[22px] font-black tracking-tight">{initial}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2 className="text-[20px] font-black leading-tight text-[var(--foreground)]">
                  {name}
                </h2>
                <span className="text-[12px] font-semibold text-[var(--toss-gray-4)]">
                  {positionAndDept}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={
                    isRetired
                      ? 'inline-flex items-center rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--danger)]'
                      : 'inline-flex items-center rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--success)]'
                  }
                >
                  {isRetired ? '퇴직' : '재직중'}
                </span>
                <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                  정규직
                </span>
                <span className="inline-flex items-center rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-bold text-[var(--toss-gray-4)]">
                  {tenureLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">사번</p>
            <p
              className="text-[16px] font-bold text-[var(--foreground)]"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {employeeNo}
            </p>
            <p className="mt-1.5 text-[11px] font-semibold text-[var(--toss-gray-3)]">입사일</p>
            <p
              className="text-[13px] font-bold text-[var(--foreground)]"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {joinedAtLabel}
            </p>
          </div>
        </div>
      </section>

      {/* KPI 5장 단일 행 — .kpi-simple-row utility (globals.css §1-2) */}
      <div className="kpi-simple-row">
        {kpis.map((kpi) => (
          <KpiSimpleCard key={kpi.key} kpi={kpi} />
        ))}
      </div>
    </>
  );
}

function KpiSimpleCard({ kpi }: { kpi: HomeKpiCard }) {
  const interactive = typeof kpi.onClick === 'function';
  const toneClass = toneToIconClass[kpi.tone || 'neutral'];

  const inner = (
    <>
      <span className={`kpi-ico ${toneClass}`.trim()} aria-hidden="true">
        <LucideIcon name={kpi.icon} size={16} />
      </span>
      <div className="kpi-info">
        <div className="kpi-lbl">{kpi.label}</div>
        <div className="kpi-sub">{kpi.sub}</div>
      </div>
      <div className="kpi-right">
        {kpi.value ? (
          <span className="kpi-simple-val">
            {kpi.value.main}
            {kpi.value.fraction ? <span className="kpi-frac">{kpi.value.fraction}</span> : null}
            {kpi.value.unit ? <span className="kpi-unit2">{kpi.value.unit}</span> : null}
          </span>
        ) : interactive ? (
          <LucideIcon name="ChevronRight" size={18} className="text-[var(--toss-gray-3)]" />
        ) : null}
      </div>
    </>
  );

  if (!interactive) {
    return (
      <div className="kpi-simple is-static" aria-disabled="true">
        {inner}
      </div>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      kpi.onClick?.();
    }
  };

  return (
    <div
      className="kpi-simple"
      role="button"
      tabIndex={0}
      onClick={kpi.onClick}
      onKeyDown={handleKeyDown}
      aria-label={`${kpi.label} — ${kpi.sub}`}
    >
      {inner}
    </div>
  );
}

export default memo(HomeTabHeader);

'use client';

import { type ReactNode } from 'react';
import { useIsMobile } from './useIsMobile';

export type MobileChartWrapperProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** 모바일 기본 240, 데스크탑 기본 320 */
  height?: number;
  /** 와이드 차트를 가로 스크롤 허용할 때의 최소 너비(px) */
  minWidth?: number;
  emptyMessage?: string;
  isEmpty?: boolean;
  isLoading?: boolean;
  className?: string;
  /** 우측 액션 영역(필터, 기간 등) */
  actions?: ReactNode;
  ariaLabel?: string;
};

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="차트 로딩 중"
      className="relative w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--tab-bg)]"
      style={{ height }}
    >
      <div
        className="absolute inset-0 animate-pulse"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in srgb, var(--border) 30%, transparent), transparent)',
        }}
      />
    </div>
  );
}

function ChartEmpty({
  height,
  message,
}: {
  height: number;
  message: string;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--tab-bg)]"
      style={{ height }}
    >
      <p className="text-[12px] font-semibold text-[var(--zinc-400)]">
        {message}
      </p>
    </div>
  );
}

export function MobileChartWrapper({
  title,
  subtitle,
  children,
  height,
  minWidth,
  emptyMessage = '표시할 데이터가 없습니다.',
  isEmpty = false,
  isLoading = false,
  className = '',
  actions,
  ariaLabel,
}: MobileChartWrapperProps) {
  const isMobile = useIsMobile();
  const effectiveHeight = height ?? (isMobile ? 240 : 320);

  const showHeader = Boolean(title || subtitle || actions);

  return (
    <section
      className={`app-card p-4 md:p-5 ${className}`}
      aria-label={ariaLabel ?? title}
    >
      {showHeader ? (
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-base font-bold text-[var(--foreground)] truncate">
                {title}
              </h3>
            ) : null}
            {subtitle ? (
              <p className="mt-1 text-[11px] font-semibold text-[var(--zinc-400)] truncate">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <ChartSkeleton height={effectiveHeight} />
      ) : isEmpty ? (
        <ChartEmpty height={effectiveHeight} message={emptyMessage} />
      ) : (
        <div
          className="w-full overflow-x-auto"
          style={{
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              height: effectiveHeight,
              minWidth: minWidth ? `${minWidth}px` : '100%',
              width: '100%',
            }}
          >
            {children}
          </div>
        </div>
      )}
    </section>
  );
}

export default MobileChartWrapper;

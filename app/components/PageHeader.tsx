/**
 * PageHeader — 페이지 컨텍스트 표시용 공통 컴포넌트
 *
 * T-000 정책: 사이드바·글로벌 헤더가 이미 현재 메뉴명을 표시하므로
 * 본 컴포넌트는 메뉴 라벨을 다시 받지 않는다. (title/subtitle 의도적 제거)
 *
 * 받는 정보는 추가 컨텍스트뿐:
 *   - breadcrumb: 사이드바 라벨 다음 단계의 경로 (예: ['입출고', '조정'])
 *   - count: 카운트(예: 12건)
 *   - status: 필터·상태 등 짧은 라벨 또는 칩
 *   - actions: 우측 액션 영역
 *
 * 모든 prop이 비어 있으면 자체 렌더 생략.
 */

import type { ReactNode } from 'react';

export interface PageHeaderProps {
  breadcrumb?: string[];
  count?: number;
  status?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ breadcrumb, count, status, actions }: PageHeaderProps) {
  const hasBreadcrumb = !!(breadcrumb && breadcrumb.length > 0);
  const hasCount = typeof count === 'number';
  const hasStatus = !!status;
  const hasLeft = hasBreadcrumb || hasCount || hasStatus;
  if (!hasLeft && !actions) return null;

  return (
    <div className="flex min-h-[44px] shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)] px-5 py-2">
      <div className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--toss-gray-3)]">
        {hasBreadcrumb && (
          <span className="truncate text-[13px] font-bold text-[var(--foreground)]">
            {breadcrumb!.join(' › ')}
          </span>
        )}
        {hasCount && (
          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-0.5 text-[11px] font-bold">
            {count!.toLocaleString()}건
          </span>
        )}
        {hasStatus && <span className="truncate">{status}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

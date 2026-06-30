import type { ReactNode } from 'react';

type StatePanelTone = 'default' | 'info' | 'success' | 'warning' | 'danger';

type StatePanelProps = {
  title: string;
  description?: ReactNode;
  tone?: StatePanelTone;
  compact?: boolean;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

type CommonStateProps = Partial<Pick<StatePanelProps, 'title' | 'description' | 'actions' | 'compact'>>;

const toneClassName: Record<StatePanelTone, { shell: string; badge: string }> = {
  default: {
    shell: 'border-[var(--border)] bg-[var(--card)]',
    badge: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted-foreground)]' },
  info: {
    shell: 'border-blue-200 bg-blue-50/70',
    badge: 'border-blue-200 bg-white text-blue-700' },
  success: {
    shell: 'border-emerald-200 bg-emerald-50/70',
    badge: 'border-emerald-200 bg-white text-emerald-700' },
  warning: {
    shell: 'border-amber-200 bg-amber-50/70',
    badge: 'border-amber-200 bg-white text-amber-800' },
  danger: {
    shell: 'border-red-200 bg-red-50/70',
    badge: 'border-red-200 bg-white text-red-700' } };

export function StatePanel({
  title,
  description,
  tone = 'default',
  compact = false,
  eyebrow,
  actions,
  children }: StatePanelProps) {
  const toneClass = toneClassName[tone];

  return (
    <section
      className={`rounded-[var(--radius-lg)] border ${toneClass.shell} ${compact ? 'p-3' : 'p-5'}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-black ${toneClass.badge}`}>
              {eyebrow}
            </span>
          ) : null}
          <div className="space-y-1">
            <h3 className="text-base font-black leading-tight text-[var(--foreground)]">{title}</h3>
            {description ? (
              <div className="text-sm font-medium leading-relaxed text-[var(--muted-foreground)]">{description}</div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className={compact ? 'mt-3' : 'mt-5'}>{children}</div> : null}
    </section>
  );
}

export function PermissionState({
  title = '접근 권한이 없습니다',
  description = '이 화면을 보려면 관리자에게 권한을 요청해 주세요.',
  actions,
  compact }: CommonStateProps) {
  return <StatePanel title={title} description={description} tone="warning" eyebrow="권한 제한" actions={actions} compact={compact} />;
}

export function EmptyState({
  title = '표시할 데이터가 없습니다',
  description = '조건을 변경하거나 새 항목을 추가해 주세요.',
  actions,
  compact }: CommonStateProps) {
  return <StatePanel title={title} description={description} tone="default" eyebrow="빈 상태" actions={actions} compact={compact} />;
}

export function ErrorState({
  title = '작업을 완료하지 못했습니다',
  description = '잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.',
  actions,
  compact }: CommonStateProps) {
  return <StatePanel title={title} description={description} tone="danger" eyebrow="오류" actions={actions} compact={compact} />;
}

export function LoadingPanel({ title = '불러오는 중입니다' }: { title?: string }) {
  return (
    <StatePanel title={title} tone="info" eyebrow="로딩" compact>
      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
      </div>
    </StatePanel>
  );
}

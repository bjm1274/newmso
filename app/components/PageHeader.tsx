import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="flex min-h-[68px] shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3.5">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-bold text-[var(--foreground)]">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

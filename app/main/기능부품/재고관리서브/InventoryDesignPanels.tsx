'use client';

type SummaryItem = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
};

type StepItem = {
  label: string;
  detail?: string;
  state?: 'done' | 'active' | 'pending' | 'warning';
};

const toneClass: Record<NonNullable<SummaryItem['tone']>, string> = {
  default: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
  info: 'border-sky-200 bg-sky-500/10 text-sky-700',
  success: 'border-emerald-200 bg-emerald-500/10 text-emerald-700',
  warning: 'border-orange-200 bg-orange-500/10 text-orange-700',
  danger: 'border-red-200 bg-red-500/10 text-red-700',
};

const stepClass: Record<NonNullable<StepItem['state']>, string> = {
  done: 'border-emerald-200 bg-emerald-500/10 text-emerald-700',
  active: 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]',
  pending: 'border-[var(--border)] bg-[var(--muted)] text-[var(--toss-gray-4)]',
  warning: 'border-orange-200 bg-orange-500/10 text-orange-700',
};

export function InventorySummaryStrip({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-[var(--radius-lg)] border p-3 shadow-sm ${toneClass[item.tone ?? 'default']}`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{item.label}</p>
          <p className="mt-1 text-lg font-black tabular-nums">{item.value}</p>
          {item.detail && <p className="mt-1 text-[11px] font-semibold leading-4 opacity-75">{item.detail}</p>}
        </div>
      ))}
    </div>
  );
}

export function InventoryStepSummary({ steps }: { steps: StepItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
      {steps.map((step, index) => (
        <div
          key={`${step.label}-${index}`}
          className={`rounded-[var(--radius-lg)] border p-3 ${stepClass[step.state ?? 'pending']}`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/10 text-[11px] font-black">
              {index + 1}
            </span>
            <p className="min-w-0 text-xs font-black">{step.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

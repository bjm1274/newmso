'use client';
import { toSafeText } from './format-utils';

export function InfoItem({ label, value, isMasked }: { label?: unknown; value?: unknown; isMasked?: unknown }) {
  const displayValue = toSafeText(value, '-');
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide">{label as string}</span>
      <span className={`text-[15px] font-bold leading-snug ${isMasked ? 'text-[var(--toss-gray-3)] tracking-widest' : 'text-[var(--foreground)]'}`}>
        {displayValue || '-'}
      </span>
    </div>
  );
}

export function EditableItem({ label, value, onChange, placeholder, testId }: { label?: unknown; value?: unknown; onChange?: unknown; placeholder?: unknown; testId?: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide">{label as string}</span>
      <input
        type="text"
        data-testid={testId as string}
        value={toSafeText(value)}
        onChange={(e) => (onChange as (v: string) => void)(e.target.value)}
        placeholder={placeholder as string}
        className="w-full px-3 py-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] text-[14px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
      />
    </div>
  );
}

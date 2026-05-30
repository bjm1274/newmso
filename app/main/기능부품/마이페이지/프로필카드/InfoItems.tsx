'use client';
import { toSafeText } from './format-utils';

type EditableItemProps = {
  label?: string;
  value?: unknown;
  onChange?: (value: string) => void;
  placeholder?: string;
  testId?: string;
};

export function EditableItem({ label, value, onChange, placeholder, testId }: EditableItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide">{label}</span>
      <input
        type="text"
        data-testid={testId}
        value={toSafeText(value)}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] text-[14px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
      />
    </div>
  );
}

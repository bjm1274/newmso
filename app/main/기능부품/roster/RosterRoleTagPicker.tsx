'use client';

import type { RosterRoleTagOption } from '@/lib/roster-role-tags';
import {
  DEFAULT_ROSTER_ROLE_TAG_OPTIONS,
  mergeRosterRoleTagOptions,
  normalizeCoverageRoleTags,
  serializeCoverageRoleTags,
  toggleCoverageRoleTag,
} from '@/lib/roster-role-tags';

type Props = {
  value: string[];
  onChange: (nextTags: string[]) => void;
  inputTestId?: string;
  options?: Array<RosterRoleTagOption | string>;
  placeholder?: string;
  hint?: string;
  inputClassName?: string;
  buttonSize?: 'sm' | 'md';
};

function isSelectedTag(selectedTags: string[], tag: string) {
  const normalized = String(tag || '').trim().toLowerCase();
  return selectedTags.some((entry) => String(entry || '').trim().toLowerCase() === normalized);
}

export default function RosterRoleTagPicker({
  value,
  onChange,
  inputTestId,
  options,
  placeholder = '격리, 책임, 프리셉터',
  hint,
  inputClassName = '',
  buttonSize = 'sm',
}: Props) {
  const selectedTags = normalizeCoverageRoleTags(value);
  const roleTagOptions = mergeRosterRoleTagOptions(DEFAULT_ROSTER_ROLE_TAG_OPTIONS, options, selectedTags);
  const buttonClassName =
    buttonSize === 'md'
      ? 'rounded-[var(--radius-md)] px-3 py-2 text-[11px]'
      : 'rounded-[var(--radius-md)] px-2.5 py-1.5 text-[10px]';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {roleTagOptions.map((option) => {
          const selected = isSelectedTag(selectedTags, option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(toggleCoverageRoleTag(selectedTags, option.value))}
              className={`${buttonClassName} border font-bold transition ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)]'
              }`}
              aria-pressed={selected}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <input
        value={serializeCoverageRoleTags(selectedTags)}
        onChange={(event) => onChange(normalizeCoverageRoleTags(event.target.value))}
        placeholder={placeholder}
        className={inputClassName}
        data-testid={inputTestId}
      />

      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(toggleCoverageRoleTag(selectedTags, tag))}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-semibold text-[var(--foreground)]"
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : hint ? (
        <p className="text-[10px] font-medium text-[var(--toss-gray-3)]">{hint}</p>
      ) : null}
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { normalizeComposeFormType } from '../전자결재-utils';
import { LucideIcon } from '../조직도서브/조직도측면창';

type FormPickerOption = {
  tab: string;
  normalized: string;
  label: string;
  groupKey: 'leave' | 'work' | 'misc';
};

type ApprovalFormTypePickerProps = {
  composeFormTabs: string[];
  builtinFormTypes: string[];
  customFormTypes: { name: string; slug: string }[];
  formType: string;
  selectFormType: (tab: string) => void;
  lastDraftByType: Record<string, Record<string, unknown> | null>;
};

const LEAVE_KEYWORDS = ['연차/휴가', '연차계획서', '연장근무', '출결정정', '연차촉진'];
const WORK_KEYWORDS = ['물품', '수리', '보고', '업무', '공문'];

function classifyGroup(label: string, normalized: string): 'leave' | 'work' | 'misc' {
  if (LEAVE_KEYWORDS.some((kw) => label.includes(kw) || normalized.includes(kw))) return 'leave';
  if (WORK_KEYWORDS.some((kw) => label.includes(kw) || normalized.includes(kw))) return 'work';
  return 'misc';
}

export default function ApprovalFormTypePicker({
  composeFormTabs,
  builtinFormTypes,
  customFormTypes,
  formType,
  selectFormType,
  lastDraftByType,
}: ApprovalFormTypePickerProps) {
  const allOptions: FormPickerOption[] = useMemo(() => {
    return composeFormTabs.map((tab) => {
      const normalized = normalizeComposeFormType(tab);
      const label = builtinFormTypes.includes(tab)
        ? tab
        : customFormTypes.find((customForm) => customForm.slug === tab)?.name ?? tab;
      return { tab, normalized, label, groupKey: classifyGroup(label, normalized) };
    });
  }, [composeFormTabs, builtinFormTypes, customFormTypes]);

  const groups = useMemo(() => {
    const used = new Set<string>();
    const buildGroup = (key: 'leave' | 'work' | 'misc') =>
      allOptions.filter((option) => {
        if (used.has(option.normalized)) return false;
        if (option.groupKey !== key) return false;
        used.add(option.normalized);
        return true;
      });
    return [
      { key: 'leave', title: '근태·휴가', items: buildGroup('leave') },
      { key: 'work', title: '업무·지원', items: buildGroup('work') },
      { key: 'misc', title: '양식·기타', items: buildGroup('misc') },
    ].filter((group) => group.items.length > 0);
  }, [allOptions]);

  const recentOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: FormPickerOption[] = [];
    for (const option of allOptions) {
      if (option.normalized === '증명서발급') continue;
      if (!lastDraftByType[option.normalized]) continue;
      if (seen.has(option.normalized)) continue;
      seen.add(option.normalized);
      result.push(option);
      if (result.length >= 5) break;
    }
    return result;
  }, [allOptions, lastDraftByType]);

  const currentValue = useMemo(() => {
    const found = allOptions.find((option) => option.tab === formType || option.normalized === formType);
    return found?.tab ?? '';
  }, [allOptions, formType]);

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-[11px] font-bold text-[var(--muted-foreground)]">결재 양식</span>
        <div className="relative">
          <select
            value={currentValue}
            onChange={(event) => {
              if (event.target.value) selectFormType(event.target.value);
            }}
            data-testid="approval-form-type-select"
            aria-label="결재 양식 선택"
            className="h-12 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] pl-3 pr-10 text-[14px] font-black text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
          >
            <option value="" disabled>
              양식을 선택하세요
            </option>
            {groups.map((group) => (
              <optgroup key={group.key} label={group.title}>
                {group.items.map((option) => {
                  const isCustom = customFormTypes.some((customForm) => customForm.slug === option.tab);
                  return (
                    <option key={option.tab} value={option.tab}>
                      {option.label}
                      {isCustom ? ' (커스텀)' : ''}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
            <LucideIcon name="ChevronDown" size={16} strokeWidth={2.2} />
          </span>
        </div>
      </label>

      {recentOptions.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-[var(--muted-foreground)]">최근 작성</p>
          <div className="flex flex-wrap gap-1.5">
            {recentOptions.map((option) => {
              const isActive = formType === option.tab || option.normalized === formType;
              return (
                <button
                  key={`recent-${option.tab}`}
                  type="button"
                  onClick={() => selectFormType(option.tab)}
                  data-testid={`approval-form-type-recent-${option.normalized}`}
                  className={`erp-chip min-h-[32px] cursor-pointer gap-1.5 border px-2.5 ${
                    isActive
                      ? 'border-[var(--accent)]/45 bg-[var(--accent-selected-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--accent)]/25 hover:bg-[var(--accent-selected-subtle)]'
                  }`}
                >
                  <LucideIcon name="History" size={11} strokeWidth={2.4} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

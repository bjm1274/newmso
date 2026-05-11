'use client';

import { useMemo, useState } from 'react';
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
  activeFormLabel: string;
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
  activeFormLabel,
}: ApprovalFormTypePickerProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(true);

  const resolveFormLabel = (tab: string) =>
    builtinFormTypes.includes(tab)
      ? tab
      : customFormTypes.find((customForm) => customForm.slug === tab)?.name ?? tab;

  const allOptions: FormPickerOption[] = useMemo(() => {
    return composeFormTabs.map((tab) => {
      const normalized = normalizeComposeFormType(tab);
      const label = resolveFormLabel(tab);
      return { tab, normalized, label, groupKey: classifyGroup(label, normalized) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeFormTabs, builtinFormTypes, customFormTypes]);

  const queryLower = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!queryLower) return allOptions;
    return allOptions.filter((option) =>
      option.label.toLowerCase().includes(queryLower) ||
      option.normalized.toLowerCase().includes(queryLower)
    );
  }, [allOptions, queryLower]);

  const recentOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: FormPickerOption[] = [];
    for (const option of allOptions) {
      if (option.normalized === '양식신청') continue;
      if (!lastDraftByType[option.normalized]) continue;
      if (seen.has(option.normalized)) continue;
      seen.add(option.normalized);
      result.push(option);
      if (result.length >= 5) break;
    }
    return result;
  }, [allOptions, lastDraftByType]);

  const groups = useMemo(() => {
    const used = new Set<string>();
    const buildGroup = (key: 'leave' | 'work' | 'misc') =>
      filteredOptions.filter((option) => {
        if (used.has(option.normalized)) return false;
        if (option.groupKey !== key) return false;
        used.add(option.normalized);
        return true;
      });
    return [
      { key: 'leave', title: '근태·휴가', desc: '연차·연장근무·출결', items: buildGroup('leave') },
      { key: 'work', title: '업무·지원', desc: '물품·수리·보고·공문·업무기안', items: buildGroup('work') },
      { key: 'misc', title: '양식·기타', desc: '양식 신청과 커스텀 문서', items: buildGroup('misc') },
    ].filter((group) => group.items.length > 0);
  }, [filteredOptions]);

  const handlePick = (tab: string) => {
    selectFormType(tab);
    setExpanded(false);
    setQuery('');
  };

  return (
    <section className="app-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)]"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="erp-icon-box h-9 w-9 shrink-0">
            <LucideIcon name="FileText" size={16} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">1단계 · 양식 선택</p>
            <p className="truncate text-[15px] font-black text-[var(--foreground)]">{activeFormLabel}</p>
          </div>
        </div>
        <span className="erp-chip shrink-0">
          {expanded ? '접기' : '양식 변경'}
          <LucideIcon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={11} strokeWidth={2.4} />
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="relative">
            <LucideIcon
              name="Search"
              size={14}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="양식 이름 검색"
              aria-label="양식 검색"
              className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-[13px] font-bold text-[var(--foreground)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
            />
          </div>

          {!queryLower && recentOptions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-black text-[var(--foreground)]">최근 작성</p>
              <div className="flex flex-wrap gap-1.5">
                {recentOptions.map((option) => {
                  const isActive = formType === option.tab || option.normalized === formType;
                  return (
                    <button
                      key={`recent-${option.tab}`}
                      type="button"
                      onClick={() => handlePick(option.tab)}
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

          {groups.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-6 text-center text-[12px] font-semibold text-[var(--muted-foreground)]">
              검색 결과가 없습니다.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-black text-[var(--foreground)]">{group.title}</p>
                  <p className="truncate text-[10px] font-semibold text-[var(--muted-foreground)]">{group.desc}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((option) => {
                    const isActive = formType === option.tab || option.normalized === formType;
                    const isCustom = customFormTypes.some((customForm) => customForm.slug === option.tab);
                    const hasRecentDraft = Boolean(lastDraftByType[option.normalized]);
                    return (
                      <button
                        type="button"
                        key={`group-${group.key}-${option.tab}`}
                        data-testid={`approval-form-type-${option.normalized}`}
                        onClick={() => handlePick(option.tab)}
                        aria-pressed={isActive}
                        className={`min-h-[54px] rounded-[var(--radius-lg)] border px-3 py-2 text-left transition-all ${
                          isActive
                            ? 'border-[var(--accent)]/45 bg-[var(--card)] shadow-[var(--shadow-xs)] ring-2 ring-[var(--accent)]/15'
                            : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/25 hover:bg-[var(--accent-selected-subtle)]'
                        }`}
                      >
                        <span className={`block text-[13px] font-black ${isActive ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>
                          {option.label}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-bold text-[var(--muted-foreground)]">
                          <span>{isCustom ? '커스텀' : '기본'}</span>
                          {hasRecentDraft && <span className="erp-status erp-status-blue">최근</span>}
                          {option.label === '공문발송' && <span className="erp-status erp-status-yellow">권한</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { StaffMember } from '@/types';
import type { ApprovalCcUser, ApproverTemplate } from '../전자결재-types';
import { resolveApprovalStaffLine } from '../전자결재-utils';
import { LucideIcon } from '../조직도서브/조직도측면창';

type ApprovalApproverLinePanelProps = {
  approverCandidates: StaffMember[];
  referenceCandidates: StaffMember[];
  approvalDirectoryStaffs: StaffMember[];
  approverLine: StaffMember[];
  setApproverLine: Dispatch<SetStateAction<StaffMember[]>>;
  ccLine: ApprovalCcUser[];
  setCcLine: Dispatch<SetStateAction<ApprovalCcUser[]>>;
  hasApproverSelection: boolean;
  approverTemplates: ApproverTemplate[];
  setApproverTemplates: Dispatch<SetStateAction<ApproverTemplate[]>>;
  persistApproverTemplates: (nextTemplates: ApproverTemplate[]) => void;
  showApproverTemplateMenu: boolean;
  setShowApproverTemplateMenu: Dispatch<SetStateAction<boolean>>;
  setTemplateNameInput: Dispatch<SetStateAction<string>>;
  setShowTemplateModal: Dispatch<SetStateAction<boolean>>;
};

type SearchableComboProps = {
  candidates: StaffMember[];
  excludeIds: Set<string>;
  onPick: (staff: StaffMember) => void;
  placeholder: string;
  testid: string;
};

function SearchableCombo({ candidates, excludeIds, onPick, placeholder, testid }: SearchableComboProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const baseList = candidates.filter((staff) => !excludeIds.has(String(staff.id)));
    const lower = query.trim().toLowerCase();
    if (!lower) return baseList.slice(0, 60);
    return baseList
      .filter((staff) => {
        const haystack = `${staff.name} ${staff.position || ''} ${staff.company || ''} ${staff.department || ''}`.toLowerCase();
        return haystack.includes(lower);
      })
      .slice(0, 60);
  }, [candidates, excludeIds, query]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          data-testid={testid}
          placeholder={placeholder}
          className="h-9 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] pl-2.5 pr-8 text-[12px] font-bold text-[var(--foreground)] outline-none transition-all placeholder:text-[var(--muted-foreground)]/70 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
        />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? '목록 닫기' : '목록 열기'}
          className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)]"
        >
          <LucideIcon name={open ? 'ChevronUp' : 'ChevronDown'} size={12} strokeWidth={2.4} />
        </button>
      </div>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-dropdown)]"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] font-semibold text-[var(--muted-foreground)]">
              일치하는 사용자가 없습니다.
            </div>
          ) : (
            filtered.map((staff) => (
              <button
                type="button"
                key={staff.id}
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(staff);
                  setQuery('');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--accent-selected-subtle)]"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--foreground)]">
                  {staff.name}{' '}
                  <span className="font-semibold text-[var(--muted-foreground)]">{staff.position || ''}</span>
                </span>
                {staff.company && (
                  <span className="shrink-0 text-[10px] font-semibold text-[var(--muted-foreground)]">{staff.company}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ApprovalApproverLinePanel({
  approverCandidates,
  referenceCandidates,
  approvalDirectoryStaffs,
  approverLine,
  setApproverLine,
  ccLine,
  setCcLine,
  hasApproverSelection,
  approverTemplates,
  setApproverTemplates,
  persistApproverTemplates,
  showApproverTemplateMenu,
  setShowApproverTemplateMenu,
  setTemplateNameInput,
  setShowTemplateModal,
}: ApprovalApproverLinePanelProps) {
  const approverExcludeIds = useMemo(
    () => new Set(approverLine.map((approver) => String(approver.id))),
    [approverLine],
  );
  const ccExcludeIds = useMemo(() => new Set(ccLine.map((cc) => String(cc.id))), [ccLine]);

  const moveApprover = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= approverLine.length) return;
    const next = [...approverLine];
    [next[index], next[target]] = [next[target], next[index]];
    setApproverLine(next);
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-[var(--muted-foreground)]">결재자 검색</span>
          <SearchableCombo
            candidates={approverCandidates}
            excludeIds={approverExcludeIds}
            onPick={(staff) => setApproverLine([...approverLine, staff])}
            placeholder="이름·직책·부서"
            testid="approval-approver-search"
          />
          {/* 접근성: 기존 select API도 hidden으로 유지 (E2E 호환) */}
          <select
            data-testid="approval-approver-select"
            value=""
            onChange={(event) => {
              const staff = approverCandidates.find((candidate) => candidate.id === event.target.value);
              if (staff && !approverLine.find((approver) => approver.id === staff.id)) {
                setApproverLine([...approverLine, staff]);
              }
              event.target.value = '';
            }}
            aria-label="결재자 선택 (보조)"
            className="sr-only"
            tabIndex={-1}
          >
            <option value="">결재자 추가...</option>
            {approverCandidates.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name} {staff.position || ''} {staff.company ? `(${staff.company})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-bold text-[var(--muted-foreground)]">참조자 검색 (전 회사·부서)</span>
          <SearchableCombo
            candidates={referenceCandidates}
            excludeIds={ccExcludeIds}
            onPick={(staff) =>
              setCcLine((prev) => [...prev, { id: staff.id, name: staff.name, position: staff.position }])
            }
            placeholder="이름·직책·부서·회사"
            testid="approval-cc-search"
          />
          <select
            data-testid="approval-cc-select"
            value=""
            onChange={(event) => {
              const staff = referenceCandidates.find((candidate) => String(candidate.id) === event.target.value);
              if (staff && !ccLine.find((ccUser) => ccUser.id === staff.id)) {
                setCcLine((prev) => [...prev, { id: staff.id, name: staff.name, position: staff.position }]);
              }
              event.target.value = '';
            }}
            aria-label="참조자 선택 (보조)"
            className="sr-only"
            tabIndex={-1}
          >
            <option value="">참조자 추가...</option>
            {referenceCandidates
              .filter((staff) => !ccLine.find((ccUser) => ccUser.id === staff.id))
              .map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name} ({staff.position || '-'}) {staff.company ? `· ${staff.company}` : ''}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-[var(--muted-foreground)]">결재선 ({approverLine.length}명)</p>
          {!hasApproverSelection && (
            <span className="text-[10px] font-bold text-[var(--danger)]" data-testid="approval-approver-required">
              결재권자 필요
            </span>
          )}
        </div>
        {approverLine.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-center text-[11px] font-semibold text-[var(--muted-foreground)]">
            결재자가 없습니다.
          </div>
        ) : (
          <ol className="space-y-1">
            {approverLine.map((approver, index) => (
              <li
                key={`${approver.id}-${index}`}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-selected-subtle)] text-[10px] font-black text-[var(--accent)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-[var(--foreground)]">
                    {approver.name} <span className="font-semibold text-[var(--muted-foreground)]">{approver.position || ''}</span>
                  </p>
                </div>
                <div className="flex items-center gap-0">
                  <button
                    type="button"
                    onClick={() => moveApprover(index, -1)}
                    disabled={index === 0}
                    aria-label="결재 순서 위로"
                    className="icon-btn h-6 w-6 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] disabled:opacity-30"
                  >
                    <LucideIcon name="ChevronUp" size={12} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveApprover(index, 1)}
                    disabled={index === approverLine.length - 1}
                    aria-label="결재 순서 아래로"
                    className="icon-btn h-6 w-6 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] disabled:opacity-30"
                  >
                    <LucideIcon name="ChevronDown" size={12} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    data-testid={`approval-selected-approver-remove-${index}`}
                    onClick={() => setApproverLine(approverLine.filter((_, itemIndex) => itemIndex !== index))}
                    aria-label="결재자 삭제"
                    className="icon-btn h-6 w-6 text-[var(--muted-foreground)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
                  >
                    <LucideIcon name="X" size={12} strokeWidth={2.4} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-[var(--muted-foreground)]">참조자 ({ccLine.length}명)</p>
        {ccLine.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {ccLine.map((ccUser, index) => (
              <div
                key={`${ccUser.id}-${index}`}
                className="inline-flex h-6 items-center gap-0.5 rounded-full border border-[var(--accent)]/15 bg-[var(--accent-selected-subtle)] px-2 text-[11px] font-bold text-[var(--accent)]"
              >
                {ccUser.name}
                <button
                  type="button"
                  data-testid={`approval-selected-cc-remove-${index}`}
                  onClick={() => setCcLine((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label="참조자 삭제"
                  className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
                >
                  <LucideIcon name="X" size={10} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">참조자 없음</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2">
        <span className="text-[11px] font-bold text-[var(--muted-foreground)]">
          결재선 템플릿 <span className="text-[var(--toss-gray-3)]">({approverTemplates.length})</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setTemplateNameInput('');
              setShowTemplateModal(true);
            }}
            data-testid="approval-template-save-open"
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
          >
            <LucideIcon name="Save" size={12} strokeWidth={2.2} />
            저장
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowApproverTemplateMenu((prev) => !prev)}
              data-testid="approval-template-load-toggle"
              disabled={approverTemplates.length === 0}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-2 text-[11px] font-bold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <LucideIcon name="FolderOpen" size={12} strokeWidth={2.2} />
              불러오기
            </button>
            {showApproverTemplateMenu && approverTemplates.length > 0 && (
              <div
                data-testid="approval-template-load-menu"
                className="absolute right-0 top-full z-50 mt-1 w-[min(280px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-dropdown)]"
              >
                {approverTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-subtle)]"
                  >
                    <button
                      type="button"
                      data-testid={`approval-template-load-${template.id}`}
                      onClick={() => {
                        setApproverLine(resolveApprovalStaffLine(template.line, approvalDirectoryStaffs));
                        if (Array.isArray(template.ccLine)) setCcLine(template.ccLine);
                        setShowApproverTemplateMenu(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[12px] font-bold text-[var(--foreground)]">{template.name}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-[var(--muted-foreground)]">
                        결재 {template.line.length}명
                        {Array.isArray(template.ccLine) && template.ccLine.length > 0
                          ? ` · 참조 ${template.ccLine.length}명`
                          : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      data-testid={`approval-template-delete-${template.id}`}
                      onClick={() => {
                        const next = approverTemplates.filter((item) => item.id !== template.id);
                        setApproverTemplates(next);
                        persistApproverTemplates(next);
                        if (next.length === 0) setShowApproverTemplateMenu(false);
                      }}
                      aria-label="템플릿 삭제"
                      className="icon-btn h-7 w-7 text-[var(--muted-foreground)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]"
                    >
                      <LucideIcon name="X" size={13} strokeWidth={2.4} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

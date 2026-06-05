'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { StaffMember } from '@/types';
import type { ApprovalCcUser, ApproverTemplate } from '../전자결재-types';
import { resolveApprovalStaffLine } from '../전자결재-utils';
import { LucideIcon } from '../조직도서브/조직도측면창';
import ApprovalLineTimeline from './ApprovalLineTimeline';

type ApprovalFlowCardProps = {
  user: StaffMember | null;
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
  persistApproverTemplates: (next: ApproverTemplate[]) => void;
  showApproverTemplateMenu: boolean;
  setShowApproverTemplateMenu: Dispatch<SetStateAction<boolean>>;
  setTemplateNameInput: Dispatch<SetStateAction<string>>;
  setShowTemplateModal: Dispatch<SetStateAction<boolean>>;
};

type StaffPickerProps = {
  open: boolean;
  onClose: () => void;
  candidates: StaffMember[];
  excludeIds: Set<string>;
  onPick: (staff: StaffMember) => void;
  placeholder: string;
  testid: string;
  align?: 'left' | 'right';
};

function StaffPicker({
  open,
  onClose,
  candidates,
  excludeIds,
  onPick,
  placeholder,
  testid,
  align = 'left',
}: StaffPickerProps) {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const focusId = window.setTimeout(() => inputRef.current?.focus(), 0);
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // 트리거 클릭(이번 tick의 mousedown)을 outside로 잡지 않도록 다음 tick에 등록
    const attachId = window.setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusId);
      window.clearTimeout(attachId);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const base = candidates.filter((staff) => !excludeIds.has(String(staff.id)));
    const lower = query.trim().toLowerCase();
    if (!lower) return base.slice(0, 60);
    return base
      .filter((staff) => {
        const haystack = `${staff.name} ${staff.position || ''} ${staff.company || ''} ${staff.department || ''}`.toLowerCase();
        return haystack.includes(lower);
      })
      .slice(0, 60);
  }, [candidates, excludeIds, query]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className={`absolute top-full z-40 mt-2 w-[min(320px,calc(100vw-32px))] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-dropdown)] ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      <div className="p-2">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid={testid}
          placeholder={placeholder}
          className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
        />
      </div>
      <div role="listbox" className="max-h-64 overflow-y-auto border-t border-[var(--border-subtle)]">
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
                onClose();
              }}
              className="flex w-full items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--accent-selected-subtle)]"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--foreground)]">
                {staff.name}{' '}
                <span className="font-semibold text-[var(--muted-foreground)]">{staff.position || ''}</span>
              </span>
              {staff.company && (
                <span className="shrink-0 text-[10px] font-semibold text-[var(--muted-foreground)]">
                  {staff.company}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function ApprovalFlowCard({
  user,
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
}: ApprovalFlowCardProps) {
  const [approverPickerOpen, setApproverPickerOpen] = useState(false);
  const [ccPickerOpen, setCcPickerOpen] = useState(false);

  const approverExcludeIds = useMemo(
    () => new Set(approverLine.map((staff) => String(staff.id))),
    [approverLine],
  );
  const ccExcludeIds = useMemo(() => new Set(ccLine.map((cc) => String(cc.id))), [ccLine]);

  const composePreviewItem = useMemo<Record<string, unknown>>(
    () => ({
      sender_id: user?.id || '',
      sender_name: user?.name || '기안자(나)',
      status: '대기',
      created_at: new Date().toISOString(),
      meta_data: { approver_line: approverLine.map((approver) => String(approver.id)) },
    }),
    [user, approverLine],
  );

  const handleRemoveApprover = useCallback(
    (_staffId: string, index: number) => {
      setApproverLine((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    },
    [setApproverLine],
  );

  const handlePickApprover = useCallback(
    (staff: StaffMember) => {
      setApproverLine((prev) => {
        if (prev.some((approver) => String(approver.id) === String(staff.id))) return prev;
        return [...prev, staff];
      });
    },
    [setApproverLine],
  );

  const handlePickCc = useCallback(
    (staff: StaffMember) => {
      setCcLine((prev) => {
        if (prev.some((cc) => String(cc.id) === String(staff.id))) return prev;
        return [...prev, { id: staff.id, name: staff.name, position: staff.position }];
      });
    },
    [setCcLine],
  );

  return (
    <section className="app-card card px-3 py-2.5">
      <div className="card-row">
        <div className="flex items-center gap-2">
          <div className="ctitle">결재 흐름</div>
          {!hasApproverSelection && (
            <span
              data-testid="approval-approver-required"
              className="rounded-[var(--radius-sm,4px)] bg-[var(--danger-light)] px-1.5 py-0.5 text-[10px] font-black text-[var(--danger)]"
            >
              결재권자 필요
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="approval-template-save-open"
            onClick={() => {
              setTemplateNameInput('');
              setShowTemplateModal(true);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
          >
            <LucideIcon name="Save" size={12} strokeWidth={2.2} />
            템플릿 저장
          </button>
          <div className="relative">
            <button
              type="button"
              data-testid="approval-template-load-toggle"
              onClick={() => setShowApproverTemplateMenu((prev) => !prev)}
              disabled={approverTemplates.length === 0}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <LucideIcon name="FolderOpen" size={12} strokeWidth={2.2} />
              불러오기
              <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                ({approverTemplates.length})
              </span>
            </button>
            {showApproverTemplateMenu && approverTemplates.length > 0 && (
              <div
                data-testid="approval-template-load-menu"
                className="absolute right-0 top-full z-40 mt-1 w-[min(280px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-dropdown)]"
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
                      <span className="block truncate text-[12px] font-bold text-[var(--foreground)]">
                        {template.name}
                      </span>
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

      <div className="relative">
        <ApprovalLineTimeline
          item={composePreviewItem}
          staffs={approvalDirectoryStaffs}
          resolveApprovalLineIds={() => approverLine.map((approver) => String(approver.id))}
          resolveCurrentApproverId={() =>
            approverLine[0]?.id ? String(approverLine[0].id) : null
          }
          composeMode
          onRemoveApprover={handleRemoveApprover}
          onAddApprover={() => setApproverPickerOpen((prev) => !prev)}
        />
        <StaffPicker
          open={approverPickerOpen}
          onClose={() => setApproverPickerOpen(false)}
          candidates={approverCandidates}
          excludeIds={approverExcludeIds}
          onPick={handlePickApprover}
          placeholder="이름·직책·부서로 결재자 검색"
          testid="approval-approver-search"
          align="right"
        />
        <select
          data-testid="approval-approver-select"
          value=""
          onChange={(event) => {
            const staff = approverCandidates.find((candidate) => candidate.id === event.target.value);
            if (staff) handlePickApprover(staff);
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

      <div className="ap-refs">
        <span className="lbl">참조자 ({ccLine.length}명)</span>
        {ccLine.map((cc, index) => (
          <span key={`${cc.id}-${index}`} className="ap-ref-chip">
            CC {cc.name}
            <button
              type="button"
              data-testid={`approval-selected-cc-remove-${index}`}
              onClick={() => setCcLine((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
              aria-label="참조자 삭제"
            >
              ×
            </button>
          </span>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => setCcPickerOpen((prev) => !prev)}
            data-testid="approval-cc-add"
            className="ap-ref-add"
          >
            <LucideIcon name="Plus" size={11} strokeWidth={2.4} />
            <span className="ml-0.5">참조자 추가</span>
          </button>
          <StaffPicker
            open={ccPickerOpen}
            onClose={() => setCcPickerOpen(false)}
            candidates={referenceCandidates}
            excludeIds={ccExcludeIds}
            onPick={handlePickCc}
            placeholder="이름·직책·부서·회사"
            testid="approval-cc-search"
            align="left"
          />
        </div>
        {ccLine.length === 0 && (
          <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            (참조자 없음)
          </span>
        )}
        <select
          data-testid="approval-cc-select"
          value=""
          onChange={(event) => {
            const staff = referenceCandidates.find(
              (candidate) => String(candidate.id) === event.target.value,
            );
            if (staff) handlePickCc(staff);
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
    </section>
  );
}

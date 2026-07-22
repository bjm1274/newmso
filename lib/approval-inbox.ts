/**
 * 결재함 분류 순수 로직 SSOT.
 * PC/모바일 UI 어댑터는 옵션으로 기존 동작을 유지한다.
 */

import { normalizeApprovalLineIds, resolveApprovalLineIds } from '@/lib/approval-shared';

export type ApprovalInboxBucket = 'inbox' | 'progress' | 'done' | 'sent' | 'ref';

export type ApprovalInboxItem = {
  id?: string;
  status?: string | null;
  sender_id?: string | null;
  current_approver_id?: string | null;
  approver_line?: unknown;
  meta_data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

const TERMINAL_STATUSES = new Set(['승인', '반려', '완료']);
const RECALLED_STATUSES = new Set(['회수']);

export function isRecalledStatus(status: unknown): boolean {
  return RECALLED_STATUSES.has(String(status ?? '').trim());
}

export function isTerminalStatus(status: unknown): boolean {
  return TERMINAL_STATUSES.has(String(status ?? '').trim());
}

export function isPendingStatus(status: unknown): boolean {
  return String(status ?? '').trim() === '대기';
}

/** meta.cc_line | cc_users | references 에서 user id 목록 */
export function resolveApprovalCcUserIds(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const m = meta as Record<string, unknown>;
  const sources = [m.cc_line, m.cc_users, m.references];
  const ids: string[] = [];
  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const entry of src) {
      if (entry == null) continue;
      if (typeof entry === 'string' || typeof entry === 'number') {
        const id = String(entry).trim();
        if (id) ids.push(id);
        continue;
      }
      if (typeof entry === 'object' && entry !== null) {
        const obj = entry as Record<string, unknown>;
        const id = String(obj.id ?? obj.user_id ?? obj.staff_id ?? '').trim();
        if (id) ids.push(id);
      }
    }
  }
  return Array.from(new Set(ids));
}

export function defaultResolveStoredCurrentApproverId(row: ApprovalInboxItem): string | null {
  if (row.current_approver_id != null && String(row.current_approver_id).trim()) {
    return String(row.current_approver_id).trim();
  }
  const line = resolveApprovalLineIds(row);
  return line[0] ?? null;
}

export type ClassifyApprovalsOptions = {
  /**
   * true(모바일 기본): 내 문서이면서 결재선에 있어도 결재자 함에서 제외(기안함 중심).
   * false(PC 결재함): 결재선/현재 결재자면 기안 문서도 결재함 포함.
   */
  excludeOwnFromApproverBuckets?: boolean;
  /** 현재 결재자 해석 — 미지정 시 stored current || line[0] */
  resolveCurrentApproverId?: (row: ApprovalInboxItem) => string | null;
};

/**
 * 모바일 classifyForStaff 계약 + PC 옵션을 한 함수로 제공.
 */
export function classifyApprovalsForStaff(
  rows: ApprovalInboxItem[],
  staffId: string,
  options: ClassifyApprovalsOptions = {},
): Record<ApprovalInboxBucket, ApprovalInboxItem[]> {
  const me = String(staffId ?? '').trim();
  const excludeOwn = options.excludeOwnFromApproverBuckets !== false;
  const resolveCurrent =
    options.resolveCurrentApproverId ?? defaultResolveStoredCurrentApproverId;

  const result: Record<ApprovalInboxBucket, ApprovalInboxItem[]> = {
    inbox: [],
    progress: [],
    done: [],
    sent: [],
    ref: [],
  };

  if (!me) return result;

  for (const row of rows) {
    const status = String(row.status ?? '').trim();
    const senderId = String(row.sender_id ?? '').trim();
    const mine = senderId === me;
    const lineIds = resolveApprovalLineIds(row);
    const onLine = lineIds.includes(me);
    const currentId = resolveCurrent(row);
    const isCurrent = currentId != null && String(currentId) === me;
    const recalled = isRecalledStatus(status);
    const terminal = isTerminalStatus(status);
    const pending = isPendingStatus(status);
    const ccIds = resolveApprovalCcUserIds(row.meta_data);

    if (mine) {
      result.sent.push(row);
      if (recalled) continue;
      if (pending) result.progress.push(row);
      if (terminal) result.done.push(row);
      if (!excludeOwn && (onLine || isCurrent) && !recalled) {
        if (pending && isCurrent) result.inbox.push(row);
        else if (pending && onLine) result.progress.push(row);
        else if (terminal && onLine) result.done.push(row);
      }
      if (ccIds.includes(me) && !recalled) result.ref.push(row);
      continue;
    }

    if (recalled) continue;

    if (pending && isCurrent) {
      result.inbox.push(row);
    } else if (pending && onLine && !isCurrent) {
      result.progress.push(row);
    } else if (terminal && onLine) {
      result.done.push(row);
    }

    if (ccIds.includes(me)) {
      result.ref.push(row);
    }
  }

  return result;
}

/** PC 기안함: sender === me */
export function isDraftForStaff(row: ApprovalInboxItem, staffId: string): boolean {
  return String(row.sender_id ?? '').trim() === String(staffId ?? '').trim();
}

/** PC 결재함 범위: 회수 제외 + (결재선 포함 또는 현재 결재자) */
export function isInApproverScope(
  row: ApprovalInboxItem,
  staffId: string,
  resolveCurrentApproverId: (row: ApprovalInboxItem) => string | null = defaultResolveStoredCurrentApproverId,
): boolean {
  if (isRecalledStatus(row.status)) return false;
  const me = String(staffId ?? '').trim();
  if (!me) return false;
  const lineIds = resolveApprovalLineIds(row);
  if (lineIds.includes(me)) return true;
  const current = resolveCurrentApproverId(row);
  return current != null && String(current) === me;
}

export function resolveApprovalCcDepartments(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const m = meta as Record<string, unknown>;
  const depts = m.cc_departments;
  if (!Array.isArray(depts)) return [];
  return depts.map((d) => String(d || '').trim()).filter(Boolean);
}

/** PC 참조함 */
export function isReferenceForStaff(
  row: ApprovalInboxItem,
  staffId: string,
  ccUserIds?: string[],
  staffDepartment?: string | null,
): boolean {
  if (isRecalledStatus(row.status)) return false;
  const me = String(staffId ?? '').trim();
  const ids = ccUserIds ?? resolveApprovalCcUserIds(row.meta_data);
  if (me && ids.includes(me)) return true;

  if (staffDepartment) {
    const targetDept = String(staffDepartment).trim();
    const depts = resolveApprovalCcDepartments(row.meta_data);
    if (targetDept && depts.includes(targetDept)) return true;
  }

  return false;
}

export function canApproveAsCurrent(
  row: ApprovalInboxItem,
  staffId: string,
  resolveCurrentApproverId: (row: ApprovalInboxItem) => string | null = defaultResolveStoredCurrentApproverId,
): boolean {
  if (!isPendingStatus(row.status)) return false;
  const current = resolveCurrentApproverId(row);
  return current != null && String(current) === String(staffId ?? '').trim();
}

// re-export line helpers for convenience
export { normalizeApprovalLineIds, resolveApprovalLineIds };

'use client';

import { isMissingColumnError } from '@/lib/db-compat';
import type { InventoryItem } from '@/types';
import { parseDbTimestamp } from '@/lib/date-formatter';
import { formatKoreanDateKey } from '@/lib/seoul-time';

const WARD_MESSAGE_FAVORITES_STORAGE_PREFIX = 'erp_op_check_ward_message_favorites';
const WARD_MESSAGE_RECENTS_STORAGE_PREFIX = 'erp_op_check_ward_message_recents';

export type QueryResult<T> = {
  data: T | null;
  error: unknown;
};

export function buildSelectColumns(
  requiredColumns: readonly string[],
  optionalColumns: readonly string[] = [],
  omittedColumns?: ReadonlySet<string>,
) {
  return [...requiredColumns, ...optionalColumns.filter((column) => !omittedColumns?.has(column))].join(', ');
}

export function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeLookupValue(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function buildWardSearchVariants(value: unknown) {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return [] as string[];

  return Array.from(new Set([normalized, normalized.replace(/\d+/g, '')].filter(Boolean)));
}

export function filterWardStaffsByCompany<T extends { company?: string | null; company_id?: string | null }>(
  data: T[] | null | undefined,
  companyId: unknown,
  companyName: unknown,
): T[] {
  const normalizedCompanyId = String(companyId || '').trim();
  const normalizedCompanyName = normalizeLookupValue(companyName);

  return (data || []).filter((staff) => {
    const staffCompanyId = String(staff.company_id || '').trim();
    const staffCompanyName = normalizeLookupValue(staff.company);

    if (normalizedCompanyId) {
      if (staffCompanyId) return staffCompanyId === normalizedCompanyId;
      return Boolean(normalizedCompanyName) && staffCompanyName === normalizedCompanyName;
    }

    if (normalizedCompanyName) {
      return staffCompanyName === normalizedCompanyName;
    }

    return true;
  });
}

export function resolveWardStaffCandidates<T extends { company?: string | null; company_id?: string | null }>(
  data: T[] | null | undefined,
  companyId: unknown,
  companyName: unknown,
) {
  const rows = data || [];
  const filtered = filterWardStaffsByCompany(rows, companyId, companyName);
  if (filtered.length === 0) return rows;
  return [...filtered, ...rows.filter((row) => !filtered.includes(row))];
}

export function normalizeDateValue(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];
  // 타임스탬프의 '날짜' 는 어느 시간대로 보느냐에 따라 달라진다 — KST 로 고정한다.
  const parsed = parseDbTimestamp(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return formatKoreanDateKey(parsed);
}

export function normalizeTimeValue(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const matched = raw.match(/^(\d{2}:\d{2})/);
  return matched ? matched[1] : raw;
}

export function stripHiddenMetaBlocks(value: unknown) {
  return String(value || '')
    .replace(/\[\[SCHEDULE_META\]\][\s\S]*?\[\[\/SCHEDULE_META\]\]/g, '')
    .replace(/\[\[BOARD_META\]\][\s\S]*?\[\[\/BOARD_META\]\]/g, '')
    .replace(/\[\[WARD_MESSAGE_META\]\][\s\S]*?\[\[\/WARD_MESSAGE_META\]\]/g, '')
    .replace(/\[\[(?:SCHEDULE_META|BOARD_META|WARD_MESSAGE_META)\]\][\s\S]*$/g, '')
    // `{2,}` → `{2 }` 일괄 치환 사고(8차 D04-002)로 이 압축은 무동작이었다.
    // 다만 원형 `\s{2,}` 를 그대로 복원하면 개행까지 공백 하나로 뭉개진다 —
    // 소비처 중 buildWardMessageContent(patient-check-helpers.ts:57) 가 사용자가
    // 여러 줄로 입력한 병동 요청 메시지를 넘기므로 줄바꿈이 사라진다.
    // 그래서 수량자만 되살리고 대상은 '가로 공백'으로 좁힌다(줄 구조 보존).
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim();
}

export function normalizeWardStaffList<
  T extends {
    id?: unknown;
    name?: unknown;
    department?: unknown;
    position?: unknown;
    company?: unknown;
    company_id?: unknown;
  },
>(data: T[] | null | undefined, senderId: string) {
  const deduped = new Map<
    string,
    {
      id: string;
      name: string;
      department: string;
      position: string;
      company: string;
      company_id: string | null;
    }
  >();

  (data || []).forEach((staff) => {
    const normalized = {
      id: String(staff.id || '').trim(),
      name: stripHiddenMetaBlocks(staff.name),
      department: stripHiddenMetaBlocks(staff.department),
      position: stripHiddenMetaBlocks(staff.position),
      company: stripHiddenMetaBlocks(staff.company),
      company_id: String(staff.company_id || '').trim() || null };

    if (!normalized.id || !normalized.name || normalized.id === senderId) return;
    deduped.set(normalized.id, normalized);
  });

  return Array.from(deduped.values());
}

function getWardScopedStorageKey(prefix: string, userId: unknown, companyId: unknown) {
  const normalizedUserId = String(userId || 'anonymous').trim() || 'anonymous';
  const normalizedCompanyId = String(companyId || 'global').trim() || 'global';
  return `${prefix}:${normalizedUserId}:${normalizedCompanyId}`;
}

export function getWardFavoriteStorageKey(userId: unknown, companyId: unknown) {
  return getWardScopedStorageKey(WARD_MESSAGE_FAVORITES_STORAGE_PREFIX, userId, companyId);
}

export function getWardRecentStorageKey(userId: unknown, companyId: unknown) {
  return getWardScopedStorageKey(WARD_MESSAGE_RECENTS_STORAGE_PREFIX, userId, companyId);
}

export function getChatRoomMemberIds(room: { members?: unknown; member_ids?: unknown }) {
  const fromMembers = coerceMemberIds(room.members);
  if (fromMembers.length > 0) return fromMembers;
  return coerceMemberIds(room.member_ids);
}

function coerceMemberIds(raw: unknown): string[] {
  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return trimmed ? [trimmed] : [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((memberId) => String(memberId || '').trim()).filter(Boolean);
  }
  return [];
}

export function isInteractiveKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'button'
  );
}

export function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [] as HTMLElement[];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
}

export function normalizeInventoryRows(rows: unknown) {
  if (!Array.isArray(rows)) return [] as InventoryItem[];

  return rows
    .map((row) => {
      const item = (row || {}) as Record<string, unknown>;
      const id = String(item.id || '').trim();
      // 재고 마스터(`inventory`)의 품목명 정본은 `item_name` 이다. `name` 은 뒤늦게
      // 추가된 별칭 컬럼이라 대부분의 행이 NULL 이다. 예전에는 `name` 만 보고 비어 있으면
      // 행을 통째로 버렸는데, 그러면 실재 품목이 조회돼도 매칭 맵이 비어 차감이 전량 skip 된다.
      const name = String(item.item_name || item.name || '').trim();
      if (!id || !name) return null;

      return {
        ...item,
        id,
        name,
        unit: String(item.unit || '').trim() || null,
        quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity || 0),
        company: String(item.company || '').trim() || null,
        company_id: String(item.company_id || '').trim() || null,
        department: String(item.department || '').trim() || null } as InventoryItem;
    })
    .filter((item): item is InventoryItem => Boolean(item));
}

export function isOpCheckSchemaMissing(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: string }).code || '');
  const message = String((error as { message?: string }).message || '');
  return code === '42P01' || message.includes('op_check_templates') || message.includes('op_patient_checks');
}

export function isMissingRelationError(error: unknown, relationNames: string[]) {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: string }).code || '');
  const message = String(
    (error as { message?: string; details?: string }).message ||
      (error as { details?: string }).details ||
      '',
  ).toLowerCase();

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    relationNames.some((relationName) => {
      const target = relationName.toLowerCase();
      return message.includes(target) || message.includes(`public.${target}`);
    })
  );
}

export async function withOptionalQueryFallback<T>(
  execute: () => PromiseLike<QueryResult<T>>,
  options: {
    fallbackData: T;
    relationNames?: string[];
    columnNames?: string[];
  },
): Promise<QueryResult<T>> {
  const result = await execute();
  if (!result.error) return result;

  const relationNames = options.relationNames || [];
  const columnNames = options.columnNames || [];
  const missingRelation = relationNames.length > 0 && isMissingRelationError(result.error, relationNames);
  const missingColumn = columnNames.some((columnName) => isMissingColumnError(result.error, columnName));

  if (!missingRelation && !missingColumn) {
    return result;
  }

  console.warn('OP체크 선택 데이터 조회를 건너뜁니다.', {
    relationNames,
    columnNames,
    error: result.error });

  return {
    data: options.fallbackData,
    error: null };
}

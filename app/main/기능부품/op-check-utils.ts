'use client';

import { isMissingColumnError } from '@/lib/supabase-compat';
import type { InventoryItem } from '@/types';

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
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
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
    .replace(/\s{2,}/g, ' ')
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
      company_id: String(staff.company_id || '').trim() || null,
    };

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

export function getChatRoomMemberIds(room: { members?: unknown[] | null; member_ids?: unknown[] | null }) {
  if (Array.isArray(room.members)) {
    return room.members.map((memberId) => String(memberId || '').trim()).filter(Boolean);
  }
  if (Array.isArray(room.member_ids)) {
    return room.member_ids.map((memberId) => String(memberId || '').trim()).filter(Boolean);
  }
  return [] as string[];
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
      const name = String(item.name || '').trim();
      if (!id || !name) return null;

      return {
        ...item,
        id,
        name,
        unit: String(item.unit || '').trim() || null,
        quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity || 0),
        company: String(item.company || '').trim() || null,
        company_id: String(item.company_id || '').trim() || null,
        department: String(item.department || '').trim() || null,
      } as InventoryItem;
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
    error: result.error,
  });

  return {
    data: options.fallbackData,
    error: null,
  };
}

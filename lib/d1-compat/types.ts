// ============================================================
// lib/d1-compat/types.ts
// d1-db-compat 전체에서 공유하는 인터페이스·타입 정의.
// ============================================================

export interface ApiError {
  message: string;
  code?: string;
  details?: string;
}
export type QueryResult<T = any> =
  | { data: T; error: null; count?: number }
  | { data: null; error: ApiError; count?: number };

export interface WhereCondition {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'lt' | 'gt' | 'lte' | 'gte' | 'is' | 'isNot' | 'like' | 'ilike' | 'contains';
  value: unknown;
}

export interface OrderCondition {
  field: string;
  ascending?: boolean;
  nullsFirst?: boolean;
}

export interface QueryState {
  table: string;
  columns?: string[];
  where: WhereCondition[];
  orFilters?: import('./filter').FilterNode[];
  order: OrderCondition[];
  limit?: number;
  range?: { from: number; to: number };
  single?: boolean;
  maybeSingle?: boolean;
  count?: boolean;
  /** parseOrFilter 실패 시 즉시 에러 반환 용도 */
  parseError?: string;
}

export interface InsertState {
  table: string;
  values: Record<string, unknown>[];
  /** legacy: 'ignore' | 'replace'. conflict 필드가 있으면 우선. */
  onConflict?: 'ignore' | 'replace';
  conflict?: {
    columns: string[];
    action: 'update' | 'ignore';
  };
  returning?: string[];
  single?: boolean;
  maybeSingle?: boolean;
}

export interface UpdateState {
  table: string;
  set: Record<string, unknown>;
  where: WhereCondition[];
  returning?: string[];
  single?: boolean;
  maybeSingle?: boolean;
}

export interface DeleteState {
  table: string;
  where: WhereCondition[];
}

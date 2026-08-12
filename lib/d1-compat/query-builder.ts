// ============================================================
// lib/d1-compat/query-builder.ts
// executeQuery + QueryBuilder — SELECT 체인 빌더.
// ============================================================
import { parseOrFilter } from './filter';
import type { FilterNode } from './filter';
import type { QueryResult, QueryState, WhereCondition } from './types';
import { WhereClauseBuilder } from './where-builder';

export type { QueryResult };

async function executeQuery<T>(state: QueryState): Promise<QueryResult<T>> {
  // .or() 파싱 실패는 fetch 없이 즉시 에러 반환 (JM3: 에러를 정상 흐름으로)
  if (state.parseError) {
    return { data: null, error: { message: state.parseError } };
  }
  try {
    const res = await fetch('/api/d1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      credentials: 'same-origin' });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data?: T; count?: number }
      | { ok: false; error: string; code?: string; details?: string }
      | null;
    if (!res.ok || !json) {
      return {
        data: null,
        error: { message: json && 'error' in json ? json.error : `HTTP ${res.status}` } };
    }
    if (!json.ok) {
      return { data: null, error: { message: json.error, code: json.code, details: json.details } };
    }
    return { data: (json.data as T) ?? (null as never), error: null, count: json.count };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Network error' } };
  }
}

export class QueryBuilder<T = any> extends WhereClauseBuilder implements PromiseLike<QueryResult<T>> {
  private state: QueryState;

  constructor(state: QueryState) {
    super();
    this.state = state;
  }

  protected get whereConditions() {
    return this.state.where;
  }

  select(cols?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    if (cols && cols !== '*') {
      this.state.columns = cols
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    } else {
      this.state.columns = undefined;
    }
    if (options?.head) {
      this.state.count = true;
    }
    return this;
  }

  like(field: string, pattern: string): this {
    this.state.where.push({ field, op: 'like', value: pattern });
    return this;
  }
  ilike(field: string, pattern: string): this {
    this.state.where.push({ field, op: 'ilike', value: pattern });
    return this;
  }
  contains(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'contains', value });
    return this;
  }

  /**
   * .or('a.eq.1,b.eq.2') — PostgREST 스타일 OR 필터.
   * 여러 번 호출하면 서버에서 각 그룹을 AND로 결합.
   * 파싱 실패 시 await 시점에 에러가 표면화됨 (db 동작과 동일).
   */
  or(filter: string): this {
    if (this.state.parseError) return this; // 이미 실패 상태면 누적하지 않음
    try {
      const node: FilterNode = parseOrFilter(filter);
      if (!this.state.orFilters) this.state.orFilters = [];
      this.state.orFilters.push(node);
    } catch (err) {
      this.state.parseError = err instanceof Error ? err.message : 'Invalid or() filter';
    }
    return this;
  }

  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.state.order.push({
      field,
      ascending: options?.ascending,
      nullsFirst: options?.nullsFirst });
    return this;
  }

  limit(n: number): this {
    this.state.limit = n;
    return this;
  }

  range(from: number, to: number): this {
    this.state.range = { from, to };
    return this;
  }

  single(): QueryBuilder<T> {
    this.state.single = true;
    return this as QueryBuilder<T>;
  }

  maybeSingle(): QueryBuilder<T> {
    this.state.maybeSingle = true;
    return this as QueryBuilder<T>;
  }

  /** db의 .returns<T>() — 런타임 no-op, 반환 타입만 재지정. */
  returns<U = T>(): QueryBuilder<U> {
    return this as unknown as QueryBuilder<U>;
  }
  /** db의 .overrideTypes<T>() — 런타임 no-op. */
  overrideTypes<U = T>(): QueryBuilder<U> {
    return this as unknown as QueryBuilder<U>;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return executeQuery<T>(this.state).then(onfulfilled, onrejected);
  }
}

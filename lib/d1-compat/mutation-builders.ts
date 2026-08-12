// ============================================================
// lib/d1-compat/mutation-builders.ts
// executeMutate + InsertBuilder / UpdateBuilder / DeleteBuilder.
// ============================================================
import type { QueryResult, InsertState, UpdateState, DeleteState, WhereCondition } from './types';
import { WhereClauseBuilder } from './where-builder';

function parseColumns(input: string | undefined): string[] | undefined {
  if (!input || input === '*') return undefined;
  return input
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

async function executeMutate<T>(body: {
  op: 'insert' | 'update' | 'delete';
  [key: string]: unknown;
}): Promise<QueryResult<T>> {
  try {
    const res = await fetch('/api/d1/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin' });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data?: T }
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
    return { data: (json.data as T) ?? (null as never), error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Network error' } };
  }
}

// ─────────────────────────────────────────────────────────────
// InsertBuilder
// ─────────────────────────────────────────────────────────────
export class InsertBuilder<T = any> implements PromiseLike<QueryResult<T>> {
  private state: InsertState;
  constructor(state: InsertState) {
    this.state = state;
  }
  select(cols?: string): this {
    this.state.returning = parseColumns(cols) ?? (['*'] as string[]);
    return this;
  }
  single(): this {
    this.state.single = true;
    return this;
  }
  maybeSingle(): this {
    this.state.maybeSingle = true;
    return this;
  }
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const { conflict, onConflict, ...rest } = this.state;
    const body: Record<string, unknown> = {
      op: 'insert' as const,
      table: rest.table,
      values: rest.values,
      returning: rest.returning };
    // conflict 필드가 있으면 우선 사용, 없으면 legacy onConflict 폴백
    if (conflict) {
      body.conflict = conflict;
    } else if (onConflict) {
      body.onConflict = onConflict;
    }
    return executeMutate<T>(body as { op: 'insert'; [key: string]: unknown }).then((result) => {
      if (result.error || result.data == null) return result;
      if (this.state.single || this.state.maybeSingle) {
        const arr = result.data as unknown as T[];
        const first = Array.isArray(arr) ? arr[0] : (arr as T | undefined);
        if (!first && this.state.single) {
          return { data: null, error: { message: 'Not found' } } as QueryResult<T>;
        }
        return { data: (first ?? null) as T, error: null } as QueryResult<T>;
      }
      return result;
    }).then(onfulfilled, onrejected);
  }
}

// ─────────────────────────────────────────────────────────────
// UpdateBuilder
// ─────────────────────────────────────────────────────────────
export class UpdateBuilder<T = any> extends WhereClauseBuilder implements PromiseLike<QueryResult<T>> {
  private state: UpdateState;
  constructor(state: UpdateState) {
    super();
    this.state = state;
  }

  protected get whereConditions() {
    return this.state.where;
  }

  // WHERE 체인 메소드
  filter(field: string, op: string, value: unknown): this {
    const mappedOp = op === 'eq' ? 'eq' : op === 'in' ? 'in' : 'eq';
    const parsedVal = op === 'in' && typeof value === 'string' && value.startsWith('(') && value.endsWith(')')
      ? value.slice(1, -1).split(',').map(s => s.trim().replace(/^'|'$/g, ''))
      : value;
    this.state.where.push({ field, op: mappedOp as any, value: parsedVal });
    return this;
  }

  /** UPDATE ... RETURNING 지원. cols 생략 시 전 컬럼. */
  select(cols?: string): this {
    this.state.returning = parseColumns(cols) ?? (['*'] as string[]);
    return this;
  }
  single(): this {
    this.state.single = true;
    return this;
  }
  maybeSingle(): this {
    this.state.maybeSingle = true;
    return this;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const body: Record<string, unknown> = {
      op: 'update' as const,
      table: this.state.table,
      set: this.state.set,
      where: this.state.where };
    if (this.state.returning && this.state.returning.length > 0) {
      body.returning = this.state.returning;
    }
    return executeMutate<T>(body as { op: 'update'; [key: string]: unknown }).then((result) => {
      if (result.error || result.data == null) return result;
      if (this.state.single || this.state.maybeSingle) {
        const arr = result.data as unknown as T[];
        const first = Array.isArray(arr) ? arr[0] : (arr as T | undefined);
        if (!first && this.state.single) {
          return { data: null, error: { message: 'Not found' } } as QueryResult<T>;
        }
        return { data: (first ?? null) as T, error: null } as QueryResult<T>;
      }
      return result;
    }).then(onfulfilled, onrejected);
  }
}

// ─────────────────────────────────────────────────────────────
// DeleteBuilder
// ─────────────────────────────────────────────────────────────
export class DeleteBuilder<T = any> extends WhereClauseBuilder implements PromiseLike<QueryResult<T>> {
  private state: DeleteState;
  constructor(state: DeleteState) {
    super();
    this.state = state;
  }

  protected get whereConditions() {
    return this.state.where;
  }
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return executeMutate<T>({
      op: 'delete',
      table: this.state.table,
      where: this.state.where }).then(onfulfilled, onrejected);
  }
}

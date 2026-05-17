// ============================================================
// lib/d1-supabase-compat.ts
// supabase.from()와 비슷한 API를 제공하면서 내부적으로 /api/d1/query 호출.
//
// 사용 예 (한 줄 import 교체):
//   - import { supabase } from '@/lib/supabase';
//   + import { supabase } from '@/lib/d1-supabase-compat';
//
//   const { data, error } = await supabase
//     .from('messages')
//     .select('id, content, created_at')
//     .eq('room_id', roomId)
//     .order('created_at', { ascending: false })
//     .limit(50);
//
// Phase 6-A — supabase.from(...).select() 직접 호출을 D1 백엔드로 점진 이전.
// chained builder가 마지막 await에서 fetch 발화.
//
// 지원 메소드:
//   .from(table)
//   .select(cols)         cols = '*' | 'id, name' | 'col1, col2'
//   .eq/.neq/.lt/.gt/.lte/.gte/.is/.like/.ilike(col, val)
//   .in(col, array)
//   .order(col, { ascending })
//   .limit(n)
//   .range(from, to)
//   .single()             1 row 또는 error
//   .maybeSingle()        1 row 또는 null
// ============================================================

export interface ApiError {
  message: string;
  code?: string;
  details?: string;
}

export type QueryResult<T = unknown> =
  | { data: T; error: null; count?: number }
  | { data: null; error: ApiError; count?: number };

interface WhereCondition {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'lt' | 'gt' | 'lte' | 'gte' | 'is' | 'isNot' | 'like' | 'ilike';
  value: unknown;
}

interface OrderCondition {
  field: string;
  ascending?: boolean;
}

interface QueryState {
  table: string;
  columns?: string[];
  where: WhereCondition[];
  order: OrderCondition[];
  limit?: number;
  range?: { from: number; to: number };
  single?: boolean;
  maybeSingle?: boolean;
  count?: boolean;
}

function parseColumns(input: string | undefined): string[] | undefined {
  if (!input || input === '*') return undefined;
  return input
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

async function executeQuery<T>(state: QueryState): Promise<QueryResult<T>> {
  try {
    const res = await fetch('/api/d1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data?: T; count?: number }
      | { ok: false; error: string; code?: string; details?: string }
      | null;
    if (!res.ok || !json) {
      return {
        data: null,
        error: { message: json && 'error' in json ? json.error : `HTTP ${res.status}` },
      };
    }
    if (!json.ok) {
      return { data: null, error: { message: json.error, code: json.code, details: json.details } };
    }
    return { data: (json.data as T) ?? (null as never), error: null, count: json.count };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Network error' },
    };
  }
}

class QueryBuilder<T = unknown> implements PromiseLike<QueryResult<T>> {
  private state: QueryState;

  constructor(state: QueryState) {
    this.state = state;
  }

  select(cols?: string): this {
    this.state.columns = parseColumns(cols);
    return this;
  }

  eq(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'eq', value });
    return this;
  }
  neq(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'neq', value });
    return this;
  }
  lt(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'lt', value });
    return this;
  }
  gt(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'gt', value });
    return this;
  }
  lte(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'lte', value });
    return this;
  }
  gte(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'gte', value });
    return this;
  }
  is(field: string, value: unknown): this {
    this.state.where.push({ field, op: 'is', value });
    return this;
  }
  not(field: string, op: 'is' | 'eq', value: unknown): this {
    if (op === 'is') this.state.where.push({ field, op: 'isNot', value });
    else this.state.where.push({ field, op: 'neq', value });
    return this;
  }
  in(field: string, values: unknown[]): this {
    this.state.where.push({ field, op: 'in', value: values });
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

  order(field: string, options?: { ascending?: boolean }): this {
    this.state.order.push({ field, ascending: options?.ascending });
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

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return executeQuery<T>(this.state).then(onfulfilled, onrejected);
  }
}

class D1ClientImpl {
  from<T = unknown>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>({
      table,
      where: [],
      order: [],
    });
  }
}

export const d1Client = new D1ClientImpl();

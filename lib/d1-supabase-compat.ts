// ============================================================
// lib/d1-supabase-compat.ts
// supabase.from()와 비슷한 API를 제공하면서 내부적으로 /api/d1/* 호출.
//
// 사용 예 (한 줄 import 교체):
//   - import { supabase } from '@/lib/supabase';
//   + import { supabase } from '@/lib/d1-supabase-compat';
//
// Phase 6-A — supabase.from(...).select() 직접 호출을 D1 백엔드로 점진 이전.
// chained builder가 마지막 await에서 fetch 발화.
// ============================================================

// 공개 타입 re-export — lib/supabase.ts 등 외부 import 유지
export type { ApiError, QueryResult } from './d1-compat/types';

import type { QueryResult, InsertState, UpdateState, DeleteState } from './d1-compat/types';
import { QueryBuilder } from './d1-compat/query-builder';
import { InsertBuilder, UpdateBuilder, DeleteBuilder } from './d1-compat/mutation-builders';

// ─────────────────────────────────────────────────────────────
// RPC 라우트 매핑 — 알려진 함수만 신규 라우트로 디스패치.
// ─────────────────────────────────────────────────────────────
const RPC_ROUTES: Readonly<Record<string, string>> = {
  increment_post_views: '/api/d1/rpc/increment-post-views',
  register_staff_full: '/api/d1/rpc/register-staff',
};

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<QueryResult<T>> {
  const path = RPC_ROUTES[name];
  if (!path) {
    return {
      data: null,
      error: { message: `rpc() not supported by d1-supabase-compat: ${name}. Use direct API route.` },
    };
  }
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data?: T }
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
    return { data: (json.data as T) ?? (null as never), error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Network error' },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// FromBuilder — supabase.from(table).select/insert/update/delete/upsert
// ─────────────────────────────────────────────────────────────
class FromBuilder {
  private table: string;
  constructor(table: string) {
    this.table = table;
  }

  select<T = unknown>(
    cols?: string,
    options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ): QueryBuilder<T> {
    const columns =
      cols && cols !== '*'
        ? cols.split(',').map((c) => c.trim()).filter(Boolean)
        : undefined;
    return new QueryBuilder<T>({
      table: this.table,
      columns,
      where: [],
      order: [],
      count: options?.head ? true : undefined,
    });
  }

  insert<T = unknown>(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: 'ignore' | 'replace' },
  ): InsertBuilder<T> {
    const arr = Array.isArray(values) ? values : [values];
    return new InsertBuilder<T>({
      table: this.table,
      values: arr,
      onConflict: options?.onConflict,
    } satisfies InsertState);
  }

  /**
   * upsert — options.onConflict이 'staff_id,year_month' 같은 복합 컬럼일 수 있음.
   * onConflict 없으면 INSERT OR REPLACE 폴백.
   */
  upsert<T = unknown>(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): InsertBuilder<T> {
    const arr = Array.isArray(values) ? values : [values];
    const state: InsertState = { table: this.table, values: arr };
    if (options?.onConflict) {
      const columns = options.onConflict
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      state.conflict = {
        columns,
        action: options.ignoreDuplicates ? 'ignore' : 'update',
      };
    } else {
      // 기존 동작 유지 — INSERT OR REPLACE
      state.onConflict = 'replace';
    }
    return new InsertBuilder<T>(state);
  }

  update<T = unknown>(set: Record<string, unknown>): UpdateBuilder<T> {
    return new UpdateBuilder<T>({
      table: this.table,
      set,
      where: [],
    } satisfies UpdateState);
  }

  delete<T = unknown>(): DeleteBuilder<T> {
    return new DeleteBuilder<T>({
      table: this.table,
      where: [],
    } satisfies DeleteState);
  }
}

// ─────────────────────────────────────────────────────────────
// D1ClientImpl — supabase 인터페이스 진입점
// ─────────────────────────────────────────────────────────────
class D1ClientImpl {
  from(table: string): FromBuilder {
    return new FromBuilder(table);
  }

  rpc<T = never>(name: string, args?: Record<string, unknown>): Promise<QueryResult<T>> {
    return callRpc<T>(name, args ?? {});
  }

  // legacy 호환: 빈 객체 반환하는 가짜 channel
  channel(_name: string): { on: () => unknown; subscribe: () => void } {
    return {
      on: () => ({ on: () => ({}), subscribe: () => {} }),
      subscribe: () => {},
    };
  }
  removeChannel(_channel: unknown): void {
    // no-op
  }
}

export const d1Client = new D1ClientImpl();

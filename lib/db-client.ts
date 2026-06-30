// ============================================================
// lib/db-client.ts
// Supabase SDK를 완전히 배제하고 Cloudflare D1 (/api/d1/*) 백엔드와
// 직접 통신하도록 구현된 순수 경량 D1 데이터베이스 클라이언트입니다.
// ============================================================

import type { QueryResult, InsertState, UpdateState, DeleteState } from './d1-compat/types';
import { QueryBuilder } from './d1-compat/query-builder';
import { InsertBuilder, UpdateBuilder, DeleteBuilder } from './d1-compat/mutation-builders';

// RPC 라우트 매핑 — 알려진 함수만 신규 라우트로 디스패치
const RPC_ROUTES: Readonly<Record<string, string>> = {
  increment_post_views: '/api/d1/rpc/increment-post-views',
  register_staff_full: '/api/d1/rpc/register-staff' };

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<QueryResult<T>> {
  const path = RPC_ROUTES[name];
  if (!path) {
    return {
      data: null,
      error: { message: `rpc() not supported by Cloudflare D1 client: ${name}. Use direct API route.` } } as QueryResult<T>;
  }
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      credentials: 'same-origin' });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data?: T }
      | { ok: false; error: string; code?: string; details?: string }
      | null;
    if (!res.ok || !json) {
      return {
        data: null,
        error: { message: json && 'error' in json ? json.error : `HTTP ${res.status}` } } as QueryResult<T>;
    }
    if (!json.ok) {
      return { data: null, error: { message: json.error, code: json.code, details: json.details } } as QueryResult<T>;
    }
    return { data: (json.data as T) ?? (null as never), error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Network error' } } as QueryResult<T>;
  }
}

class FromBuilder {
  private table: string;
  constructor(table: string) {
    this.table = table;
  }

  select<T = any>(
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
      count: options?.head ? true : undefined });
  }

  insert<T = any>(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: 'ignore' | 'replace' },
  ): InsertBuilder<T> {
    const arr = Array.isArray(values) ? values : [values];
    return new InsertBuilder<T>({
      table: this.table,
      values: arr,
      onConflict: options?.onConflict } satisfies InsertState);
  }

  upsert<T = any>(
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
        action: options.ignoreDuplicates ? 'ignore' : 'update' };
    } else {
      state.onConflict = 'replace';
    }
    return new InsertBuilder<T>(state);
  }

  update<T = any>(set: Record<string, unknown>): UpdateBuilder<T> {
    return new UpdateBuilder<T>({
      table: this.table,
      set,
      where: [] } satisfies UpdateState);
  }

  delete<T = any>(): DeleteBuilder<T> {
    return new DeleteBuilder<T>({
      table: this.table,
      where: [] } satisfies DeleteState);
  }
}

class D1ClientImpl {
  from(table: string): FromBuilder {
    return new FromBuilder(table);
  }

  rpc<T = any>(name: string, args?: Record<string, unknown>): Promise<QueryResult<T>> {
    return callRpc<T>(name, args ?? {});
  }

  channel(_name: string): { on: () => unknown; subscribe: () => void } {
    return {
      on: () => ({ on: () => ({}), subscribe: () => {} }),
      subscribe: () => {} };
  }

  removeChannel(_channel: unknown): void {
    // no-op
  }
}

export const d1Client = new D1ClientImpl();
export const db = d1Client;
export const d1 = d1Client;

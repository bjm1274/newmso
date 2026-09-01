// ============================================================
// lib/db/types.ts
// 데이터 백엔드 공통 타입 정의 (SQLite / D1 표준 인터페이스)
// ============================================================

import type * as schema from './schema';

export type DataBackend = 'supabase' | 'd1' | 'dual-write';

export type SchemaType = typeof schema;

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  error?: string;
  meta: {
    duration?: number;
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
    served_by?: string;
    size_after?: number;
    [key: string]: unknown;
  };
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(options?: { columnNames?: boolean }): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump?(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export function getDataBackend(envOverride?: string): DataBackend {
  return 'd1';
}

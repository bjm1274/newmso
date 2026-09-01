// ============================================================
// lib/db/get-binding.ts
// Next.js API route에서 SQLite / D1 binding을 가져오는 헬퍼.
// Node.js Standalone / Docker / 로컬 환경 -> SqliteD1Adapter(better-sqlite3 WAL) 반환
// ============================================================

import type { D1Database, DataBackend } from './types';

/**
 * DB binding을 가져옴.
 * Node.js 서버(Docker/Standalone/로컬)이면 SqliteD1Adapter 반환.
 */
export async function getD1Binding(): Promise<D1Database | undefined> {
  if (typeof window !== 'undefined') {
    return undefined;
  }

  // 1. globalThis에 사전 등록된 SQLite 어댑터가 있으면 즉시 반환 (0ms)
  if ((globalThis as any).__allerp_sqlite_adapter) {
    return (globalThis as any).__allerp_sqlite_adapter;
  }

  // 2. Node.js 런타임 환경에서 기본 SQLite 어댑터 반환
  try {
    const { getSqliteD1Adapter } = await import('./client-sqlite');
    return getSqliteD1Adapter();
  } catch (err) {
    console.error('[getD1Binding] Failed to initialize SQLite database adapter:', err);
    return undefined;
  }
}

/**
 * 현재 백엔드 모드 — SQLite / D1 기반
 */
export async function resolveDataBackend(): Promise<DataBackend> {
  return 'd1';
}

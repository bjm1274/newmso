// ============================================================
// lib/db/get-binding.ts
// Next.js API route에서 D1 / 로컬 SQLite binding을 가져오는 헬퍼.
//
// 1) Cloudflare Workers 환경 (OpenNext) -> getCloudflareContext()로 env.DB 반환
// 2) Node.js Standalone / Docker / 로컬 환경 -> SqliteD1Adapter(better-sqlite3 WAL) 반환
// ============================================================

import type { D1Database } from '@cloudflare/workers-types';
import { isCloudflareWorkerRuntime } from '@/lib/cloudflare-runtime';
import { type DataBackend } from './types';

// CloudflareEnv 타입 보강 — wrangler.toml의 [[d1_databases]] binding과 [vars]
declare global {
  interface CloudflareEnv {
    DB?: D1Database;
    DATA_BACKEND?: string;
    REALTIME_HUB?: any;
  }
}

/**
 * DB binding을 가져옴.
 * Cloudflare Worker 환경이면 env.DB, Node.js 서버(Docker/Standalone/로컬)이면 SqliteD1Adapter 반환.
 *
 * Next.js API route에서 사용:
 *   const d1 = await getD1Binding();
 *   if (d1) { ... use d1 ... }
 *
 * better-sqlite3 는 동적 import 한다. 정적 import 하면 Edge/클라이언트/워커 번들에
 * 네이티브 모듈이 새어 `util.promisify` 가 객체를 받고 페이지가 죽는다.
 */
export async function getD1Binding(): Promise<D1Database | undefined> {
  if (typeof window !== 'undefined') {
    return undefined;
  }

  // 1. globalThis에 사전 등록된 SQLite 어댑터가 있으면 즉시 반환 (0ms)
  if ((globalThis as any).__allerp_sqlite_adapter) {
    return (globalThis as any).__allerp_sqlite_adapter;
  }

  // 2. 실제 Workers 런타임에서만 Cloudflare 컨텍스트를 읽는다.
  //    Node 에서 getCloudflareContext({ async: true }) 를 호출하면 wrangler 가
  //    기동되며 The "original" argument must be of type Function 이 난다.
  if (isCloudflareWorkerRuntime()) {
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const { env } = await getCloudflareContext({ async: true });
      if (env?.DB) return env.DB;
    } catch {
      // Cloudflare Context 없음 -> Node.js 런타임으로 진행
    }
  }

  // 3. Node.js 런타임 환경에서 기본 SQLite 어댑터 반환
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

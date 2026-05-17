// ============================================================
// lib/db/get-binding.ts
// Next.js API route에서 Cloudflare D1 binding을 가져오는 헬퍼.
//
// OpenNext on Cloudflare Workers는 getCloudflareContext()로 env에 접근.
// 로컬 개발(`next dev`)에서는 Cloudflare context가 없으므로 undefined 반환.
// ============================================================

import type { D1Database } from '@cloudflare/workers-types';
import { getDataBackend, type DataBackend } from './types';

// CloudflareEnv 타입 보강 — wrangler.toml의 [[d1_databases]] binding과 [vars]
declare global {
  interface CloudflareEnv {
    DB?: D1Database;
    DATA_BACKEND?: string;
  }
}

/**
 * D1 binding을 가져옴. Workers 외 환경이거나 binding이 없으면 undefined.
 *
 * Next.js API route에서 사용:
 *   const d1 = await getD1Binding();
 *   if (d1) { ... use d1 ... }
 */
export async function getD1Binding(): Promise<D1Database | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    return env.DB;
  } catch {
    return undefined;
  }
}

/**
 * 현재 백엔드 모드 — wrangler.toml [vars].DATA_BACKEND 또는 process.env.DATA_BACKEND
 *
 * 동기 호출이 가능하면 그쪽을 우선 시도하고, async context만 가능하면 그것 사용.
 */
export async function resolveDataBackend(): Promise<DataBackend> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const v = env.DATA_BACKEND;
    if (v) return getDataBackend(v);
  } catch {
    // not in Workers — fall back to process.env
  }
  return getDataBackend();
}

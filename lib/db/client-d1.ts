// ============================================================
// lib/db/client-d1.ts
// Cloudflare D1 + Drizzle 클라이언트 (Workers 환경 전용)
//
// 사용:
//   import { getD1Drizzle } from '@/lib/db/client-d1';
//   const db = getD1Drizzle(env.DB);  // env.DB는 wrangler.toml에 정의된 binding
//   const rows = await db.select().from(staff_members);
//
// Workers 외 환경(Node.js)에서는 client-local.ts 사용.
// ============================================================

import type { D1Database } from '@cloudflare/workers-types';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';
import * as relations from './relations';

export type D1Client = DrizzleD1Database<typeof schema & typeof relations>;

/**
 * D1 binding으로 Drizzle 클라이언트 생성.
 * Workers handler의 `env.DB`를 그대로 넘기면 됨.
 *
 * wrangler.toml 예시:
 *   [[d1_databases]]
 *   binding = "DB"
 *   database_name = "pchos-d1-v2"
 *   database_id = "..."
 */
export function getD1Drizzle(d1: D1Database): D1Client {
  return drizzle(d1, { schema: { ...schema, ...relations } });
}

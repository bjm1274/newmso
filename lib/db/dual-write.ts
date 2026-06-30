// ============================================================
// lib/db/dual-write.ts
// Dual-write 헬퍼: 마이그레이션 기간 동안 Supabase + D1 양쪽에 write
//
// 사용 시나리오 (Phase 3):
//   - DATA_BACKEND = 'supabase'   : 기존 동작, write는 Supabase만
//   - DATA_BACKEND = 'dual-write' : write를 두 곳 모두 (D1 실패는 alert만)
//   - DATA_BACKEND = 'd1'         : 컷오버 후, D1만 사용
//
// 읽기는 점진적으로 직접 drizzle 사용 (이 파일은 write 전용).
// ============================================================

import type { D1Database } from '@cloudflare/workers-types';
import { getDataBackend, type DataBackend } from './types';
import { getD1Drizzle } from './client-d1';
import * as schemaTables from './schema';

type TableName = keyof typeof schemaTables;

export interface DualWriteContext {
  /** Workers 환경에서만 — D1 binding */
  d1?: D1Database;
  /** override (테스트용, 또는 force) */
  backend?: DataBackend;
}

export interface DualWriteResult<T = unknown> {
  backend: DataBackend;
  db?: { ok: boolean; data?: T; error?: unknown };
  d1?: { ok: boolean; data?: T; error?: unknown };
}

/**
 * 마이그레이션 기간 동안 양 백엔드에 동시 INSERT.
 *
 * @param table     — 테이블 이름 (schema.ts에 정의된 이름과 일치해야)
 * @param data      — 한 row 데이터
 * @param ctx       — Workers env (D1 사용 시), backend override
 * @param supabaseFn — Supabase 측 write를 수행하는 콜백
 *                    (기존 코드의 client.from().insert() 등을 그대로 위임)
 *
 * 동작:
 *  - backend='supabase'   : supabaseFn만 실행
 *  - backend='d1'         : D1만 실행 (drizzle insert)
 *  - backend='dual-write' : 둘 다 실행. Supabase 결과를 진실로 반환,
 *                           D1 실패는 결과에 기록하되 throw 안 함
 */
export async function dualInsert<T = unknown>(
  table: TableName,
  data: Record<string, unknown>,
  ctx: DualWriteContext,
  supabaseFn: () => Promise<T>,
): Promise<DualWriteResult<T>> {
  const backend = ctx.backend ?? getDataBackend();
  const result: DualWriteResult<T> = { backend };

  if (backend === 'supabase') {
    try {
      result.db = { ok: true, data: await supabaseFn() };
    } catch (error) {
      result.db = { ok: false, error };
      throw error;
    }
    return result;
  }

  if (backend === 'd1') {
    if (!ctx.d1) throw new Error('[dual-write] d1 backend requires ctx.d1');
    try {
      const db = getD1Drizzle(ctx.d1);
      const tableObj = schemaTables[table];
      if (!tableObj) throw new Error(`[dual-write] unknown table: ${String(table)}`);
      const inserted = await db.insert(tableObj as never).values(data as never).returning();
      result.d1 = { ok: true, data: inserted as T };
    } catch (error) {
      result.d1 = { ok: false, error };
      throw error;
    }
    return result;
  }

  // dual-write
  const supabasePromise = (async () => {
    try { return { ok: true as const, data: await supabaseFn() }; }
    catch (e) { return { ok: false as const, error: e }; }
  })();

  const d1Promise = (async () => {
    if (!ctx.d1) return { ok: false as const, error: new Error('no D1 binding') };
    try {
      const db = getD1Drizzle(ctx.d1);
      const tableObj = schemaTables[table];
      if (!tableObj) throw new Error(`unknown table: ${String(table)}`);
      const inserted = await db.insert(tableObj as never).values(data as never).returning();
      return { ok: true as const, data: inserted as T };
    } catch (e) {
      return { ok: false as const, error: e };
    }
  })();

  const [supa, d1] = await Promise.all([supabasePromise, d1Promise]);
  result.db = supa;
  result.d1 = d1;

  // Supabase가 진실 — 실패하면 throw. D1 실패는 alert 수준
  if (!supa.ok) throw supa.error;
  if (!d1.ok) {
    // structured log — Phase 3에서 alert/metric으로 연결
    console.warn('[dual-write] D1 mirror failed', {
      table,
      error: d1.error instanceof Error ? d1.error.message : String(d1.error) });
  }
  return result;
}

/**
 * UPDATE/DELETE 같은 비-insert 작업용 일반화.
 * supabaseFn / d1Fn 각각 콜백으로 받음.
 */
export async function dualWrite<T = unknown>(
  ctx: DualWriteContext,
  supabaseFn: () => Promise<T>,
  d1Fn: (db: ReturnType<typeof getD1Drizzle>) => Promise<unknown>,
): Promise<DualWriteResult<T>> {
  const backend = ctx.backend ?? getDataBackend();
  const result: DualWriteResult<T> = { backend };

  if (backend === 'supabase') {
    result.db = { ok: true, data: await supabaseFn() };
    return result;
  }

  if (backend === 'd1') {
    if (!ctx.d1) throw new Error('[dual-write] d1 backend requires ctx.d1');
    result.d1 = { ok: true, data: await d1Fn(getD1Drizzle(ctx.d1)) as T };
    return result;
  }

  // dual-write
  const supabasePromise = (async () => {
    try { return { ok: true as const, data: await supabaseFn() }; }
    catch (e) { return { ok: false as const, error: e }; }
  })();
  const d1Promise = (async () => {
    if (!ctx.d1) return { ok: false as const, error: new Error('no D1 binding') };
    try { return { ok: true as const, data: (await d1Fn(getD1Drizzle(ctx.d1))) as T }; }
    catch (e) { return { ok: false as const, error: e }; }
  })();
  const [supa, d1] = await Promise.all([supabasePromise, d1Promise]);
  result.db = supa;
  result.d1 = d1;
  if (!supa.ok) throw supa.error;
  if (!d1.ok) {
    console.warn('[dual-write] D1 mirror failed', {
      error: d1.error instanceof Error ? d1.error.message : String(d1.error) });
  }
  return result;
}

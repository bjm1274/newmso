// ============================================================
// lib/db/mirror.ts
// 일반화된 D1 미러 헬퍼 — Phase 2 dual-write 확장용.
//
// 사용 시점:
//   1) Supabase에 write 성공한 직후
//   2) 같은 row를 D1 테이블에도 INSERT/UPSERT
//
// DATA_BACKEND 모드:
//   - 'supabase'   : early-return, no-op
//   - 'dual-write' : 시도, 실패는 warn (Supabase가 진실원)
//   - 'd1'         : 실패는 throw (D1이 진실원)
//
// 호출 측 책임:
//   - row가 D1 컬럼 타입에 맞게 normalize되어 있어야 함
//     (jsonb → JSON.stringify, boolean → 0|1, 등)
//   - schema의 테이블 객체를 직접 전달 (타입 안전)
// ============================================================

import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getD1Binding, resolveDataBackend } from './get-binding';
import { getD1Drizzle } from './client-d1';

export interface MirrorOptions {
  /**
   * 충돌 처리 정책:
   *   'do_nothing' — ON CONFLICT DO NOTHING (멱등 미러에 적합)
   *   'throw'      — 충돌 시 throw (기본)
   */
  onConflict?: 'do_nothing' | 'throw';
  /**
   * 로그 식별자 — warn 메시지에 표시 ([mirror:audit_logs] 등)
   */
  label?: string;
}

/**
 * Supabase write 직후 D1에 INSERT/UPSERT 미러.
 *
 * 단일 row와 배열 모두 받음. 빈 배열이면 no-op.
 */
export async function mirrorRowsToD1<T extends SQLiteTable>(
  table: T,
  rows: T['$inferInsert'] | T['$inferInsert'][],
  options?: MirrorOptions,
): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return;

  const backend = await resolveDataBackend();
  if (backend === 'supabase') return;

  const label = options?.label ?? 'mirror';

  const d1 = await getD1Binding();
  if (!d1) {
    if (backend === 'd1') {
      throw new Error(`[${label}] DATA_BACKEND=d1 but DB binding not available`);
    }
    console.warn(`[${label}] dual-write skipped — D1 binding unavailable`);
    return;
  }

  try {
    const db = getD1Drizzle(d1);
    const query = options?.onConflict === 'do_nothing'
      ? db.insert(table).values(list as never).onConflictDoNothing()
      : db.insert(table).values(list as never);
    await query;
  } catch (err) {
    if (backend === 'd1') throw err;
    console.warn(`[${label}] D1 mirror failed`, {
      count: list.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

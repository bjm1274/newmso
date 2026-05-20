// ============================================================
// app/api/d1/mutate/route.ts
// Generic D1 INSERT / UPDATE / DELETE 엔드포인트.
//
// /api/d1/query (SELECT 전용)과 짝을 이루어 supabase.from() 호출의
// write 경로를 D1으로 라우팅. supabase-compatible 클라이언트 헬퍼가
// chained .insert / .update / .delete 호출 시 이 라우트로 fetch.
//
// 권한: 로그인 사용자 + POLICY_REGISTRY (Phase 4)로 op별 검증.
// 보안:
//   - ALLOWED_TABLES whitelist (POLICY_REGISTRY 등록 테이블만)
//   - 컬럼명/필드명 정규식 검증 (SQLi 차단)
//   - zod로 모든 입력 검증
//   - UPDATE/DELETE는 WHERE 절 필수 (전체 row 변경 금지)
//   - assertAccess로 각 op별 정책 검사
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, type SQL } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  assertAccess,
  PolicyDenied,
  PolicyMissing,
  POLICY_REGISTRY,
} from '@/lib/db';
import type { ErpClaims } from '@/lib/db/auth/claims';
import { JSON_COLUMNS } from '@/lib/db/json-columns';

export const dynamic = 'force-dynamic';

const ALLOWED_TABLES = new Set(Object.keys(POLICY_REGISTRY));
const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_ROWS_PER_INSERT = 100;

// RETURNING 컬럼 — 일반 컬럼명 또는 '*'(전체 컬럼). supabase .select('*') 호환.
const ReturningColSchema = z.string().refine((c) => c === '*' || COLUMN_RE.test(c), {
  message: 'invalid returning column',
});

const WhereSchema = z.object({
  field: z.string().regex(COLUMN_RE),
  op: z.enum(['eq', 'neq', 'in', 'lt', 'gt', 'lte', 'gte', 'is', 'isNot', 'like', 'ilike']),
  value: z.unknown(),
});

const InsertSchema = z.object({
  op: z.literal('insert'),
  table: z.string(),
  values: z.array(z.record(z.string().regex(COLUMN_RE), z.unknown())).min(1).max(MAX_ROWS_PER_INSERT),
  onConflict: z.enum(['ignore', 'replace']).optional(),
  conflict: z.object({
    columns: z.array(z.string().regex(COLUMN_RE)).min(1).max(8),
    action: z.enum(['update', 'ignore']),
  }).optional(),
  returning: z.array(ReturningColSchema).optional(),
});

const UpdateSchema = z.object({
  op: z.literal('update'),
  table: z.string(),
  set: z.record(z.string().regex(COLUMN_RE), z.unknown()),
  where: z.array(WhereSchema).min(1).max(20),
  returning: z.array(ReturningColSchema).optional(),
});

const DeleteSchema = z.object({
  op: z.literal('delete'),
  table: z.string(),
  where: z.array(WhereSchema).min(1).max(20),
});

const PayloadSchema = z.discriminatedUnion('op', [InsertSchema, UpdateSchema, DeleteSchema]);

type Payload = z.infer<typeof PayloadSchema>;

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

function buildClaimsFromSession(user: SessionUser | null | undefined): ErpClaims {
  if (!user) return {};
  const id = userId(user);
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  return {
    erp_staff_id: id,
    erp_company_id: (user.company_id as string | undefined) ?? null,
    erp_company_name: (user.company as string | undefined) ?? null,
    erp_department_name: (user.department as string | undefined) ?? null,
    erp_is_admin: Boolean(user.role === 'admin' || perms.admin || perms.mso),
    erp_can_manage_company: Boolean(perms.admin || perms.mso || perms.hr),
    erp_can_view_all_inventory_companies: Boolean(perms.admin || perms.mso),
    erp_can_manage_all_inventory_companies: Boolean(perms.admin || perms.mso),
    erp_can_view_all_department_inventory: Boolean(perms.admin || perms.mso || perms.hr),
    erp_can_manage_department_inventory: Boolean(perms.admin || perms.mso || perms.hr),
  };
}

function buildWhereSql(where: { field: string; op: string; value: unknown }[]): SQL[] {
  const out: SQL[] = [];
  for (const cond of where) {
    const col = sql.identifier(cond.field);
    if (cond.op === 'eq') out.push(sql`${col} = ${cond.value}`);
    else if (cond.op === 'neq') out.push(sql`${col} != ${cond.value}`);
    else if (cond.op === 'lt') out.push(sql`${col} < ${cond.value}`);
    else if (cond.op === 'gt') out.push(sql`${col} > ${cond.value}`);
    else if (cond.op === 'lte') out.push(sql`${col} <= ${cond.value}`);
    else if (cond.op === 'gte') out.push(sql`${col} >= ${cond.value}`);
    else if (cond.op === 'is') {
      if (cond.value === null) out.push(sql`${col} IS NULL`);
      else out.push(sql`${col} IS ${cond.value}`);
    } else if (cond.op === 'isNot') {
      if (cond.value === null) out.push(sql`${col} IS NOT NULL`);
      else out.push(sql`${col} IS NOT ${cond.value}`);
    } else if (cond.op === 'like' || cond.op === 'ilike') {
      out.push(sql`${col} LIKE ${cond.value}`);
    } else if (cond.op === 'in') {
      const arr = Array.isArray(cond.value) ? cond.value : [];
      if (arr.length === 0) out.push(sql`1 = 0`);
      else out.push(sql`${col} IN (${sql.join(arr.map((v) => sql`${v}`), sql`, `)})`);
    }
  }
  return out;
}

function whereToRowProxy(where: { field: string; op: string; value: unknown }[]): Record<string, unknown> {
  // assertAccess의 row 인자에 사용. eq 조건만 field=value로 사용.
  const proxy: Record<string, unknown> = {};
  for (const cond of where) {
    if (cond.op === 'eq') proxy[cond.field] = cond.value;
  }
  return proxy;
}

// ─────────────────────────────────────────────────────────────
// JSON 직렬화/역직렬화 헬퍼 (수정 2)
// ─────────────────────────────────────────────────────────────

/**
 * INSERT values / UPDATE set 에서 객체·배열 값을 JSON.stringify 로 변환.
 * D1(SQLite)은 객체/배열을 bound value로 처리하지 못하므로 TEXT로 직렬화.
 * null / 원시값(string, number, boolean)은 그대로 통과.
 */
function serializeRecord(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && typeof v === 'object') {
      result[k] = JSON.stringify(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * RETURNING 결과 행의 JSON 컬럼을 TEXT → 객체/배열로 역직렬화.
 * parse 실패 시 원본 문자열 유지 (graceful — JM3).
 */
function deserializeRow(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const jsonCols = JSON_COLUMNS[table];
  if (!jsonCols || jsonCols.length === 0) return row;
  const result: Record<string, unknown> = { ...row };
  for (const col of jsonCols) {
    const val = result[col];
    if (typeof val === 'string') {
      try {
        result[col] = JSON.parse(val);
      } catch {
        // parse 실패 → 원본 문자열 유지
      }
    }
  }
  return result;
}

function deserializeRows(
  table: string,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const jsonCols = JSON_COLUMNS[table];
  if (!jsonCols || jsonCols.length === 0) return rows;
  return rows.map((row) => deserializeRow(table, row));
}

function buildReturningSql(returning: string[] | undefined): SQL {
  if (!returning || returning.length === 0) return sql.raw('');
  if (returning.includes('*')) return sql` RETURNING *`;
  return sql` RETURNING ${sql.join(returning.map((c) => sql.identifier(c)), sql`, `)}`;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const payload: Payload = parsed.data;
    if (!ALLOWED_TABLES.has(payload.table)) {
      return NextResponse.json(
        { ok: false, error: `Table not allowed: ${payload.table}` },
        { status: 403 },
      );
    }
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);
    const claims = buildClaimsFromSession(session?.user);

    if (payload.op === 'insert') {
      // 각 row에 정책 검사
      for (const row of payload.values) {
        await assertAccess({ db, claims, table: payload.table, op: 'insert', row });
      }
      // 객체/배열 값을 D1 bound value로 전달 가능한 TEXT로 직렬화 (수정 2)
      const serializedValues = payload.values.map(serializeRecord);
      const tableSql = sql.identifier(payload.table);
      const allCols = Array.from(
        serializedValues.reduce<Set<string>>((acc, row) => {
          Object.keys(row).forEach((k) => acc.add(k));
          return acc;
        }, new Set()),
      );
      const colsSql = sql.join(allCols.map((c) => sql.identifier(c)), sql`, `);
      const valuesSql = sql.join(
        serializedValues.map((row) =>
          sql`(${sql.join(allCols.map((c) => sql`${row[c] ?? null}`), sql`, `)})`,
        ),
        sql`, `,
      );
      const returningSql = buildReturningSql(payload.returning);

      let stmt: SQL;
      if (payload.conflict) {
        // 복합 ON CONFLICT(...) DO UPDATE/NOTHING
        const conflictColsSql = sql.join(
          payload.conflict.columns.map((c) => sql.identifier(c)),
          sql`, `,
        );
        const conflictSet = new Set(payload.conflict.columns);
        const updateCols = allCols.filter((c) => !conflictSet.has(c));
        const shouldUpdate =
          payload.conflict.action === 'update' && updateCols.length > 0;
        const onConflictClause = shouldUpdate
          ? sql` ON CONFLICT(${conflictColsSql}) DO UPDATE SET ${sql.join(
              updateCols.map((c) => sql`${sql.identifier(c)} = excluded.${sql.identifier(c)}`),
              sql`, `,
            )}`
          : sql` ON CONFLICT(${conflictColsSql}) DO NOTHING`;
        stmt = sql`INSERT INTO ${tableSql} (${colsSql}) VALUES ${valuesSql}${onConflictClause}${returningSql}`;
      } else {
        // 기존 INSERT / INSERT OR REPLACE / INSERT OR IGNORE
        const verb = payload.onConflict === 'replace'
          ? sql.raw('INSERT OR REPLACE')
          : payload.onConflict === 'ignore'
            ? sql.raw('INSERT OR IGNORE')
            : sql.raw('INSERT');
        stmt = sql`${verb} INTO ${tableSql} (${colsSql}) VALUES ${valuesSql}${returningSql}`;
      }

      const result = await db.run(stmt);
      const rows = ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
      // RETURNING 결과의 JSON 컬럼 역직렬화 (수정 2)
      return NextResponse.json({ ok: true, data: deserializeRows(payload.table, rows) });
    }

    if (payload.op === 'update') {
      // where 조건의 eq 필드로 row proxy 만들고 정책 검사
      const row = { ...whereToRowProxy(payload.where), ...payload.set };
      await assertAccess({ db, claims, table: payload.table, op: 'update', row });
      // 객체/배열 값을 D1 bound value로 전달 가능한 TEXT로 직렬화 (수정 2)
      const serializedSet = serializeRecord(payload.set);
      const tableSql = sql.identifier(payload.table);
      const setKeys = Object.keys(serializedSet).filter((k) => COLUMN_RE.test(k));
      if (setKeys.length === 0) {
        return NextResponse.json({ ok: false, error: 'Empty set' }, { status: 400 });
      }
      const setSql = sql.join(
        setKeys.map((k) => sql`${sql.identifier(k)} = ${serializedSet[k] ?? null}`),
        sql`, `,
      );
      const whereParts = buildWhereSql(payload.where);
      const returningSql = buildReturningSql(payload.returning);
      const stmt = sql`UPDATE ${tableSql} SET ${setSql} WHERE ${sql.join(whereParts, sql` AND `)}${returningSql}`;
      if (payload.returning && payload.returning.length > 0) {
        const result = await db.run(stmt);
        const rows = ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
        // RETURNING 결과의 JSON 컬럼 역직렬화 (수정 2)
        return NextResponse.json({ ok: true, data: deserializeRows(payload.table, rows) });
      }
      await db.run(stmt);
      return NextResponse.json({ ok: true });
    }

    if (payload.op === 'delete') {
      const row = whereToRowProxy(payload.where);
      await assertAccess({ db, claims, table: payload.table, op: 'delete', row });
      const tableSql = sql.identifier(payload.table);
      const whereParts = buildWhereSql(payload.where);
      const stmt = sql`DELETE FROM ${tableSql} WHERE ${sql.join(whereParts, sql` AND `)}`;
      await db.run(stmt);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported op' }, { status: 400 });
  } catch (err) {
    if (err instanceof PolicyDenied || err instanceof PolicyMissing) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

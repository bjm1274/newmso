// ============================================================
// app/api/d1/query/route.ts
// Generic D1 SELECT 엔드포인트.
//
// 클라이언트가 supabase-like API로 호출하면 이 라우트가 D1 SQL을 생성·실행.
// SQL injection 방지를 위해 모든 입력은 zod로 검증 + ALLOWED_TABLES whitelist.
//
// 권한: 로그인 사용자 + POLICY_REGISTRY (Phase 4)로 SELECT 검증.
//
// 요청 형식:
//   POST /api/d1/query
//   body: { table, columns?, where?, order?, limit?, range?, single?, count?,
//           orFilters? }
//
//   orFilters?: FilterNode[]  — 각 원소가 OR 그룹. WHERE에 AND로 추가.
//
// 응답:
//   { ok: true, data: T[] | T | null, count?: number }
//   { ok: false, error: string, code?: string }
//
// Phase 6-A — supabase.from() 직접 호출을 D1으로 점진 이전.
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, type SQL } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  filterByPolicy,
  POLICY_REGISTRY,
} from '@/lib/db';
import type { ErpClaims } from '@/lib/db/auth/claims';
import {
  FilterNodeSchema,
  assertFilterTreeValid,
  type FilterNode,
} from '@/lib/d1-compat/filter';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// 허용 테이블 — POLICY_REGISTRY에 등록된 테이블만.
// 미등록 테이블은 default-deny.
// ─────────────────────────────────────────────────────────────
const ALLOWED_TABLES = new Set(Object.keys(POLICY_REGISTRY));

const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_LIMIT = 1000;

const WhereSchema = z.object({
  field: z.string().regex(COLUMN_RE),
  op: z.enum(['eq', 'neq', 'in', 'lt', 'gt', 'lte', 'gte', 'is', 'isNot', 'like', 'ilike']),
  value: z.unknown(),
});

const OrderSchema = z.object({
  field: z.string().regex(COLUMN_RE),
  ascending: z.boolean().optional(),
});

const PayloadSchema = z.object({
  table: z.string(),
  columns: z.array(z.string().regex(COLUMN_RE)).optional(),
  where: z.array(WhereSchema).max(20).optional(),
  orFilters: z.array(FilterNodeSchema).max(10).optional(),
  order: z.array(OrderSchema).max(5).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  range: z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }).optional(),
  single: z.boolean().optional(),
  maybeSingle: z.boolean().optional(),
  count: z.boolean().optional(),
});

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

function buildWhereSql(where: Payload['where']): SQL[] {
  if (!where || where.length === 0) return [];
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
    } else if (cond.op === 'like') {
      out.push(sql`${col} LIKE ${cond.value}`);
    } else if (cond.op === 'ilike') {
      // SQLite는 LIKE 기본 case-insensitive
      out.push(sql`${col} LIKE ${cond.value}`);
    } else if (cond.op === 'in') {
      const arr = Array.isArray(cond.value) ? cond.value : [];
      if (arr.length === 0) {
        out.push(sql`1 = 0`); // empty in → no match
      } else {
        out.push(sql`${col} IN (${sql.join(arr.map((v) => sql`${v}`), sql`, `)})`);
      }
    }
  }
  return out;
}

/**
 * FilterNode 트리를 재귀적으로 SQL로 변환.
 * 모든 값은 drizzle sql 템플릿 파라미터 바인딩으로 처리.
 */
function buildFilterNodeSql(node: FilterNode): SQL {
  if (node.kind === 'cond') {
    const col = sql.identifier(node.field);
    const { op, value } = node;
    if (op === 'eq') return sql`(${col} = ${value})`;
    if (op === 'neq') return sql`(${col} != ${value})`;
    if (op === 'lt') return sql`(${col} < ${value})`;
    if (op === 'gt') return sql`(${col} > ${value})`;
    if (op === 'lte') return sql`(${col} <= ${value})`;
    if (op === 'gte') return sql`(${col} >= ${value})`;
    if (op === 'is') {
      if (value === null) return sql`(${col} IS NULL)`;
      return sql`(${col} IS ${value})`;
    }
    if (op === 'isNot') {
      if (value === null) return sql`(${col} IS NOT NULL)`;
      return sql`(${col} IS NOT ${value})`;
    }
    if (op === 'like') return sql`(${col} LIKE ${value})`;
    if (op === 'ilike') return sql`(${col} LIKE ${value})`; // SQLite LIKE는 기본 CI
    if (op === 'in') {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) return sql`(1 = 0)`;
      return sql`(${col} IN (${sql.join(arr.map((v) => sql`${v}`), sql`, `)}))`;
    }
    // 미지원 op — 방어적으로 false 반환
    return sql`(1 = 0)`;
  }

  if (node.kind === 'and') {
    const parts = node.children.map(buildFilterNodeSql);
    return sql`(${sql.join(parts, sql` AND `)})`;
  }

  // kind === 'or'
  const parts = node.children.map(buildFilterNodeSql);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * orFilters 배열을 검증하고 WHERE 절에 추가할 SQL 조각 목록 반환.
 * 각 원소를 assertFilterTreeValid로 검증 후 buildFilterNodeSql로 변환.
 */
function buildOrFilterParts(orFilters: FilterNode[] | undefined): SQL[] {
  if (!orFilters || orFilters.length === 0) return [];
  return orFilters.map((node) => {
    assertFilterTreeValid(node); // 깊이/노드 수 초과 시 throw → 500 처리
    return buildFilterNodeSql(node);
  });
}

function buildSelectSql(payload: Payload): SQL {
  const tableSql = sql.identifier(payload.table);
  const colsSql = payload.columns && payload.columns.length > 0
    ? sql.join(payload.columns.map((c) => sql.identifier(c)), sql`, `)
    : sql.raw('*');
  const whereParts = [
    ...buildWhereSql(payload.where),
    ...buildOrFilterParts(payload.orFilters),
  ];
  const whereSql =
    whereParts.length > 0
      ? sql` WHERE ${sql.join(whereParts, sql` AND `)}`
      : sql.raw('');
  const orderSql =
    payload.order && payload.order.length > 0
      ? sql` ORDER BY ${sql.join(
          payload.order.map((o) =>
            o.ascending === false
              ? sql`${sql.identifier(o.field)} DESC`
              : sql`${sql.identifier(o.field)} ASC`,
          ),
          sql`, `,
        )}`
      : sql.raw('');
  const limitSql = payload.limit ? sql` LIMIT ${payload.limit}` : sql.raw('');
  const rangeSql = payload.range
    ? sql` LIMIT ${payload.range.to - payload.range.from + 1} OFFSET ${payload.range.from}`
    : sql.raw('');
  return sql`SELECT ${colsSql} FROM ${tableSql}${whereSql}${orderSql}${limitSql}${rangeSql}`;
}

function buildCountSql(payload: Payload): SQL {
  const tableSql = sql.identifier(payload.table);
  const whereParts = [
    ...buildWhereSql(payload.where),
    ...buildOrFilterParts(payload.orFilters),
  ];
  const whereSql =
    whereParts.length > 0
      ? sql` WHERE ${sql.join(whereParts, sql` AND `)}`
      : sql.raw('');
  return sql`SELECT COUNT(*) AS count FROM ${tableSql}${whereSql}`;
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

    const payload = parsed.data;
    if (!ALLOWED_TABLES.has(payload.table)) {
      return NextResponse.json(
        { ok: false, error: `Table not allowed: ${payload.table}` },
        { status: 403 },
      );
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json(
        { ok: false, error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const db = getD1Drizzle(d1);
    const claims = buildClaimsFromSession(session?.user);

    if (payload.count) {
      // 주의: COUNT(*)는 filterByPolicy를 거치지 않음 — PUBLIC 외 정책 테이블은
      // 사용자가 볼 수 없는 row까지 카운트될 수 있음(컷오버 전 정책 인식 카운트 보강 필요).
      const countResult = await db.run(buildCountSql(payload));
      const rows = ((countResult as { results?: unknown[] }).results ?? []) as Array<{ count: number }>;
      const count = rows[0]?.count ?? 0;
      return NextResponse.json({ ok: true, count });
    }

    const result = await db.run(buildSelectSql(payload));
    const rawRows = ((result as { results?: unknown[] }).results ?? []) as Array<Record<string, unknown>>;
    const filtered = await filterByPolicy(db, claims, payload.table, rawRows);

    if (payload.single) {
      if (filtered.length === 0) {
        return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, data: filtered[0] });
    }
    if (payload.maybeSingle) {
      return NextResponse.json({ ok: true, data: filtered[0] ?? null });
    }
    return NextResponse.json({ ok: true, data: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

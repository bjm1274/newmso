// ============================================================
// app/api/d1/query/route.ts
// Generic D1 SELECT 엔드포인트.
//
// 클라이언트가 db-like API로 호출하면 이 라우트가 D1 SQL을 생성·실행.
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
// Phase 6-A — db.from() 직접 호출을 D1으로 점진 이전.
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, type SQL } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  filterByPolicy,
  POLICY_REGISTRY } from '@/lib/db';
import type { ErpClaims } from '@/lib/db/auth/claims';
import {
  FilterNodeSchema,
  assertFilterTreeValid,
  type FilterNode } from '@/lib/d1-compat/filter';
import { JSON_COLUMNS } from '@/lib/db/json-columns';
import { consumeRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Rate limit: 분당 200회 per user
const D1_QUERY_RATE_LIMIT_MAX = 200;
const D1_QUERY_RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ─────────────────────────────────────────────────────────────
// 허용 테이블 — POLICY_REGISTRY에 등록된 테이블만.
// 미등록 테이블은 default-deny.
// ─────────────────────────────────────────────────────────────
const ALLOWED_TABLES = new Set(Object.keys(POLICY_REGISTRY));

const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_LIMIT = 1000;

// DDL(CREATE TABLE / INDEX / ALTER)은 핫패스에서 실행하지 않는다.
// disciplinary_committees·employment_contracts 스키마는 lib/db/migrations 로 적용됨.

const WhereSchema = z.object({
  field: z.string().regex(COLUMN_RE),
  op: z.enum(['eq', 'neq', 'in', 'lt', 'gt', 'lte', 'gte', 'is', 'isNot', 'like', 'ilike', 'contains']),
  value: z.unknown() });

const OrderSchema = z.object({
  field: z.string().regex(COLUMN_RE),
  ascending: z.boolean().optional(),
  nullsFirst: z.boolean().optional() });

const PayloadSchema = z
  .object({
    table: z.string(),
    columns: z.array(z.string().regex(COLUMN_RE)).optional(),
    where: z.array(WhereSchema).max(20).optional(),
    orFilters: z.array(FilterNodeSchema).max(10).optional(),
    order: z.array(OrderSchema).max(5).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    range: z
      .object({ from: z.number().int().min(0), to: z.number().int().min(0) })
      .refine((r) => r.to >= r.from, { message: 'range.to must be >= range.from' })
      .optional(),
    single: z.boolean().optional(),
    maybeSingle: z.boolean().optional(),
    count: z.boolean().optional() })
  // limit + range 동시 지정 시 range 우선(buildSelectSql). 상호배제 강제하지 않음.

type Payload = z.infer<typeof PayloadSchema>;

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  if (user.is_system_master === true || user.login_id === '9999' || user.employee_no === '9999') {
    return '9999';
  }
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
    erp_can_manage_department_inventory: Boolean(perms.admin || perms.mso || perms.hr) };
}

/**
 * D1(SQLite)은 boolean을 bound parameter로 받지 못한다(D1_TYPE_ERROR).
 * 클라이언트의 .eq('is_active', true) 같은 호출이 그대로 깨지므로,
 * SQL 바인딩 직전에 boolean → 정수(0/1)로 정규화한다. 배열(IN 절)도 원소별 변환.
 */
function normalizeBindValue(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  }
  return value;
}

function buildWhereSql(where: Payload['where']): SQL[] {
  if (!where || where.length === 0) return [];
  const out: SQL[] = [];
  for (const cond of where) {
    const col = sql.identifier(cond.field);
    const value = normalizeBindValue(cond.value);
    if (cond.op === 'eq') out.push(sql`${col} = ${value}`);
    else if (cond.op === 'neq') out.push(sql`${col} != ${value}`);
    else if (cond.op === 'lt') out.push(sql`${col} < ${value}`);
    else if (cond.op === 'gt') out.push(sql`${col} > ${value}`);
    else if (cond.op === 'lte') out.push(sql`${col} <= ${value}`);
    else if (cond.op === 'gte') out.push(sql`${col} >= ${value}`);
    else if (cond.op === 'is') {
      if (value === null) out.push(sql`${col} IS NULL`);
      else out.push(sql`${col} IS ${value}`);
    } else if (cond.op === 'isNot') {
      if (value === null) out.push(sql`${col} IS NOT NULL`);
      else out.push(sql`${col} IS NOT ${value}`);
    } else if (cond.op === 'like') {
      // ESCAPE '\' 선언 — 클라이언트가 사용자 입력의 %/_/\ 를 백슬래시로
      // 이스케이프(\%, \_, \\)해 보내면 리터럴로 매칭된다. 기존 패턴(이스케이프
      // 없는 %...%)은 동작 불변(무회귀).
      out.push(sql`${col} LIKE ${value} ESCAPE '\\'`);
    } else if (cond.op === 'ilike') {
      // SQLite는 LIKE 기본 case-insensitive
      out.push(sql`${col} LIKE ${value} ESCAPE '\\'`);
    } else if (cond.op === 'in') {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) {
        out.push(sql`1 = 0`); // empty in → no match
      } else {
        out.push(sql`${col} IN (${sql.join(arr.map((v) => sql`${v}`), sql`, `)})`);
      }
    } else if (cond.op === 'contains') {
      const jsonStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const literal = jsonStr.startsWith('[') && jsonStr.endsWith(']') ? jsonStr.slice(1, -1) : jsonStr;
      out.push(sql`${col} LIKE ${`%${literal}%`}`);
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
    const { op } = node;
    const value = normalizeBindValue(node.value);
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
    if (op === 'like') return sql`(${col} LIKE ${value} ESCAPE '\\')`;
    if (op === 'ilike') return sql`(${col} LIKE ${value} ESCAPE '\\')`; // SQLite LIKE는 기본 CI
    if (op === 'in') {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) return sql`(1 = 0)`;
      return sql`(${col} IN (${sql.join(arr.map((v) => sql`${v}`), sql`, `)}))`;
    }
    if (op === 'contains') {
      const jsonStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const literal = jsonStr.startsWith('[') && jsonStr.endsWith(']') ? jsonStr.slice(1, -1) : jsonStr;
      return sql`(${col} LIKE ${`%${literal}%`})`;
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

// ─────────────────────────────────────────────────────────────
// JSON 역직렬화 헬퍼 (수정 1)
// D1(SQLite)은 jsonb/배열 컬럼을 TEXT로 반환하므로, 클라이언트에
// 돌려주기 직전 JSON_COLUMNS 맵에 등록된 컬럼을 JSON.parse 한다.
// parse 실패 시 원본 문자열 유지 (graceful — JM3).
// ─────────────────────────────────────────────────────────────
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
    // null / 이미 객체/배열 → 그대로
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
          payload.order.map((o) => {
            const dir = o.ascending === false ? 'DESC' : 'ASC';
            const nulls =
              o.nullsFirst === true
                ? ' NULLS FIRST'
                : o.nullsFirst === false
                ? ' NULLS LAST'
                : '';
            return sql`${sql.identifier(o.field)} ${sql.raw(dir + nulls)}`;
          }),
          sql`, `,
        )}`
      : sql.raw('');
  const limitSql = payload.limit ? sql` LIMIT ${payload.limit}` : sql.raw('');
  const rangeSql = payload.range
    ? sql` LIMIT ${payload.range.to - payload.range.from + 1} OFFSET ${payload.range.from}`
    : sql.raw('');
  // range가 있으면 rangeSql만, 없으면 limitSql만 사용한다. 둘을 무조건 연결하면
  // `LIMIT a LIMIT b ...` 처럼 LIMIT 절이 중복돼 SQL이 깨진다. range가 limit보다 우선.
  const pageSql = payload.range ? rangeSql : limitSql;
  return sql`SELECT ${colsSql} FROM ${tableSql}${whereSql}${orderSql}${pageSql}`;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 분당 200회 per user (check+increment 원자적)
    const uid = userId(session?.user)!;
    const rateKey = `d1-query:${uid}`;
    const rate = await consumeRateLimit(rateKey, D1_QUERY_RATE_LIMIT_MAX, D1_QUERY_RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 잦습니다.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
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
      // count: limit/range 무시(전체 집계). PUBLIC/AUTHENTICATED/ADMIN 은
      // SQL COUNT(*) 한 번으로 처리해 전 행 메모리 로드(DoS)를 피한다.
      // 행 단위 정책(STAFF_IN_SCOPE 등)만 MAX_LIMIT 캡으로 근사 집계.
      const policy = POLICY_REGISTRY[payload.table];
      const selectPattern = policy?.select;
      const whereParts = [
        ...buildWhereSql(payload.where),
        ...buildOrFilterParts(payload.orFilters),
      ];
      const whereSql =
        whereParts.length > 0
          ? sql` WHERE ${sql.join(whereParts, sql` AND `)}`
          : sql.raw('');
      const tableSql = sql.identifier(payload.table);

      const canSqlCount =
        selectPattern === 'PUBLIC' ||
        selectPattern === 'AUTHENTICATED' ||
        selectPattern === 'ADMIN_ONLY' ||
        claims.erp_is_admin === true;

      if (canSqlCount) {
        if (selectPattern === 'AUTHENTICATED' && !claims.erp_staff_id && !claims.erp_is_admin) {
          return NextResponse.json({ ok: true, count: 0 });
        }
        if (selectPattern === 'ADMIN_ONLY' && !claims.erp_is_admin) {
          return NextResponse.json({ ok: true, count: 0 });
        }
        if (!policy && !claims.erp_is_admin) {
          return NextResponse.json({ ok: true, count: 0 });
        }
        const countResult = await db.run(
          sql`SELECT COUNT(*) AS cnt FROM ${tableSql}${whereSql}`,
        );
        const cntRows = ((countResult as { results?: Array<{ cnt?: number | string }> }).results ?? []);
        const cnt = Number(cntRows[0]?.cnt ?? 0);
        return NextResponse.json({ ok: true, count: Number.isFinite(cnt) ? cnt : 0 });
      }

      // 행 단위 정책: MAX_LIMIT 상한으로 메모리 적재 후 filterByPolicy
      const countPayload: Payload = {
        ...payload,
        columns: undefined,
        limit: MAX_LIMIT,
        range: undefined };
      const countResult = await db.run(buildSelectSql(countPayload));
      const rawRows = ((countResult as { results?: unknown[] }).results ?? []) as Array<Record<string, unknown>>;
      const filtered = await filterByPolicy(db, claims, payload.table, rawRows);
      return NextResponse.json({ ok: true, count: filtered.length });
    }

    // ─────────────────────────────────────────────────────────────
    // D1 바인딩 파라미터 한도(100) 초과 시 IN절 자동 청킹.
    // WHERE에 IN절이 있고 전체 파라미터가 100을 넘으면 IN절 값을 분할하여
    // 여러 쿼리로 실행한 뒤 결과를 합친다.
    // ─────────────────────────────────────────────────────────────
    const D1_MAX_PARAMS = 100;

    function countBindParams(p: Payload): number {
      let count = 0;
      for (const cond of p.where ?? []) {
        if (cond.op === 'in' && Array.isArray(cond.value)) {
          count += (cond.value as unknown[]).length;
        } else {
          count += 1;
        }
      }
      return count;
    }

    async function executeWithAutoChunk(p: Payload): Promise<Record<string, unknown>[]> {
      const totalParams = countBindParams(p);
      if (totalParams <= D1_MAX_PARAMS) {
        // 한도 이내 — 단일 쿼리 실행
        const result = await db.run(buildSelectSql(p));
        return ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
      }

      // IN절 중 가장 큰 것을 찾아 분할
      const inConditions = (p.where ?? [])
        .map((cond, idx) => ({ cond, idx }))
        .filter((c) => c.cond.op === 'in' && Array.isArray(c.cond.value));

      if (inConditions.length === 0) {
        // IN절이 없는데 파라미터가 많은 경우 — 그냥 실행 (에러는 caller에서 처리)
        const result = await db.run(buildSelectSql(p));
        return ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
      }

      // 가장 큰 IN절을 찾아 분할
      const largest = inConditions.reduce((a, b) =>
        (a.cond.value as unknown[]).length >= (b.cond.value as unknown[]).length ? a : b,
      );
      const otherParams = totalParams - (largest.cond.value as unknown[]).length;
      const chunkSize = Math.max(1, D1_MAX_PARAMS - otherParams);
      const fullArray = largest.cond.value as unknown[];

      const allRows: Record<string, unknown>[] = [];
      for (let i = 0; i < fullArray.length; i += chunkSize) {
        const chunk = fullArray.slice(i, i + chunkSize);
        const chunkedWhere = [...(p.where ?? [])];
        chunkedWhere[largest.idx] = { ...largest.cond, value: chunk };
        const chunkedPayload = { ...p, where: chunkedWhere };
        const result = await db.run(buildSelectSql(chunkedPayload));
        const rows = ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
        allRows.push(...rows);
      }
      return allRows;
    }

    const rawRows = await executeWithAutoChunk(payload);
    const filtered = await filterByPolicy(db, claims, payload.table, rawRows);
    // jsonb/배열 컬럼을 TEXT → 객체/배열로 역직렬화 (수정 1)
    const deserialized = deserializeRows(payload.table, filtered);

    if (payload.single) {
      if (deserialized.length === 0) {
        return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, data: deserialized[0] });
    }
    if (payload.maybeSingle) {
      return NextResponse.json({ ok: true, data: deserialized[0] ?? null });
    }
    return NextResponse.json({ ok: true, data: deserialized });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

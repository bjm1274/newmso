// ============================================================
// lib/d1-compat/filter.ts
// PostgREST 스타일 .or() 필터 문자열을 구조화된 트리(FilterNode)로 파싱.
//
// d1-db-compat(클라이언트)가 .or() 문자열을 parseOrFilter로 트리화해
// /api/d1/query로 전송하고, 서버 라우트가 FilterNodeSchema로 검증 후 SQL로
// 변환한다. 클라이언트·서버가 공유하는 단일 계약 파일.
//
// 지원 문법:
//   .or('a.eq.1,b.eq.2')                      → (a = 1 OR b = 2)
//   .or('a.lt.X,and(a.eq.X,id.lt.Y)')         → 중첩 and() 그룹
//   .or('file_url.not.is.null,c.ilike.%x%')   → not 수정자
// ============================================================
import { z } from 'zod';

export type FilterOp =
  | 'eq' | 'neq' | 'lt' | 'gt' | 'lte' | 'gte'
  | 'is' | 'isNot' | 'like' | 'ilike' | 'in';

export type FilterNode =
  | { kind: 'cond'; field: string; op: FilterOp; value: FilterValue }
  | { kind: 'and'; children: FilterNode[] }
  | { kind: 'or'; children: FilterNode[] };

export type FilterScalar = string | number | boolean | null;
export type FilterValue = FilterScalar | FilterScalar[];

const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const FILTER_MAX_DEPTH = 5;
export const FILTER_MAX_NODES = 60;
const FILTER_MAX_INPUT = 2000;

const FILTER_OPS: readonly FilterOp[] = [
  'eq', 'neq', 'lt', 'gt', 'lte', 'gte', 'is', 'isNot', 'like', 'ilike', 'in',
];

// ─────────────────────────────────────────────────────────────
// zod 스키마 — 서버 라우트가 신뢰할 수 없는 입력을 런타임 검증.
// ─────────────────────────────────────────────────────────────
const FilterScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const FilterValueSchema = z.union([FilterScalarSchema, z.array(FilterScalarSchema)]);

export const FilterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal('cond'),
      field: z.string().regex(COLUMN_RE),
      op: z.enum(['eq', 'neq', 'lt', 'gt', 'lte', 'gte', 'is', 'isNot', 'like', 'ilike', 'in']),
      value: FilterValueSchema }),
    z.object({
      kind: z.literal('and'),
      children: z.array(FilterNodeSchema).min(1).max(FILTER_MAX_NODES) }),
    z.object({
      kind: z.literal('or'),
      children: z.array(FilterNodeSchema).min(1).max(FILTER_MAX_NODES) }),
  ]),
);

// ─────────────────────────────────────────────────────────────
// 트리 구조 검증 — zod로는 깊이/총 노드 수를 제한할 수 없어 별도 가드.
// 서버 라우트가 SQL 생성 전 호출.
// ─────────────────────────────────────────────────────────────
export function assertFilterTreeValid(node: FilterNode): void {
  let count = 0;
  const walk = (n: FilterNode, depth: number): void => {
    if (depth > FILTER_MAX_DEPTH) throw new Error('Filter nesting too deep');
    count += 1;
    if (count > FILTER_MAX_NODES) throw new Error('Filter too large');
    if (n.kind === 'and' || n.kind === 'or') {
      for (const child of n.children) walk(child, depth + 1);
    }
  };
  walk(node, 1);
}

// ─────────────────────────────────────────────────────────────
// 파서 — PostgREST .or() 문자열 → FilterNode
// ─────────────────────────────────────────────────────────────

/** 괄호 깊이를 존중하며 최상위 콤마로 분리. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function parseScalar(raw: string): FilterScalar {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw) || /^-?\d+\.\d+$/.test(raw)) return Number(raw);
  // PostgREST는 특수문자 포함 값을 큰따옴표로 감쌈
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseLeaf(term: string): FilterNode {
  const dot1 = term.indexOf('.');
  if (dot1 < 0) throw new Error(`Invalid filter term: ${term}`);
  const field = term.slice(0, dot1);
  if (!COLUMN_RE.test(field)) throw new Error(`Invalid filter field: ${field}`);

  let rest = term.slice(dot1 + 1);
  let negate = false;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }

  const dot2 = rest.indexOf('.');
  if (dot2 < 0) throw new Error(`Invalid filter term: ${term}`);
  const opToken = rest.slice(0, dot2);
  const rawValue = rest.slice(dot2 + 1);

  if (opToken === 'is') {
    return { kind: 'cond', field, op: negate ? 'isNot' : 'is', value: parseScalar(rawValue) };
  }
  if (opToken === 'in') {
    if (negate) throw new Error('not.in is not supported');
    const inner = rawValue.startsWith('(') && rawValue.endsWith(')')
      ? rawValue.slice(1, -1)
      : rawValue;
    return { kind: 'cond', field, op: 'in', value: splitTopLevel(inner).map(parseScalar) };
  }
  if (!FILTER_OPS.includes(opToken as FilterOp)) {
    throw new Error(`Unsupported filter op: ${opToken}`);
  }

  let op = opToken as FilterOp;
  if (negate) {
    if (op === 'eq') op = 'neq';
    else if (op === 'neq') op = 'eq';
    else throw new Error(`not.${opToken} is not supported`);
  }
  return { kind: 'cond', field, op, value: parseScalar(rawValue) };
}

function parseTerm(term: string, depth: number): FilterNode {
  if (depth > FILTER_MAX_DEPTH) throw new Error('Filter nesting too deep');
  const t = term.trim();
  if (t.startsWith('and(') && t.endsWith(')')) {
    return { kind: 'and', children: parseList(t.slice(4, -1), depth + 1) };
  }
  if (t.startsWith('or(') && t.endsWith(')')) {
    return { kind: 'or', children: parseList(t.slice(3, -1), depth + 1) };
  }
  return parseLeaf(t);
}

function parseList(inner: string, depth: number): FilterNode[] {
  const terms = splitTopLevel(inner);
  if (terms.length === 0) throw new Error('Empty filter group');
  return terms.map((t) => parseTerm(t, depth));
}

/**
 * db `.or(input)`의 input 문자열을 OR 그룹 FilterNode로 파싱.
 * 잘못된 입력은 throw — 호출 측(QueryBuilder.or)에서 처리.
 */
export function parseOrFilter(input: string): FilterNode {
  if (input.length > FILTER_MAX_INPUT) throw new Error('Filter string too long');
  const node: FilterNode = { kind: 'or', children: parseList(input, 1) };
  assertFilterTreeValid(node);
  return node;
}

/**
 * d1-api-helpers — /api/d1/query · /api/d1/mutate 공용 헬퍼 (SSOT).
 *
 * userId / claims 빌드, bind value 정규화, WHERE SQL 생성.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { SessionUser } from '@/lib/server-session';
import type { ErpClaims } from '@/lib/db/auth/claims';

export function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  if (user.is_system_master === true || user.login_id === '9999' || user.employee_no === '9999') {
    return '9999';
  }
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

/** alias — 호출부 가독성용 */
export const userIdFromSession = userId;

/**
 * 타 직원의 인사 레코드를 다룰 수 있는 권한(관리자 또는 인사)인지.
 *
 * 판정 기준은 buildClaimsFromSession 의 erp_is_admin / erp_can_manage_company 와
 * 동일하게 유지할 것.
 */
export function hasStaffRecordScope(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  return Boolean(
    user.is_system_master ||
    user.role === 'admin' ||
    perms.admin ||
    perms.mso ||
    perms.system_master ||
    perms.hr,
  );
}

/**
 * 직원 단위 레코드(연차·근태·급여 등)에 접근할 자격이 있는지.
 *
 * 본인이면 허용, 아니면 hasStaffRecordScope 를 요구한다.
 * `staffId` 를 쿼리/바디로 받는 라우트에서 IDOR 을 막기 위한 SSOT.
 */
export function canAccessStaffRecord(
  user: SessionUser | null | undefined,
  targetStaffId: string | null | undefined,
): boolean {
  if (!user) return false;

  const target = String(targetStaffId ?? '').trim();
  if (!target) return false;

  const me = userId(user);
  if (me && me === target) return true;

  return hasStaffRecordScope(user);
}

/**
 * 재무 권한 보유 여부.
 *
 * 실제 권한 객체에는 bare `finance` 키가 없고 `finance_복식부기`·`finance_결산` 같은
 * 세부 키만 담기는 경우가 많다(lib/access-control.ts 의 FINANCE_* 매핑 참조).
 * bare 키만 검사하면 재무 담당자가 정책 레이어에서 계속 일반 직원으로 취급되므로,
 * `finance` 또는 `finance_*` 중 하나라도 true 면 재무 권한으로 본다.
 */
function hasFinancePermission(perms: Record<string, unknown>): boolean {
  if (perms.finance) return true;
  for (const [key, value] of Object.entries(perms)) {
    if (value && key.startsWith('finance_')) return true;
  }
  return false;
}

export function buildClaimsFromSession(user: SessionUser | null | undefined): ErpClaims {
  if (!user) return {};
  const id = userId(user);
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  return {
    erp_staff_id: id,
    erp_company_id: (user.company_id as string | undefined) ?? null,
    erp_company_name: (user.company as string | undefined) ?? null,
    erp_department_name: (user.department as string | undefined) ?? null,
    erp_is_admin: Boolean(user.is_system_master || user.role === 'admin' || perms.admin || perms.mso || perms.system_master),
    erp_can_manage_company: Boolean(perms.admin || perms.mso || perms.hr),
    erp_can_manage_finance: Boolean(perms.admin || perms.mso || hasFinancePermission(perms)),
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
export function normalizeBindValue(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  }
  return value;
}

export type WhereCond = { field: string; op: string; value: unknown };

/**
 * WHERE 조건 배열 → drizzle SQL 조각.
 * like/ilike 모두 ESCAPE '\' 적용 (query 경로의 더 완전한 처리 통합).
 */
export function buildWhereSql(where: WhereCond[] | undefined | null): SQL[] {
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

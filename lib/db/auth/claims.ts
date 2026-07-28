// ============================================================
// lib/db/auth/claims.ts
// RLS 헬퍼 7개의 TypeScript 포트.
//
// 원본 (Postgres SQL):
//   erp_claim_uuid / erp_claim_text / erp_claim_bool
//   erp_staff_id / erp_company_id / erp_company_name / erp_department_name
//   erp_is_admin / erp_can_manage_company / erp_can_view_all_department_inventory
//   erp_can_manage_department_inventory
//   erp_can_view_all_inventory_companies / erp_can_manage_all_inventory_companies
//   erp_company_matches / erp_company_name_matches
//   erp_target_staff_same_company / erp_target_staff_in_scope
//   erp_company_inventory_scope_matches / erp_inventory_scope_matches
//   erp_department_inventory_scope_matches
//   erp_is_roster_approver
//
// Postgres에서는 auth.jwt() ->> 'claim'으로 JWT claim을 직접 읽었음.
// D1에서는 JWT 검증을 앱 라우트(미들웨어/route handler)에서 수행하고,
// 결과 claim 객체를 명시적으로 전달. RLS 정책 자체가 사라지므로
// 호출자가 권한 검사를 잊지 않도록 명시적 API로 설계.
// ============================================================

import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import { staff_members } from '../schema';

// ─────────────────────────────────────────────────────────────
// Claim 객체 — JWT 디코드 결과를 그대로 보관
// ─────────────────────────────────────────────────────────────
export interface ErpClaims {
  erp_staff_id?: string | null;
  erp_company_id?: string | null;
  erp_company_name?: string | null;
  erp_department_name?: string | null;
  erp_is_admin?: boolean | null;
  erp_can_manage_company?: boolean | null;
  erp_can_view_all_department_inventory?: boolean | null;
  erp_can_manage_department_inventory?: boolean | null;
  erp_can_view_all_inventory_companies?: boolean | null;
  erp_can_manage_all_inventory_companies?: boolean | null;
  /** 재무 데이터(급여·정산·매출 등) 관리 권한 — admin/mso/finance */
  erp_can_manage_finance?: boolean;
}

// ─────────────────────────────────────────────────────────────
// 기본 캐스터 (erp_claim_uuid / erp_claim_text / erp_claim_bool)
// ─────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function claimUuid(claims: ErpClaims, key: keyof ErpClaims): string | null {
  const v = claims[key];
  if (typeof v !== 'string') return null;
  return UUID_RE.test(v.trim()) ? v.trim() : null;
}

export function claimText(claims: ErpClaims, key: keyof ErpClaims): string | null {
  const v = claims[key];
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

export function claimBool(claims: ErpClaims, key: keyof ErpClaims): boolean {
  const v = claims[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  return false;
}

// ─────────────────────────────────────────────────────────────
// 단순 접근자
// ─────────────────────────────────────────────────────────────
export const erpStaffId = (c: ErpClaims) => claimUuid(c, 'erp_staff_id');
export const erpCompanyId = (c: ErpClaims) => claimUuid(c, 'erp_company_id');
export const erpCompanyName = (c: ErpClaims) => claimText(c, 'erp_company_name');
export const erpDepartmentName = (c: ErpClaims) => claimText(c, 'erp_department_name');
export const erpIsAdmin = (c: ErpClaims) => claimBool(c, 'erp_is_admin');
export const erpCanManageCompany = (c: ErpClaims) => claimBool(c, 'erp_can_manage_company');
export const erpCanViewAllDepartmentInventory = (c: ErpClaims) =>
  claimBool(c, 'erp_can_view_all_department_inventory');
export const erpCanManageDepartmentInventory = (c: ErpClaims) =>
  claimBool(c, 'erp_can_manage_department_inventory');
export const erpCanViewAllInventoryCompanies = (c: ErpClaims) =>
  claimBool(c, 'erp_can_view_all_inventory_companies');
export const erpCanManageAllInventoryCompanies = (c: ErpClaims) =>
  claimBool(c, 'erp_can_manage_all_inventory_companies');

/**
 * 재무 데이터 관리 권한 (admin/mso/finance).
 * 관리자는 항상 포함한다.
 */
export function erpCanManageFinance(c: ErpClaims): boolean {
  return erpIsAdmin(c) || claimBool(c, 'erp_can_manage_finance');
}

// ─────────────────────────────────────────────────────────────
// 회사 단위 scope 검사
// ─────────────────────────────────────────────────────────────
export function erpCompanyMatches(c: ErpClaims, targetCompanyId: string | null): boolean {
  if (erpIsAdmin(c)) return true;
  const my = erpCompanyId(c);
  return my !== null && targetCompanyId !== null && my === targetCompanyId;
}

export function erpCompanyNameMatches(c: ErpClaims, targetCompanyName: string | null): boolean {
  if (erpIsAdmin(c)) return true;
  const my = erpCompanyName(c);
  const target = (targetCompanyName ?? '').trim();
  return my !== null && target !== '' && my.trim() === target;
}

// ─────────────────────────────────────────────────────────────
// 인벤토리 scope
// ─────────────────────────────────────────────────────────────
export function erpInventoryCompanyScopeMatches(
  c: ErpClaims,
  targetCompany: string | null,
  targetCompanyId: string | null,
): boolean {
  if (erpCanViewAllInventoryCompanies(c)) return true;
  const myId = erpCompanyId(c);
  if (myId !== null && targetCompanyId !== null && myId === targetCompanyId) return true;
  const myName = erpCompanyName(c);
  const target = (targetCompany ?? '').trim().toLowerCase();
  if (myName !== null && target !== '' && myName.toLowerCase() === target) return true;
  return false;
}

export function erpDepartmentInventoryScopeMatches(
  c: ErpClaims,
  targetCompany: string | null,
  targetCompanyId: string | null,
  targetDepartment: string | null,
): boolean {
  if (erpIsAdmin(c)) return true;
  const companyOk =
    erpCompanyMatches(c, targetCompanyId) ||
    erpCompanyNameMatches(c, targetCompany);
  if (!companyOk) return false;
  if (erpCanViewAllDepartmentInventory(c)) return true;
  const myDept = erpDepartmentName(c);
  const target = (targetDepartment ?? '').trim().toLowerCase();
  return myDept !== null && target !== '' && myDept.toLowerCase() === target;
}

export function erpInventoryScopeMatches(
  c: ErpClaims,
  targetCompany: string | null,
  targetCompanyId: string | null,
  targetDepartment: string | null,
): boolean {
  if (erpCanViewAllInventoryCompanies(c)) return true;
  if (!erpInventoryCompanyScopeMatches(c, targetCompany, targetCompanyId)) return false;
  if (erpCanViewAllDepartmentInventory(c)) return true;
  const target = (targetDepartment ?? '').trim();
  if (target === '') return true; // 원본: target_department가 null/빈 값이면 통과
  const myDept = erpDepartmentName(c);
  return myDept !== null && myDept.toLowerCase() === target.toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// 직원 단위 scope — DB 조회 필요
// ─────────────────────────────────────────────────────────────

/**
 * erp_target_staff_same_company — 대상 staff가 내 회사 소속인지 확인.
 * D1 조회 1건 발생.
 */
export async function erpTargetStaffSameCompany(
  db: D1Client,
  c: ErpClaims,
  targetStaffId: string,
): Promise<boolean> {
  // 회사 판정은 UUID(company_id) 우선, 없으면 **회사명(company)** 으로 폴백한다.
  //
  // company_id 로만 비교하던 시절에는, 실데이터에서 staff_members.company_id 가
  // 대부분 비어 있어(프로덕션 실측 재직 45명 중 34명 NULL) 인사담당자(perms.hr)가
  // 인사발령·건강검진·조퇴·연차촉진 목록에서 본인 행 외에 거의 아무것도 못 봤다.
  // 이 시스템은 회사를 이름 문자열로 다루는 곳이 많아 UUID 단독 판정은 성립하지 않는다.
  const myId = erpCompanyId(c);
  const myName = erpCompanyName(c);
  if (myId === null && myName === null) return false;

  const rows = await db
    .select({ company_id: staff_members.company_id, company: staff_members.company })
    .from(staff_members)
    .where(eq(staff_members.id, targetStaffId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;

  if (myId !== null && row.company_id != null && String(row.company_id) === myId) return true;
  if (myName !== null && row.company != null) {
    return String(row.company).trim() === myName.trim();
  }
  return false;
}

/**
 * erp_target_staff_in_scope — 본인 / 본인 회사 / 관리자 권한 셋 중 하나.
 */
export async function erpTargetStaffInScope(
  db: D1Client,
  c: ErpClaims,
  targetStaffId: string,
): Promise<boolean> {
  if (erpIsAdmin(c)) return true;
  if (targetStaffId === erpStaffId(c)) return true;
  if (!erpCanManageCompany(c)) return false;
  return erpTargetStaffSameCompany(db, c, targetStaffId);
}

/**
 * D1 은 쿼리 1건당 bound parameter 100개 제한이 있다.
 * IN 목록만으로 100개를 채우기 위해 회사 비교는 SQL 이 아니라 JS 에서 수행한다.
 */
const STAFF_SCOPE_CHUNK_SIZE = 100;

/**
 * 여러 직원 id 를 한 번에 스코프 판정. erpTargetStaffInScope 의 배치 버전.
 *
 * 판정 규칙은 erpTargetStaffInScope / erpTargetStaffSameCompany 와 동일:
 *   - admin 이면 전부 허용
 *   - 본인 id 는 항상 허용
 *   - erpCanManageCompany 가 false 면 본인 것만 허용
 *   - true 면 내 회사(erp_company_id, UUID)와 staff_members.company_id 가
 *     일치하고 NULL 이 아닌 대상만 허용
 *
 * 행마다 쿼리하는 대신 최대 100개씩 IN 으로 묶어 조회한다.
 * 반환: 접근 가능한 staffId 집합 (입력에 없던 id 는 포함되지 않음)
 */
export async function erpTargetStaffInScopeBatch(
  db: D1Client,
  c: ErpClaims,
  targetStaffIds: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (!Array.isArray(targetStaffIds) || targetStaffIds.length === 0) return allowed;

  // 중복 제거 (원본 문자열 그대로 — 단건 버전이 trim 하지 않으므로 동일하게 유지)
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of targetStaffIds) {
    if (typeof raw !== 'string' || raw === '') continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    unique.push(raw);
  }
  if (unique.length === 0) return allowed;

  // admin — 전부 허용
  if (erpIsAdmin(c)) {
    for (const id of unique) allowed.add(id);
    return allowed;
  }

  // 본인은 항상 허용
  const me = erpStaffId(c);
  if (me !== null && seen.has(me)) allowed.add(me);

  if (!erpCanManageCompany(c)) return allowed;

  // erpTargetStaffSameCompany 와 동일한 판정 — UUID 우선, 없으면 회사명 폴백.
  // (실데이터의 company_id 대부분이 비어 있어 UUID 단독으로는 회사 확장이 성립하지 않는다.)
  const myId = erpCompanyId(c);
  const myName = erpCompanyName(c);
  if (myId === null && myName === null) return allowed;
  const myNameTrimmed = myName === null ? null : myName.trim();

  const pending = unique.filter((id) => !allowed.has(id));
  for (let i = 0; i < pending.length; i += STAFF_SCOPE_CHUNK_SIZE) {
    const chunk = pending.slice(i, i + STAFF_SCOPE_CHUNK_SIZE);
    const rows = await db
      .select({
        id: staff_members.id,
        company_id: staff_members.company_id,
        company: staff_members.company })
      .from(staff_members)
      .where(inArray(staff_members.id, chunk));
    for (const row of rows) {
      if (myId !== null && row.company_id != null && String(row.company_id) === myId) {
        allowed.add(row.id);
        continue;
      }
      if (myNameTrimmed !== null && row.company != null && String(row.company).trim() === myNameTrimmed) {
        allowed.add(row.id);
      }
    }
  }
  return allowed;
}

/**
 * erp_is_roster_approver — 근무표 결재자 권한.
 * 원본 SQL이 staff_members에서 role/position/company 조합을 검사하므로 DB 조회.
 */
export async function erpIsRosterApprover(
  db: D1Client,
  c: ErpClaims,
): Promise<boolean> {
  if (erpIsAdmin(c)) return true;
  const me = erpStaffId(c);
  if (me === null) return false;
  const rows = await db
    .select({
      role: staff_members.role,
      position: staff_members.position,
      company: staff_members.company })
    .from(staff_members)
    .where(eq(staff_members.id, me))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  const role = (row.role ?? '').trim();
  const position = (row.position ?? '').trim();
  const company = (row.company ?? '').trim();
  if (role === 'admin' || role === 'master') return true;
  if (position === '총무부장' || position === '이사') return true;
  if (company === 'SY INC.' && position === '이사') return true;
  return false;
}

// ============================================================
// lib/db/auth/policies.ts
// 186개 RLS 정책을 5가지 패턴으로 분류 후 앱 권한 검사로 이식.
//
// 분류 결과:
//   - PUBLIC               : 16개 (FOR ALL USING (true)) — 인증된 사용자 누구나
//   - SELF_ONLY            : 본인 row만 (staff_id = erp_staff_id())
//   - SELF_OR_SAME_COMPANY : 본인 + 같은 회사 관리자 + 시스템 관리자
//   - STAFF_IN_SCOPE       : erp_target_staff_in_scope(staff_id) 동등
//   - INVENTORY_SCOPE      : 인벤토리 회사/부서 scope
//
// 정책별 매핑은 POLICY_REGISTRY에 누적. 175개를 한 번에 다 옮기지 않고
// 각 API 라우트에서 사용하는 테이블만 점진적으로 추가 → JM2 (불필요한
// 검사 회피) 원칙 준수.
//
// 사용 예 (API route):
//   import { assertCanRead, assertCanWrite } from '@/lib/db/auth/policies';
//   await assertCanRead({ table: 'leave_requests', row, claims });
//   await assertCanWrite({ table: 'leave_requests', op: 'insert', row, claims });
// ============================================================

import type { D1Client } from '../client-d1';
import {
  type ErpClaims,
  erpIsAdmin,
  erpStaffId,
  erpCanManageCompany,
  erpCompanyMatches,
  erpInventoryScopeMatches,
  erpTargetStaffInScope,
} from './claims';

// ─────────────────────────────────────────────────────────────
// 정책 패턴
// ─────────────────────────────────────────────────────────────
export type PolicyPattern =
  | 'PUBLIC'
  | 'SELF_ONLY'
  | 'SELF_OR_SAME_COMPANY'
  | 'STAFF_IN_SCOPE'
  | 'INVENTORY_SCOPE';

export type Op = 'select' | 'insert' | 'update' | 'delete';

/**
 * 한 테이블의 정책 — op별로 다른 패턴을 허용. 원본 RLS도 op별로 분리되어 있었음.
 *
 * staffIdField  : SELF_ONLY / STAFF_IN_SCOPE / SELF_OR_SAME_COMPANY 패턴에서
 *                 row의 어느 필드를 'staff_id'로 볼지 (기본 'staff_id')
 * companyIdField: SELF_OR_SAME_COMPANY 패턴에서 회사 id 필드 (기본 'company_id')
 * inventoryFields: INVENTORY_SCOPE 패턴에서 사용할 필드 매핑
 */
export interface TablePolicy {
  table: string;
  select?: PolicyPattern;
  insert?: PolicyPattern;
  update?: PolicyPattern;
  delete?: PolicyPattern;
  staffIdField?: string;
  companyIdField?: string;
  inventoryFields?: {
    company?: string;
    company_id?: string;
    department?: string;
  };
}

// ─────────────────────────────────────────────────────────────
// 정책 레지스트리 — 패턴화된 정책만 등록.
// FOR ALL USING (true) 정책은 PUBLIC, 누락된 테이블은 admin-only로 안전 폴백.
// ─────────────────────────────────────────────────────────────
export const POLICY_REGISTRY: Record<string, TablePolicy> = {
  push_subscriptions: {
    table: 'push_subscriptions',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_ONLY', // erp_is_admin OR staff_id = erp_staff_id (admin은 패턴 내부에서 처리)
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
  },
  notifications: {
    table: 'notifications',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id',
  },
  attendance: {
    table: 'attendance',
    select: 'STAFF_IN_SCOPE',
    insert: 'STAFF_IN_SCOPE',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY',
  },
  attendances: {
    table: 'attendances',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'SELF_OR_SAME_COMPANY',
  },
  leave_requests: {
    table: 'leave_requests',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'SELF_OR_SAME_COMPANY',
  },
  // 'Public Access *' FOR ALL USING (true) 패턴
  staff_members: { table: 'staff_members', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  companies: { table: 'companies', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  board_posts: { table: 'board_posts', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  daily_closures: { table: 'daily_closures', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  system_configs: { table: 'system_configs', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  work_shifts: { table: 'work_shifts', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  contract_templates: { table: 'contract_templates', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  employment_contracts: { table: 'employment_contracts', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  staff_evaluations: { table: 'staff_evaluations', select: 'PUBLIC', insert: 'PUBLIC', update: 'PUBLIC', delete: 'PUBLIC' },
  inventory: {
    table: 'inventory',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    update: 'INVENTORY_SCOPE',
    delete: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' },
  },
};

// ─────────────────────────────────────────────────────────────
// 패턴 평가
// ─────────────────────────────────────────────────────────────
function getField<T>(row: Record<string, unknown>, field: string): T | null {
  const v = row[field];
  return (v ?? null) as T | null;
}

async function evalPattern(
  pattern: PolicyPattern,
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
  cfg: TablePolicy,
): Promise<boolean> {
  if (pattern === 'PUBLIC') return true;
  if (erpIsAdmin(claims)) return true;

  const staffField = cfg.staffIdField ?? 'staff_id';
  const companyField = cfg.companyIdField ?? 'company_id';

  if (pattern === 'SELF_ONLY') {
    const rowStaff = getField<string>(row, staffField);
    return rowStaff !== null && rowStaff === erpStaffId(claims);
  }

  if (pattern === 'SELF_OR_SAME_COMPANY') {
    const rowStaff = getField<string>(row, staffField);
    if (rowStaff !== null && rowStaff === erpStaffId(claims)) return true;
    if (!erpCanManageCompany(claims)) return false;
    return erpCompanyMatches(claims, getField<string>(row, companyField));
  }

  if (pattern === 'STAFF_IN_SCOPE') {
    const rowStaff = getField<string>(row, staffField);
    if (rowStaff === null) return false;
    return erpTargetStaffInScope(db, claims, rowStaff);
  }

  if (pattern === 'INVENTORY_SCOPE') {
    const f = cfg.inventoryFields ?? {};
    return erpInventoryScopeMatches(
      claims,
      getField<string>(row, f.company ?? 'company'),
      getField<string>(row, f.company_id ?? 'company_id'),
      getField<string>(row, f.department ?? 'department'),
    );
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// 외부 API
// ─────────────────────────────────────────────────────────────

export class PolicyDenied extends Error {
  constructor(table: string, op: Op) {
    super(`policy denied: ${op} ${table}`);
    this.name = 'PolicyDenied';
  }
}

export class PolicyMissing extends Error {
  constructor(table: string, op: Op) {
    super(`policy not registered: ${op} ${table} — default deny`);
    this.name = 'PolicyMissing';
  }
}

export interface PolicyCheckArgs {
  db: D1Client;
  claims: ErpClaims;
  table: string;
  op: Op;
  row: Record<string, unknown>;
}

/**
 * 단일 row가 정책을 통과하는지 검사. 통과하지 못하면 false.
 * 등록되지 않은 테이블은 default deny (관리자만 허용).
 */
export async function canAccess(args: PolicyCheckArgs): Promise<boolean> {
  const cfg = POLICY_REGISTRY[args.table];
  if (!cfg) return erpIsAdmin(args.claims); // default deny
  const pattern = cfg[args.op];
  if (!pattern) return erpIsAdmin(args.claims);
  return evalPattern(pattern, args.db, args.claims, args.row, cfg);
}

/**
 * 정책 위반이면 throw — API 라우트에서 한 줄로 가드.
 */
export async function assertAccess(args: PolicyCheckArgs): Promise<void> {
  const cfg = POLICY_REGISTRY[args.table];
  if (!cfg) {
    if (!erpIsAdmin(args.claims)) throw new PolicyMissing(args.table, args.op);
    return;
  }
  const ok = await canAccess(args);
  if (!ok) throw new PolicyDenied(args.table, args.op);
}

/**
 * 여러 row를 일괄 필터링 — SELECT 결과를 RLS처럼 적용.
 */
export async function filterByPolicy<T extends Record<string, unknown>>(
  db: D1Client,
  claims: ErpClaims,
  table: string,
  rows: T[],
): Promise<T[]> {
  const cfg = POLICY_REGISTRY[table];
  if (!cfg || !cfg.select) return erpIsAdmin(claims) ? rows : [];
  if (cfg.select === 'PUBLIC') return rows;
  if (erpIsAdmin(claims)) return rows;

  const out: T[] = [];
  for (const row of rows) {
    const ok = await evalPattern(cfg.select, db, claims, row, cfg);
    if (ok) out.push(row);
  }
  return out;
}

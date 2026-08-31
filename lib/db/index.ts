// ============================================================
// lib/db/index.ts
// Drizzle ORM 메인 entry
//
// 사용 예:
//   // 서버 라우트 (Workers env 사용 가능)
//   import { getD1Drizzle, staff_members, eq } from '@/lib/db';
//   const db = getD1Drizzle(ctx.env.DB);
//   const rows = await db.select().from(staff_members).where(eq(staff_members.id, id));
// ============================================================

export * from './schema';
export * from './relations';
export * from './types';

// Workers 환경 (D1)
export { getD1Drizzle } from './client-d1';
export type { D1Client } from './client-d1';

// Next.js API route용 D1/SQLite 통합 binding 헬퍼
export { getD1Binding, resolveDataBackend } from './get-binding';

// Phase 2 — 일반화된 D1 미러 헬퍼 (테이블별 dual-write 확장용)
export { mirrorRowsToD1, type MirrorOptions } from './mirror';

// Phase 3-B — D1 미러 실패 구조화 로깅
export {
  logD1MirrorFailure,
  logD1BindingMissing,
  type MirrorFailureContext } from './mirror-metrics';

// Phase 1D — Postgres 함수의 TS 포트
export {
  registerStaffFull,
  type RegisterStaffInput,
  type RegisterStaffResult,
  type StaffRow,
  type LicenseRow,
  type JobCategoryRow,
  type ShiftAssignmentRow } from './functions/staff';
export {
  atomicStockUpdate,
  atomicStockConsumeWithLog,
  syncInventoryNameStock,
  StockError,
  type StockUpdateResult } from './functions/inventory';
export {
  incrementAnnualLeaveUsed,
  incrementPostViews,
  cleanupChatMessagesByRetention } from './functions/counters';
export {
  updateChatRoomLastMessage,
  refreshChatRoomLastMessage,
  withUpdatedAt,
  nowSqlite } from './functions/triggers';

// Phase 1E — RLS 헬퍼·정책 wrapper
export {
  type ErpClaims,
  claimUuid, claimText, claimBool,
  erpStaffId, erpCompanyId, erpCompanyName, erpDepartmentName,
  erpIsAdmin, erpCanManageCompany,
  erpCanViewAllDepartmentInventory, erpCanManageDepartmentInventory,
  erpCanViewAllInventoryCompanies, erpCanManageAllInventoryCompanies,
  erpCanManageFinance,
  erpCompanyMatches, erpCompanyNameMatches,
  erpInventoryCompanyScopeMatches, erpDepartmentInventoryScopeMatches,
  erpInventoryScopeMatches,
  erpTargetStaffSameCompany, erpTargetStaffInScope, erpTargetStaffInScopeBatch,
  erpIsRosterApprover } from './auth/claims';
export {
  canAccess,
  assertAccess,
  filterByPolicy,
  POLICY_REGISTRY,
  PolicyDenied,
  PolicyMissing,
  STAFF_SECRET_ALWAYS_COLUMNS,
  STAFF_PII_SENSITIVE_COLUMNS,
  type PolicyPattern,
  type TablePolicy,
  type Op,
  type PolicyCheckArgs } from './auth/policies';

// 로컬·스크립트 환경 (better-sqlite3)는 직접 경로로 import:
//   import { getLocalDrizzle } from '@/lib/db/client-local';
// (Workers 번들에 better-sqlite3가 포함되지 않게 분리)

// Drizzle 표현식·연산자 재export
export {
  sql, eq, ne, gt, gte, lt, lte,
  and, or, not, inArray, notInArray,
  like, ilike, notLike,
  isNull, isNotNull,
  desc, asc,
  between, notBetween,
  exists, notExists,
  sum, count, avg, min, max } from 'drizzle-orm';

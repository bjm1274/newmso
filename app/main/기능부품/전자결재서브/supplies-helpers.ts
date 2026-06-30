/**
 * 비품구매양식 공용 헬퍼 / 타입 / 상수
 *
 * - 비즈니스 로직과 무관하게, 화면 도구·기본값·정규화 함수만 모음.
 * - JM 규율: 한 파일 = 한 책임. 타입과 가벼운 순수 함수만.
 * - JM4: any 금지. 외부 입력은 unknown으로 받아 안전 파싱.
 */

import {
  normalizeInventoryUnit,
  normalizeSupplyRequestCategory,
  type SupplyRequestCategory,
  type SupplyRequestItemUnit } from '@/app/main/inventory-utils';

// 표·드롭다운에서 노출되는 카테고리/단위는 inventory-utils의 좁은 union을 기준으로 한다.
// 새 양식(2026-05-18) 사양은 더 넓은 카테고리·단위를 요구하나, ledger·검증 로직이
// 기존 union에 묶여 있으므로 호환을 위해 union을 그대로 사용한다.
export type {
  SupplyRequestCategory,
  SupplyRequestItemUnit };

export type InventoryCatalogItem = {
  name: string;
  stock: number;
  min_stock: number;
  unit: SupplyRequestItemUnit;
  spec: string;
  category: SupplyRequestCategory | '';
};

export type SupplyRow = {
  name: string;
  qty: number;
  unit: SupplyRequestItemUnit;
  currentStock: number | null;
  category: SupplyRequestCategory | '';
  purpose: string;
  suggestions: InventoryCatalogItem[];
};

export type DropdownPosition = { top: number; left: number; width: number };

export const MONTHLY_STATS_VISIBLE_LIMIT = 8;
export const MONTHLY_STATS_FETCH_LIMIT = 200;

/** 신청 수량은 1 이상 정수 보장. */
export function sanitizeQuantity(value: unknown): number {
  return Math.max(1, Number(value) || 1);
}

/** 비교 키는 trim + 소문자. */
export function normalizeInventoryKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** 신청 행 기본값. partial override로 카드 선택 시 빠르게 채우기. */
export function defaultRow(
  overrides: Partial<Omit<SupplyRow, 'suggestions'>> = {},
): SupplyRow {
  return {
    name: '',
    qty: 1,
    unit: 'EA',
    currentStock: null,
    category: '',
    purpose: '',
    suggestions: [],
    ...overrides };
}

/** unknown 입력을 안전하게 SupplyRow로. (임시저장 복원·외부 데이터 진입점) */
export function buildRowFromUnknown(input: unknown): SupplyRow {
  const row = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return defaultRow({
    name: String(row.name || row.item_name || '').trim(),
    qty: sanitizeQuantity(row.qty || row.quantity),
    unit: normalizeInventoryUnit(row.unit),
    currentStock: row.currentStock == null ? null : Number(row.currentStock) || 0,
    category: normalizeSupplyRequestCategory(
      row.category || row.item_category || row.classification,
    ),
    purpose: String(row.purpose || row.reason || '').trim() });
}

/** 빈 마지막 행을 통계 카드 추가 시 보존하기 위한 의미 판단. */
export function hasMeaningfulRow(row: SupplyRow): boolean {
  return Boolean(
    row.name.trim() ||
      row.category.trim() ||
      row.purpose.trim() ||
      row.qty > 1,
  );
}

// --- inventory row 접근자 (Supabase 응답 형태 변동성 흡수) ---
type LooseRecord = Record<string, unknown>;

function asRecord(input: unknown): LooseRecord {
  return input && typeof input === 'object' ? (input as LooseRecord) : {};
}

export function getInventoryItemName(row: unknown): string {
  const record = asRecord(row);
  return String(record.item_name || record.name || '').trim();
}

export function getInventoryStock(row: unknown): number {
  const record = asRecord(row);
  return Number(record.quantity ?? record.stock ?? 0) || 0;
}

export function getInventoryMinStock(row: unknown): number {
  const record = asRecord(row);
  return Number(record.min_quantity ?? record.min_stock ?? 0) || 0;
}

export function getInventoryUnit(row: unknown): SupplyRequestItemUnit {
  const record = asRecord(row);
  return normalizeInventoryUnit(record.unit);
}

export function getInventorySpec(row: unknown): string {
  const record = asRecord(row);
  return String(record.spec || '').trim();
}

export function getInventoryCompany(row: unknown): string {
  const record = asRecord(row);
  return String(record.company || record.company_name || '').trim();
}

export function getInventoryDepartment(row: unknown): string {
  const record = asRecord(row);
  return String(record.department || record.team || record.dept || '').trim();
}

/**
 * 재고 chip 단계 — 지시서 §3-5: 0 → danger / ≤3 → warn / 그 외 → muted.
 * null(미파악)은 'empty'.
 */
export type StockTone = 'empty' | 'danger' | 'warn' | 'normal';
export function getStockTone(stock: number | null): StockTone {
  if (stock === null) return 'empty';
  if (stock <= 0) return 'danger';
  if (stock <= 3) return 'warn';
  return 'normal';
}

/** 본사·소속 부서 기준 라벨. 안내 문구를 한 곳에서 만든다. */
export function buildInventoryLabel(company: string, department: string): string {
  const parts = [company.trim(), department.trim()].filter(Boolean);
  return parts.length > 0 ? `${parts.join(' ')} 재고 기준` : '소속 부서 재고 기준';
}

/** 임시저장 시각 HH:MM (간단 표시용). */
export function formatDraftTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

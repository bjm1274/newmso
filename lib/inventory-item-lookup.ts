/**
 * 발주 라인의 품명 → inventory.id 해석 (회사 스코프 강제)
 *
 * 예전에는 po-receive / po-inspect 가 각자 `SELECT id, item_name, name FROM inventory LIMIT 5000`
 * 을 회사 조건 없이 통째로 읽고 JS `find` 로 이름이 처음 일치하는 행을 골랐다.
 * 그래서 타사에 같은 품명(거즈·주사기 같은 공통 소모품)이 있고 그 행이 앞에 오면
 * 자사 품목이 멀쩡히 존재해도 타사 itemId 로 해석됐고, 바로 다음 줄의
 * `assertInventoryItemCompanyScope` 가 403 을 던져 입고/검수 전체가 막혔다
 * (8차 D07-006 실측: 자사·타사 동명 2행 상태에서 입고가 403 으로 실패).
 * 게다가 LIMIT 5000 은 품목이 늘면 조용히 잘려 "있는데 없다"는 오류원이 된다.
 *
 * 조회 자체에 회사 조건을 걸고, 동명 다건이면 임의로 첫 행을 고르지 않고
 * 명시적으로 itemId 를 요구한다.
 */
import { and, eq, or, sql } from 'drizzle-orm';
import type { D1Client } from '@/lib/db/client-d1';
import { inventory } from '@/lib/db/schema';

export type ItemLookupResult =
  | { ok: true; itemId: string }
  | { ok: false; code: 'NO_COMPANY_SCOPE' | 'ITEM_NOT_FOUND' | 'AMBIGUOUS_ITEM'; error: string };

export async function resolveInventoryItemIdByName(
  db: D1Client,
  itemName: string,
  scope: { company?: string | null; companyId?: string | null },
): Promise<ItemLookupResult> {
  const key = String(itemName || '').trim().toLowerCase();
  const company = String(scope.company || '').trim();
  const companyId = String(scope.companyId || '').trim();

  if (!key) {
    return { ok: false, code: 'ITEM_NOT_FOUND', error: '품목명이 비어 있습니다.' };
  }
  if (!company && !companyId) {
    // 회사를 특정할 수 없으면 전사 검색으로 폴백하지 않는다 — 그 폴백이 D07-006 의 원인이었다.
    return {
      ok: false,
      code: 'NO_COMPANY_SCOPE',
      error: `품목 조회 회사를 특정할 수 없습니다: ${itemName}. 품목을 직접 지정(itemId)해 주세요.`,
    };
  }

  const scopeConds = [
    ...(company ? [eq(inventory.company, company)] : []),
    ...(companyId ? [eq(inventory.company_id, companyId)] : []),
  ];

  const rows = await db
    .select({ id: inventory.id })
    .from(inventory)
    .where(
      and(
        scopeConds.length > 1 ? or(...scopeConds) : scopeConds[0],
        sql`LOWER(TRIM(COALESCE(${inventory.item_name}, ${inventory.name}, ''))) = ${key}`,
      ),
    )
    .limit(5);

  const ids = Array.from(new Set(rows.map((r) => String(r.id))));
  if (ids.length === 0) {
    return {
      ok: false,
      code: 'ITEM_NOT_FOUND',
      error: `품목 미등록: ${itemName}. 기준정보에서 등록 후 입고하세요.`,
    };
  }
  if (ids.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_ITEM',
      error: `동명 품목이 ${ids.length}건 이상입니다: ${itemName}. 품목을 직접 지정(itemId)해 주세요.`,
    };
  }
  return { ok: true, itemId: ids[0] };
}

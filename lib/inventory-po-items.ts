/**
 * 발주서 items JSON 파서 (SSOT)
 *
 * po-receive 와 po-inspect 가 같은 4개 함수를 각자 복사해 갖고 있었다.
 * 두 라우트는 같은 컬럼(items)을 읽고 서로의 결과를 이어받는데, 사본이 갈라지면
 * 한쪽이 세는 입고 수량과 다른 쪽이 세는 수량이 달라져 발주 잔여가 어긋난다.
 * (8차 D07-016 의 '중복 구현' 부분)
 */

export function parsePurchaseOrderItems(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function poLineName(it: Record<string, unknown>): string {
  return String(it.name || it.item_name || '').trim();
}

export function poLineOrderedQty(it: Record<string, unknown>): number {
  return Math.max(0, Math.trunc(Number(it.qty ?? it.quantity ?? 0) || 0));
}

export function poLineReceivedQty(it: Record<string, unknown>): number {
  return Math.max(0, Math.trunc(Number(it.received_qty ?? it.receivedQty ?? 0) || 0));
}

export type PurchaseOrderReceivedItem = {
  name: string;
  ordered: number;
  received: number;
  remaining: number;
  rejected: number;
  item_id: string | null;
};

/**
 * `purchase_orders.received_items` 스냅샷 빌더 (SSOT).
 *
 * 8차 D12-003: po-inspect 판은 `rejected` 를 포함하고 po-receive 판은 포함하지 않아,
 * 같은 컬럼의 JSON 스키마가 어느 라우트가 마지막에 썼는지에 따라 달라졌다.
 * (검수 뒤 추가 입고가 들어오면 검수가 기록한 rejected 가 사라졌다.)
 * `rejected` 를 항상 포함하는 쪽으로 스키마를 고정한다 — 필드가 빠지는 것보다
 * 0 으로 들어 있는 편이 소비처에서 판별하기 쉽고, 반품 이력은 유실되면 복구할 수 없다.
 */
export function buildPurchaseOrderReceivedItems(
  items: Array<Record<string, unknown>>,
): PurchaseOrderReceivedItem[] {
  return items.map((it) => {
    const ordered = poLineOrderedQty(it);
    const received = poLineReceivedQty(it);
    return {
      name: poLineName(it),
      ordered,
      received,
      remaining: Math.max(0, ordered - received),
      rejected: Math.max(0, Math.trunc(Number(it.rejected_qty ?? 0) || 0)),
      item_id: (it.item_id as string | null) || (it.inventory_id as string | null) || null };
  });
}

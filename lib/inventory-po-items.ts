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

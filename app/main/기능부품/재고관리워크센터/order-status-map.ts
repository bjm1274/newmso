// 발주 상태 문자열 → 워크센터 UI 상태/톤 매핑 (SSOT)
// use-stock-data / use-io-data 공통

import type { PurchaseOrderRow, Tone } from './stock-types';

export type OrderStatusMapped = {
  status: PurchaseOrderRow['status'];
  tone: Tone;
};

export const ORDER_STATUS_MAP: Record<string, OrderStatusMapped> = {
  대기: { status: '발주 대기', tone: 'warn' },
  '발주 대기': { status: '발주 대기', tone: 'warn' },
  승인: { status: '확정', tone: 'success' },
  확정: { status: '확정', tone: 'success' },
  배송: { status: '배송 중', tone: 'accent' },
  '배송 중': { status: '배송 중', tone: 'accent' },
  완료: { status: '납품 완료', tone: 'success' },
  '납품 완료': { status: '납품 완료', tone: 'success' },
};

export const DEFAULT_ORDER_STATUS: OrderStatusMapped = {
  status: '발주 대기',
  tone: 'warn',
};

export function mapOrderStatus(rawStatus: string): OrderStatusMapped {
  return ORDER_STATUS_MAP[rawStatus] ?? DEFAULT_ORDER_STATUS;
}

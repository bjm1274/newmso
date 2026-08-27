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

// ─────────────────────────────────────────────────────────────
// 앱 밖에서 주입된 영문 상태값 → 앱의 한글 상태 (INV-02)
//
// 운영 purchase_orders 31건이 전부 status='draft' 인데(2026-04-28 일괄 주입분,
// 앱의 발주 생성 경로는 '대기'로 넣는다) 이 값을 아는 분기가 저장소 어디에도 없어서
// 발주관리 모달은 배지에 영문 'draft' 를 그대로 찍고 '발주 확인'·'입고 처리' 버튼을
// 하나도 렌더하지 않았다. 같은 행을 워크센터 목록은 '발주 대기' 로, 상단 KPI 는 0 건으로
// 세어 한 화면에서 세 값이 갈렸다.
// 운영 실측(2026-08-27, SELECT status,count(*) GROUP BY status)상 등장하는 앱 밖 값은
// 'draft' 하나뿐이라 그 하나만 매핑한다 — 관측되지 않은 값을 추측해 넣지 않는다.
// ─────────────────────────────────────────────────────────────
const RAW_ORDER_STATUS_ALIASES: Record<string, string> = {
  draft: '대기',
};

/** 원문 status 를 앱이 쓰는 한글 상태로 정규화한다(모르는 값은 그대로 둔다). */
export function normalizeRawOrderStatus(rawStatus: unknown): string {
  const s = String(rawStatus ?? '').trim();
  if (!s) return '대기';
  return RAW_ORDER_STATUS_ALIASES[s.toLowerCase()] ?? s;
}

export function mapOrderStatus(rawStatus: string): OrderStatusMapped {
  return ORDER_STATUS_MAP[normalizeRawOrderStatus(rawStatus)] ?? DEFAULT_ORDER_STATUS;
}

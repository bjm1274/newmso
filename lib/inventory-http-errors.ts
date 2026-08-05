/**
 * 재고·발주 라우트 공통 에러 → HTTP 응답 매핑 (SSOT)
 *
 * 예전에는 라우트마다 catch 블록을 따로 갖고 있었고 매핑이 서로 갈라져 있었다.
 * 8차 실측(D07-016)에서 같은 `STOCK_CONFLICT` 가 stock-post 는 409, po-receive 는
 * 500 으로 나가는 것을 확인했다. 클라이언트 `formatStockApiError` 는 code 로 분기해
 * "잠시 후 다시 시도하세요" 를 띄우는데, 500 으로 오면 그 분기를 타지 못해 사용자에게는
 * 원인 불명 서버 오류로 보였고 재시도(= 정상 복구 경로)를 포기하게 만들었다.
 * 매핑을 한 곳에 모아 재고 도메인 라우트가 같은 상황에 같은 상태코드를 내도록 한다.
 */
import { NextResponse } from 'next/server';
import { StockError } from '@/lib/db';

/** StockError.code → HTTP status */
export function stockErrorStatus(code: string): number {
  switch (code) {
    case 'INSUFFICIENT_STOCK':
    case 'EXPIRED_STOCK':
      return 409;
    case 'ITEM_NOT_FOUND':
    case 'SOURCE_NOT_FOUND':
    case 'DEST_NOT_FOUND':
      return 404;
    default:
      return 500;
  }
}

export type InventoryErrorPayload = {
  ok: false;
  error: string;
  code?: string;
  /** 실패 시점까지 이미 커밋된 부분 결과 (부분 실패를 사용자에게 숨기지 않기 위함) */
  data?: unknown;
};

/**
 * 재고 도메인의 throw 를 표준 응답으로 변환한다.
 * StockError 가 아닌 것들(월마감 잠금·수량 CAS 충돌)은 message prefix 로 식별한다 —
 * movement-service 가 이 둘을 일반 Error 로 던지기 때문이다.
 */
export function inventoryErrorResponse(err: unknown, extra?: { data?: unknown }): NextResponse {
  if (err instanceof StockError) {
    return NextResponse.json(
      { ok: false, error: err.message, code: err.code, ...(extra?.data ? { data: extra.data } : {}) },
      { status: stockErrorStatus(err.code) },
    );
  }

  const message = err instanceof Error ? err.message : 'Internal error';
  if (message.startsWith('INVENTORY_PERIOD_LOCKED')) {
    return NextResponse.json(
      { ok: false, error: message, code: 'PERIOD_LOCKED', ...(extra?.data ? { data: extra.data } : {}) },
      { status: 423 },
    );
  }
  if (message.startsWith('STOCK_CONFLICT')) {
    return NextResponse.json(
      { ok: false, error: message, code: 'STOCK_CONFLICT', ...(extra?.data ? { data: extra.data } : {}) },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { ok: false, error: message, ...(extra?.data ? { data: extra.data } : {}) },
    { status: 500 },
  );
}

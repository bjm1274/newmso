// ============================================================
// app/api/inventory/stock-consume/route.ts
//
// @deprecated 폐지된 라우트. 항상 410 을 돌려준다.
//
// 라이브 재고 소모는 stock-post / stock-transfer 및 inventory-utils 경로를 쓴다.
// 저장소 전체에서 이 경로를 호출하는 코드는 없다.
//
// 예전에는 `x-allow-deprecated-stock-consume: 1` 헤더가 있으면 실제 차감을
// 수행했다. 그런데 그 헤더는 **요청자가 직접 붙이는 값**이라 통제가 아니었고,
// 통과한 뒤에는 세션 존재만 확인할 뿐 회사 스코프도(assertInventoryItemCompanyScope)
// 재고 권한도(canWriteInventory) 보지 않았다. 같은 도메인의 다른 재고 라우트는
// 전부 inventory-scope-guard 를 거치는데 이 파일만 import 조차 없었다.
// 품목 id 는 /api/d1/query 로 누구나 열람할 수 있으므로(INVENTORY_SCOPE 는
// 재고 권한이 아니라 회사·부서 일치만 본다), 재고 권한이 없는 임의 직원이
// 자사 아무 품목의 재고를 무단 차감할 수 있었다.
//
// 사용처가 없으므로 권한 가드를 새로 붙이는 대신 실행 경로 자체를 없앤다.
// 다시 살릴 일이 생기면 stock-post 와 같은 가드를 갖춘 채로 되살려야 한다.
// ============================================================
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Deprecated: use POST /api/inventory/stock-post instead',
      code: 'STOCK_CONSUME_DEPRECATED',
    },
    { status: 410 },
  );
}

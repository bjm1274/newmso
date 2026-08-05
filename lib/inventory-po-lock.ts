/**
 * 발주서(purchase_orders) 낙관적 잠금 — 입고/검수의 read-modify-write 직렬화
 *
 * 예전에는 두 라우트 모두 PO 스냅샷을 읽어 items JSON 을 통째로 재작성한 뒤
 * `WHERE id = ?` 만으로 UPDATE 했다. 재고 수량은 movement-service 의 CAS 가 지키지만
 * PO 문서는 아무 가드가 없어 last-writer-wins 였다.
 * 8차 실측(D07-004): 같은 PO 의 서로 다른 라인을 동시에 입고하면 재고는 20개 늘었는데
 * 나중 UPDATE 가 앞선 스냅샷을 덮어써 PO 의 received_qty 는 10 으로 남았고,
 * 먼저 입고된 라인의 received_qty 가 0 으로 되돌아가 그만큼 다시 초과 입고할 수 있었다.
 *
 * 그래서 쓰기를 시작하기 전에 `updated_at` 을 CAS 로 선점한다. 선점에 실패하면
 * 그 사이 다른 요청이 같은 PO 를 건드린 것이므로 재고를 하나도 건드리지 않은 채 409 로 돌려보낸다.
 */
import { sql } from 'drizzle-orm';
import type { D1Client } from '@/lib/db/client-d1';
import { purchase_orders } from '@/lib/db/schema';

export type PoLockResult =
  | { ok: true; stamp: string }
  | { ok: false; error: string; code: 'PO_CONFLICT' };

/**
 * 읽어 둔 `updated_at` 과 일치할 때만 새 스탬프로 바꾼다.
 * 성공하면 이후 최종 UPDATE 의 WHERE 에 이 stamp 를 써서 잠금 구간을 닫는다.
 */
export async function acquirePurchaseOrderLock(
  db: D1Client,
  purchaseOrderId: string,
  prevUpdatedAt: string | null | undefined,
): Promise<PoLockResult> {
  // ISO 로 파싱되는 형태를 유지하면서(뒤에 마이크로초 자리를 붙인다) 같은 밀리초에 들어온
  // 두 요청이 우연히 같은 스탬프를 갖는 일을 막는다 — 스탬프가 겹치면 잠금 구간을 닫는
  // WHERE 가 남의 갱신도 통과시킨다.
  const iso = new Date().toISOString();
  const stamp = `${iso.slice(0, -1)}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}Z`;
  const rows = await db
    .update(purchase_orders)
    .set({ updated_at: stamp })
    .where(
      sql`${purchase_orders.id} = ${purchaseOrderId} AND COALESCE(${purchase_orders.updated_at}, '') = ${prevUpdatedAt ?? ''}`,
    )
    .returning({ id: purchase_orders.id });

  if (rows.length === 0) {
    return {
      ok: false,
      code: 'PO_CONFLICT',
      error: '다른 요청이 같은 발주서를 처리 중입니다. 목록을 새로고침한 뒤 다시 시도하세요.',
    };
  }
  return { ok: true, stamp };
}

import { NextResponse } from 'next/server';
import { batchProcessExpiredLeaves, recordUnusedLeaveCompensation } from '@/lib/annual-leave-expiry';
import { recalculateLeaveBalance } from '@/lib/annual-leave-balance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { processed, results, skippedNoPromotion, failures } = await batchProcessExpiredLeaves();

    // 소멸 처리된 직원의 leave_balances 정합성 갱신 + 미사용 연차 보상 기록
    const balanceErrors: string[] = [];
    for (const r of results) {
      // 금전 보상 기록 (companies.unused_leave_compensation=TRUE 인 경우)
      try {
        await recordUnusedLeaveCompensation(r.staffId, r.expiredDays);
      } catch (compErr) {
        console.error('[annual-leave-expiry cron] recordUnusedLeaveCompensation 실패:', r.staffId, compErr);
      }

      try {
        await recalculateLeaveBalance(r.staffId, new Date(r.expiryDate).getFullYear());
      } catch (balanceErr) {
        const msg = balanceErr instanceof Error ? balanceErr.message : String(balanceErr);
        console.error('[annual-leave-expiry cron] recalculateLeaveBalance 실패:', r.staffId, msg);
        balanceErrors.push(`${r.staffId}: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      results: results.map((r) => ({
        staffId: r.staffId,
        staffName: r.staffName,
        expiredDays: r.expiredDays,
        expiryDate: r.expiryDate })),
      balanceErrors: balanceErrors.length > 0 ? balanceErrors : undefined,
      // 촉진 미이행으로 소멸 보류된 건 (보상의무 유지 — 관리자 확인 필요)
      skippedNoPromotion: skippedNoPromotion.length > 0 ? skippedNoPromotion : undefined,
      // 개별 실패는 이제 배치를 멈추지 않는다. 대신 여기 실어 알림으로 드러낸다.
      failures: failures.length > 0 ? failures : undefined });
  } catch (err) {
    console.error('연차 소멸 크론 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '연차 소멸 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

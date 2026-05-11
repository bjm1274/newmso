import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { processed, results } = await batchProcessExpiredLeaves(supabase);

    // 소멸 처리된 직원의 leave_balances 정합성 갱신 + 미사용 연차 보상 기록
    const balanceErrors: string[] = [];
    for (const r of results) {
      // 금전 보상 기록 (companies.unused_leave_compensation=TRUE 인 경우)
      recordUnusedLeaveCompensation(supabase, r.staffId, r.expiredDays).catch((compErr) => {
        console.error('[annual-leave-expiry cron] recordUnusedLeaveCompensation 실패:', r.staffId, compErr);
      });

      try {
        await recalculateLeaveBalance(r.staffId, new Date(r.expiryDate).getFullYear(), supabase);
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
        expiryDate: r.expiryDate,
      })),
      balanceErrors: balanceErrors.length > 0 ? balanceErrors : undefined,
    });
  } catch (err) {
    console.error('연차 소멸 크론 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '연차 소멸 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

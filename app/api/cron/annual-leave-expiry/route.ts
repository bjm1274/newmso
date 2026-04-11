import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { batchProcessExpiredLeaves } from '@/lib/annual-leave-expiry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { processed, results } = await batchProcessExpiredLeaves(supabase);

    return NextResponse.json({
      ok: true,
      processed,
      results: results.map((r) => ({
        staffId: r.staffId,
        staffName: r.staffName,
        expiredDays: r.expiredDays,
        expiryDate: r.expiryDate,
      })),
    });
  } catch (err) {
    console.error('연차 소멸 크론 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '연차 소멸 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

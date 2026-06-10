import { NextResponse } from 'next/server';
import { dispatchPayrollNotice } from '@/lib/payroll-notice-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchPayrollNotice(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('급여 리마인더 자동 디스패치 크론 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '급여 리마인더 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

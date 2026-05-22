import { NextResponse } from 'next/server';
import { runLicenseExpiryJobs } from '@/lib/license-expiry-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { expiry, ce } = await runLicenseExpiryJobs();
    return NextResponse.json({ ok: true, expiry, ce });
  } catch (err) {
    console.error('[license-expiry-check] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '자격증 만료 알림 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

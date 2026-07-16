import { NextResponse } from 'next/server';
import { processBirthdayAnnouncements } from '@/lib/birthday-announcements';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ?date=YYYY-MM-DD 로 소급 실행 가능 (미지정 시 오늘 KST)
    const url = new URL(request.url);
    const dateParam = String(url.searchParams.get('date') || '').trim();
    const target =
      /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

    const result = await processBirthdayAnnouncements(target ?? new Date());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to process birthday announcements' },
      { status: 500 },
    );
  }
}

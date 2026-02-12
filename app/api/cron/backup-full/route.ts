/**
 * 24시간 정각 전체 백업 Cron (한국시간 0시 = UTC 15:00)
 */
import { NextResponse } from 'next/server';
import { runBackup } from '@/lib/backup-cron';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runBackup('24h');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, hint: result.hint, ok: false },
      { status: 500 }
    );
  }
  return NextResponse.json(result);
}

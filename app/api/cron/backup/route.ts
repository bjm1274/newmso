/**
 * 하루 1회 전체 백업 Cron (한국시간 자정 = UTC 15:00)
 * Supabase Storage 'mso-backups' 버킷에 JSON 저장
 */
import { NextResponse } from 'next/server';
import { runBackup } from '@/lib/backup-cron';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured', ok: false },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
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

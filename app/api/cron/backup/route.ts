/**
 * 6시간마다 데이터 백업 Cron
 * 직원, 급여, 휴가, 근태, 결재, 감사로그 → Supabase Storage 'mso-backups' 버킷
 */
import { NextResponse } from 'next/server';
import { runBackup } from '@/lib/backup-cron';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = new URL(req.url).searchParams.get('type') || '6h';
  const result = await runBackup(type === '24h' ? '24h' : '6h');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, hint: result.hint, ok: false },
      { status: 500 }
    );
  }
  return NextResponse.json(result);
}

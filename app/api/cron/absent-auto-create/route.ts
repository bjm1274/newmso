/**
 * 결근 자동 생성 Cron (KST 00:30 매일)
 *
 * 전날 근태 기록(attendance)이 없는 모든 재직 직원에 대해
 * attendance·attendances 양 테이블에 '결근(absent)' 행을 자동 생성합니다.
 *
 * 호출: Cloudflare Worker scheduled() → GET /api/cron/absent-auto-create
 */
import { NextResponse } from 'next/server';
import { runAbsentAutoCreate } from '@/lib/absent-auto-create';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured', ok: false },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runAbsentAutoCreate();

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
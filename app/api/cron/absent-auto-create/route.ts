/**
 * 결근 자동 생성 Cron (KST 02:00 매일 — cloudflare-worker.ts 의 '0 17 * * *' 슬롯)
 *
 * 전날 **근무표(shift_assignments)에 실근무가 배정됐는데** 근태 기록(attendance)이 없는
 * 재직 직원에 대해 attendance·attendances 양 테이블에 '결근(absent)' 행을 생성합니다.
 * 배정이 없는 날(오프)·휴무 배정·회사 지정 휴일은 대상이 아닙니다.
 *
 * 호출: Cloudflare Worker scheduled() → GET /api/cron/absent-auto-create
 *
 * dry-run: `?dryRun=1` 을 붙이면 **아무것도 쓰지 않고** 대상자 명단만 돌려줍니다.
 * 판정 규칙을 바꿀 때 변경 전후 명단(absentTargets·notScheduled)을 대조하는 용도입니다.
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

  // dry-run 은 쓰기 없이 판정만 한다. 인증(CRON_SECRET)은 위에서 이미 통과한 상태다.
  const dryRunParam = new URL(req.url).searchParams.get('dryRun');
  const dryRun = dryRunParam === '1' || dryRunParam === 'true';

  const result = await runAbsentAutoCreate(new Date(), { dryRun });

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
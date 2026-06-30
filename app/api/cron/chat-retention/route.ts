/**
 * 채팅 보관정책 정리 API
 * Cloudflare Cron Trigger: 매일 새벽 2시(Asia/Seoul) 등으로 호출 권장
 * 보관: 대화 5년, 사진/10MB 이하 1년, 동영상·10MB 초과 3개월
 */
import { NextResponse } from 'next/server';
import {
  cleanupChatMessagesByRetention,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured', deleted: 0 },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const d1 = await getD1Binding();
  if (!d1) {
    return NextResponse.json(
      { error: 'D1 binding not available', deleted: 0 },
      { status: 500 }
    );
  }

  try {
    const deleted = await cleanupChatMessagesByRetention(getD1Drizzle(d1));
    return NextResponse.json({ deleted });
  } catch (err) {
    console.error('[chat-retention] D1 cleanup failed', err);
    return NextResponse.json(
      { error: '채팅 보관 정리 중 오류가 발생했습니다.', deleted: 0 },
      { status: 500 }
    );
  }
}

/**
 * 채팅 보관정책 정리 API
 * Vercel Cron: 매일 새벽 2시(Asia/Seoul) 등으로 호출 권장
 * 보관: 대화 5년, 사진/10MB 이하 1년, 동영상·10MB 초과 3개월
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase env', deleted: 0 },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase.rpc('cleanup_chat_messages_by_retention');

  if (error) {
    console.error('chat-retention error', error);
    return NextResponse.json(
      { error: error.message, deleted: 0 },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: data ?? 0 });
}

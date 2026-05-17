/**
 * 채팅 보관정책 정리 API
 * Cloudflare Cron Trigger: 매일 새벽 2시(Asia/Seoul) 등으로 호출 권장
 * 보관: 대화 5년, 사진/10MB 이하 1년, 동영상·10MB 초과 3개월
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  cleanupChatMessagesByRetention,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
} from '@/lib/db';

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

  const backend = await resolveDataBackend();

  let deletedSupabase = 0;
  let deletedD1 = 0;
  let supabaseError: unknown = null;
  let d1Error: unknown = null;

  // Supabase RPC — backend가 'd1'이 아닐 때만
  if (backend !== 'd1') {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase.rpc('cleanup_chat_messages_by_retention');
    if (error) {
      supabaseError = error;
    } else {
      deletedSupabase = typeof data === 'number' ? data : 0;
    }
  }

  // D1 cleanup — backend가 'supabase'가 아닐 때
  if (backend !== 'supabase') {
    const d1 = await getD1Binding();
    if (!d1) {
      if (backend === 'd1') {
        return NextResponse.json(
          { error: 'DATA_BACKEND=d1 but DB binding not available', deleted: 0 },
          { status: 500 }
        );
      }
      console.warn('[chat-retention] dual-write D1 cleanup skipped — binding unavailable');
    } else {
      try {
        deletedD1 = await cleanupChatMessagesByRetention(getD1Drizzle(d1));
      } catch (err) {
        d1Error = err;
        if (backend === 'd1') {
          return NextResponse.json(
            { error: '채팅 보관 정리(D1) 중 오류가 발생했습니다.', deleted: 0 },
            { status: 500 }
          );
        }
        console.warn('[chat-retention] D1 cleanup failed', err);
      }
    }
  }

  // 진실원은 backend별로 다름
  if (backend === 'd1') return NextResponse.json({ deleted: deletedD1, backend });
  if (supabaseError) {
    return NextResponse.json(
      { error: '채팅 보관 정리 중 오류가 발생했습니다.', deleted: 0 },
      { status: 500 }
    );
  }
  return NextResponse.json({
    deleted: deletedSupabase,
    ...(backend === 'dual-write' ? { d1_deleted: deletedD1, d1_error: d1Error ? String(d1Error) : null } : {}),
  });
}

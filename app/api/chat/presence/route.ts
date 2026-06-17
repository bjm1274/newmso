/**
 * /api/chat/presence
 *
 * 사용자 온라인 presence heartbeat.
 * 이 앱의 실시간 계층은 Supabase realtime 채널이 아니라 폴링/SSE 기반이므로,
 * presence(온라인/오프라인)는 heartbeat + freshness 윈도 방식으로 구현한다.
 *
 * POST   — 현재 사용자 온라인 표시: staff_members.presence_status='online', last_seen_at=now
 * DELETE — 오프라인 표시(로그아웃/탭 종료): presence_status='away'
 *
 * 온라인 판정은 클라이언트(메신저.tsx isStaffCurrentlyOnline)가
 * presence_status==='online' && last_seen_at 5분 이내일 때 수행한다.
 * presence는 비필수 기능이므로 D1 미바인딩/오류 시에도 200(ok:false)으로 조용히 처리.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, staff_members, eq } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const session = await readSessionFromRequest(req);
  const userId = String(session?.user?.id ?? session?.user?.user_id ?? '').trim();
  return userId || null;
}

async function setPresence(userId: string, status: 'online' | 'away'): Promise<boolean> {
  const d1 = await getD1Binding();
  if (!d1) return false;
  const db = getD1Drizzle(d1);
  await db
    .update(staff_members)
    .set({ presence_status: status, last_seen_at: new Date().toISOString() })
    .where(eq(staff_members.id, userId));
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const ok = await setPresence(userId, 'online');
    return NextResponse.json({ ok });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const ok = await setPresence(userId, 'away');
    return NextResponse.json({ ok });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) });
  }
}

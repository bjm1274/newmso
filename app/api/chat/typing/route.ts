/**
 * /api/chat/typing
 *
 * POST — typing 상태 upsert (입력 중)
 *   body: { room_id: string; user_name: string }
 *   → chat_typing_status에 (room_id, user_id, user_name, updated_at=now) upsert
 *
 * DELETE — typing 상태 제거 (입력 중단)
 *   body: { room_id: string }
 *   → chat_typing_status에서 (room_id, user_id) 행 삭제
 *
 * GET — 방의 현재 typing 중인 사용자 목록
 *   ?room_id=xxx
 *   → updated_at이 5초 이내인 행만 반환 (자신 제외)
 */

import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, chat_typing_status, eq, and, gt, sql } from '@/lib/db';

const TYPING_TTL_SECONDS = 5;

// ─── POST: typing 상태 upsert ─────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await readSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(session.user.id ?? session.user.user_id ?? '').trim();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).room_id !== 'string'
  ) {
    return NextResponse.json({ error: 'room_id required' }, { status: 400 });
  }

  const { room_id, user_name } = body as Record<string, unknown>;
  const roomId = String(room_id).trim();
  const userName = typeof user_name === 'string' ? user_name.trim() : (session.user.name ?? '');

  if (!roomId) {
    return NextResponse.json({ error: 'room_id required' }, { status: 400 });
  }

  const d1 = await getD1Binding();
  if (!d1) {
    // D1 binding 없음(로컬 개발): 무음 성공
    return NextResponse.json({ ok: true });
  }

  const db = getD1Drizzle(d1);
  const now = new Date().toISOString();

  try {
    await db
      .insert(chat_typing_status)
      .values({ room_id: roomId, user_id: userId, user_name: userName, updated_at: now })
      .onConflictDoUpdate({
        target: [chat_typing_status.room_id, chat_typing_status.user_id],
        set: { user_name: userName, updated_at: now } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[chat/typing POST] upsert failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: typing 상태 제거 ─────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await readSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(session.user.id ?? session.user.user_id ?? '').trim();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomId = String(
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).room_id ?? ''
      : '',
  ).trim();

  if (!roomId) {
    return NextResponse.json({ error: 'room_id required' }, { status: 400 });
  }

  const d1 = await getD1Binding();
  if (!d1) {
    return NextResponse.json({ ok: true });
  }

  const db = getD1Drizzle(d1);
  try {
    await db
      .delete(chat_typing_status)
      .where(
        and(
          eq(chat_typing_status.room_id, roomId),
          eq(chat_typing_status.user_id, userId),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[chat/typing DELETE] delete failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET: 방의 typing 중인 사용자 목록 ───────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await readSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(session.user.id ?? session.user.user_id ?? '').trim();
  const roomId = (req.nextUrl.searchParams.get('room_id') ?? '').trim();

  if (!roomId) {
    return NextResponse.json({ error: 'room_id required' }, { status: 400 });
  }

  const d1 = await getD1Binding();
  if (!d1) {
    return NextResponse.json({ users: [] });
  }

  const db = getD1Drizzle(d1);

  // updated_at이 TTL 이내인 행 — SQLite datetime 연산으로 필터
  const cutoff = new Date(Date.now() - TYPING_TTL_SECONDS * 1000).toISOString();

  try {
    const rows = await db
      .select({
        user_id: chat_typing_status.user_id,
        user_name: chat_typing_status.user_name })
      .from(chat_typing_status)
      .where(
        and(
          eq(chat_typing_status.room_id, roomId),
          gt(chat_typing_status.updated_at, cutoff),
        ),
      );

    // 자신 제외
    const users = rows
      .filter((row) => row.user_id !== userId)
      .map((row) => ({ user_id: row.user_id, user_name: row.user_name }));

    return NextResponse.json({ users });
  } catch (err) {
    console.error('[chat/typing GET] select failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

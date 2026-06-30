/**
 * 관리자 — 직원 강제 로그아웃 명령.
 *
 * 처리 흐름:
 *   1) 세션 + admin 권한 검증.
 *   2) staff_members.force_logout_at 갱신 → 클라이언트 polling이 강제 로그아웃 인식.
 *   3) 대상 직원에게 인앱 알림(system/force_logout) INSERT.
 *   4) 대상 직원에게 즉시 푸시(FCM/WebPush) 발송 — 푸시 실패는 본 요청 결과에 영향 없음.
 *
 * 알림·푸시 단계는 try/catch 격리되므로 force_logout_at 갱신만 성공하면 200을 반환한다.
 */
import { NextResponse } from 'next/server';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { insertNotificationsOrThrow, type NotificationRow } from '@/lib/notification-utils';
import { dispatchPushForNotificationRows } from '@/lib/notification-push-dispatch';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  eq } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RequestBody = {
  staffId?: unknown;
};

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as RequestBody | null;
    const staffId =
      typeof payload?.staffId === 'string' ? payload.staffId.trim() : '';
    if (!staffId) {
      return NextResponse.json({ error: 'staffId is required' }, { status: 400 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json(
        { error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const db = getD1Drizzle(d1);

    // 대상 직원 존재 확인 + 이름 확보 (알림 메시지용)
    const targetRows = await db
      .select({ id: staffMembersTable.id, name: staffMembersTable.name })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, staffId))
      .limit(1);
    const target = targetRows[0];
    if (!target) {
      return NextResponse.json({ error: '대상 직원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    // 1) force_logout_at 갱신
    await db
      .update(staffMembersTable)
      .set({ force_logout_at: nowIso })
      .where(eq(staffMembersTable.id, staffId));

    // 2) 인앱 알림 INSERT + 3) 푸시 발송 — 실패해도 200 응답 유지(JM3 격리)
    let notificationCreated = false;
    let pushSent = 0;
    let pushError: string | null = null;
    try {
      const notificationRow: NotificationRow = {
        user_id: staffId,
        type: 'system',
        title: '⚠️ 강제 로그아웃',
        body: '관리자가 모든 기기에서 로그아웃을 실행했습니다. 다시 로그인해 주세요.',
        metadata: {
          subtype: 'force_logout',
          force_logout_at: nowIso,
          requested_by: String(session.user.id || ''),
          requested_by_name: String(session.user.name || ''),
          dedupe_key: `force_logout:${nowIso}` },
        read_at: null,
        created_at: nowIso };

      await insertNotificationsOrThrow([notificationRow]);
      notificationCreated = true;

      const pushResult = await dispatchPushForNotificationRows([
        {
          user_id: staffId,
          type: 'system',
          title: notificationRow.title!,
          body: notificationRow.body!,
          metadata: notificationRow.metadata ?? null },
      ]);
      pushSent = pushResult.fcmSent + pushResult.webPushSent;
      if (pushResult.errors.length > 0) {
        pushError = pushResult.errors.slice(0, 3).join('; ');
      }
    } catch (err) {
      pushError = err instanceof Error ? err.message : 'notification/push failed';
      console.error('[admin/force-logout] notification dispatch failed:', err);
    }

    return NextResponse.json({
      ok: true,
      staffId,
      notificationCreated,
      pushSent,
      ...(pushError ? { pushError } : {}) });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : '강제 로그아웃 처리 중 오류가 발생했습니다.';
    console.error('[admin/force-logout] failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

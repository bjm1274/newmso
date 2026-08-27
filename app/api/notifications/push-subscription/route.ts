import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  push_subscriptions,
  resolveDataBackend,
  sql,
  and,
  eq,
  ne,
  isNull,
  asc,
  inArray } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';

export const dynamic = 'force-dynamic';

type PushSubscriptionPayload = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  fcm_token?: string;
  device_id?: string;
  platform?: string;
  user_agent?: string;
};

function parsePayload(body: PushSubscriptionPayload | null) {
  const endpoint = String(body?.endpoint || '').trim();
  const p256dh = String(body?.p256dh || '').trim();
  const auth = String(body?.auth || '').trim();
  const fcmToken = String(body?.fcm_token || '').trim() || null;
  const deviceId = String(body?.device_id || '').trim() || null;
  const platform = String(body?.platform || '').trim() || null;
  const userAgent = String(body?.user_agent || '').trim() || null;
  return { endpoint, p256dh, auth, fcmToken, deviceId, platform, userAgent };
}

// D1 binding 필수 — Workers env 가 없으면 throw.
async function requireD1ForPushSubscriptions(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[push_subscriptions] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

// D1 스키마는 device_id/platform/user_agent 컬럼이 항상 존재 → 단순히 true 반환.
// (Supabase 시절 health check 잔재 — 변경 최소화 위해 형태 유지)
function detectExtendedColumnSupport(): boolean {
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;
    const { endpoint, p256dh, auth, fcmToken, deviceId, platform, userAgent } = parsePayload(body);

    if (!endpoint && !fcmToken) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }
    if (endpoint && (!p256dh || !auth)) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }

    const db = await requireD1ForPushSubscriptions('POST');
    const staffId = String(session.user.id);
    const supportsExtendedColumns = detectExtendedColumnSupport();
    const effectiveEndpoint =
      endpoint || (deviceId ? `fcm:${staffId}:${deviceId}` : `fcm:${staffId}`);

    if (endpoint) {
      // 같은 endpoint를 보유한 staff_id=NULL 잔재 정리
      await db
        .delete(push_subscriptions)
        .where(
          and(
            eq(push_subscriptions.endpoint, endpoint),
            isNull(push_subscriptions.staff_id),
          ),
        );

      // 같은 endpoint를 다른 staff가 보유 중이면 그 행은 무효화
      await db
        .delete(push_subscriptions)
        .where(
          and(
            eq(push_subscriptions.endpoint, endpoint),
            ne(push_subscriptions.staff_id, staffId),
          ),
        );
    }

    if (fcmToken) {
      // 같은 물리 기기의 FCM 토큰을 다른 staff가 보유 중이면 그 행을 제거한다.
      // 로그아웃 시 토큰 정리가 누락돼도, 다음 사용자가 같은 브라우저에서 로그인해
      // 토큰을 재등록하는 시점에 교차 계정 잔재가 사라진다(메시지 알림 오발송 차단).
      // fcm_token UNIQUE 제약과 충돌하지 않도록 반드시 upsert 이전에 실행한다.
      await db
        .delete(push_subscriptions)
        .where(
          and(
            eq(push_subscriptions.fcm_token, fcmToken),
            ne(push_subscriptions.staff_id, staffId),
          ),
        );
    }

    // '토큰 없는 구독 잔재(fcm_token IS NULL)' 를 staff_id 만 보고 지우던 두 블록을 제거했다.
    //
    // 운영에서 fcm_token IS NULL 인 구독은 **전부 아이폰 설치형(PWA)** 이다 — 애플 모바일은
    // FCM 토큰 발급 자체가 막혀 있다(알림시스템.tsx isAppleMobileDevice 분기). 반면 PC·안드로이드는
    // 전부 토큰을 갖고 등록한다. 그래서 예전 조건은 "같은 사람이 PC/안드로이드에서 앱을 한 번 열
    // 때마다 자기 아이폰 구독을 서버에서 지운다" 로 동작했다(10차 NB-01). 아이폰 PWA 는 재구독이
    // 번거로워 한 번 지워지면 앱을 완전히 다시 열 때까지 그 기기로 푸시가 끊긴다.
    //
    // 기기 구분 키는 (staff_id, device_id) 다 — idx_push_subscriptions_staff_device_unique
    // 가 그 조합으로 잡혀 있다. 잔재 정리는 아래 device_id 블록 하나로 충분하다:
    // 그 조건(같은 staff + 같은 device + 다른 endpoint)이 지워야 할 토큰 없는 잔재를 이미
    // 전부 포함하고, 다른 기기의 구독은 건드리지 않는다.
    if (supportsExtendedColumns && deviceId) {
      // 같은 device가 다른 endpoint로 등록되어 있던 잔재 제거
      await db
        .delete(push_subscriptions)
        .where(
          and(
            eq(push_subscriptions.staff_id, staffId),
            eq(push_subscriptions.device_id, deviceId),
            ne(push_subscriptions.endpoint, effectiveEndpoint),
          ),
        );
    }

    // upsert — (staff_id, endpoint) UNIQUE 충돌 시 update
    await db
      .insert(push_subscriptions)
      .values({
        id: crypto.randomUUID(),
        staff_id: staffId,
        endpoint: effectiveEndpoint,
        p256dh,
        auth,
        fcm_token: fcmToken,
        device_id: deviceId,
        platform,
        user_agent: userAgent,
        created_at: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [push_subscriptions.staff_id, push_subscriptions.endpoint],
        set: {
          p256dh: sql`excluded.p256dh`,
          auth: sql`excluded.auth`,
          fcm_token: sql`excluded.fcm_token`,
          device_id: sql`excluded.device_id`,
          platform: sql`excluded.platform`,
          user_agent: sql`excluded.user_agent` } });

    if (fcmToken) {
      // 같은 fcm_token이 같은 staff의 다른 endpoint에 남아 있으면 dedupe
      const conditions = [
        eq(push_subscriptions.staff_id, staffId),
        eq(push_subscriptions.fcm_token, fcmToken),
        ne(push_subscriptions.endpoint, effectiveEndpoint),
      ];
      if (supportsExtendedColumns && deviceId) {
        conditions.push(eq(push_subscriptions.device_id, deviceId));
      }
      await db.delete(push_subscriptions).where(and(...conditions));
    }

    // 사용자당 구독 최대 10개 초과 시 오래된 것부터 정리
    const MAX_SUBSCRIPTIONS_PER_USER = 10;
    const allSubs = await db
      .select({
        id: push_subscriptions.id,
        created_at: push_subscriptions.created_at })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.staff_id, staffId))
      .orderBy(asc(push_subscriptions.created_at));

    if (allSubs && allSubs.length > MAX_SUBSCRIPTIONS_PER_USER) {
      const excessIds = allSubs
        .slice(0, allSubs.length - MAX_SUBSCRIPTIONS_PER_USER)
        .map((s) => String(s.id))
        .filter(Boolean);
      if (excessIds.length > 0) {
        await db
          .delete(push_subscriptions)
          .where(inArray(push_subscriptions.id, excessIds));
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: '구독 정보를 처리하는 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;
    const endpoint = String(body?.endpoint || '').trim();

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint is required.' }, { status: 400 });
    }

    const db = await requireD1ForPushSubscriptions('DELETE');

    await db
      .delete(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.staff_id, String(session.user.id)),
          eq(push_subscriptions.endpoint, endpoint),
        ),
      );

    // staff_id=NULL 잔재(이전 익명 등록) 정리
    await db
      .delete(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.endpoint, endpoint),
          isNull(push_subscriptions.staff_id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: '구독 정보를 처리하는 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

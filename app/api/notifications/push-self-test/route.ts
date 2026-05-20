/**
 * 서버→기기 푸시 자가진단 API
 * 현재 로그인한 사용자의 모든 구독에 실제로 테스트 push를 보냅니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  push_subscriptions as pushSubscriptionsTable,
  eq,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  fcm_token: string | null;
};

export async function POST(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const staffId = String(session.user.id);
  const diagnostics: Record<string, unknown> = {};

  // ── 1. 환경변수 확인 ──
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || '';
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const vapidSubject = process.env.VAPID_SUBJECT?.trim() || '';
  const firebaseSA = process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || '';

  diagnostics.env = {
    vapidPublicKey: vapidPublic ? `${vapidPublic.slice(0, 10)}...` : '❌ 없음',
    vapidPrivateKey: vapidPrivate ? '✅ 설정됨' : '❌ 없음 (Cloudflare에 추가 필요)',
    vapidSubject: vapidSubject || '❌ 없음 (Cloudflare에 추가 필요)',
    firebaseServiceAccount: firebaseSA ? '✅ 설정됨' : '❌ 없음 (Cloudflare에 추가 필요)',
  };

  // ── 2. DB 구독 정보 확인 ──
  let subs: SubRow[] | null = null;
  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      const rows = await db
        .select({
          id: pushSubscriptionsTable.id,
          endpoint: pushSubscriptionsTable.endpoint,
          p256dh: pushSubscriptionsTable.p256dh,
          auth: pushSubscriptionsTable.auth,
          fcm_token: pushSubscriptionsTable.fcm_token,
        })
        .from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.staff_id, staffId));
      subs = rows as SubRow[];
    }
  } else {
    const supabase = getAdminClient();
    const { data } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, fcm_token')
      .eq('staff_id', staffId);
    subs = data as SubRow[] | null;
  }

  diagnostics.subscriptions = (subs || []).map((s) => ({
    endpoint: String(s.endpoint || '').slice(0, 60) + '...',
    hasP256dh: Boolean(s.p256dh),
    hasAuth: Boolean(s.auth),
    hasFcmToken: Boolean(s.fcm_token),
  }));

  if (!subs || subs.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: '구독 정보 없음. 클라이언트에서 "푸시 다시 연결" 버튼을 눌러주세요.',
      diagnostics,
    });
  }

  const results: any[] = [];

  // ── 3. Web Push (VAPID) 테스트 ──
  if (vapidPrivate && vapidPublic) {
    try {
      const { sendWebPushNotification } = await import('@/lib/web-push-cloudflare');

      const testPayload = JSON.stringify({
        title: '🔔 푸시 연결 테스트',
        body: '[Web Push] 서버→기기 연결이 정상입니다!',
        tag: `self-test-webpush-${Date.now()}`,
        data: { type: 'notification', source: 'self-test' },
      });

      for (const sub of subs as any[]) {
        if (!sub.p256dh || !sub.auth || !/^https?:\/\//i.test(String(sub.endpoint))) continue;
        try {
          const res = await sendWebPushNotification(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            testPayload,
          );
          results.push({ method: 'webpush', endpoint: String(sub.endpoint).slice(0, 40), ok: res.ok });
        } catch (err: any) {
          results.push({ method: 'webpush', endpoint: String(sub.endpoint).slice(0, 40), ok: false, error: String(err?.message || err) });
        }
      }
    } catch (err: any) {
      diagnostics.webPushError = String(err?.message || err);
    }
  } else {
    diagnostics.webPushSkipped = 'VAPID_PRIVATE_KEY 또는 NEXT_PUBLIC_VAPID_PUBLIC_KEY 미설정';
  }

  // ── 4. FCM 테스트 ──
  if (firebaseSA) {
    try {
      const { sendFcmNotification } = await import('@/lib/fcm-http');

      for (const sub of subs as any[]) {
        if (!sub.fcm_token) continue;
        try {
          const ok = await sendFcmNotification(sub.fcm_token, {
            title: '🔔 FCM 테스트',
            body: '[FCM] 서버→기기 FCM 연결이 정상입니다!',
            data: {
              type: 'notification',
              tag: `self-test-fcm-${Date.now()}`,
            },
          });
          results.push({ method: 'fcm', token: String(sub.fcm_token).slice(0, 20), ok });
        } catch (err: any) {
          results.push({ method: 'fcm', token: String(sub.fcm_token).slice(0, 20), ok: false, error: String(err?.message || err) });
        }
      }
    } catch (err: any) {
      diagnostics.fcmError = String(err?.message || err);
    }
  } else {
    diagnostics.fcmSkipped = 'FIREBASE_SERVICE_ACCOUNT 미설정';
  }

  const anyOk = results.some((r) => r.ok);
  return NextResponse.json({
    ok: anyOk,
    results,
    diagnostics,
    summary: anyOk
      ? '✅ 최소 1개 경로로 푸시 발송 성공. 기기 알림창을 확인하세요.'
      : '❌ 모든 경로 실패. diagnostics를 확인하세요.',
  });
}

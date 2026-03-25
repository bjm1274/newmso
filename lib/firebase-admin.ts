import admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 설정되지 않았습니다.');

  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export async function sendFcmNotification(
  fcmToken: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<boolean> {
  try {
    const app = getAdminApp();
    await admin.messaging(app).send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      webpush: {
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/sy-logo.png',
          badge: '/badge-72x72.png',
          requireInteraction: true,
          vibrate: [200, 100, 200],
        },
        fcmOptions: { link: '/main' },
      },
      android: {
        priority: 'high',
        notification: { sound: 'default', priority: 'high', defaultVibrateTimings: true },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } },
      },
    });
    return true;
  } catch (err: any) {
    // 만료된 토큰 처리
    const code = String(err?.errorInfo?.code || err?.code || '');
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      return false; // 호출 측에서 토큰 삭제 처리
    }
    console.error('[FCM] 전송 실패:', err?.message || err);
    return false;
  }
}

export async function sendFcmBatch(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<{ success: string[]; expired: string[] }> {
  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const ok = await sendFcmNotification(token, payload);
      return { token, ok };
    }),
  );

  const success: string[] = [];
  const expired: string[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.ok) success.push(r.value.token);
      else expired.push(r.value.token);
    }
  }

  return { success, expired };
}

import admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing.');

  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export async function sendFcmNotification(
  fcmToken: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<boolean> {
  try {
    const app = getAdminApp();
    const messageData = {
      ...(payload.data || {}),
      title: payload.title,
      body: payload.body,
    };

    const messageId = payload.data?.message_id || '';
    const collapseKey = messageId ? `chat-msg-${messageId}` : undefined;

    await admin.messaging(app).send({
      token: fcmToken,
      data: messageData,
      webpush: {
        fcmOptions: { link: '/main' },
        headers: {
          Urgency: 'high',
        },
      },
      android: {
        priority: 'high',
        ...(collapseKey ? { collapseKey } : {}),
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
          ...(collapseKey ? { 'apns-collapse-id': collapseKey } : {}),
        },
        payload: {
          aps: {
            contentAvailable: true,
          },
        },
      },
    });
    return true;
  } catch (err: any) {
    const code = String(err?.errorInfo?.code || err?.code || '');
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      return false;
    }
    console.error('[FCM] send failed:', err?.message || err);
    return false;
  }
}

export async function sendFcmBatch(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<{ success: string[]; expired: string[] }> {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  const results = await Promise.allSettled(
    uniqueTokens.map(async (token) => {
      const ok = await sendFcmNotification(token, payload);
      return { token, ok };
    }),
  );

  const success: string[] = [];
  const expired: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.ok) success.push(result.value.token);
      else expired.push(result.value.token);
    }
  }

  return { success, expired };
}

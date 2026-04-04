import admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing.');

  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function buildSafeWebpushLink() {
  const rawOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    '';
  const normalizedOrigin = String(rawOrigin).trim();
  if (!normalizedOrigin) return undefined;

  try {
    const parsed = new URL(normalizedOrigin);
    if (parsed.protocol !== 'https:') return undefined;
    parsed.pathname = '/main';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return undefined;
  }
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
    const collapseKey = payload.data?.tag || (messageId ? `chat-msg-${messageId}` : undefined);
    const webpushLink = buildSafeWebpushLink();
    const webpushNotificationData = {
      ...messageData,
      ...payload.data,
    };

    await admin.messaging(app).send({
      token: fcmToken,
      data: messageData,
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title: payload.title,
          body: payload.body,
          tag: collapseKey,
          data: webpushNotificationData,
        },
        ...(webpushLink
          ? {
              fcmOptions: {
                link: webpushLink,
              },
            }
          : {}),
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

/**
 * FCM HTTP v1 REST API 기반 푸시 알림 전송
 * firebase-admin 대체: Node.js 바인딩 없이 fetch() + Web Crypto API만 사용
 * Cloudflare Workers / Edge Runtime 호환
 */

const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000; // 만료 5분 전에 갱신

let cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing.');
  return JSON.parse(raw) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(binaryDer).buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function createSignedJwt(
  clientEmail: string,
  privateKey: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKey);
  const signingBytes = new TextEncoder().encode(signingInput);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new Uint8Array(signingBytes).buffer as ArrayBuffer,
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_EXPIRY_MARGIN_MS) {
    return cachedToken.token;
  }

  const sa = getServiceAccount();
  const jwt = await createSignedJwt(sa.client_email, sa.private_key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google OAuth token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
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
    const sa = getServiceAccount();
    const accessToken = await getAccessToken();

    const messageData = {
      ...(payload.data || {}),
      title: payload.title,
      body: payload.body,
    };

    const messageId = payload.data?.message_id || '';
    const collapseKey = payload.data?.tag || (messageId ? `chat-msg-${messageId}` : undefined);
    const webpushLink = buildSafeWebpushLink();

    const message: Record<string, unknown> = {
      token: fcmToken,
      data: messageData,
      webpush: {
        headers: { Urgency: 'high' },
        ...(webpushLink ? { fcm_options: { link: webpushLink } } : {}),
      },
      android: {
        priority: 'high',
        ...(collapseKey ? { collapse_key: collapseKey } : {}),
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
          ...(collapseKey ? { 'apns-collapse-id': collapseKey } : {}),
        },
        payload: {
          aps: { 'content-available': 1 },
        },
      },
    };

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const errorCode = String(
        (body?.error as Record<string, unknown>)?.status || '',
      );
      if (errorCode === 'NOT_FOUND' || errorCode === 'INVALID_ARGUMENT') {
        return false; // 토큰 만료/무효
      }
      console.error('[FCM HTTP v1] send failed:', res.status, body);
      return false;
    }

    return true;
  } catch (err: unknown) {
    console.error('[FCM HTTP v1] send error:', (err as Error)?.message || err);
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

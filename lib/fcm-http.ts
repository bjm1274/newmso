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

export type FcmSendResult =
  | { ok: true }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'error' };

export async function sendFcmNotification(
  fcmToken: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<FcmSendResult> {
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
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: messageData,
      webpush: {
        headers: { Urgency: 'high' },
        ...(webpushLink ? { fcm_options: { link: webpushLink } } : {}),
      },
      android: {
        priority: 'high',
        ...(collapseKey ? { collapse_key: collapseKey } : {}),
        notification: {
          channel_id: 'high_importance_channel',
          default_vibrate_timings: true,
          notification_priority: 'PRIORITY_MAX',
          visibility: 'PUBLIC',
        },
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
      const errorObj = body?.error as Record<string, unknown> | undefined;
      const errorStatus = String(errorObj?.status || '');
      // FCM v1 상세 에러코드(UNREGISTERED 등)는 error.details[].errorCode 에 들어온다.
      const details = Array.isArray(errorObj?.details)
        ? (errorObj?.details as Record<string, unknown>[])
        : [];
      const fcmErrorCode =
        details.map((d) => String(d?.errorCode || '')).find((code) => code) || '';

      // 토큰이 '영구 무효'(삭제/무효화 대상)임을 뜻하는 신호로만 expired 판정 — 보수적으로 좁힌다.
      //   - HTTP 404/410, status=NOT_FOUND          → 등록 해제된 토큰
      //   - FcmError.errorCode=UNREGISTERED          → 앱 삭제/토큰 만료
      // ⚠️ HTTP 400 / INVALID_ARGUMENT 는 '토큰 무효'보다 '메시지 페이로드 오류'인 경우가 더 흔하다.
      //    이를 expired 로 오판하면 batch 한 번의 페이로드 문제로 정상 토큰까지 null 처리되어
      //    해당 기기(FCM 우선 정책상 WebPush 에서도 제외됨)의 푸시가 영구 중단된다.
      const isUnregistered =
        errorStatus === 'NOT_FOUND' ||
        fcmErrorCode === 'UNREGISTERED' ||
        res.status === 404 ||
        res.status === 410;
      if (isUnregistered) {
        return { ok: false, reason: 'expired' };
      }
      // 400(페이로드)·5xx·기타 → 일시/구성 오류로 보고 토큰은 유지(다음 시도/다른 채널 폴백 여지).
      console.error(
        '[FCM HTTP v1] send failed (token retained):',
        res.status,
        errorStatus,
        fcmErrorCode,
        body,
      );
      return { ok: false, reason: 'error' };
    }

    return { ok: true };
  } catch (err: unknown) {
    // 네트워크 실패 등 → 일시 오류, 토큰 유지
    console.error('[FCM HTTP v1] send error:', (err as Error)?.message || err);
    return { ok: false, reason: 'error' };
  }
}

export async function sendFcmBatch(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<{ success: string[]; expired: string[]; error: string[] }> {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  const results = await Promise.allSettled(
    uniqueTokens.map(async (token) => {
      const result = await sendFcmNotification(token, payload);
      return { token, result };
    }),
  );

  const success: string[] = [];
  const expired: string[] = [];
  const error: string[] = [];

  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      const { token, result } = settled.value;
      if (result.ok) {
        success.push(token);
      } else if (result.reason === 'expired') {
        expired.push(token);
      } else {
        error.push(token);
      }
    }
  }

  return { success, expired, error };
}

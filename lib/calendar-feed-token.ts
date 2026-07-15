/**
 * 공유캘린더 ICS 피드 서명 토큰.
 * 예전: token = staff_id 평문 → UUID 유출 시 근무표 전체 노출.
 * 현재: base64url(payload).base64url(hmac) — SESSION_SECRET 기반.
 */

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.CALENDAR_FEED_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST || process.env.CI) {
    return 'dev-only-calendar-feed-secret';
  }
  throw new Error('SESSION_SECRET 이 필요합니다 (calendar feed token).');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

export type CalendarFeedPayload = {
  sid: string;
  exp: number;
};

/** 기본 90일 유효 서명 토큰 발급 */
export async function createCalendarFeedToken(
  staffId: string,
  ttlSeconds = 60 * 60 * 24 * 90,
): Promise<string> {
  const sid = String(staffId || '').trim();
  if (!sid) throw new Error('staffId required');
  const payload: CalendarFeedPayload = {
    sid,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacSign(body);
  return `${body}.${sig}`;
}

/** 서명·만료 검증. 실패 시 null. 레거시 평문 staff_id 는 거부. */
export async function verifyCalendarFeedToken(token: string): Promise<string | null> {
  const raw = String(token || '').trim();
  if (!raw || !raw.includes('.')) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  try {
    const expected = await hmacSign(body);
    // timing-safe-ish compare
    if (expected.length !== sig.length) return null;
    let ok = 0;
    for (let i = 0; i < expected.length; i += 1) {
      ok |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    if (ok !== 0) return null;
    const json = new TextDecoder().decode(base64UrlToBytes(body));
    const payload = JSON.parse(json) as CalendarFeedPayload;
    if (!payload?.sid || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return String(payload.sid).trim() || null;
  } catch {
    return null;
  }
}

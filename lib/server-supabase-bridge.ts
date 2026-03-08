import type { SessionUser } from './server-session';

const encoder = new TextEncoder();
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function getCryptoApi() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API를 사용할 수 없습니다.');
  }
  return globalThis.crypto;
}

function getSupabaseJwtSecret(): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  return secret || null;
}

function bytesToBase64Url(bytes: Uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function importSigningKey(secret: string) {
  return getCryptoApi().subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signHs256(input: string, secret: string) {
  const key = await importSigningKey(secret);
  const signature = await getCryptoApi().subtle.sign('HMAC', key, encoder.encode(input));
  return bytesToBase64Url(new Uint8Array(signature));
}

function encodeJson(value: unknown) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

export async function createSupabaseAccessToken(
  user: SessionUser,
  maxAgeSeconds = 60 * 60 * 12
): Promise<string | null> {
  const secret = getSupabaseJwtSecret();
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const isMso = Boolean(user?.permissions?.mso);
  const isAdmin = Boolean(user?.role === 'admin' || user?.permissions?.admin || isMso);
  const isCompanyAdmin = Boolean(user?.role === 'admin' && !isMso);
  const canManageCompany = Boolean(isMso || isCompanyAdmin || user?.permissions?.hr);
  const subject = String(user?.auth_user_id || user?.id || ZERO_UUID);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    aud: 'authenticated',
    exp: now + maxAgeSeconds,
    iat: now,
    iss: process.env.NEXT_PUBLIC_SUPABASE_URL || 'newmso',
    sub: subject,
    role: 'authenticated',
    aal: 'aal1',
    session_id: globalThis.crypto?.randomUUID?.() || `${Date.now()}`,
    erp_staff_id: user?.id || null,
    erp_company_id: user?.company_id || null,
    erp_company_name: user?.company || null,
    erp_role: user?.role || null,
    erp_is_admin: isAdmin,
    erp_is_mso: isMso,
    erp_is_company_admin: isCompanyAdmin,
    erp_can_manage_company: canManageCompany,
  };

  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHs256(unsigned, secret);

  return `${unsigned}.${signature}`;
}

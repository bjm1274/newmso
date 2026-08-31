import { normalizeProfileUser } from './profile-photo';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SESSION_COOKIE_NAME = 'erp_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = Record<string, unknown> & {
  id: string | null;
  employee_no?: string | null;
  name: string;
  role?: string | null;
  department?: string | null;
  company?: string | null;
  company_id?: string | null;
  position?: string | null;
  photo_url?: string | null;
  avatar_url?: string | null;
  profile_photo_path?: string | null;
  email?: string | null;
  phone?: string | null;
  auth_user_id?: string | null;
  is_system_master?: boolean;
  permissions?: Record<string, boolean>;
};

export type SessionPayload = {
  iat: number;
  exp: number;
  user: SessionUser;
};

type CompactPermissions = {
  pt?: string[];
  pf?: string[];
};

type SerializedSessionUser = Omit<SessionUser, 'permissions'> & {
  permissions?: Record<string, boolean> | CompactPermissions;
};

type SerializedSessionPayload = Omit<SessionPayload, 'user'> & {
  user: SerializedSessionUser;
};

export type CookieOptions = {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
  expires?: Date;
};

function getCryptoApi() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API를 사용할 수 없습니다.');
  }
  return globalThis.crypto;
}

function getSessionSecret() {
  const secret =
    (typeof process !== 'undefined' ? process.env?.SESSION_SECRET?.trim() : undefined) ||
    (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SESSION_SECRET?.trim() : undefined);
  if (secret) return secret;
  return 'allerp-mso-unified-session-secret-2026-production-v1';
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

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToString(value: string) {
  return decoder.decode(base64UrlToBytes(value));
}

const COMPRESSED_BODY_PREFIX = 'z~';

export function compressBody(json: string): string | null {
  return stringToBase64Url(json);
}

export function decompressBody(body: string): string | null {
  if (body.startsWith(COMPRESSED_BODY_PREFIX)) {
    return null;
  }
  try {
    return base64UrlToString(body);
  } catch {
    return null;
  }
}

async function importSigningKeyWithSecret(secret: string) {
  return getCryptoApi().subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signValue(value: string, secret = getSessionSecret()) {
  const key = await importSigningKeyWithSecret(secret);
  const signature = await getCryptoApi().subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifySignatureWithSecret(value: string, signature: string, secret: string) {
  const key = await importSigningKeyWithSecret(secret);
  return getCryptoApi().subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(signature),
    encoder.encode(value)
  );
}

const SESSION_PERMISSION_BARE_KEYS = new Set([
  'admin',
  'mso',
  'system_master',
  'hr',
  'inventory',
  'approval',
  'finance',
]);

const SESSION_PERMISSION_PREFIXES = [
  'menu_',
  'finance_',
  'mypage_',
  'hr_',
  'calendar_',
  'chat_',
  'inventory_',
  'extra_',
  'board_',
];

export function isSessionPermissionKey(key: string) {
  return (
    SESSION_PERMISSION_BARE_KEYS.has(key) ||
    SESSION_PERMISSION_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function compactSessionPermissions(permissions: unknown): CompactPermissions | undefined {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return undefined;
  }
  const pt: string[] = [];
  const pf: string[] = [];
  for (const [rawKey, val] of Object.entries(permissions as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || !isSessionPermissionKey(key)) continue;
    if (val === true) pt.push(key);
    else if (val === false) pf.push(key);
  }
  const result: CompactPermissions = {};
  if (pt.length > 0) result.pt = pt;
  if (pf.length > 0) result.pf = pf;
  return Object.keys(result).length > 0 ? result : undefined;
}

export function expandSessionPermissions(
  permissions: Record<string, boolean> | CompactPermissions | undefined
): Record<string, boolean> | undefined {
  if (!permissions || typeof permissions !== 'object') return undefined;
  if ('pt' in permissions || 'pf' in permissions) {
    const compact = permissions as CompactPermissions;
    const out: Record<string, boolean> = {};
    if (Array.isArray(compact.pt)) {
      for (const k of compact.pt) {
        if (typeof k === 'string') out[k] = true;
      }
    }
    if (Array.isArray(compact.pf)) {
      for (const k of compact.pf) {
        if (typeof k === 'string') out[k] = false;
      }
    }
    return out;
  }
  return permissions as Record<string, boolean>;
}

export function normalizeSessionUser(user: unknown): SessionUser {
  if (!user || typeof user !== 'object') {
    return {
      id: null,
      name: '',
      permissions: {},
    };
  }

  const raw = user as Record<string, unknown>;
  const id = raw.id ? String(raw.id).trim() : null;
  const name = String(raw.name ?? '').trim();
  const permissions = raw.permissions && typeof raw.permissions === 'object'
    ? expandSessionPermissions(raw.permissions as any) || {}
    : {};

  const normalized: SessionUser = {
    ...raw,
    id,
    employee_no: raw.employee_no ? String(raw.employee_no).trim() : null,
    name,
    role: raw.role ? String(raw.role).trim() : null,
    department: raw.department ? String(raw.department).trim() : null,
    company: raw.company ? String(raw.company).trim() : null,
    company_id: raw.company_id ? String(raw.company_id).trim() : null,
    position: raw.position ? String(raw.position).trim() : null,
    photo_url: raw.photo_url ? String(raw.photo_url).trim() : null,
    avatar_url: raw.avatar_url ? String(raw.avatar_url).trim() : null,
    profile_photo_path: raw.profile_photo_path ? String(raw.profile_photo_path).trim() : null,
    email: raw.email ? String(raw.email).trim() : null,
    phone: raw.phone ? String(raw.phone).trim() : null,
    auth_user_id: raw.auth_user_id ? String(raw.auth_user_id).trim() : null,
    is_system_master: Boolean(raw.is_system_master),
    permissions,
  };

  return normalizeProfileUser(normalized);
}

export async function verifySessionTokenWithSecret(
  token: string | null | undefined,
  secret: string
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const isValid = await verifySignatureWithSecret(body, signature, secret);
  if (!isValid) return null;

  try {
    const json = await decompressBody(body);
    if (!json) return null;
    const parsed = JSON.parse(json) as SerializedSessionPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.exp !== 'number' || Date.now() >= parsed.exp * 1000) return null;

    const user = normalizeSessionUser(parsed.user);
    if (!user.name && !user.id && !user.employee_no) return null;

    return {
      iat: parsed.iat,
      exp: parsed.exp,
      user,
    };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | null | undefined): Promise<SessionPayload | null> {
  const secret = getSessionSecret();
  const primary = await verifySessionTokenWithSecret(token, secret);
  if (primary) return primary;

  const legacySecret = 'allerp-mso-unified-session-secret-2026-production-v1';
  if (secret !== legacySecret) {
    return verifySessionTokenWithSecret(token, legacySecret);
  }
  return null;
}

export async function createSessionToken(
  user: SessionUser,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
  secret = getSessionSecret()
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const normalizedUser = normalizeSessionUser(user);
  const compactPerms = compactSessionPermissions(normalizedUser.permissions);
  const serializedUser: SerializedSessionUser = {
    ...normalizedUser,
    ...(compactPerms ? { permissions: compactPerms } : { permissions: {} }),
  };

  const payload: SerializedSessionPayload = {
    iat: now,
    exp: now + maxAgeSeconds,
    user: serializedUser,
  };

  const json = JSON.stringify(payload);
  const compressed = await compressBody(json);
  const body = compressed || stringToBase64Url(json);
  const signature = await signValue(body, secret);

  return `${body}.${signature}`;
}

export function getSessionCookieOptions(maxAgeSeconds = SESSION_MAX_AGE_SECONDS): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: maxAgeSeconds,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
  };
}

export function clearSessionCookie<
  T extends { cookies: { set: (name: string, value: string, options: CookieOptions) => void } }
>(response: T): T {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    expires: new Date(0),
  });
  return response;
}

import { normalizeProfileUser } from './profile-photo';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  eq,
  or } from '@/lib/db';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SESSION_COOKIE_NAME = 'erp_session';
// 모바일/PWA 백그라운드에서 세션 갱신 타이머가 멈춰도 "방치 후 만료" 로그아웃이 잘 일어나지 않도록
// 슬라이딩 세션 수명을 30일로 둔다. 사용 중에는 GET /api/auth/session 이 절반 미만일 때 30일로 재연장한다.
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
  profile_photo_updated_at?: string | null;
  email?: string | null;
  phone?: string | null;
  auth_user_id?: string | null;
  is_system_master?: boolean;
  login_id?: string | null;
  permissions: Record<string, any>;
};

export type SessionPayload = {
  ver: 1;
  iat: number;
  exp: number;
  user: SessionUser;
};

type CookieOptions = {
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
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST || process.env.CI) {
    return 'dev-only-session-secret-change-this';
  }
  throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다.');
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

async function importSigningKey() {
  return getCryptoApi().subtle.importKey(
    'raw',
    encoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signValue(value: string) {
  const key = await importSigningKey();
  const signature = await getCryptoApi().subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignature(value: string, signature: string) {
  const key = await importSigningKey();
  return getCryptoApi().subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(signature),
    encoder.encode(value)
  );
}

const SESSION_PERMISSION_KEYS = new Set([
  'admin',
  'mso',
  'system_master',
  'hr',
  'inventory',
  'approval',
  'hr_교대근무',
  'hr_근무표생성',
]);

function compactSessionPermissions(permissions: Record<string, any>) {
  return Object.entries(permissions || {}).reduce<Record<string, boolean>>((acc, [key, value]) => {
    if (SESSION_PERMISSION_KEYS.has(key) || key.startsWith('menu_')) {
      acc[key] = value === true;
    }
    return acc;
  }, {});
}

export function normalizeSessionUser(input: any): SessionUser {
  const rest = { ...(input || {}) };
  delete rest.password;
  delete rest.passwd;
  const normalizedProfile = normalizeProfileUser(rest) as Record<string, any>;
  return {
    ...normalizedProfile,
    id: normalizedProfile?.id ?? null,
    employee_no: normalizedProfile?.employee_no ?? null,
    name: normalizedProfile?.name ?? '',
    role: normalizedProfile?.role ?? null,
    department: normalizedProfile?.department ?? null,
    company: normalizedProfile?.company ?? null,
    company_id: normalizedProfile?.company_id ?? null,
    position: normalizedProfile?.position ?? null,
    photo_url: normalizedProfile?.photo_url ?? null,
    avatar_url: normalizedProfile?.avatar_url ?? null,
    profile_photo_path: normalizedProfile?.profile_photo_path ?? null,
    profile_photo_updated_at: normalizedProfile?.profile_photo_updated_at ?? null,
    email: normalizedProfile?.email ?? null,
    phone: normalizedProfile?.phone ?? null,
    auth_user_id: normalizedProfile?.auth_user_id ?? null,
    is_system_master: normalizedProfile?.is_system_master === true,
    login_id: normalizedProfile?.login_id ?? rest.login_id ?? null,
    permissions:
      normalizedProfile?.permissions &&
      typeof normalizedProfile.permissions === 'object' &&
      !Array.isArray(normalizedProfile.permissions)
        ? normalizedProfile.permissions
        : {} };
}

type StaffSessionRow = {
  id: string;
  employee_no: string;
  name: string;
  role: string | null;
  department: string | null;
  company: string;
  company_id: string | null;
  position: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  profile_photo_path: string | null;
  profile_photo_updated_at: string | null;
  email: string | null;
  phone: string | null;
  auth_user_id: string | null;
  is_system_master: number | null;
  permissions: string | null;
};

function parseSessionRowPermissions(row: StaffSessionRow): Record<string, unknown> {
  if (typeof row.permissions === 'string' && row.permissions.length > 0) {
    try {
      const parsed = JSON.parse(row.permissions) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 파싱 실패 시 빈 객체
    }
  }
  return {};
}

function normalizeD1SessionRow(row: StaffSessionRow) {
  return {
    ...row,
    is_system_master: row.is_system_master === 1,
    permissions: parseSessionRowPermissions(row) };
}

export async function resolveLatestSessionUser(sessionUser: unknown): Promise<SessionUser> {
  const normalizedUser = normalizeSessionUser(sessionUser);
  const sessionUserId = String(normalizedUser?.id ?? '').trim();
  const sessionEmployeeNo = String(normalizedUser?.employee_no ?? '').trim();
  const sessionName = String(normalizedUser?.name ?? '').trim();

  if (!sessionUserId && !sessionEmployeeNo && !sessionName) return normalizedUser;

  const d1 = await getD1Binding();
  if (!d1) return normalizedUser;
  const db = getD1Drizzle(d1);

  // 단일 OR 쿼리로 N+1 제거 — id/employee_no/name 중 하나로 매칭
  const conditions: ReturnType<typeof eq>[] = [];
  if (sessionUserId) conditions.push(eq(staffMembersTable.id, sessionUserId));
  if (sessionEmployeeNo) conditions.push(eq(staffMembersTable.employee_no, sessionEmployeeNo));
  if (sessionName) conditions.push(eq(staffMembersTable.name, sessionName));

  const rows = await db
    .select({
      id: staffMembersTable.id,
      employee_no: staffMembersTable.employee_no,
      name: staffMembersTable.name,
      role: staffMembersTable.role,
      department: staffMembersTable.department,
      company: staffMembersTable.company,
      company_id: staffMembersTable.company_id,
      position: staffMembersTable.position,
      photo_url: staffMembersTable.photo_url,
      avatar_url: staffMembersTable.avatar_url,
      profile_photo_path: staffMembersTable.profile_photo_path,
      profile_photo_updated_at: staffMembersTable.profile_photo_updated_at,
      email: staffMembersTable.email,
      phone: staffMembersTable.phone,
      auth_user_id: staffMembersTable.auth_user_id,
      is_system_master: staffMembersTable.is_system_master,
      permissions: staffMembersTable.permissions })
    .from(staffMembersTable)
    .where(or(...conditions))
    .limit(10);

  if (rows.length === 0) return normalizedUser;

  // 우선순위: id > employee_no > name (단일 매칭만)
  const byId = sessionUserId
    ? rows.find((r) => String(r.id) === sessionUserId)
    : null;
  if (byId) return normalizeSessionUser({ ...normalizedUser, ...normalizeD1SessionRow(byId as StaffSessionRow) });

  const byEmpNo = sessionEmployeeNo
    ? rows.find((r) => String(r.employee_no) === sessionEmployeeNo)
    : null;
  if (byEmpNo) return normalizeSessionUser({ ...normalizedUser, ...normalizeD1SessionRow(byEmpNo as StaffSessionRow) });

  const byName = sessionName
    ? rows.filter((r) => String(r.name) === sessionName)
    : [];
  if (byName.length === 1) return normalizeSessionUser({ ...normalizedUser, ...normalizeD1SessionRow(byName[0] as StaffSessionRow) });

  return normalizedUser;
}

function createSessionUserSnapshot(input: any): SessionUser {
  const normalizedUser = normalizeSessionUser(input);
  return {
    id: normalizedUser.id ?? null,
    employee_no: normalizedUser.employee_no ?? null,
    name: normalizedUser.name ?? '',
    role: normalizedUser.role ?? null,
    department: normalizedUser.department ?? null,
    company: normalizedUser.company ?? null,
    company_id: normalizedUser.company_id ?? null,
    position: normalizedUser.position ?? null,
    photo_url: normalizedUser.photo_url ?? null,
    avatar_url: normalizedUser.avatar_url ?? null,
    profile_photo_path: normalizedUser.profile_photo_path ?? null,
    profile_photo_updated_at: normalizedUser.profile_photo_updated_at ?? null,
    email: normalizedUser.email ?? null,
    phone: normalizedUser.phone ?? null,
    auth_user_id: String(normalizedUser.auth_user_id ?? '').trim() || null,
    is_system_master: normalizedUser.is_system_master === true,
    login_id: (normalizedUser as any).login_id ?? null,
    permissions: compactSessionPermissions(normalizedUser.permissions || {}) };
}

export async function createSessionToken(user: any, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ver: 1,
    iat: now,
    exp: now + maxAgeSeconds,
    user: createSessionUserSnapshot(user) };

  const body = stringToBase64Url(JSON.stringify(payload));
  const signature = await signValue(body);
  return `${body}.${signature}`;
}

export async function verifySessionToken(token?: string | null) {
  if (!token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const isValid = await verifySignature(body, signature);
  if (!isValid) return null;

  try {
    const payload = JSON.parse(base64UrlToString(body)) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.user?.name || !payload.exp || payload.exp <= now) {
      return null;
    }
    return {
      ...payload,
      user: normalizeSessionUser(payload.user) };
  } catch {
    return null;
  }
}

function parseCookieHeader(cookieHeader?: string | null) {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [name, ...value] = part.trim().split('=');
    if (!name) return acc;
    acc[name] = decodeURIComponent(value.join('='));
    return acc;
  }, {});
}

export async function readSessionFromRequest(
  request:
    | Request
    | {
        headers: Headers;
        cookies?: {
          get: (name: string) => { value: string } | undefined;
        };
      }
) {
  const cookiesObj = 'cookies' in request
    ? (request as { cookies?: { get?: (n: string) => { value: string } | undefined } }).cookies
    : undefined;
  const token =
    cookiesObj?.get?.(SESSION_COOKIE_NAME)?.value ||
    parseCookieHeader(request.headers.get('cookie'))[SESSION_COOKIE_NAME] ||
    null;

  return verifySessionToken(token);
}

export function getSessionCookieOptions(maxAgeSeconds = SESSION_MAX_AGE_SECONDS): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
    // 일부 모바일 웹뷰는 Max-Age 만 있으면 세션 쿠키로 취급해 앱 종료 시 소실시킨다 → Expires 동시 지정.
    expires: new Date(Date.now() + maxAgeSeconds * 1000) };
}

export function clearSessionCookie<T extends { cookies: { set: (name: string, value: string, options: CookieOptions) => void } }>(response: T): T {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0) });
  return response;
}

export function isAdminSession(user?: SessionUser | null) {
  return Boolean(user?.role === 'admin' || user?.permissions?.admin || user?.permissions?.mso);
}

export function isSystemMasterSession(user?: SessionUser | null) {
  return Boolean(
    user?.permissions?.system_master === true ||
    (user as Record<string, unknown> | undefined)?.is_system_master === true
  );
}

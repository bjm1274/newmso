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

/**
 * 토큰 안에 실제로 직렬화되는 사용자 표현.
 * 쿠키 4KB 한도 때문에 권한을 permissions 객체가 아니라 pt/pf 배열로 압축해 담는다.
 * 읽는 쪽에서 SessionUser 로 되돌리므로 소비 코드는 이 타입을 볼 일이 없다.
 */
type SerializedSessionUser = Omit<SessionUser, 'permissions'> & {
  /** 값이 true 인 권한 키 */
  pt?: string[];
  /** 값이 명시적으로 false 인 권한 키 (차단 의미를 갖는다) */
  pf?: string[];
  /** 예전 형식 토큰 호환 */
  permissions?: Record<string, any>;
};

export type SessionPayload = {
  ver: 1;
  iat: number;
  exp: number;
  user: SessionUser;
};

type SerializedSessionPayload = Omit<SessionPayload, 'user'> & {
  user: SerializedSessionUser;
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

async function importSigningKeyWithSecret(secret: string) {
  return getCryptoApi().subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signValue(value: string) {
  const key = await importSigningKeyWithSecret(getSessionSecret());
  const signature = await getCryptoApi().subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignatureWithSecret(value: string, signature: string, secret: string) {
  const key = await importSigningKeyWithSecret(secret);
  return getCryptoApi().subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(signature),
    encoder.encode(value)
  );
}

// ---------------------------------------------------------------------------
// 세션 토큰에 담을 권한 키
// ---------------------------------------------------------------------------
// 세션은 쿠키에 들어가고 쿠키 한도는 4KB 다. 그래서 권한 전체를 담을 수 없고
// 추려서 담는데, 예전 목록은 bare 8개 + `menu_*` 뿐이었다.
// 그 결과 서버가 실제로 판정에 쓰는 키들이 토큰에서 사라졌다.
//   - `finance_*` 소실 → lib/d1-api-helpers.ts 의 hasFinancePermission() 이 항상 false
//     → policies.ts 의 FINANCE_SCOPE 3테이블이 재무 담당자에게 통째로 닫힘 (fail-closed)
//   - `mypage_수정` 소실 → `perms.mypage_수정 === false` 로 막던 라우트가
//     `undefined === false` 가 되어 차단이 풀림 (fail-open)
//
// 그래서 "서버가 권한 판정에 읽는 키"를 기준으로 다시 정의한다.
// 실측(권한 121개 전량 기준):
//   객체 형태로 전량   → 4,653B  쿠키 한도 초과
//   배열 압축으로 전량 → 3,837B  들어가지만 여유 260B
//   아래 접두사 범위   → 3,209B  여유 ~900B
const SESSION_PERMISSION_BARE_KEYS = new Set([
  'admin',
  'mso',
  'system_master',
  'hr',
  'inventory',
  'approval',
  'finance',
]);

// 서버 코드가 판정에 참조하는 접두사. 여기에 없는 접두사(admin_ 등)는
// 화면 표시 전용이라 클라이언트가 별도로 조회한다.
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

function isSessionPermissionKey(key: string) {
  return (
    SESSION_PERMISSION_BARE_KEYS.has(key) ||
    SESSION_PERMISSION_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/**
 * 권한 객체를 토큰용 두 배열로 압축한다.
 *  - pt: 값이 true 인 키
 *  - pf: 값이 **명시적으로** false 인 키 (차단 의미를 갖는 키가 있어 보존해야 한다)
 *
 * `{"키":true,}` 형태보다 배열이 키당 7바이트 남짓 작다.
 */
function compactSessionPermissions(permissions: Record<string, any>) {
  const pt: string[] = [];
  const pf: string[] = [];
  for (const [key, value] of Object.entries(permissions || {})) {
    if (!isSessionPermissionKey(key)) continue;
    if (value === true) pt.push(key);
    else if (value === false) pf.push(key);
  }
  return { pt, pf };
}

/**
 * 토큰의 압축 표현을 원래의 권한 객체로 되돌린다.
 * 예전 토큰은 `permissions` 객체를 그대로 담고 있으므로 그 형태도 받아들인다
 * (그래야 이 변경 배포 시 기존 로그인 세션이 무효화되지 않는다).
 */
function expandSessionPermissions(user: Record<string, any>): Record<string, boolean> {
  const legacy = user?.permissions;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    return legacy as Record<string, boolean>;
  }
  const out: Record<string, boolean> = {};
  for (const key of Array.isArray(user?.pt) ? user.pt : []) {
    if (typeof key === 'string') out[key] = true;
  }
  for (const key of Array.isArray(user?.pf) ? user.pf : []) {
    if (typeof key === 'string') out[key] = false;
  }
  return out;
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

function createSessionUserSnapshot(input: any): SerializedSessionUser {
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
    // 권한은 pt/pf 배열로 압축해 담는다. 읽는 쪽(verifySessionTokenWithSecret)에서
    // 다시 permissions 객체로 되돌리므로, 소비 코드는 종전대로 user.permissions 를 쓰면 된다.
    ...compactSessionPermissions(normalizedUser.permissions || {}) };
}

export async function createSessionToken(user: any, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SerializedSessionPayload = {
    ver: 1,
    iat: now,
    exp: now + maxAgeSeconds,
    user: createSessionUserSnapshot(user) };

  const body = stringToBase64Url(JSON.stringify(payload));
  const signature = await signValue(body);
  return `${body}.${signature}`;
}

export async function verifySessionTokenWithSecret(token: string | null | undefined, secret: string) {
  if (!token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const isValid = await verifySignatureWithSecret(body, signature, secret);
  if (!isValid) return null;

  try {
    const payload = JSON.parse(base64UrlToString(body)) as SerializedSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.user?.name || !payload.exp || payload.exp <= now) {
      return null;
    }
    // 강제 로그아웃 시간 검증
    const forceLogoutAt = (payload.user as Record<string, unknown>).force_logout_at;
    if (forceLogoutAt && payload.iat) {
      const forceLogoutTime = new Date(String(forceLogoutAt)).getTime() / 1000;
      if (Number.isFinite(forceLogoutTime) && forceLogoutTime > payload.iat) {
        return null; // 토큰 발급 이후 강제 로그아웃이 수행되었으면 토큰 즉시 무효화
      }
    }
    // 압축된 pt/pf 배열을 permissions 객체로 되돌린 뒤 정규화한다.
    // 예전 형식(permissions 객체)도 그대로 받아들이므로 기존 로그인 세션이 끊기지 않는다.
    const rawUser = payload.user as Record<string, any>;
    const expandedUser: Record<string, any> = {
      ...rawUser,
      permissions: expandSessionPermissions(rawUser),
    };
    delete expandedUser.pt;
    delete expandedUser.pf;

    return {
      ...payload,
      user: normalizeSessionUser(expandedUser) };
  } catch {
    return null;
  }
}

/**
 * DB의 최신 force_logout_at과 비교하여 무효화 여부 검증 (민감 API용)
 */
export async function isStaffForceLoggedOutInDb(d1: unknown, staffId: string, tokenIat?: number): Promise<boolean> {
  if (!staffId || !tokenIat || !d1) return false;
  try {
    const bind = d1 as { prepare: (sql: string) => { bind: (...args: unknown[]) => { first: <T>() => Promise<T | null> } } };
    const row = await bind.prepare('SELECT force_logout_at FROM staff_members WHERE id = ? LIMIT 1').bind(staffId).first<{ force_logout_at?: string | null }>();
    if (row?.force_logout_at) {
      const dbLogoutTime = new Date(String(row.force_logout_at)).getTime() / 1000;
      if (Number.isFinite(dbLogoutTime) && dbLogoutTime > tokenIat) {
        return true; // 무효화된 토큰
      }
    }
  } catch (err) {
    console.warn('[isStaffForceLoggedOutInDb] check failed', err);
  }
  return false;
}

export async function verifySessionToken(token?: string | null) {
  return verifySessionTokenWithSecret(token, getSessionSecret());
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

  const session = await verifySessionToken(token);
  if (!session) return null;

  const staffId = String(session.user.id ?? '').trim();
  if (!staffId) return session;
  const d1 = await getD1Binding();
  if (!d1) return session;
  if (await isStaffForceLoggedOutInDb(d1, staffId, session.iat)) return null;

  return session;
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
  return Boolean(
    user?.is_system_master === true ||
    user?.role === 'admin' ||
    user?.permissions?.admin ||
    user?.permissions?.mso ||
    user?.permissions?.system_master
  );
}

export function isSystemMasterSession(user?: SessionUser | null) {
  return Boolean(
    user?.permissions?.system_master === true ||
    (user as Record<string, unknown> | undefined)?.is_system_master === true
  );
}

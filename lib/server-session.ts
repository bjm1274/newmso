import { normalizeProfileUser } from './profile-photo';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  eq,
  or,
} from '@/lib/db';

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
  const secret = process.env.SESSION_SECRET?.trim() || process.env.NEXT_PUBLIC_SESSION_SECRET?.trim();
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

/**
 * 압축 토큰 표식.
 *
 * `~` 는 base64url 알파벳([A-Za-z0-9_-])에 없어서, 이 접두사가 붙어 있으면
 * 압축본임을 확실히 구분할 수 있다. 접두사가 없는 예전 토큰은 종전대로
 * 평문 base64url 로 읽는다 — 이미 로그인한 세션이 끊기지 않는다.
 */
const COMPRESSED_BODY_PREFIX = 'z~';

/** payload JSON → 압축 body (평문 base64url). */
async function compressBody(json: string): Promise<string | null> {
  return stringToBase64Url(json);
}

/** body → payload JSON. */
async function decompressBody(body: string): Promise<string | null> {
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

/**
 * 쿠키 하나가 담을 수 있는 최대 크기(이름+값). 브라우저 공통 한도가 4096 이다.
 * 쿠키 이름·속성이 함께 세므로 여유를 두고 토큰 자체를 이 값으로 제한한다.
 */
const MAX_SESSION_TOKEN_BYTES = 3600;

/**
 * 세션 토큰을 만든다. **쿠키 한도를 넘기지 않는 것이 최우선이다.**
 *
 * 권한을 세션에 담기 시작한 뒤(FB3), 권한이 많은 계정은 pt/pf 로 압축해도
 * 4096 바이트를 넘었다. 그러면 브라우저가 Set-Cookie 를 **조용히 버린다** —
 * 서버는 200 을 주고 실패 기록도 남지 않는데 사용자에게는 "로그인을 눌러도
 * 아무 반응이 없는" 것으로 보인다. 원인을 짐작할 단서가 화면에 하나도 없다.
 *
 * 그래서 한도를 넘으면 권한 payload 를 떼고 다시 만든다. 권한이 빠진 세션도
 * 로그인 자체는 성립하고, 권한이 필요한 경로는 resolveLatestSessionUser 가
 * DB 에서 최신 권한을 읽어 채운다. 화면이 잠깐 좁게 보일 수는 있어도
 * **아무도 로그인하지 못하는 것보다는 낫다.**
 */
export async function createSessionToken(user: any, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const snapshot = createSessionUserSnapshot(user);

  const build = async (userPayload: SerializedSessionUser) => {
    const payload: SerializedSessionPayload = {
      ver: 1,
      iat: now,
      exp: now + maxAgeSeconds,
      user: userPayload };
    const json = JSON.stringify(payload);
    const body = stringToBase64Url(json);
    const signature = await signValue(body);
    return `${body}.${signature}`;
  };

  const token = await build(snapshot);
  if (token.length <= MAX_SESSION_TOKEN_BYTES) return token;

  // 1차 축소: 값이 false 인 권한 목록(pf)은 없어도 판정이 달라지지 않는다.
  // (읽는 쪽은 pt 에 없는 키를 미부여로 취급한다.)
  const withoutFalse: SerializedSessionUser = { ...snapshot, pf: undefined };
  const trimmed = await build(withoutFalse);
  if (trimmed.length <= MAX_SESSION_TOKEN_BYTES) {
    console.warn(
      `[server-session] 세션 토큰이 커서 미부여 권한 목록을 뺐습니다 `
      + `(${token.length} → ${trimmed.length}바이트, id=${snapshot.id ?? '?'})`,
    );
    return trimmed;
  }

  // 2차 축소: 권한을 통째로 뺀다. 권한은 DB 에서 다시 읽힌다.
  const withoutPermissions: SerializedSessionUser = { ...snapshot, pt: undefined, pf: undefined };
  const minimal = await build(withoutPermissions);
  console.warn(
    `[server-session] 세션 토큰이 쿠키 한도를 넘어 권한을 제외했습니다 `
    + `(${token.length} → ${minimal.length}바이트, id=${snapshot.id ?? '?'}). `
    + '권한은 요청 시 DB 에서 조회됩니다.',
  );
  return minimal;
}

export async function verifySessionTokenWithSecret(token: string | null | undefined, secret: string) {
  if (!token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const isValid = await verifySignatureWithSecret(body, signature, secret);
  if (!isValid) return null;

  try {
    const json = await decompressBody(body);
    if (!json) return null;
    const payload = JSON.parse(json) as SerializedSessionPayload;
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

/** 조회가 던졌을 때 다시 시도하는 횟수 (총 시도 = 1 + 이 값). */
const FORCE_LOGOUT_CHECK_RETRIES = 2;
/** 재시도 간 대기(ms). attempt 마다 배수로 늘어난다 — 60ms, 120ms. */
const FORCE_LOGOUT_CHECK_RETRY_DELAY_MS = 60;

/**
 * DB의 최신 force_logout_at과 비교하여 무효화 여부 검증 (민감 API용)
 *
 * 조회 실패 시 fail-closed(= 무효화된 토큰으로 간주)다. 예전에는 catch 가 false 를
 * 돌려줘서, D1 조회가 실패하는 동안 강제 로그아웃·퇴사 세션 회수가 통째로 무력화됐다.
 * 이 판정이 저장소 유일한 세션 무효화 수단이라(토큰 안 force_logout_at 은 발급 시점
 * 스냅샷이라 재발급되면 사라진다) 여기가 열리면 무효화 자체가 없는 것과 같다.
 *
 * 다만 그냥 닫으면 안 되는 이유가 있어서 재시도를 먼저 둔다.
 *  - 이 함수는 readSessionFromRequest 안에서 불리고, 그 함수는 API 라우트 140여 곳이
 *    **요청마다** 부른다. 즉 실패 판정 한 번의 영향 범위가 전 직원 × 전 요청이다.
 *  - 게다가 GET /api/auth/session 은 세션이 null 이면 쿠키를 지운다
 *    (app/api/auth/session/route.ts:14-19 clearSessionCookie). 클라이언트는 30분 주기 +
 *    포그라운드 복귀마다 이 GET 을 치므로(app/main/page.tsx:657-712), 순간 오류 한 번이
 *    "잠깐 401" 이 아니라 **비밀번호 재입력이 필요한 진짜 로그아웃**이 된다.
 * 그래서 PK 단건 조회를 세 번까지 시도하고, 세 번 다 실패했을 때만 닫는다. 순간 오류는
 * 대개 첫 재시도에서 풀리고, 세 번 연속 실패는 D1 장애 — 그때는 ERP 자체가 못 쓰는
 * 상태이므로 세션을 살려 두는 쪽의 이득이 없다.
 *
 * 행이 없을 때(row == null)는 그대로 통과시킨다. 사번 없는 특권 로그인처럼
 * staff_members 에 대응 행이 없는 정상 세션이 있어서, 여기까지 닫으면 정상 사용자가 막힌다.
 */
export async function isStaffForceLoggedOutInDb(d1: unknown, staffId: string, tokenIat?: number): Promise<boolean> {
  // 판정에 필요한 입력이 없으면 '조회 실패' 가 아니라 '판정 대상 아님' 이다 → 통과.
  // (binding 부재는 호출부 readSessionFromRequest 가 이미 앞에서 걸러낸다.)
  if (!staffId || !tokenIat || !d1) return false;

  const bind = d1 as { prepare: (sql: string) => { bind: (...args: unknown[]) => { first: <T>() => Promise<T | null> } } };
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= FORCE_LOGOUT_CHECK_RETRIES; attempt += 1) {
    try {
      const row = await bind
        .prepare('SELECT force_logout_at, status, role, is_active, resigned_at, resign_date FROM staff_members WHERE id = ? LIMIT 1')
        .bind(staffId)
        .first<{
          force_logout_at?: string | null;
          status?: string | null;
          role?: string | null;
          is_active?: number | boolean | null;
          resigned_at?: string | null;
          resign_date?: string | null;
        }>();

      if (row) {
        const st = String(row.status || '').trim();
        const rl = String(row.role || '').trim();
        const act = row.is_active;
        if (st === '퇴사' || st === '퇴직' || st === 'resigned' || rl === 'inactive' || act === 0 || act === false) {
          return true; // 퇴사/비활성 계정 세션 즉시 무효화
        }

        if (row.force_logout_at) {
          const dbLogoutTime = new Date(String(row.force_logout_at)).getTime() / 1000;
          if (Number.isFinite(dbLogoutTime) && dbLogoutTime > tokenIat) {
            return true; // 무효화된 토큰
          }
        }
      }
      return false; // 조회 성공 — 재직 중 및 무효화 기록 없음
    } catch (err) {
      lastError = err;
      if (attempt < FORCE_LOGOUT_CHECK_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, FORCE_LOGOUT_CHECK_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  // 여기까지 왔으면 재시도까지 전부 실패 — 무효화 여부를 알 수 없다. 모른 채로 통과시키지 않는다.
  console.error(
    `[isStaffForceLoggedOutInDb] ${FORCE_LOGOUT_CHECK_RETRIES + 1}회 모두 실패 — 세션을 무효 처리합니다(fail-closed). staffId=${staffId}`,
    lastError,
  );
  return true;
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
    secure: false,
    path: '/',
    maxAge: maxAgeSeconds,
    // 일부 모바일 웹뷰는 Max-Age 만 있으면 세션 쿠키로 취급해 앱 종료 시 소실시킨다 → Expires 동시 지정.
    expires: new Date(Date.now() + maxAgeSeconds * 1000) };
}

export function clearSessionCookie<T extends { cookies: { set: (name: string, value: string, options: CookieOptions) => void } }>(response: T): T {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
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

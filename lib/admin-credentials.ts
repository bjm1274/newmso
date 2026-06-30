import bcrypt from 'bcryptjs';

const LEGACY_ADMIN_LOGIN_IDS: string[] = [];
type PrivilegedKind = 'admin' | 'master';
type PrivilegedVerificationResult =
  | { ok: true; kind: PrivilegedKind }
  | { ok: false; kind: null };

export function getRuntimeEnv(key: string) {
  return process.env[key] || '';
}

export function getAdminCredentialConfig() {
  return {
    adminName: getRuntimeEnv('ADMIN_NAME'),
    adminPasswordHash: getRuntimeEnv('ADMIN_PASSWORD_HASH'),
    masterId: getRuntimeEnv('MASTER_ID'),
    masterPasswordHash: getRuntimeEnv('MASTER_PASSWORD_HASH') };
}

async function matchesConfiguredPassword(
  inputPassword: string,
  configuredPassword: string,
) {
  const normalizedConfiguredPassword = String(configuredPassword || '').trim();
  const normalizedInputPassword = String(inputPassword || '');

  if (!normalizedConfiguredPassword) return false;

  if (normalizedConfiguredPassword.startsWith('$2')) {
    try {
      return await bcrypt.compare(normalizedInputPassword, normalizedConfiguredPassword);
    } catch {
      return false;
    }
  }

  return false;
}

function collectUserIdentifiers(user: any) {
  return new Set(
    [user?.id, user?.name, user?.employee_no, user?.master_id]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  );
}

function matchesAdminLoginId(loginId: string, adminName: string) {
  const normalizedLoginId = String(loginId || '').trim();
  if (!normalizedLoginId) return false;

  return normalizedLoginId === adminName || LEGACY_ADMIN_LOGIN_IDS.includes(normalizedLoginId);
}

function matchesAdminSessionUser(user: any, adminName: string) {
  const identifiers = collectUserIdentifiers(user);
  if (adminName && identifiers.has(adminName)) return true;
  return LEGACY_ADMIN_LOGIN_IDS.some((loginId) => identifiers.has(loginId));
}

function matchesMasterSessionUser(user: any, masterId: string) {
  if (user?.is_system_master) return true;
  const identifiers = collectUserIdentifiers(user);
  return Boolean(masterId && identifiers.has(masterId));
}

export async function verifyPrivilegedLogin(
  loginId: string,
  password: string
): Promise<PrivilegedVerificationResult> {
  const { adminName, adminPasswordHash, masterId, masterPasswordHash } = getAdminCredentialConfig();

  if (matchesAdminLoginId(loginId, adminName)) {
    const matched = await matchesConfiguredPassword(password, adminPasswordHash);
    if (matched) {
      return { ok: true, kind: 'admin' };
    }
  }

  if (String(loginId || '').trim() === masterId) {
    const matched = await matchesConfiguredPassword(password, masterPasswordHash);
    if (matched) {
      return { ok: true, kind: 'master' };
    }
  }

  return { ok: false, kind: null };
}

export async function verifyPrivilegedSessionPassword(
  user: any,
  password: string
): Promise<PrivilegedVerificationResult> {
  const { adminName, adminPasswordHash, masterId, masterPasswordHash } = getAdminCredentialConfig();

  if (matchesAdminSessionUser(user, adminName)) {
    const matched = await matchesConfiguredPassword(password, adminPasswordHash);
    if (matched) {
      return { ok: true, kind: 'admin' };
    }
  }

  if (matchesMasterSessionUser(user, masterId)) {
    const matched = await matchesConfiguredPassword(password, masterPasswordHash);
    if (matched) {
      return { ok: true, kind: 'master' };
    }
  }

  return { ok: false, kind: null };
}

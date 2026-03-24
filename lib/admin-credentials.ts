import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// 레거시 비밀번호 제거 - 환경변수 해시만 사용
const LEGACY_ADMIN_PASSWORD = '';
const LEGACY_ADMIN_LOGIN_IDS = ['1'];
type PrivilegedKind = 'admin' | 'master';
type PrivilegedVerificationResult =
  | { ok: true; kind: PrivilegedKind }
  | { ok: false; kind: null };

function readEnvFileValue(key: string) {
  const envFiles = ['.env.local', '.env'];

  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile);
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
      const separatorIndex = normalized.indexOf('=');
      if (separatorIndex === -1) continue;

      const name = normalized.slice(0, separatorIndex).trim();
      if (name !== key) continue;

      const rawValue = normalized.slice(separatorIndex + 1).trim();
      if (!rawValue) return '';

      if (
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ) {
        return rawValue.slice(1, -1);
      }

      return rawValue;
    }
  }

  return '';
}

export function getRuntimeEnv(key: string) {
  return process.env[key] || readEnvFileValue(key);
}

export function getAdminCredentialConfig() {
  return {
    adminName: getRuntimeEnv('ADMIN_NAME'),
    adminPasswordHash: getRuntimeEnv('ADMIN_PASSWORD_HASH'),
    masterId: getRuntimeEnv('MASTER_ID'),
    masterPasswordHash: getRuntimeEnv('MASTER_PASSWORD_HASH'),
  };
}

async function matchesConfiguredPassword(
  inputPassword: string,
  configuredPassword: string,
  legacyPassword?: string
) {
  const normalizedConfiguredPassword = String(configuredPassword || '').trim();
  const normalizedInputPassword = String(inputPassword || '');

  let matched = false;

  if (normalizedConfiguredPassword) {
    if (normalizedConfiguredPassword.startsWith('$2')) {
      try {
        matched = await bcrypt.compare(normalizedInputPassword, normalizedConfiguredPassword);
      } catch {
        matched = false;
      }
    } else {
      matched = normalizedConfiguredPassword === normalizedInputPassword;
    }
  }

  if (matched) {
    return true;
  }

  return Boolean(legacyPassword && normalizedInputPassword === legacyPassword);
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
    const matched = await matchesConfiguredPassword(password, adminPasswordHash, LEGACY_ADMIN_PASSWORD);
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
    const matched = await matchesConfiguredPassword(password, adminPasswordHash, LEGACY_ADMIN_PASSWORD);
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

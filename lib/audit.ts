import { STORAGE_KEYS } from './storage-keys';
import {
  audit_logs as auditLogsTable,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend } from './db';
import { logD1BindingMissing } from './db/mirror-metrics';

export type AuditAction = string;

const FULL_MASK_KEYS = new Set([
  'password',
  'passwd',
]);

const PARTIAL_MASK_KEYS = new Set([
  'resident_no',
  'bank_account',
  'account_number',
  'phone',
  'email',
]);

function maskStringValue(value: string, key: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (key === 'resident_no') {
    const normalized = trimmed.replace(/\s/g, '');
    if (normalized.length <= 7) return `${normalized.slice(0, 1)}******`;
    return `${normalized.slice(0, 7)}******`;
  }

  if (key === 'bank_account' || key === 'account_number') {
    const normalized = trimmed.replace(/\s/g, '');
    if (normalized.length <= 4) return `****${normalized.slice(-2)}`;
    return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
  }

  if (key === 'phone') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 8) return '***';
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }

  if (key === 'email') {
    const [localPart, domainPart] = trimmed.split('@');
    if (!domainPart) return '***';
    const safeLocal = localPart.length <= 2
      ? `${localPart.slice(0, 1)}*`
      : `${localPart.slice(0, 2)}***`;
    return `${safeLocal}@${domainPart}`;
  }

  return `${trimmed.slice(0, 2)}***`;
}

export function sanitizeAuditValue(value: unknown, key = ''): unknown {
  if (value === null || value === undefined) return value;

  if (FULL_MASK_KEYS.has(key)) {
    return '[PROTECTED]';
  }

  if (typeof value === 'string') {
    return PARTIAL_MASK_KEYS.has(key) ? maskStringValue(value, key) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, key));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [childKey, childValue]) => {
      acc[childKey] = sanitizeAuditValue(childValue, childKey);
      return acc;
    }, {});
  }

  return value;
}

export function buildAuditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys?: string[]
) {
  const beforeRecord = before || {};
  const afterRecord = after || {};
  const candidateKeys = keys || Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]));

  const changed_fields: string[] = [];
  const before_values: Record<string, unknown> = {};
  const after_values: Record<string, unknown> = {};

  candidateKeys.forEach((key) => {
    const beforeValue = beforeRecord[key];
    const afterValue = afterRecord[key];

    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      return;
    }

    changed_fields.push(key);
    before_values[key] = sanitizeAuditValue(beforeValue, key);
    after_values[key] = sanitizeAuditValue(afterValue, key);
  });

  return {
    changed_fields,
    before: before_values,
    after: after_values };
}

export function readClientAuditActor() {
  if (typeof window === 'undefined') {
    return { userId: undefined, userName: undefined };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.USER);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      userId: parsed?.id,
      userName: parsed?.name };
  } catch {
    return { userId: undefined, userName: undefined };
  }
}

// D1 binding 필수 — Workers env 가 없으면 throw. (서버 라우트 안에서만 호출)
async function requireD1ForAuditLogs(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[audit_logs] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

export async function logAudit(
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown>,
  userId?: string,
  userName?: string
) {
  const createdAt = new Date().toISOString();
  try {
    // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat db 경유
    if (typeof window !== 'undefined') {
      const { db: db } = await import('./db-client');
      const { error } = await db.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: userId || null,
        user_name: userName || null,
        action,
        target_type: targetType,
        target_id: targetId,
        details,
        created_at: createdAt });
      if (error) {
        console.warn('[audit_logs] logAudit (client):', error.message);
      }
      return;
    }
    // 서버: D1 binding 직접 INSERT — details(jsonb) → text(JSON.stringify) 변환
    const db = await requireD1ForAuditLogs('logAudit');
    await db.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      user_id: userId || null,
      user_name: userName || null,
      action,
      target_type: targetType,
      target_id: targetId,
      details: JSON.stringify(details),
      created_at: createdAt });
  } catch (e) {
    console.error('Audit log failed:', e);
  }
}

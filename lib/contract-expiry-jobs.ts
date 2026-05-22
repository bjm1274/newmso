import 'server-only';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import type { NotificationRow } from './notification-utils';
import {
  getD1Binding,
  getD1Drizzle,
  notifications as notificationsTable,
  staff_members as staffMembersTable,
  eq,
  and,
  inArray,
} from './db';
import { logD1BindingMissing } from './db/mirror-metrics';

/**
 * 수습기간/계약기간 만료 알림 잡.
 *
 * 정책:
 *  - 만료 7일 전(±0일 윈도우, 즉 정확히 7일 후 만료) 1회 발송
 *  - 대상 = 관리자 권한을 가진 직원들 (role=admin or permissions.admin)
 *  - 한 직원·한 만료일·한 종류(probation/contract) 조합당 1회만 (중복 방지 dedup_key)
 *  - 수습 만료일 = joined_at + permissions.probation_months
 *  - 계약 만료일 = permissions.contract_end_date (고용형태=계약직)
 *
 * 호출:
 *  - app/api/cron/push-subscription-cleanup/route.ts 에서 runContractExpiryJobs 호출
 *  - license-expiry-jobs 와 동일한 KST 12:00 cron 슬롯에 통합 실행
 *  - try/catch 로 격리, 본 잡 실패가 cleanup·license 결과에 영향 없음
 */

// 만료까지 며칠 전에 알림 발송할지(7일)
const LEAD_DAYS = 7;

type StaffRow = {
  id: string;
  name: string | null;
  company: string | null;
  department: string | null;
  position: string | null;
  joined_at: string | null;
  join_date: string | null;
  status: string | null;
  role: string | null;
  permissions: Record<string, unknown> | null;
};

type ExpiryKind = 'probation' | 'contract';

type ExpiryCandidate = {
  staffId: string;
  staffName: string;
  staffCompany: string;
  staffDepartment: string;
  staffPosition: string;
  kind: ExpiryKind;
  expiryDate: string; // 'YYYY-MM-DD'
};

export type ContractExpiryJobResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
};

type NotificationsD1Row = typeof notificationsTable.$inferInsert;

function normalizeNotificationForD1(row: NotificationRow): NotificationsD1Row {
  return {
    id: row.id ?? crypto.randomUUID(),
    user_id: row.user_id ?? null,
    type: row.type ?? null,
    title: row.title ?? null,
    body: row.body ?? null,
    metadata:
      row.metadata === null || row.metadata === undefined
        ? null
        : JSON.stringify(row.metadata),
    read_at: row.read_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

async function requireD1ForContractJobs(label: string) {
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend: 'd1' });
    throw new Error(`[contract-expiry-jobs] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

function readNumberField(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** 'YYYY-MM-DD' 문자열을 Date(UTC 자정)로 변환. 잘못된 값은 null. */
function parseDateKey(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [y, m, d] = normalized.split('-').map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** base 날짜에 monthsToAdd 개월을 더해 'YYYY-MM-DD' 반환. 음수/0이면 null. */
function addMonthsDateKey(base: Date, monthsToAdd: number): string | null {
  if (!Number.isFinite(monthsToAdd) || monthsToAdd <= 0) return null;
  const next = new Date(base.getTime());
  next.setUTCMonth(next.getUTCMonth() + Math.trunc(monthsToAdd));
  return formatKoreanDateKey(next);
}

function daysBetween(target: Date, base: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const t = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const b = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return Math.round((t - b) / MS_PER_DAY);
}

/** 직원 row 에서 수습/계약 만료 후보를 추출. */
function extractCandidatesForStaff(row: StaffRow, today: Date): ExpiryCandidate[] {
  if (!row?.id) return [];
  // 퇴사자는 제외
  const status = String(row.status ?? '').trim();
  if (status && status !== '재직') return [];

  const permissions = isPlainRecord(row.permissions) ? row.permissions : {};
  const employmentType =
    readStringField(permissions, 'employment_type') ||
    readStringField(permissions, 'current_work_type') ||
    '';

  const result: ExpiryCandidate[] = [];

  const staffName = String(row.name ?? '').trim() || '(이름 미상)';
  const staffCompany = String(row.company ?? '').trim();
  const staffDepartment = String(row.department ?? '').trim();
  const staffPosition = String(row.position ?? '').trim();

  // 수습 만료일: joined_at + probation_months
  const joinedAt = parseDateKey(row.joined_at) || parseDateKey(row.join_date);
  const probationMonths = readNumberField(permissions, 'probation_months');
  if (joinedAt && probationMonths > 0) {
    const probationEnd = addMonthsDateKey(joinedAt, probationMonths);
    const probationEndDate = parseDateKey(probationEnd);
    if (probationEnd && probationEndDate) {
      const daysLeft = daysBetween(probationEndDate, today);
      if (daysLeft === LEAD_DAYS) {
        result.push({
          staffId: row.id,
          staffName,
          staffCompany,
          staffDepartment,
          staffPosition,
          kind: 'probation',
          expiryDate: probationEnd,
        });
      }
    }
  }

  // 계약 만료일: permissions.contract_end_date (계약직만)
  if (employmentType === '계약직') {
    const contractEndRaw = readStringField(permissions, 'contract_end_date');
    const contractEndDate = parseDateKey(contractEndRaw);
    if (contractEndDate) {
      const daysLeft = daysBetween(contractEndDate, today);
      if (daysLeft === LEAD_DAYS) {
        result.push({
          staffId: row.id,
          staffName,
          staffCompany,
          staffDepartment,
          staffPosition,
          kind: 'contract',
          expiryDate: contractEndRaw.slice(0, 10),
        });
      }
    }
  }

  return result;
}

/** 관리자 직원 id 목록 추출. */
function pickAdminStaffIds(rows: StaffRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const status = String(row.status ?? '').trim();
    if (status && status !== '재직') continue;
    const role = String(row.role ?? '').trim().toLowerCase();
    const permissions = isPlainRecord(row.permissions) ? row.permissions : {};
    const adminFlag = permissions.admin;
    const hasAdminPerm =
      adminFlag === true ||
      adminFlag === 1 ||
      adminFlag === '1' ||
      adminFlag === 'true';
    if (role === 'admin' || hasAdminPerm) {
      ids.push(row.id);
    }
  }
  return ids;
}

function buildNotification(
  candidate: ExpiryCandidate,
  recipientStaffId: string,
): NotificationRow {
  const kindLabel = candidate.kind === 'probation' ? '수습기간' : '계약기간';
  const titleSuffix = candidate.kind === 'probation' ? '수습 만료 예정' : '계약 만료 예정';
  const orgParts = [candidate.staffCompany, candidate.staffDepartment, candidate.staffPosition]
    .filter(Boolean)
    .join(' · ');
  const orgText = orgParts ? ` (${orgParts})` : '';
  const dedupKey = `${candidate.staffId}|${candidate.kind}|${candidate.expiryDate}`;
  return {
    user_id: recipientStaffId,
    type: 'contract_expiry',
    title: `${titleSuffix} — ${candidate.staffName}`,
    body: `${candidate.staffName}${orgText}님의 ${kindLabel}이(가) ${candidate.expiryDate} 만료됩니다. 갱신 또는 후속 조치를 검토해 주세요.`,
    metadata: {
      type: 'contract_expiry',
      kind: candidate.kind,
      staff_id: candidate.staffId,
      staff_name: candidate.staffName,
      expiry_date: candidate.expiryDate,
      dedup_key: dedupKey,
      days_left: LEAD_DAYS,
    },
    read_at: null,
  };
}

/** 메인 잡. */
export async function processContractExpiry(): Promise<ContractExpiryJobResult> {
  const todayKey = formatKoreanDateKey(new Date());
  const today = parseDateKey(todayKey);
  if (!today) {
    return { scanned: 0, sent: 0, skipped: 0, errors: ['invalid_today_key'] };
  }

  let rows: StaffRow[];

  {
    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'processContractExpiry:staffQuery', backend: 'd1' });
      throw new Error('[contract-expiry-jobs] D1 binding not available (processContractExpiry:staffQuery)');
    }
    const db = getD1Drizzle(d1);
    const staffRows = await db
      .select({
        id: staffMembersTable.id,
        name: staffMembersTable.name,
        company: staffMembersTable.company,
        department: staffMembersTable.department,
        position: staffMembersTable.position,
        joined_at: staffMembersTable.joined_at,
        join_date: staffMembersTable.join_date,
        status: staffMembersTable.status,
        role: staffMembersTable.role,
        permissions: staffMembersTable.permissions,
      })
      .from(staffMembersTable);
    // permissions는 D1에서 TEXT(JSON) → 파싱
    rows = staffRows.map((r) => {
      let permissions: Record<string, unknown> | null = null;
      if (typeof r.permissions === 'string' && r.permissions.length > 0) {
        try {
          const parsed = JSON.parse(r.permissions) as unknown;
          if (isPlainRecord(parsed)) permissions = parsed;
        } catch { /* 파싱 실패 → null */ }
      } else if (isPlainRecord(r.permissions)) {
        permissions = r.permissions as Record<string, unknown>;
      }
      return {
        id: r.id,
        name: r.name ?? null,
        company: r.company ?? null,
        department: r.department ?? null,
        position: r.position ?? null,
        joined_at: r.joined_at ?? null,
        join_date: r.join_date ?? null,
        status: r.status ?? null,
        role: r.role ?? null,
        permissions,
      };
    });
  }

  if (rows.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [] };
  }

  // 후보 수집
  const candidates: ExpiryCandidate[] = [];
  for (const row of rows) {
    const items = extractCandidatesForStaff(row, today);
    for (const item of items) candidates.push(item);
  }

  if (candidates.length === 0) {
    return { scanned: rows.length, sent: 0, skipped: 0, errors: [] };
  }

  // 수신자(관리자) 목록
  const adminIds = pickAdminStaffIds(rows);
  if (adminIds.length === 0) {
    return {
      scanned: rows.length,
      sent: 0,
      skipped: candidates.length,
      errors: ['no_admin_recipients'],
    };
  }

  // 중복 방지: 이미 발송된 (수신자|staff|kind|expiryDate) 조합 조회.
  // dedup_key = staff_id|kind|expiry_date 로 metadata에 박혀 있음.
  const dedupKeys = new Set(
    candidates.map((c) => `${c.staffId}|${c.kind}|${c.expiryDate}`),
  );

  type ExistingNotifRow = { user_id: string | null; metadata: Record<string, unknown> | null };
  let existingNotifRows: ExistingNotifRow[];

  {
    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'processContractExpiry:notifQuery', backend: 'd1' });
      throw new Error('[contract-expiry-jobs] D1 binding not available (processContractExpiry:notifQuery)');
    }
    const db = getD1Drizzle(d1);
    const notifRows = await db
      .select({ user_id: notificationsTable.user_id, metadata: notificationsTable.metadata })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.type, 'contract_expiry'),
          inArray(notificationsTable.user_id, adminIds),
        ),
      );
    existingNotifRows = notifRows.map((r) => {
      let metadata: Record<string, unknown> | null = null;
      if (typeof r.metadata === 'string' && r.metadata.length > 0) {
        try {
          const parsed = JSON.parse(r.metadata) as unknown;
          if (isPlainRecord(parsed)) metadata = parsed;
        } catch { /* 파싱 실패 → null */ }
      } else if (isPlainRecord(r.metadata)) {
        metadata = r.metadata as Record<string, unknown>;
      }
      return { user_id: r.user_id ?? null, metadata };
    });
  }

  const sentSet = new Set<string>();
  for (const row of existingNotifRows) {
    if (!row.user_id) continue;
    const metadata = isPlainRecord(row.metadata) ? row.metadata : {};
    const key =
      typeof metadata.dedup_key === 'string'
        ? metadata.dedup_key
        : `${String(metadata.staff_id ?? '')}|${String(metadata.kind ?? '')}|${String(metadata.expiry_date ?? '')}`;
    if (!key || key === '||') continue;
    if (!dedupKeys.has(key)) continue;
    sentSet.add(`${row.user_id}|${key}`);
  }

  // 발송 대상 row 구성
  const toInsert: NotificationRow[] = [];
  for (const candidate of candidates) {
    const dedup = `${candidate.staffId}|${candidate.kind}|${candidate.expiryDate}`;
    for (const adminId of adminIds) {
      if (sentSet.has(`${adminId}|${dedup}`)) continue;
      toInsert.push(buildNotification(candidate, adminId));
    }
  }

  if (toInsert.length === 0) {
    return {
      scanned: rows.length,
      sent: 0,
      skipped: candidates.length * adminIds.length,
      errors: [],
    };
  }

  const errors: string[] = [];
  let sent = 0;
  const db = await requireD1ForContractJobs('processContractExpiry');
  const chunkSize = 100;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    try {
      const values = chunk.map(normalizeNotificationForD1);
      await db.insert(notificationsTable).values(values);
      sent += chunk.length;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      continue;
    }
  }

  return {
    scanned: rows.length,
    sent,
    skipped: candidates.length * adminIds.length - sent,
    errors,
  };
}

export async function runContractExpiryJobs(): Promise<ContractExpiryJobResult> {
  return processContractExpiry();
}

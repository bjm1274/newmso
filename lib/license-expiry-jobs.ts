import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeCENextDue, getRenewalRule } from '@/lib/license-renewal-policy';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import type { NotificationRow } from './notification-utils';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  notifications as notificationsTable,
  staff_licenses as staffLicensesTable,
  license_continuing_education as licenseCETable,
  eq,
  and,
  inArray,
  isNull,
  isNotNull,
  lte,
  desc,
} from './db';
import { logD1BindingMissing } from './db/mirror-metrics';

// Phase 8-G — notifications 테이블 D1 직접 INSERT 전용 normalizer
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

async function requireD1ForLicenseJobs(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[license-expiry-jobs] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

// 만료 N일 전 — milestone(단계) 정의
// 같은 단계 알림은 metadata.milestone으로 중복 발송 방지
// 정책: 만료 도래 한 달 전(30일) 1회 + 일주일 전(7일) 1회
const MILESTONES = [30, 7] as const;
type Milestone = (typeof MILESTONES)[number];

// 보수교육 마감 단계: 사전 알림(30/7) + 미이수 알림(0=마감 당일/이후 첫 발송)
const CE_MILESTONES = [30, 7, 0] as const;
type CEMilestone = (typeof CE_MILESTONES)[number];

type LicenseRow = {
  id: string;
  staff_id: string;
  license_name: string | null;
  license_number: string | null;
  expiry_date: string | null;
  issuing_body: string | null;
};

type LicenseFullRow = LicenseRow & {
  license_type: string | null;
  renewed_date: string | null;
  issued_date: string | null;
};

type CERow = {
  license_id: string | null;
  staff_id: string;
  education_date: string | null;
  status: string | null;
};

type ExistingNotificationRow = {
  id: string;
  user_id: string;
  metadata: Record<string, unknown> | null;
};

export type LicenseExpiryJobResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
};

export type LicenseExpiryJobsResult = {
  expiry: LicenseExpiryJobResult;
  ce: LicenseExpiryJobResult;
};

function daysBetween(target: Date, base: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const t = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  return Math.round((t - b) / MS_PER_DAY);
}

function pickMilestone(daysLeft: number): Milestone | null {
  for (const m of MILESTONES) {
    if (daysLeft <= m && daysLeft > (MILESTONES[MILESTONES.indexOf(m) + 1] ?? -Infinity)) {
      return m;
    }
  }
  return null;
}

function buildNotification(license: LicenseRow, daysLeft: number, milestone: Milestone) {
  const licenseName = license.license_name || '면허·자격증';
  const issuer = license.issuing_body ? ` (${license.issuing_body})` : '';
  const expireText =
    daysLeft < 0
      ? `${Math.abs(daysLeft)}일 전에 만료되었습니다.`
      : daysLeft === 0
        ? '오늘 만료됩니다.'
        : `${daysLeft}일 후 만료됩니다.`;

  return {
    user_id: license.staff_id,
    type: 'license_expiry',
    title: `자격증 만료 알림 — ${licenseName}`,
    body: `${licenseName}${issuer} ${expireText} 갱신을 준비해 주세요.`,
    metadata: {
      type: 'license_expiry',
      license_id: license.id,
      license_name: licenseName,
      expiry_date: license.expiry_date,
      days_left: daysLeft,
      milestone,
    },
    read_at: null,
  };
}

export async function processLicenseExpiry(supabase: SupabaseClient): Promise<LicenseExpiryJobResult> {
  const now = new Date();
  const horizonDays = MILESTONES[0];
  const horizonDate = new Date(now.getTime());
  horizonDate.setDate(horizonDate.getDate() + horizonDays);
  const horizonIso = formatKoreanDateKey(horizonDate);

  const backend = await resolveDataBackend();
  let licenses: LicenseRow[];

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'processLicenseExpiry:staff_licenses', backend });
      throw new Error('[license-expiry-jobs] D1 binding not available (processLicenseExpiry)');
    }
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: staffLicensesTable.id,
        staff_id: staffLicensesTable.staff_id,
        license_name: staffLicensesTable.license_name,
        license_number: staffLicensesTable.license_number,
        expiry_date: staffLicensesTable.expiry_date,
        issuing_body: staffLicensesTable.issuing_body,
      })
      .from(staffLicensesTable)
      .where(
        and(
          isNotNull(staffLicensesTable.expiry_date),
          lte(staffLicensesTable.expiry_date, horizonIso),
        )
      );
    licenses = (rows ?? []) as LicenseRow[];
  } else {
    const { data: licenseRows, error: licenseError } = await supabase
      .from('staff_licenses')
      .select('id, staff_id, license_name, license_number, expiry_date, issuing_body')
      .not('expiry_date', 'is', null)
      .lte('expiry_date', horizonIso);

    if (licenseError) throw licenseError;
    licenses = (licenseRows ?? []) as LicenseRow[];
  }

  if (licenses.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [] };
  }

  const candidates: { license: LicenseRow; daysLeft: number; milestone: Milestone }[] = [];
  for (const license of licenses) {
    if (!license.expiry_date) continue;
    const expiry = new Date(license.expiry_date);
    if (Number.isNaN(expiry.getTime())) continue;
    const daysLeft = daysBetween(expiry, now);
    if (daysLeft > MILESTONES[0]) continue;
    const milestone = pickMilestone(daysLeft);
    if (milestone == null) continue;
    candidates.push({ license, daysLeft, milestone });
  }

  if (candidates.length === 0) {
    return { scanned: licenses.length, sent: 0, skipped: 0, errors: [] };
  }

  const userIds = Array.from(new Set(candidates.map((c) => c.license.staff_id)));
  let existingRows: ExistingNotificationRow[];

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-expiry-jobs] D1 binding not available (processLicenseExpiry:notifications)');
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({ id: notificationsTable.id, user_id: notificationsTable.user_id, metadata: notificationsTable.metadata })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.type, 'license_expiry'),
          inArray(notificationsTable.user_id, userIds),
        )
      );
    // D1에서 metadata는 TEXT → JSON.parse
    existingRows = rows.map((row) => {
      let metadata: Record<string, unknown> | null = null;
      if (typeof row.metadata === 'string' && row.metadata.length > 0) {
        try {
          const parsed = JSON.parse(row.metadata) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            metadata = parsed as Record<string, unknown>;
          }
        } catch { metadata = null; }
      } else if (row.metadata && typeof row.metadata === 'object') {
        metadata = row.metadata as Record<string, unknown>;
      }
      return { id: String(row.id || ''), user_id: String(row.user_id || ''), metadata };
    });
  } else {
    const { data: notifRows, error: existingError } = await supabase
      .from('notifications')
      .select('id, user_id, metadata')
      .eq('type', 'license_expiry')
      .in('user_id', userIds);
    if (existingError) throw existingError;
    existingRows = (notifRows ?? []) as ExistingNotificationRow[];
  }

  const sentKeys = new Set<string>();
  for (const row of existingRows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const licenseId = String(metadata.license_id ?? '');
    const milestone = Number(metadata.milestone ?? 0);
    if (!licenseId || !milestone) continue;
    sentKeys.add(`${row.user_id}|${licenseId}|${milestone}`);
  }

  const toInsert = candidates
    .filter((c) => !sentKeys.has(`${c.license.staff_id}|${c.license.id}|${c.milestone}`))
    .map((c) => buildNotification(c.license, c.daysLeft, c.milestone));

  if (toInsert.length === 0) {
    return { scanned: licenses.length, sent: 0, skipped: candidates.length, errors: [] };
  }

  const errors: string[] = [];
  let sent = 0;
  // Phase 8-G — D1 직접 INSERT. D1 max bind 100 한도 고려해 chunkSize=100 유지.
  // notifications 컬럼이 ~8개라 100*8=800 bind로 한 statement 한도(약 999) 이내.
  const db = await requireD1ForLicenseJobs('processLicenseExpiry');
  const chunkSize = 100;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    try {
      const values = (chunk as NotificationRow[]).map(normalizeNotificationForD1);
      await db.insert(notificationsTable).values(values);
      sent += chunk.length;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      continue;
    }
  }

  return {
    scanned: licenses.length,
    sent,
    skipped: candidates.length - toInsert.length,
    errors,
  };
}

function pickCEMilestone(daysLeft: number): CEMilestone | null {
  if (daysLeft < 0) return 0;
  for (const m of CE_MILESTONES) {
    if (m === 0) continue;
    const next = CE_MILESTONES[CE_MILESTONES.indexOf(m) + 1] ?? -Infinity;
    if (daysLeft <= m && daysLeft > next) return m;
  }
  return null;
}

function buildCENotification(
  license: LicenseFullRow,
  dueDate: string,
  daysLeft: number,
  milestone: CEMilestone,
  ceLabel: string | null,
) {
  const licenseName = license.license_name || '면허·자격증';
  const overdueText = daysLeft < 0
    ? `${Math.abs(daysLeft)}일 전 마감되었습니다`
    : daysLeft === 0
      ? '오늘 마감입니다'
      : `${daysLeft}일 남았습니다`;
  return {
    user_id: license.staff_id,
    type: 'license_ce_due',
    title: `보수교육 이수 안내 — ${licenseName}`,
    body:
      `${licenseName} 보수교육 마감일이 ${dueDate}로 ${overdueText}. ` +
      (ceLabel ? `(${ceLabel}) ` : '') +
      '이수증을 마이페이지 → 서류제출에서 업로드해 주세요.',
    metadata: {
      type: 'license_ce_due',
      license_id: license.id,
      license_name: licenseName,
      ce_due_date: dueDate,
      days_left: daysLeft,
      milestone,
    },
    read_at: null,
  };
}

export async function processCEDue(supabase: SupabaseClient): Promise<LicenseExpiryJobResult> {
  const backend = await resolveDataBackend();
  let licenses: LicenseFullRow[];

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'processCEDue:staff_licenses', backend });
      throw new Error('[license-expiry-jobs] D1 binding not available (processCEDue)');
    }
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: staffLicensesTable.id,
        staff_id: staffLicensesTable.staff_id,
        license_type: staffLicensesTable.license_type,
        license_name: staffLicensesTable.license_name,
        license_number: staffLicensesTable.license_number,
        expiry_date: staffLicensesTable.expiry_date,
        issuing_body: staffLicensesTable.issuing_body,
        renewed_date: staffLicensesTable.renewed_date,
        issued_date: staffLicensesTable.issued_date,
      })
      .from(staffLicensesTable)
      .where(isNotNull(staffLicensesTable.license_type));
    licenses = (rows ?? []) as LicenseFullRow[];
  } else {
    const { data: rows, error } = await supabase
      .from('staff_licenses')
      .select('id, staff_id, license_type, license_name, license_number, expiry_date, issuing_body, renewed_date, issued_date')
      .not('license_type', 'is', null);
    if (error) throw error;
    licenses = (rows ?? []) as LicenseFullRow[];
  }

  if (licenses.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [] };
  }

  const licenseIds = licenses.map((l) => l.id);
  let ceRawRows: CERow[];

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-expiry-jobs] D1 binding not available (processCEDue:ce)');
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        license_id: licenseCETable.license_id,
        staff_id: licenseCETable.staff_id,
        education_date: licenseCETable.education_date,
        status: licenseCETable.status,
      })
      .from(licenseCETable)
      .where(
        and(
          inArray(licenseCETable.license_id, licenseIds),
          eq(licenseCETable.status, 'approved'),
          isNotNull(licenseCETable.education_date),
        )
      )
      .orderBy(desc(licenseCETable.education_date));
    ceRawRows = (rows ?? []) as CERow[];
  } else {
    const { data: ceRows } = await supabase
      .from('license_continuing_education')
      .select('license_id, staff_id, education_date, status')
      .in('license_id', licenseIds)
      .eq('status', 'approved')
      .not('education_date', 'is', null)
      .order('education_date', { ascending: false });
    ceRawRows = (ceRows ?? []) as CERow[];
  }

  const lastCEByLicense = new Map<string, string>();
  for (const r of ceRawRows) {
    if (!r.license_id || !r.education_date) continue;
    if (!lastCEByLicense.has(r.license_id)) {
      lastCEByLicense.set(r.license_id, r.education_date);
    }
  }

  type Candidate = { license: LicenseFullRow; dueDate: string; daysLeft: number; milestone: CEMilestone; ceLabel: string | null };
  const candidates: Candidate[] = [];
  for (const license of licenses) {
    const rule = getRenewalRule(license.license_type);
    if (!rule || rule.ceMonths == null) continue;
    const lastCE = lastCEByLicense.get(license.id);
    const due = computeCENextDue({
      license_type: license.license_type,
      last_ce_date: lastCE ?? null,
      renewed_date: license.renewed_date,
      issued_date: license.issued_date,
    });
    if (!due.date || due.daysLeft == null) continue;
    const milestone = pickCEMilestone(due.daysLeft);
    if (milestone == null) continue;
    candidates.push({ license, dueDate: due.date, daysLeft: due.daysLeft, milestone, ceLabel: due.ceLabel });
  }
  if (candidates.length === 0) {
    return { scanned: licenses.length, sent: 0, skipped: 0, errors: [] };
  }

  const userIds = Array.from(new Set(candidates.map((c) => c.license.staff_id)));
  type ExistingCENotifRow = { user_id: string; metadata: Record<string, unknown> | null };
  let existingCERows: ExistingCENotifRow[];

  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-expiry-jobs] D1 binding not available (processCEDue:notifications)');
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({ user_id: notificationsTable.user_id, metadata: notificationsTable.metadata })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.type, 'license_ce_due'),
          inArray(notificationsTable.user_id, userIds),
        )
      );
    existingCERows = rows.map((row) => {
      let metadata: Record<string, unknown> | null = null;
      if (typeof row.metadata === 'string' && row.metadata.length > 0) {
        try {
          const parsed = JSON.parse(row.metadata) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            metadata = parsed as Record<string, unknown>;
          }
        } catch { metadata = null; }
      } else if (row.metadata && typeof row.metadata === 'object') {
        metadata = row.metadata as Record<string, unknown>;
      }
      return { user_id: String(row.user_id || ''), metadata };
    });
  } else {
    const { data: existingRows, error: existingError } = await supabase
      .from('notifications')
      .select('id, user_id, metadata')
      .eq('type', 'license_ce_due')
      .in('user_id', userIds);
    if (existingError) throw existingError;
    existingCERows = (existingRows ?? []) as ExistingCENotifRow[];
  }

  const sentKeys = new Set<string>();
  for (const row of existingCERows) {
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    const lid = String(m.license_id ?? '');
    const dueDate = String(m.ce_due_date ?? '');
    const milestone = m.milestone as number | string | undefined;
    if (!lid || !dueDate || milestone == null) continue;
    sentKeys.add(`${row.user_id}|${lid}|${dueDate}|${milestone}`);
  }

  const toInsert = candidates
    .filter((c) => !sentKeys.has(`${c.license.staff_id}|${c.license.id}|${c.dueDate}|${c.milestone}`))
    .map((c) => buildCENotification(c.license, c.dueDate, c.daysLeft, c.milestone, c.ceLabel));

  if (toInsert.length === 0) {
    return { scanned: licenses.length, sent: 0, skipped: candidates.length, errors: [] };
  }

  const errors: string[] = [];
  let sent = 0;
  // Phase 8-G — D1 직접 INSERT, chunkSize 100 유지 (bind 한도 가드)
  const db = await requireD1ForLicenseJobs('processCEDue');
  const chunkSize = 100;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    try {
      const values = (chunk as NotificationRow[]).map(normalizeNotificationForD1);
      await db.insert(notificationsTable).values(values);
      sent += chunk.length;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      continue;
    }
  }

  return {
    scanned: licenses.length,
    sent,
    skipped: candidates.length - toInsert.length,
    errors,
  };
}

export async function runLicenseExpiryJobs(supabase: SupabaseClient): Promise<LicenseExpiryJobsResult> {
  const expiry = await processLicenseExpiry(supabase);
  const ce = await processCEDue(supabase);
  return { expiry, ce };
}

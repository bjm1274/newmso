import 'server-only';
import { computeCENextDue, getRenewalRule } from '@/lib/license-renewal-policy';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import type { NotificationRow } from './notification-utils';
import {
  getD1Binding,
  getD1Drizzle,
  notifications as notificationsTable,
  staff_licenses as staffLicensesTable,
  license_continuing_education as licenseCETable,
  eq,
  and,
  inArray,
  isNotNull,
  lte,
  desc } from './db';
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
    created_at: row.created_at ?? new Date().toISOString() };
}

// D1 은 **쿼리 1건당 bound parameter 100개**가 한도다(lib/db/auth/claims.ts:237 과 같은 값).
// 예전 주석은 SQLite 의 SQLITE_MAX_VARIABLE_NUMBER(999)를 D1 한도로 착각해 chunkSize=100(행)
// 으로 두었는데, notifications 는 컬럼이 8개라 100행 = 800 bind 로 **13행부터 통째로 실패**했다.
// 실제 운영에서 보수교육(CE) 알림 36행(=288 bind)이 29일 연속 전량 실패했다(10차 CR10-01).
// 행 단위가 아니라 **bind 단위**로 나눠야 한다.
const D1_MAX_BIND_PARAMS = 100;
// normalizeNotificationForD1 이 만드는 컬럼 수(id·user_id·type·title·body·metadata·read_at·created_at).
const NOTIFICATION_INSERT_COLUMNS = 8;
const NOTIFICATION_INSERT_CHUNK_ROWS = Math.floor(
  D1_MAX_BIND_PARAMS / NOTIFICATION_INSERT_COLUMNS,
); // = 12행 (96 bind)

// inArray 는 값 1개당 bind 1개다. 같은 WHERE 에 붙는 고정 조건(eq/lte 등) 몫을 빼고 여유를 둔다.
const IN_ARRAY_CHUNK = 90;

function chunkList<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function requireD1ForLicenseJobs(label: string) {
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend: 'd1' });
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
  const t = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const b = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
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
      milestone },
    read_at: null };
}

export async function processLicenseExpiry(): Promise<LicenseExpiryJobResult> {
  const now = new Date();
  const horizonDays = MILESTONES[0];
  const horizonDate = new Date(now.getTime());
  horizonDate.setDate(horizonDate.getDate() + horizonDays);
  const horizonIso = formatKoreanDateKey(horizonDate);

  let licenses: LicenseRow[];

  {
    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'processLicenseExpiry:staff_licenses', backend: 'd1' });
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
        issuing_body: staffLicensesTable.issuing_body })
      .from(staffLicensesTable)
      .where(
        and(
          isNotNull(staffLicensesTable.expiry_date),
          lte(staffLicensesTable.expiry_date, horizonIso),
        )
      );
    licenses = (rows ?? []) as LicenseRow[];
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

  {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-expiry-jobs] D1 binding not available (processLicenseExpiry:notifications)');
    const db = getD1Drizzle(d1);
    // inArray 도 bind 한도를 먹는다 — 직원 수가 늘면 SELECT 자체가 죽는다(CR10-01).
    const rows: { id: string | null; user_id: string | null; metadata: unknown }[] = [];
    for (const idChunk of chunkList(userIds, IN_ARRAY_CHUNK)) {
      const part = await db
        .select({ id: notificationsTable.id, user_id: notificationsTable.user_id, metadata: notificationsTable.metadata })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.type, 'license_expiry'),
            inArray(notificationsTable.user_id, idChunk),
          )
        );
      rows.push(...(part as { id: string | null; user_id: string | null; metadata: unknown }[]));
    }
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
  }

  // 중복 방지 키에 **만료일**을 포함한다.
  //
  // 예전 키는 (직원|면허|마일스톤) 뿐이었다. 면허 갱신은 새 행을 만들지 않고
  // 같은 행의 expiry_date 를 update 하므로(app/api/license-ce/[id]/route.ts),
  // 한 번 알림이 나간 면허는 **갱신해서 새 만료일이 와도 같은 키에 걸려 다시
  // 알림이 나가지 않았다**(9차 CRON-04). 바로 아래 보수교육 쪽은 이미
  // ce_due_date 를 키에 넣고 있다 — 같은 규칙으로 맞춘다.
  //
  // legacyKeys 는 배포 직후 1회 중복 발송을 막는다. 만료일이 없던 구 알림이
  // 새 4-part 키와 매칭되지 않아 그 조합이 한 번 더 나가는 것을 흡수한다.
  const sentKeys = new Set<string>();
  const legacyKeys = new Set<string>();
  for (const row of existingRows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const licenseId = String(metadata.license_id ?? '');
    const milestone = Number(metadata.milestone ?? 0);
    if (!licenseId || !milestone) continue;
    const expiryDate = String(metadata.expiry_date ?? '').trim();
    if (expiryDate) {
      sentKeys.add(`${row.user_id}|${licenseId}|${expiryDate}|${milestone}`);
    } else {
      legacyKeys.add(`${row.user_id}|${licenseId}|${milestone}`);
    }
  }

  const toInsert = candidates
    .filter((c) => {
      const expiryDate = String(c.license.expiry_date ?? '').trim();
      if (sentKeys.has(`${c.license.staff_id}|${c.license.id}|${expiryDate}|${c.milestone}`)) {
        return false;
      }
      return !legacyKeys.has(`${c.license.staff_id}|${c.license.id}|${c.milestone}`);
    })
    .map((c) => buildNotification(c.license, c.daysLeft, c.milestone));

  if (toInsert.length === 0) {
    return { scanned: licenses.length, sent: 0, skipped: candidates.length, errors: [] };
  }

  const errors: string[] = [];
  let sent = 0;
  // Phase 8-G — D1 직접 INSERT. bind 한도(100/쿼리) 기준으로 12행씩 나눈다.
  const db = await requireD1ForLicenseJobs('processLicenseExpiry');
  const chunkSize = NOTIFICATION_INSERT_CHUNK_ROWS;
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
    errors };
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
      milestone },
    read_at: null };
}

export async function processCEDue(): Promise<LicenseExpiryJobResult> {
  let licenses: LicenseFullRow[];

  {
    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'processCEDue:staff_licenses', backend: 'd1' });
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
        issued_date: staffLicensesTable.issued_date })
      .from(staffLicensesTable)
      .where(isNotNull(staffLicensesTable.license_type));
    licenses = (rows ?? []) as LicenseFullRow[];
  }

  if (licenses.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [] };
  }

  const licenseIds = licenses.map((l) => l.id);
  let ceRawRows: CERow[];

  {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-expiry-jobs] D1 binding not available (processCEDue:ce)');
    const db = getD1Drizzle(d1);
    // 면허가 100건을 넘으면 inArray 가 bind 한도를 넘겨 SELECT 자체가 죽는다(CR10-01).
    const rows: unknown[] = [];
    for (const idChunk of chunkList(licenseIds, IN_ARRAY_CHUNK)) {
      const part = await db
        .select({
          license_id: licenseCETable.license_id,
          staff_id: licenseCETable.staff_id,
          education_date: licenseCETable.education_date,
          status: licenseCETable.status })
        .from(licenseCETable)
        .where(
          and(
            inArray(licenseCETable.license_id, idChunk),
            eq(licenseCETable.status, 'approved'),
            isNotNull(licenseCETable.education_date),
          )
        )
        .orderBy(desc(licenseCETable.education_date));
      rows.push(...(part ?? []));
    }
    ceRawRows = rows as CERow[];
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
      issued_date: license.issued_date });
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

  {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[license-expiry-jobs] D1 binding not available (processCEDue:notifications)');
    const db = getD1Drizzle(d1);
    const rows: { user_id: string | null; metadata: unknown }[] = [];
    for (const idChunk of chunkList(userIds, IN_ARRAY_CHUNK)) {
      const part = await db
        .select({ user_id: notificationsTable.user_id, metadata: notificationsTable.metadata })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.type, 'license_ce_due'),
            inArray(notificationsTable.user_id, idChunk),
          )
        );
      rows.push(...(part as { user_id: string | null; metadata: unknown }[]));
    }
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
  // Phase 8-G — D1 직접 INSERT, bind 한도(100/쿼리) 기준 12행씩 (CR10-01)
  const db = await requireD1ForLicenseJobs('processCEDue');
  const chunkSize = NOTIFICATION_INSERT_CHUNK_ROWS;
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
    errors };
}

export async function runLicenseExpiryJobs(): Promise<LicenseExpiryJobsResult> {
  const expiry = await processLicenseExpiry();
  const ce = await processCEDue();
  return { expiry, ce };
}

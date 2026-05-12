import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeCENextDue, getRenewalRule } from '@/lib/license-renewal-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

// 만료 N일 전 — milestone(단계) 정의
// 같은 단계 알림은 metadata.milestone으로 중복 발송 방지
const MILESTONES = [60, 30, 7] as const;
type Milestone = (typeof MILESTONES)[number];

// 보수교육 마감 단계: 사전 알림(60/30/7) + 미이수 알림(0=마감 당일/이후 첫 발송)
const CE_MILESTONES = [60, 30, 7, 0] as const;
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

function daysBetween(target: Date, base: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  // 일 단위로 잘라낸 뒤 차이 계산
  const t = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  return Math.round((t - b) / MS_PER_DAY);
}

function pickMilestone(daysLeft: number): Milestone | null {
  // 가장 가까운 milestone에 도달한 단계만 발송
  // 예: daysLeft=29 → 30단계 알림(아직 7단계는 아니므로 30단계만)
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

async function processLicenseExpiry(supabase: SupabaseClient) {
  const now = new Date();
  const horizonDays = MILESTONES[0]; // 60일 이내 만료 예정 조회
  const horizonDate = new Date(now.getTime());
  horizonDate.setDate(horizonDate.getDate() + horizonDays);
  const horizonIso = horizonDate.toISOString().slice(0, 10);

  const { data: licenseRows, error: licenseError } = await supabase
    .from('staff_licenses')
    .select('id, staff_id, license_name, license_number, expiry_date, issuing_body')
    .not('expiry_date', 'is', null)
    .lte('expiry_date', horizonIso);

  if (licenseError) throw licenseError;
  const licenses = (licenseRows ?? []) as LicenseRow[];
  if (licenses.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [] as string[] };
  }

  // 이번 실행에서 발송 후보인 (license_id, milestone) 쌍 계산
  const candidates: { license: LicenseRow; daysLeft: number; milestone: Milestone }[] = [];
  for (const license of licenses) {
    if (!license.expiry_date) continue;
    const expiry = new Date(license.expiry_date);
    if (Number.isNaN(expiry.getTime())) continue;
    const daysLeft = daysBetween(expiry, now);
    if (daysLeft > MILESTONES[0]) continue; // 60일 초과
    const milestone = pickMilestone(daysLeft);
    if (milestone == null) continue;
    candidates.push({ license, daysLeft, milestone });
  }

  if (candidates.length === 0) {
    return { scanned: licenses.length, sent: 0, skipped: 0, errors: [] };
  }

  // 중복 발송 방지 — 동일 (user_id, license_id, milestone) 알림이 이미 있는지 조회
  const userIds = Array.from(new Set(candidates.map((c) => c.license.staff_id)));
  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('id, user_id, metadata')
    .eq('type', 'license_expiry')
    .in('user_id', userIds);

  if (existingError) throw existingError;

  const sentKeys = new Set<string>();
  for (const row of (existingRows ?? []) as ExistingNotificationRow[]) {
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
  // Supabase insert는 큰 배열도 지원하지만, 안전을 위해 100개 단위 분할
  const chunkSize = 100;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from('notifications').insert(chunk);
    if (error) {
      errors.push(error.message);
      continue;
    }
    sent += chunk.length;
  }

  return {
    scanned: licenses.length,
    sent,
    skipped: candidates.length - toInsert.length,
    errors,
  };
}

// === 보수교육 마감 알림 ====================================================

function pickCEMilestone(daysLeft: number): CEMilestone | null {
  // daysLeft >= 0 → 사전 알림 (60/30/7), daysLeft < 0 → 마감 당일/이후 알림(0)
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

async function processCEDue(supabase: SupabaseClient) {
  // 1. 보수교육 주기가 정의된 면허 종류만 대상
  const { data: rows, error } = await supabase
    .from('staff_licenses')
    .select('id, staff_id, license_type, license_name, license_number, expiry_date, issuing_body, renewed_date, issued_date')
    .not('license_type', 'is', null);
  if (error) throw error;

  const licenses = (rows ?? []) as LicenseFullRow[];
  if (licenses.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [] as string[] };
  }

  // 2. 각 면허의 마지막 승인된 보수교육일 조회
  const licenseIds = licenses.map((l) => l.id);
  const { data: ceRows } = await supabase
    .from('license_continuing_education')
    .select('license_id, staff_id, education_date, status')
    .in('license_id', licenseIds)
    .eq('status', 'approved')
    .not('education_date', 'is', null)
    .order('education_date', { ascending: false });

  const lastCEByLicense = new Map<string, string>();
  for (const r of (ceRows ?? []) as CERow[]) {
    if (!r.license_id || !r.education_date) continue;
    if (!lastCEByLicense.has(r.license_id)) {
      lastCEByLicense.set(r.license_id, r.education_date);
    }
  }

  // 3. 각 면허의 다음 보수교육 마감일 산출 후 milestone 매칭
  type Candidate = { license: LicenseFullRow; dueDate: string; daysLeft: number; milestone: CEMilestone; ceLabel: string | null };
  const candidates: Candidate[] = [];
  for (const license of licenses) {
    const rule = getRenewalRule(license.license_type);
    if (!rule || rule.ceMonths == null) continue; // 보수교육 미적용 면허
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

  // 4. 중복 방지 — (user_id, license_id, ce_due_date, milestone)
  const userIds = Array.from(new Set(candidates.map((c) => c.license.staff_id)));
  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('id, user_id, metadata')
    .eq('type', 'license_ce_due')
    .in('user_id', userIds);
  if (existingError) throw existingError;

  const sentKeys = new Set<string>();
  for (const row of (existingRows ?? []) as { user_id: string; metadata: Record<string, unknown> | null }[]) {
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
  const chunkSize = 100;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error: insErr } = await supabase.from('notifications').insert(chunk);
    if (insErr) {
      errors.push(insErr.message);
      continue;
    }
    sent += chunk.length;
  }

  return {
    scanned: licenses.length,
    sent,
    skipped: candidates.length - toInsert.length,
    errors,
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const expiryResult = await processLicenseExpiry(supabase);
    const ceResult = await processCEDue(supabase);
    return NextResponse.json({ ok: true, expiry: expiryResult, ce: ceResult });
  } catch (err) {
    console.error('[license-expiry-check] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '자격증 만료 알림 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

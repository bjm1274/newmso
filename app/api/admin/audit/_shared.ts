/**
 * 감사 워크센터 API 공용 헬퍼 (route 아님 — _ 접두로 라우트 제외).
 *
 * - 권한 게이트 (세션 없으면 401, 관리자/시스템마스터 아니면 403)
 * - 이상 감지(detectAnomalies): audit_logs 기반 단시간 다수 삭제/권한변경 패턴
 * - 급여 이상치(detectPayrollOutliers): payroll_records 전월 대비 net_pay 급변동
 *
 * 소비처 계약(필드명) 기준으로 정확히 맞춤:
 *  - AnomalyRow: { id, kind, who, count, when, tone, reason, recommend }
 *  - OutlierRow: { id, name, changePct, reason }
 *
 * JM3: 모든 조회는 호출부에서 try/catch — 여기서는 throw 가능.
 * JM4: any 금지.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import {
  getD1Drizzle,
  audit_logs as auditLogsTable,
  payroll_records as payrollRecordsTable,
  staff_members as staffMembersTable,
  desc,
  gte } from '@/lib/db';

export type D1Db = ReturnType<typeof getD1Drizzle>;

// ─── 권한 게이트 ────────────────────────────────────────────
// 통과 시 null, 차단 시 NextResponse(401/403)를 반환.
export async function guardAuditAdmin(
  request: NextRequest,
): Promise<NextResponse | null> {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminSession(session.user) && !isNamedSystemMasterAccount(session.user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// 시스템마스터 전용 게이트 (복구 등 파괴적 작업).
export async function guardSystemMaster(
  request: NextRequest,
): Promise<NextResponse | null> {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isNamedSystemMasterAccount(session.user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// ─── 이상 감지 ──────────────────────────────────────────────
export interface AnomalyRow {
  id: string;
  kind: string;
  who: string;
  count: number;
  when: string;
  tone: 'warn' | 'danger' | 'accent';
  reason: string;
  recommend: string;
}

type AuditRow = {
  id: string | null;
  action: string | null;
  target_type: string | null;
  user_id: string | null;
  user_name: string | null;
  actor_name: string | null;
  created_at: string | null;
};

function isDestructiveAction(action: string): boolean {
  const a = action.toLowerCase();
  return a.includes('delete') || a.includes('삭제') || a.includes('reset') || a.includes('초기화') || a.includes('force');
}

function isPermissionAction(action: string, targetType: string): boolean {
  const a = action.toLowerCase();
  const t = targetType.toLowerCase();
  return (
    t.includes('permission') ||
    a.includes('permission') ||
    a.includes('role') ||
    a.includes('권한') ||
    a.includes('역할')
  );
}

function actorKey(row: AuditRow): string {
  return (
    String(row.user_id || '').trim() ||
    String(row.actor_name || '').trim() ||
    String(row.user_name || '').trim() ||
    'unknown'
  );
}

function actorLabel(row: AuditRow): string {
  return (
    String(row.actor_name || '').trim() ||
    String(row.user_name || '').trim() ||
    String(row.user_id || '').trim() ||
    '시스템'
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// 최근 7일 audit_logs에서 행위자별 단시간(1시간 윈도) 다수 삭제/권한변경을 묶어 카드화.
export async function detectAnomalies(db: D1Db): Promise<AnomalyRow[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = (await db
    .select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      target_type: auditLogsTable.target_type,
      user_id: auditLogsTable.user_id,
      user_name: auditLogsTable.user_name,
      actor_name: auditLogsTable.actor_name,
      created_at: auditLogsTable.created_at })
    .from(auditLogsTable)
    .where(gte(auditLogsTable.created_at, sevenDaysAgo))
    .orderBy(desc(auditLogsTable.created_at))
    .limit(5000)) as AuditRow[];

  // 행위자 + 종류(삭제/권한)별 집계
  type Bucket = { who: string; events: { at: string }[] };
  const destructive = new Map<string, Bucket>();
  const permission = new Map<string, Bucket>();

  for (const row of rows) {
    const action = String(row.action || '');
    const targetType = String(row.target_type || '');
    const at = String(row.created_at || '');
    if (!at) continue;
    const key = actorKey(row);
    const who = actorLabel(row);
    if (isDestructiveAction(action)) {
      const bucket = destructive.get(key) || { who, events: [] };
      bucket.events.push({ at });
      destructive.set(key, bucket);
    }
    if (isPermissionAction(action, targetType)) {
      const bucket = permission.get(key) || { who, events: [] };
      bucket.events.push({ at });
      permission.set(key, bucket);
    }
  }

  const anomalies: AnomalyRow[] = [];
  const WINDOW_MS = 60 * 60 * 1000; // 1시간

  // 단시간 다수 삭제: 1시간 내 5건 이상
  function maxBurst(events: { at: string }[]): { count: number; latest: string } {
    const times = events
      .map((e) => new Date(e.at).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    let best = 0;
    let bestLatest = '';
    let left = 0;
    for (let right = 0; right < times.length; right += 1) {
      while (times[right] - times[left] > WINDOW_MS) left += 1;
      const span = right - left + 1;
      if (span > best) {
        best = span;
        bestLatest = new Date(times[right]).toISOString();
      }
    }
    return { count: best, latest: bestLatest };
  }

  for (const [key, bucket] of destructive.entries()) {
    const burst = maxBurst(bucket.events);
    if (burst.count >= 5) {
      anomalies.push({
        id: `del-${key}`,
        kind: '대량 수정',
        who: bucket.who,
        count: burst.count,
        when: formatWhen(burst.latest),
        tone: burst.count >= 10 ? 'danger' : 'warn',
        reason: `1시간 내 삭제/초기화 작업 ${burst.count}건이 집중되었습니다.`,
        recommend: '작업 사유 확인 및 권한 점검' });
    }
  }

  for (const [key, bucket] of permission.entries()) {
    const burst = maxBurst(bucket.events);
    if (burst.count >= 3) {
      anomalies.push({
        id: `perm-${key}`,
        kind: '권한 외 접근',
        who: bucket.who,
        count: burst.count,
        when: formatWhen(burst.latest),
        tone: burst.count >= 6 ? 'danger' : 'warn',
        reason: `1시간 내 권한/역할 변경 ${burst.count}건이 집중되었습니다.`,
        recommend: '권한 변경 이력 검토' });
    }
  }

  // 비정상 시간대(00:00~05:00) 작업 — 행위자별 합산
  const nightByActor = new Map<string, { who: string; count: number; latest: string }>();
  for (const row of rows) {
    const at = String(row.created_at || '');
    if (!at) continue;
    const d = new Date(at);
    if (!Number.isFinite(d.getTime())) continue;
    // KST(UTC+9) 기준 시각으로 보정 — 서버 TZ가 UTC라 getHours()는 KST가 아님.
    const hour = new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
    if (hour >= 0 && hour < 5) {
      const key = actorKey(row);
      const entry = nightByActor.get(key) || { who: actorLabel(row), count: 0, latest: '' };
      entry.count += 1;
      if (!entry.latest || at > entry.latest) entry.latest = at;
      nightByActor.set(key, entry);
    }
  }
  for (const [key, entry] of nightByActor.entries()) {
    if (entry.count >= 5) {
      anomalies.push({
        id: `night-${key}`,
        kind: '비정상 시간',
        who: entry.who,
        count: entry.count,
        when: formatWhen(entry.latest),
        tone: 'accent',
        reason: `심야(00~05시) 시간대 작업 ${entry.count}건이 확인됩니다.`,
        recommend: '야간 작업 정당성 확인' });
    }
  }

  // 심각도(danger > warn > accent) → 건수 순으로 정렬
  const toneRank: Record<string, number> = { danger: 0, warn: 1, accent: 2 };
  return anomalies.sort((l, r) => {
    const t = (toneRank[l.tone] ?? 9) - (toneRank[r.tone] ?? 9);
    if (t !== 0) return t;
    return r.count - l.count;
  });
}

// ─── 급여 이상치 ────────────────────────────────────────────
export interface OutlierRow {
  id: string;
  name: string;
  changePct: number;
  reason: string;
}

type PayrollRow = {
  id: string | null;
  staff_id: string | null;
  year_month: string | null;
  net_pay: number | null;
};

// 전월 대비 net_pay 변동률이 ±20% 이상인 직원을 이상치로 본다.
export async function detectPayrollOutliers(db: D1Db): Promise<OutlierRow[]> {
  const rows = (await db
    .select({
      id: payrollRecordsTable.id,
      staff_id: payrollRecordsTable.staff_id,
      year_month: payrollRecordsTable.year_month,
      net_pay: payrollRecordsTable.net_pay })
    .from(payrollRecordsTable)
    .orderBy(desc(payrollRecordsTable.year_month))
    .limit(20000)) as PayrollRow[];

  // staff_id별 최신 2개월 (year_month 내림차순) 추출
  const byStaff = new Map<string, { ym: string; net: number }[]>();
  for (const row of rows) {
    const staffId = String(row.staff_id || '').trim();
    const ym = String(row.year_month || '').trim();
    if (!staffId || !ym) continue;
    const net = Number(row.net_pay);
    if (!Number.isFinite(net)) continue;
    const list = byStaff.get(staffId) || [];
    if (list.length < 2) {
      list.push({ ym, net });
      byStaff.set(staffId, list);
    }
  }

  const candidates: { staffId: string; changePct: number; curr: number; prev: number }[] = [];
  for (const [staffId, list] of byStaff.entries()) {
    if (list.length < 2) continue;
    // list[0] = 최신, list[1] = 직전 (year_month 내림차순 정렬 보장)
    const curr = list[0].net;
    const prev = list[1].net;
    if (prev <= 0) continue;
    const changePct = ((curr - prev) / prev) * 100;
    if (Math.abs(changePct) >= 20) {
      candidates.push({ staffId, changePct, curr, prev });
    }
  }

  if (candidates.length === 0) return [];

  // 직원 이름 매핑
  const staffRows = (await db
    .select({ id: staffMembersTable.id, name: staffMembersTable.name })
    .from(staffMembersTable)
    .limit(10000)) as { id: string | null; name: string | null }[];
  const nameMap = new Map<string, string>();
  for (const s of staffRows) {
    nameMap.set(String(s.id || ''), String(s.name || ''));
  }

  return candidates
    .map((c) => {
      const name = nameMap.get(c.staffId) || c.staffId;
      const direction = c.changePct >= 0 ? '증가' : '감소';
      return {
        id: c.staffId,
        name,
        changePct: Math.round(c.changePct * 10) / 10,
        reason: `전월 ${c.prev.toLocaleString('ko-KR')}원 → 당월 ${c.curr.toLocaleString('ko-KR')}원 (${direction})` } satisfies OutlierRow;
    })
    .sort((l, r) => Math.abs(r.changePct) - Math.abs(l.changePct));
}

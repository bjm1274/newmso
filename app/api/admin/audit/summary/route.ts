/**
 * 감사 워크센터 헤더 4 KPI 요약.
 *
 * 소비처:
 *  - app/main/모바일/관리자/data-hooks.ts → useAuditSummary
 *  - app/main/기능부품/관리자워크센터/AuditWorkcenter.tsx → buildKpiFromSummary
 *
 * 반환 shape (둘 다 동일 필드를 number/string 가드로 읽음):
 *  {
 *    todayLogs, todayLogsSub,
 *    anomalyCount, anomalySub,
 *    payrollOutlierCount, payrollOutlierSub,
 *    lastBackupHoursAgo, lastBackupSub
 *  }
 *
 * 권한: 세션 없으면 401, 관리자/시스템마스터 아니면 403.
 * 데이터: D1 audit_logs / access_logs 집계 + payroll_records 이상치 + backup_restore_runs 최근.
 *
 * JM3: 집계 실패 시 0 폴백(정상 흐름) — 소비처가 자체 fallback을 유지하므로 안전.
 * JM4: any 금지, 결과는 명시 number/string.
 * JM5: 권한 게이트 후에만 데이터 노출.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  audit_logs as auditLogsTable,
  access_logs as accessLogsTable,
  backup_restore_runs as backupRestoreRunsTable,
  desc,
  gte } from '@/lib/db';
import { detectAnomalies, detectPayrollOutliers, guardAuditAdmin } from '../_shared';
import { parseDbTimestampMs } from '@/lib/date-formatter';
import { getKoreanTodayString } from '@/lib/seoul-time';

export const dynamic = 'force-dynamic';

type AuditLogLite = { action: string | null; created_at: string | null };
type AccessLogLite = { action: string | null; created_at: string | null };

/**
 * '오늘'의 시작 = **KST 자정**의 ISO 표현.
 *
 * 예전에는 런타임 로컬 자정(`new Date(y, m, d)`)을 썼다. Cloudflare Worker 의 TZ 는
 * UTC 라 이것이 UTC 자정 = KST 09:00 이 되고, KST 00:00~09:00 활동이 '오늘' 집계에서
 * 통째로 빠지면서 창 전체가 9시간 밀렸다(8차 D08-013 / D10-007).
 */
function startOfTodayIso(): string {
  return new Date(`${getKoreanTodayString()}T00:00:00+09:00`).toISOString();
}

/**
 * SQL 로는 **날짜 앞 10자리까지만** 넓게 자르고, 정확한 경계는 JS 에서 본다.
 *
 * audit_logs.created_at 은 운영에 두 형식이 섞여 있다(공백형 247 / T형 5,998).
 * ISO 커트오프로 TEXT 비교하면 사전순에서 ' '(0x20) < 'T'(0x54) 이므로
 * **같은 날짜의 공백형 행이 커트오프보다 항상 작게** 판정돼 '오늘' 집계에서
 * 통째로 빠졌다(9차 TZ-04). 반대로 커트오프를 공백형으로 바꾸면 이번엔 T형이
 * 항상 크게 나와 과다 포함된다 — 어느 한 형식으로도 정확할 수 없다.
 *
 * 그래서 SQL 은 하루 여유를 둔 날짜 문자열로 거르고(두 형식 모두 통과),
 * 실제 경계 판정은 두 형식을 모두 아는 parseDbTimestampMs 로 한다.
 */
function sqlDateFloor(iso: string): string {
  const ms = Date.parse(iso);
  const safe = Number.isNaN(ms) ? Date.now() : ms - 24 * 60 * 60 * 1000;
  return new Date(safe).toISOString().slice(0, 10);
}

/** 커트오프 이후 행만 남긴다 — 형식 혼재를 아는 정본 파서로 비교. */
function keepSince<T extends { created_at?: unknown }>(rows: T[], iso: string): T[] {
  const cutoffMs = Date.parse(iso);
  if (Number.isNaN(cutoffMs)) return rows;
  return rows.filter((row) => {
    const ms = parseDbTimestampMs(row.created_at);
    return !Number.isNaN(ms) && ms >= cutoffMs;
  });
}

function isLoginAction(action: string): boolean {
  const a = action.toLowerCase();
  return a.includes('login') || a.includes('로그인') || a.includes('sign_in') || a.includes('signin');
}

function isMutationAction(action: string): boolean {
  const a = action.toLowerCase();
  return (
    a.includes('update') ||
    a.includes('create') ||
    a.includes('insert') ||
    a.includes('delete') ||
    a.includes('수정') ||
    a.includes('등록') ||
    a.includes('삭제') ||
    a.includes('변경') ||
    a.includes('toggle')
  );
}

export async function GET(request: NextRequest) {
  const denied = await guardAuditAdmin(request);
  if (denied) return denied;

  const fallback = {
    todayLogs: 0,
    todayLogsSub: '로그인 0 · 수정 0 · 조회 0',
    anomalyCount: 0,
    anomalySub: '이상 감지 기록 없음',
    payrollOutlierCount: 0,
    payrollOutlierSub: '전월 대비 이상치 없음',
    lastBackupHoursAgo: 0,
    lastBackupSub: '자동 백업 정보 없음' };

  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json(fallback);
    const db = getD1Drizzle(d1);
    const todayIso = startOfTodayIso();
    const todaySqlFloor = sqlDateFloor(todayIso);

    const [auditTodayRowsRaw, accessTodayRowsRaw, backupRows, anomalies, outliers] = await Promise.all([
      db
        .select({ action: auditLogsTable.action, created_at: auditLogsTable.created_at })
        .from(auditLogsTable)
        .where(gte(auditLogsTable.created_at, todaySqlFloor))
        .limit(20000) as Promise<AuditLogLite[]>,
      db
        .select({ action: accessLogsTable.action, created_at: accessLogsTable.created_at })
        .from(accessLogsTable)
        .where(gte(accessLogsTable.created_at, todaySqlFloor))
        .limit(20000) as Promise<AccessLogLite[]>,
      db
        .select({ started_at: backupRestoreRunsTable.started_at })
        .from(backupRestoreRunsTable)
        .orderBy(desc(backupRestoreRunsTable.started_at))
        .limit(1),
      detectAnomalies(db).catch(() => []),
      detectPayrollOutliers(db).catch(() => []),
    ]);

    // SQL 은 하루 여유로 넓게 받았으므로 여기서 정확한 경계로 좁힌다.
    const auditTodayRows = keepSince(auditTodayRowsRaw, todayIso);
    const accessTodayRows = keepSince(accessTodayRowsRaw, todayIso);

    // 오늘 로그 수: audit + access 합산
    const todayLogs = auditTodayRows.length + accessTodayRows.length;

    let loginCount = 0;
    let mutationCount = 0;
    for (const row of accessTodayRows) {
      if (isLoginAction(String(row.action || ''))) loginCount += 1;
    }
    for (const row of auditTodayRows) {
      if (isMutationAction(String(row.action || ''))) mutationCount += 1;
    }
    const viewCount = Math.max(0, accessTodayRows.length - loginCount);

    const anomalyCount = anomalies.length;
    const payrollOutlierCount = outliers.length;

    // 마지막 백업 경과 시간
    let lastBackupHoursAgo = 0;
    let lastBackupSub = '자동 백업 정보 없음';
    const lastBackup = backupRows[0];
    if (lastBackup?.started_at) {
      const ts = new Date(String(lastBackup.started_at)).getTime();
      if (Number.isFinite(ts)) {
        lastBackupHoursAgo = Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60)));
        lastBackupSub =
          lastBackupHoursAgo <= 24
            ? '최근 백업 정상'
            : lastBackupHoursAgo <= 48
              ? '백업 점검 권장'
              : '백업 지연 — 즉시 백업 권장';
      }
    }

    return NextResponse.json({
      todayLogs,
      todayLogsSub: `로그인 ${loginCount} · 수정 ${mutationCount} · 조회 ${viewCount}`,
      anomalyCount,
      anomalySub: anomalyCount > 0 ? `최근 7일 ${anomalyCount}건 감지` : '이상 감지 기록 없음',
      payrollOutlierCount,
      payrollOutlierSub:
        payrollOutlierCount > 0 ? `전월 대비 ${payrollOutlierCount}건 이상치` : '전월 대비 이상치 없음',
      lastBackupHoursAgo,
      lastBackupSub });
  } catch {
    return NextResponse.json(fallback);
  }
}

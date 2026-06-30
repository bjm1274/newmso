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

export const dynamic = 'force-dynamic';

type AuditLogLite = { action: string | null; created_at: string | null };
type AccessLogLite = { action: string | null; created_at: string | null };

function startOfTodayIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return start.toISOString();
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

    const [auditTodayRows, accessTodayRows, backupRows, anomalies, outliers] = await Promise.all([
      db
        .select({ action: auditLogsTable.action, created_at: auditLogsTable.created_at })
        .from(auditLogsTable)
        .where(gte(auditLogsTable.created_at, todayIso))
        .limit(20000) as Promise<AuditLogLite[]>,
      db
        .select({ action: accessLogsTable.action, created_at: accessLogsTable.created_at })
        .from(accessLogsTable)
        .where(gte(accessLogsTable.created_at, todayIso))
        .limit(20000) as Promise<AccessLogLite[]>,
      db
        .select({ started_at: backupRestoreRunsTable.started_at })
        .from(backupRestoreRunsTable)
        .orderBy(desc(backupRestoreRunsTable.started_at))
        .limit(1),
      detectAnomalies(db).catch(() => []),
      detectPayrollOutliers(db).catch(() => []),
    ]);

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

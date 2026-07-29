import { NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  audit_logs as auditLogsTable,
  backup_restore_runs as backupRestoreRunsTable,
  todos as todosTable,
  todo_reminder_logs as todoReminderLogsTable,
  wiki_documents as wikiDocumentsTable,
  wiki_document_versions as wikiDocumentVersionsTable,
  and,
  desc,
  eq,
  isNotNull,
  lte,
  gte,
  ne } from '@/lib/db';
import { collectChatPushQueueHealth } from '@/lib/chat-push-health';
import { formatKoreanDateTimeLabel } from '@/lib/seoul-time';
import {
  OPERATION_CRONS,
  buildPushFailureSummary,
  buildPushSubscriptionPlatformSummary,
  buildUsageSummary,
  groupDuplicateEndpoints,
  listRecentBackups,
  loadPushSubscriptionDiagnostics,
  loadRecentPushFailures,
  type AuditLogRow,
  type LooseRecord } from '../_shared';

export async function handleOperations() {
  const d1 = await getD1Binding();
  if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available (operations)' }, { status: 500 });
  const db = getD1Drizzle(d1);
  const nowIso = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      auditRawRows,
      staffIdRows,
      restoreRunRaws,
      dueTodoRows,
      repeatingTodoRows,
      reminderLogRows,
      wikiDocRows,
      wikiVerRows,
      recentWikiVerRows,
      cronFailureRows,
      cronSuccessRows,
    ] = await Promise.all([
      db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.created_at)).limit(400),
      db.select({ id: staffMembersTable.id }).from(staffMembersTable),
      db.select({
        id: backupRestoreRunsTable.id,
        file_name: backupRestoreRunsTable.file_name,
        status: backupRestoreRunsTable.status,
        total_tables: backupRestoreRunsTable.total_tables,
        total_rows: backupRestoreRunsTable.total_rows,
        requested_by_name: backupRestoreRunsTable.requested_by_name,
        started_at: backupRestoreRunsTable.started_at,
        finished_at: backupRestoreRunsTable.finished_at,
        result_summary: backupRestoreRunsTable.result_summary }).from(backupRestoreRunsTable).orderBy(desc(backupRestoreRunsTable.started_at)).limit(10),
      // 미완료 + reminder_at 설정 + 기한 경과
      db.select({ id: todosTable.id }).from(todosTable)
        .where(and(
          eq(todosTable.is_complete, 0),
          isNotNull(todosTable.reminder_at),
          lte(todosTable.reminder_at, nowIso),
        )),
      // 반복 할일 (repeat_type != 'none')
      db.select({ id: todosTable.id }).from(todosTable)
        .where(and(
          eq(todosTable.is_complete, 0),
          ne(todosTable.repeat_type, 'none'),
        )),
      // 24시간 이내 리마인더 로그
      db.select({ id: todoReminderLogsTable.id }).from(todoReminderLogsTable)
        .where(gte(todoReminderLogsTable.created_at, since24h)),
      // 아카이브 안 된 위키 문서
      db.select({ id: wikiDocumentsTable.id }).from(wikiDocumentsTable)
        .where(eq(wikiDocumentsTable.is_archived, 0)),
      // 위키 버전 전체 카운트
      db.select({ id: wikiDocumentVersionsTable.id }).from(wikiDocumentVersionsTable),
      // 최근 위키 버전 5건
      db.select({
        id: wikiDocumentVersionsTable.id,
        document_id: wikiDocumentVersionsTable.document_id,
        title: wikiDocumentVersionsTable.title,
        version_no: wikiDocumentVersionsTable.version_no,
        created_at: wikiDocumentVersionsTable.created_at,
        change_summary: wikiDocumentVersionsTable.change_summary }).from(wikiDocumentVersionsTable).orderBy(desc(wikiDocumentVersionsTable.created_at)).limit(5),
      // 크론 실패는 위 audit_logs 400건 창에 묻힌다 (5분 크론이 죽으면 하루 288건).
      // 별도 질의로 7일치를 직접 본다.
      db.select({
        target_id: auditLogsTable.target_id,
        details: auditLogsTable.details,
        created_at: auditLogsTable.created_at }).from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.action, 'cron_failure'),
          gte(auditLogsTable.created_at, since7d),
        ))
        .orderBy(desc(auditLogsTable.created_at)),
      db.select({
        target_id: auditLogsTable.target_id,
        created_at: auditLogsTable.created_at }).from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.action, 'cron_success'),
          gte(auditLogsTable.created_at, since7d),
        ))
        .orderBy(desc(auditLogsTable.created_at)),
    ]);

    // audit_logs.details JSON 파싱
    const parsedAuditRows = auditRawRows.map((row) => {
      const r = { ...row } as Record<string, unknown>;
      if (typeof r.details === 'string') {
        try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
      }
      return r as AuditLogRow;
    });

    const [backupRows, queueSummary, recentPushFailures, subscriptionRows] = await Promise.all([
      listRecentBackups(10),
      collectChatPushQueueHealth(null),
      loadRecentPushFailures(),
      loadPushSubscriptionDiagnostics(),
    ]);

  const opAuditRows: AuditLogRow[] = parsedAuditRows;
  const validStaffIds = new Set(staffIdRows.map((row) => String(row.id || '')));
  const restoreRuns = restoreRunRaws as unknown as LooseRecord[];
  const dueTodoCount = dueTodoRows.length;
  const repeatingTodoCount = repeatingTodoRows.length;
  const reminderLogCount24h = reminderLogRows.length;
  const wikiDocumentCount = wikiDocRows.length;
  const wikiVersionCount = wikiVerRows.length;
  const recentWikiVersions = recentWikiVerRows as unknown as LooseRecord[];

  const duplicateEndpointInfo = groupDuplicateEndpoints(subscriptionRows);
  const orphanSubscriptions = subscriptionRows.filter((row) => {
    const staffId = String(row.staff_id || '').trim();
    return Boolean(staffId) && !validStaffIds.has(staffId);
  }).length;
  const nullStaffSubscriptions = subscriptionRows.filter((row) => !String(row.staff_id || '').trim()).length;
  const platformSummary = buildPushSubscriptionPlatformSummary(subscriptionRows);
  const fcmEnabledCount = subscriptionRows.filter((row) => Boolean(String(row.fcm_token || '').trim())).length;
  const webPushOnlyCount = subscriptionRows.filter((row) => {
    const endpoint = String(row.endpoint || '').trim();
    return /^https?:\/\//i.test(endpoint) && !String(row.fcm_token || '').trim();
  }).length;
  const placeholderEndpointCount = subscriptionRows.filter((row) =>
    String(row.endpoint || '').trim().startsWith('fcm:')
  ).length;
  const recentSubscriptions = [...subscriptionRows]
    .sort((left, right) => {
      const leftTime = new Date(String(left.created_at || 0)).getTime();
      const rightTime = new Date(String(right.created_at || 0)).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      staff_id: row.staff_id,
      platform: String(row.platform || '').trim() || 'unknown',
      device_id: String(row.device_id || '').trim() || null,
      has_fcm: Boolean(String(row.fcm_token || '').trim()),
      created_at: row.created_at || null,
      user_agent: String(row.user_agent || '').trim() || null }));
  const recentFailureSummary = buildPushFailureSummary(recentPushFailures);

  // ── 크론 건강도 (7일) ──────────────────────────────────────────────
  // 라우트별로 묶어서 "무엇이 언제부터 몇 번 실패했는지"를 한 줄로 보여준다.
  // 2026-07-16~28 처럼 12일간 조용히 죽어 있는 상태를 눈에 띄게 하는 게 목적이다.
  const cronSuccessByTarget = new Map<string, string>();
  for (const row of cronSuccessRows as LooseRecord[]) {
    const target = String(row.target_id || '').trim();
    if (!target || cronSuccessByTarget.has(target)) continue;
    cronSuccessByTarget.set(target, String(row.created_at || ''));
  }

  const cronFailureByTarget = new Map<string, {
    target: string;
    count: number;
    lastAt: string;
    firstAt: string;
    lastError: string;
  }>();
  for (const row of cronFailureRows as LooseRecord[]) {
    const target = String(row.target_id || '').trim() || '(unknown)';
    let error = '';
    try {
      const parsed = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      error = String((parsed as LooseRecord)?.error || '');
    } catch { error = ''; }
    const createdAt = String(row.created_at || '');
    const existing = cronFailureByTarget.get(target);
    if (!existing) {
      // 정렬이 최신순이라 첫 등장이 곧 마지막 실패다.
      cronFailureByTarget.set(target, {
        target,
        count: 1,
        lastAt: createdAt,
        firstAt: createdAt,
        lastError: error });
      continue;
    }
    existing.count += 1;
    if (createdAt && createdAt < existing.firstAt) existing.firstAt = createdAt;
  }

  const cronHealth = {
    windowDays: 7,
    totalFailures: (cronFailureRows as LooseRecord[]).length,
    byRoute: Array.from(cronFailureByTarget.values())
      .map((item) => ({
        ...item,
        lastSuccessAt: cronSuccessByTarget.get(item.target) || null }))
      .sort((left, right) => right.count - left.count) };

  const latestBackup = backupRows[0] || null;
  const backupAgeHours = latestBackup ? (Date.now() - new Date(latestBackup.created_at).getTime()) / (1000 * 60 * 60) : null;
  const failedRestoreRuns = (restoreRuns as LooseRecord[]).filter((run) => String(run.status || '') === 'failed');
  const latestRestoreRun = (restoreRuns as LooseRecord[])[0] || null;
  const versionGap = Math.max(0, Number(wikiDocumentCount || 0) - Number(wikiVersionCount || 0));
  const cronFailuresLast24h = (cronFailureRows as LooseRecord[]).filter(
    (row) => String(row.created_at || '') >= since24h,
  ).length;
  const failureItems = [
    cronFailuresLast24h > 0
      ? {
          id: 'cron-failure',
          severity: 'critical',
          label: '크론 실행 실패',
          count: cronFailuresLast24h,
          detail: cronHealth.byRoute.length > 0
            ? `${cronHealth.byRoute[0].target} 외 ${Math.max(0, cronHealth.byRoute.length - 1)}건 · 최근 실패 ${formatKoreanDateTimeLabel(cronHealth.byRoute[0].lastAt)} · ${cronHealth.byRoute[0].lastError || '원인 미상'}`
            : '최근 24시간 내 크론 실행이 실패했습니다.' }
      : null,
    queueSummary.deadLettered > 0
      ? { id: 'chat-push-dead-letter', severity: 'critical', label: '채팅 푸시 Dead Letter', count: queueSummary.deadLettered, detail: '재시도 한도를 넘긴 채팅 푸시 작업이 남아 있습니다.' }
      : null,
    queueSummary.pending > 0
      ? {
          id: 'chat-push-pending',
          severity: queueSummary.ready > 0 ? 'warning' : 'info',
          label: '대기 중인 채팅 푸시 작업',
          count: queueSummary.pending,
          detail: queueSummary.oldestPendingAt ? `가장 오래된 작업: ${formatKoreanDateTimeLabel(queueSummary.oldestPendingAt)}` : '처리 대기 중인 작업이 있습니다.' }
      : null,
    orphanSubscriptions + nullStaffSubscriptions > 0
      ? { id: 'push-subscription-orphan', severity: 'warning', label: '정리 필요한 푸시 구독', count: orphanSubscriptions + nullStaffSubscriptions, detail: `null staff ${nullStaffSubscriptions}건 · orphan ${orphanSubscriptions}건` }
      : null,
    duplicateEndpointInfo.duplicateRows > 0
      ? { id: 'push-subscription-duplicate', severity: 'info', label: '중복 푸시 구독', count: duplicateEndpointInfo.duplicateRows, detail: `${duplicateEndpointInfo.duplicateGroups}개 endpoint 그룹에서 중복이 발견됐습니다.` }
      : null,
    backupAgeHours !== null && backupAgeHours > 30
      ? { id: 'backup-stale', severity: 'warning', label: '백업 지연', count: 1, detail: `마지막 로컬 백업이 ${Math.floor(backupAgeHours)}시간 전에 생성됐습니다.` }
      : null,
    failedRestoreRuns.length > 0
      ? {
          id: 'backup-restore-failed',
          severity: 'warning',
          label: '백업 복원 실패 이력',
          count: failedRestoreRuns.length,
          detail: latestRestoreRun?.started_at ? `최근 복원 시각: ${formatKoreanDateTimeLabel(String(latestRestoreRun.started_at))}` : '최근 복원 작업 중 실패한 이력이 있습니다.' }
      : null,
    dueTodoCount > 0
      ? {
          id: 'todo-reminder-backlog',
          severity: 'info',
          label: '대기 중인 할일 리마인더',
          count: dueTodoCount,
          detail: `미완료 리마인더 대상 ${Number(dueTodoCount || 0).toLocaleString('ko-KR')}건이 확인됩니다.` }
      : null,
    versionGap > 0
      ? {
          id: 'wiki-version-gap',
          severity: 'info',
          label: '버전 기록이 없는 위키 문서',
          count: versionGap,
          detail: `문서 ${Number(wikiDocumentCount || 0).toLocaleString('ko-KR')}건 중 버전 기록 ${Number(wikiVersionCount || 0).toLocaleString('ko-KR')}건이 있습니다.` }
      : null,
  ].filter(Boolean);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    queue: queueSummary,
    subscriptions: {
      total: subscriptionRows.length,
      nullStaff: nullStaffSubscriptions,
      orphan: orphanSubscriptions,
      duplicateEndpointGroups: duplicateEndpointInfo.duplicateGroups,
      duplicateRows: duplicateEndpointInfo.duplicateRows,
      fcmEnabled: fcmEnabledCount,
      webPushOnly: webPushOnlyCount,
      placeholderEndpoints: placeholderEndpointCount,
      platformSummary,
      recentSubscriptions },
    pushFailures: {
      total: recentPushFailures.length,
      summary: recentFailureSummary,
      recent: recentPushFailures },
    recentBackups: backupRows,
    latestBackup,
    restoreRuns,
    cronJobs: OPERATION_CRONS,
    cronHealth,
    usageSummary: buildUsageSummary(opAuditRows),
    todoAutomation: {
      dueReminders: dueTodoCount,
      repeatingOpenTodos: repeatingTodoCount,
      reminderLogs24h: reminderLogCount24h },
    wiki: {
      documents: wikiDocumentCount,
      versions: wikiVersionCount,
      recentVersions: recentWikiVersions },
    failureItems });
}

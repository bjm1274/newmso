import { NextResponse } from 'next/server';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { sendFcmBatch } from '@/lib/fcm-http';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push-cloudflare';
import { insertNotificationsOrThrow, type NotificationRow } from '@/lib/notification-utils';
import { deleteExpiredWebPushSubscriptions } from '@/lib/notification-shared';
import {
  approvals as approvalsTable,
  staff_members as staffMembersTable,
  roster_approval_requests as rosterApprovalRequestsTable,
  push_subscriptions as pushSubscriptionsTable,
  inArray,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';

const ROSTER_CREATOR_POSITIONS = ['\uAC04\uD638\uACFC\uC7A5', '\uAC04\uD638\uBD80\uC7A5', '\uC2E4\uC7A5'];
const ROSTER_APPROVER_POSITIONS = ['\uAC04\uD638\uACFC\uC7A5', '\uBCD1\uC6D0\uC7A5'];
const ROSTER_APPROVER_COMPANIES = ['SY INC.'];
const DIRECTOR_POSITION = '\uC774\uC0AC';
const ROSTER_APPROVAL_TYPE = '\uADFC\uBB34\uD45C'; // '근무표'
const LEGACY_APPROVAL_PENDING_STATUS = '\uB300\uAE30';
const ADMIN_LIKE_POSITIONS = ['\uCD5C\uACE0\uAD00\uB9AC\uC790', '\uC2DC\uC2A4\uD15C\uAD00\uB9AC\uC790', '\uB300\uD45C', '\uAD00\uB9AC\uC790'];

type ApprovalAssignment = {
  staff_id?: string;
  work_date?: string;
  shift_id?: string;
  staff_name?: string;
  shift_name?: string;
};

type NormalizedAssignment = {
  staff_id: string;
  work_date: string;
  shift_id: string;
  staff_name: string | undefined;
  shift_name: string | undefined;
};

type ApprovalRequestPayload = {
  companyName?: string;
  teamName?: string;
  yearMonth?: string;
  assignments?: ApprovalAssignment[];
};

type ApproverRow = {
  id?: string | null;
  name?: string | null;
  position?: string | null;
  company?: string | null;
  role?: string | null;
};

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  fcm_token?: string | null;
  created_at?: string | null;
};

type NotificationInsertRow = {
  user_id: string;
  type: 'approval';
  title: string;
  body: string;
  metadata: Record<string, unknown>;
};

function canRequestRosterApproval(user: SessionUser | null | undefined) {
  if (!user) return false;
  const position = String(user.position || '').trim();
  const role = String(user.role || '').trim().toLowerCase();
  const userPermissions = user.permissions || {};

  const explicitRosterCreatePermission = Object.prototype.hasOwnProperty.call(userPermissions, 'hr_근무표생성')
    ? userPermissions.hr_근무표생성 === true
    : null;

  const canCreateRosterByPosition =
    ROSTER_CREATOR_POSITIONS.includes(position) ||
    ['admin', 'master'].includes(role) ||
    ADMIN_LIKE_POSITIONS.includes(position);

  return explicitRosterCreatePermission ?? canCreateRosterByPosition;
}

function normalizeAssignments(assignments: ApprovalAssignment[] = []) {
  const normalized = assignments
    .map((item) => {
      const staffId = String(item?.staff_id || '').trim();
      const workDate = String(item?.work_date || '').trim().slice(0, 10);
      const shiftId = String(item?.shift_id || '').trim();
      const staffName = String(item?.staff_name || '').trim();
      const shiftName = String(item?.shift_name || '').trim();

      if (!staffId || !shiftId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
        return null;
      }

      return {
        staff_id: staffId,
        work_date: workDate,
        shift_id: shiftId,
        staff_name: staffName || undefined,
        shift_name: shiftName || undefined };
    })
    .filter((item): item is NormalizedAssignment => item !== null);

  return Array.from(
    normalized.reduce(
      (map, item) => map.set(`${item.staff_id}:${item.work_date}`, item),
      new Map<string, NormalizedAssignment>(),
    ).values(),
  );
}

function resolveApprovers(rows: ApproverRow[], requesterId: string, companyName: string) {
  const normalizedCompany = String(companyName || '').trim();

  const candidates = rows.filter((row) => {
    const id = String(row?.id || '').trim();
    if (!id || id === requesterId) return false;

    const position = String(row?.position || '').trim();
    const role = String(row?.role || '').trim().toLowerCase();
    const company = String(row?.company || '').trim();
    const isAdminRole = ['admin', 'master'].includes(role);
    const isExplicitApprover = ROSTER_APPROVER_POSITIONS.includes(position);
    const isSyDirector = position === DIRECTOR_POSITION && ROSTER_APPROVER_COMPANIES.includes(company);

    if (!isAdminRole && !isExplicitApprover && !isSyDirector) {
      return false;
    }

    if (isAdminRole) return true;
    if (!normalizedCompany) return true;
    return company === normalizedCompany || ROSTER_APPROVER_COMPANIES.includes(company);
  });

  const fallbackCandidates = candidates.length > 0
    ? candidates
    : rows.filter((row) => {
        const id = String(row?.id || '').trim();
        if (!id || id === requesterId) return false;
        const position = String(row?.position || '').trim();
        const role = String(row?.role || '').trim().toLowerCase();
        return ['admin', 'master'].includes(role) || ROSTER_APPROVER_POSITIONS.includes(position);
      });

  const getPriority = (row: ApproverRow) => {
    const pos = String(row.position || '').trim();
    const role = String(row.role || '').trim().toLowerCase();
    if (pos === '\uAC04\uD638\uACFC\uC7A5') return 1; // 간호과장
    if (pos === '\uBCD1\uC6D0\uC7A5') return 2; // 병원장
    if (['admin', 'master'].includes(role)) return 3;
    return 4;
  };

  const sortedCandidates = [...fallbackCandidates].sort((a, b) => getPriority(a) - getPriority(b));

  const uniqueApprovers = new Map<string, ApproverRow>();
  sortedCandidates.forEach((row) => {
    const id = String(row?.id || '').trim();
    if (!id || uniqueApprovers.has(id)) return;
    uniqueApprovers.set(id, row);
  });
  return Array.from(uniqueApprovers.values());
}

function toStringRecord(value: Record<string, unknown>) {
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entry]) => {
    if (entry === null || entry === undefined) return acc;
    acc[key] = typeof entry === 'string' ? entry : JSON.stringify(entry);
    return acc;
  }, {});
}

function buildApprovalNotificationRows(params: {
  approvers: ApproverRow[];
  requestId: string;
  storage: 'roster_approval_requests' | 'approvals';
  companyName: string;
  teamName: string;
  yearMonth: string;
  requestedBy: string;
  requestedByName: string;
}) {
  const { approvers, requestId, storage, companyName, teamName, yearMonth, requestedBy, requestedByName } = params;
  const rows: NotificationInsertRow[] = [];

  approvers.forEach((approver) => {
    const userId = String(approver.id || '').trim();
    if (!userId) return;

    rows.push({
      user_id: userId,
      type: 'approval',
      title: `\uD83D\uDCCB \uADFC\uBB34\uD45C \uC2B9\uC778 \uC694\uCCAD: ${teamName} ${yearMonth}`,
      body: `${requestedByName}\uB2D8\uC774 ${teamName} ${yearMonth} \uADFC\uBB34\uD45C \uC2B9\uC778\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4.`,
      metadata: {
        id: requestId,
        approval_id: storage === 'approvals' ? requestId : null,
        roster_request_id: requestId,
        type: 'approval',
        approval_role: 'approver',
        approval_view: 'roster_schedule',
        approval_source: storage,
        company_name: companyName || null,
        team_name: teamName,
        year_month: yearMonth,
        requested_by: requestedBy,
        requested_by_name: requestedByName } });
  });

  return rows;
}

function buildImmediatePushPayload(row: NotificationInsertRow) {
  return {
    title: row.title,
    body: row.body,
    tag: `erp-roster-approval-${String(row.metadata.approval_id || row.metadata.roster_request_id || 'request')}`,
    data: {
      ...row.metadata,
      notification_type: row.type } };
}

async function dispatchImmediateApprovalPush(
  notificationRows: NotificationInsertRow[],
) {
  const targetUserIds = Array.from(
    new Set(notificationRows.map((row) => String(row.user_id || '').trim()).filter(Boolean)),
  );

  if (targetUserIds.length === 0) {
    return { pushTargetCount: 0, pushSentCount: 0 };
  }

  let subscriptions: PushSubscriptionRow[] = [];
  {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      const rows = await db
        .select({
          id: pushSubscriptionsTable.id,
          staff_id: pushSubscriptionsTable.staff_id,
          endpoint: pushSubscriptionsTable.endpoint,
          p256dh: pushSubscriptionsTable.p256dh,
          auth: pushSubscriptionsTable.auth,
          fcm_token: pushSubscriptionsTable.fcm_token,
          created_at: pushSubscriptionsTable.created_at })
        .from(pushSubscriptionsTable)
        .where(inArray(pushSubscriptionsTable.staff_id, targetUserIds));
      subscriptions = rows.map((r) => ({
        id: String(r.id ?? ''),
        staff_id: r.staff_id ?? null,
        endpoint: r.endpoint ?? null,
        p256dh: r.p256dh ?? null,
        auth: r.auth ?? null,
        fcm_token: r.fcm_token ?? null,
        created_at: r.created_at ?? null }));
    }
  }
  const sampleNotification = notificationRows[0];
  const payload = buildImmediatePushPayload(sampleNotification);
  let pushSentCount = 0;

  // 기기 단위: 모든 고유 FCM 토큰 + FCM 없는 행의 Web Push (모바일+PC 동시 지원)
  const uniqueFcmTokens = Array.from(
    new Set(
      subscriptions
        .map((row) => String(row.fcm_token || '').trim())
        .filter(Boolean),
    ),
  );

  if (uniqueFcmTokens.length > 0) {
    try {
      const fcmResult = await sendFcmBatch(uniqueFcmTokens, {
        title: payload.title,
        body: payload.body,
        data: toStringRecord(payload.data) });
      pushSentCount += fcmResult.success.length;
    } catch (error) {
      console.error('roster approval FCM push failed:', error);
    }
  }

  let webPushEnabled = true;
  try {
    ensureWebPushConfigured();
  } catch {
    webPushEnabled = false;
  }

  if (webPushEnabled) {
    const payloadJson = JSON.stringify(payload);
    const uniqueWebSubscriptions = new Map<string, PushSubscriptionRow>();
    subscriptions.forEach((row) => {
      const endpoint = String(row.endpoint || '').trim();
      if (!endpoint || !/^https?:\/\//i.test(endpoint)) return;
      if (!row.p256dh || !row.auth) return;
      // 같은 구독 행에 FCM 이 있으면 이 endpoint 는 FCM 전용 (동일 기기 이중 방지)
      if (String(row.fcm_token || '').trim()) return;
      if (!uniqueWebSubscriptions.has(endpoint)) {
        uniqueWebSubscriptions.set(endpoint, row);
      }
    });

    const webTargets = Array.from(uniqueWebSubscriptions.values()).filter(
      (s) => s.endpoint && s.p256dh && s.auth,
    );
    const webResults = await Promise.allSettled(
      webTargets.map((subscription) =>
        sendWebPushNotification(
          { endpoint: subscription.endpoint!, p256dh: subscription.p256dh!, auth: subscription.auth! },
          payloadJson,
        ),
      ),
    );

    const expiredWebIds: string[] = [];
    for (let i = 0; i < webResults.length; i += 1) {
      const r = webResults[i];
      if (r.status === 'fulfilled') {
        pushSentCount += 1;
      } else {
        const err = r.reason as { statusCode?: number; status?: number } | undefined;
        const statusCode = Number(err?.statusCode || err?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredWebIds.push(webTargets[i].id);
        }
      }
    }

    if (expiredWebIds.length > 0) {
      const d1 = await getD1Binding();
      if (d1) await deleteExpiredWebPushSubscriptions(d1, expiredWebIds);
    }
  }

  return {
    pushTargetCount: targetUserIds.length,
    pushSentCount };
}

async function insertLegacyApprovalRequest(params: {
  companyName: string;
  teamName: string;
  yearMonth: string;
  assignments: ReturnType<typeof normalizeAssignments>;
  requestedBy: string;
  requestedByName: string;
  approverIds: string[];
}) {
  const { companyName, teamName, yearMonth, assignments, requestedBy, requestedByName, approverIds } = params;

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[roster/approval-request] D1 binding not available (insertLegacyApprovalRequest)');
  const db = getD1Drizzle(d1);
  const newId = crypto.randomUUID();
  const docNumber = `ROSTER-${yearMonth.replace('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

  const metaDataObj = {
    type: 'approval',
    approval_view: 'roster_schedule',
    approval_source: 'approvals',
    roster_request_type: 'monthly_schedule',
    company_name: companyName || null,
    team_name: teamName,
    year_month: yearMonth,
    assignments,
    approver_line: approverIds,
    form_slug: 'roster',
    form_name: '\uADFC\uBB34\uD45C', // '근무표'
    doc_number: docNumber,
    revision: 1 };

  await db.insert(approvalsTable).values({
    id: newId,
    sender_id: requestedBy,
    sender_name: requestedByName,
    sender_company: companyName || null,
    current_approver_id: approverIds[0] || null,
    type: ROSTER_APPROVAL_TYPE,
    title: `${teamName} ${yearMonth} \uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD`,
    content: `${requestedByName}\uB2D8\uC758 ${teamName} ${yearMonth} \uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD\uC785\uB2C8\uB2E4.`,
    status: LEGACY_APPROVAL_PENDING_STATUS,
    meta_data: JSON.stringify(metaDataObj),
    approver_line: JSON.stringify(approverIds),
    doc_number: docNumber,
    created_at: new Date().toISOString() });
  return newId;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canRequestRosterApproval(session.user)) {
      return NextResponse.json(
        { error: '\uADFC\uBB34\uD45C \uC2B9\uC778 \uC694\uCCAD \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.' },
        { status: 403 },
      );
    }

    const payload = (await request.json().catch(() => null)) as ApprovalRequestPayload | null;
    const assignments = normalizeAssignments(Array.isArray(payload?.assignments) ? payload.assignments : []);
    const yearMonth = String(payload?.yearMonth || '').trim();

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json(
        { error: '\uB144\uC6D4 \uC815\uBCF4\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.' },
        { status: 400 },
      );
    }

    if (assignments.length === 0) {
      return NextResponse.json(
        { error: '\uC2B9\uC778 \uC694\uCCAD\uD560 \uADFC\uBB34 \uBC30\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.' },
        { status: 400 },
      );
    }

    const companyName = String(payload?.companyName || session.user.company || '').trim();
    const teamName = String(payload?.teamName || '').trim() || '\uC804\uCCB4';
    const requestedBy = String(session.user.id || '').trim();
    const requestedByName = String(session.user.name || '').trim() || '\uC774\uB984 \uC5C6\uC74C';
    const now = new Date().toISOString();

    // staff_members \uC870\uD68C (D1)
    let staffRows: ApproverRow[] = [];
    {
      const d1 = await getD1Binding();
      if (!d1) {
        return NextResponse.json({ error: 'D1 binding not available' }, { status: 500 });
      }
      const db = getD1Drizzle(d1);
      const { or: drizzleOr, inArray: drizzleInArray, eq: drizzleEq } = await import('drizzle-orm');
      const rows = await db
        .select({
          id: staffMembersTable.id,
          name: staffMembersTable.name,
          position: staffMembersTable.position,
          company: staffMembersTable.company,
          role: staffMembersTable.role })
        .from(staffMembersTable)
        .where(
          drizzleOr(
            drizzleInArray(staffMembersTable.position, ROSTER_APPROVER_POSITIONS),
            drizzleEq(staffMembersTable.role, 'admin'),
            drizzleEq(staffMembersTable.role, 'master'),
          )
        );
      staffRows = rows.map((r) => ({
        id: r.id ?? null,
        name: r.name ?? null,
        position: r.position ?? null,
        company: r.company ?? null,
        role: r.role ?? null }));
    }

    const approvers = resolveApprovers(staffRows, requestedBy, companyName);
    const approverIds = approvers
      .map((approver) => String(approver.id || '').trim())
      .filter(Boolean);

    if (approverIds.length === 0) {
      return NextResponse.json(
        { error: '\uC2B9\uC778\uC790\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uCD1D\uBB34\uBD80\uC7A5 \uB610\uB294 \uC774\uC0AC \uACC4\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.' },
        { status: 409 },
      );
    }

    let requestId = '';
    let storage: 'roster_approval_requests' | 'approvals' = 'approvals';

    try {
      requestId = await insertLegacyApprovalRequest({
        companyName,
        teamName,
        yearMonth,
        assignments,
        requestedBy,
        requestedByName,
        approverIds });
    } catch (legacyInsertError) {
      const message =
        legacyInsertError instanceof Error
          ? legacyInsertError.message
          : '\uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD \uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.';
      console.error('D1 roster approval insert failed:', legacyInsertError);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const notificationRows = buildApprovalNotificationRows({
      approvers,
      requestId,
      storage,
      companyName,
      teamName,
      yearMonth,
      requestedBy,
      requestedByName });

    let notifiedApproverCount = 0;
    let pushSentCount = 0;

    if (notificationRows.length > 0) {
      // Phase 8-C: D1 직접 INSERT — Supabase + mirror 2단 처리 대체.
      // insertNotificationsOrThrow 가 실패 시 throw 하므로 try/catch 로 흐름 유지.
      try {
        await insertNotificationsOrThrow(notificationRows as NotificationRow[]);
        notifiedApproverCount = notificationRows.length;
        const pushResult = await dispatchImmediateApprovalPush(notificationRows);
        pushSentCount = pushResult.pushSentCount;
      } catch (notificationError) {
        console.error('roster approval notification insert failed:', notificationError);
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      storage,
      notifiedApproverCount,
      pushSentCount });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : '\uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

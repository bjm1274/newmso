import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { sendFcmBatch } from '@/lib/firebase-admin';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push';

const ROSTER_CREATOR_POSITIONS = ['\uAC04\uD638\uACFC\uC7A5', '\uAC04\uD638\uBD80\uC7A5', '\uC2E4\uC7A5'];
const ROSTER_APPROVER_POSITIONS = ['\uCD1D\uBB34\uBD80\uC7A5', '\uC774\uC0AC'];
const ROSTER_APPROVER_COMPANIES = ['SY INC.'];
const DIRECTOR_POSITION = '\uC774\uC0AC';
const ROSTER_APPROVAL_TYPE = 'roster_schedule_approval';
const LEGACY_APPROVAL_PENDING_STATUS = '\uB300\uAE30';
const ADMIN_LIKE_POSITIONS = ['\uCD5C\uACE0\uAD00\uB9AC\uC790', '\uC2DC\uC2A4\uD15C\uAD00\uB9AC\uC790', '\uB300\uD45C', '\uAD00\uB9AC\uC790'];

type ApprovalAssignment = {
  staff_id?: string;
  work_date?: string;
  shift_id?: string;
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
};

type NotificationInsertRow = {
  user_id: string;
  type: 'approval';
  title: string;
  body: string;
  metadata: Record<string, unknown>;
};

function getAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function isMissingRelationError(error: unknown, relationNames: string[]) {
  const payload = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
  const code = String(payload?.code || '').trim();
  const message = [payload?.message, payload?.details, payload?.hint]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    relationNames.some((relationName) => message.includes(relationName.toLowerCase()))
  );
}

function canRequestRosterApproval(user: SessionUser | null | undefined) {
  const position = String(user?.position || '').trim();
  const role = String(user?.role || '').trim().toLowerCase();
  return (
    ROSTER_CREATOR_POSITIONS.includes(position) ||
    ['admin', 'master'].includes(role) ||
    ADMIN_LIKE_POSITIONS.includes(position)
  );
}

function normalizeAssignments(assignments: ApprovalAssignment[] = []) {
  const normalized = assignments
    .map((item) => {
      const staffId = String(item?.staff_id || '').trim();
      const workDate = String(item?.work_date || '').trim().slice(0, 10);
      const shiftId = String(item?.shift_id || '').trim();

      if (!staffId || !shiftId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
        return null;
      }

      return {
        staff_id: staffId,
        work_date: workDate,
        shift_id: shiftId,
      };
    })
    .filter((item): item is Required<ApprovalAssignment> => item !== null);

  return Array.from(
    normalized.reduce(
      (map, item) => map.set(`${item.staff_id}:${item.work_date}`, item),
      new Map<string, Required<ApprovalAssignment>>(),
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

  const uniqueApprovers = new Map<string, ApproverRow>();
  fallbackCandidates.forEach((row) => {
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
        requested_by_name: requestedByName,
      },
    });
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
      notification_type: row.type,
    },
  };
}

async function dispatchImmediateApprovalPush(
  supabase: SupabaseClient,
  notificationRows: NotificationInsertRow[],
) {
  const targetUserIds = Array.from(
    new Set(notificationRows.map((row) => String(row.user_id || '').trim()).filter(Boolean)),
  );

  if (targetUserIds.length === 0) {
    return { pushTargetCount: 0, pushSentCount: 0 };
  }

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, staff_id, endpoint, p256dh, auth, fcm_token')
    .in('staff_id', targetUserIds);

  if (subscriptionError) {
    console.error('roster approval push subscription lookup failed:', subscriptionError);
    return { pushTargetCount: targetUserIds.length, pushSentCount: 0 };
  }

  const subscriptions = (subscriptionRows || []) as PushSubscriptionRow[];
  const sampleNotification = notificationRows[0];
  const payload = buildImmediatePushPayload(sampleNotification);
  let pushSentCount = 0;

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
        data: toStringRecord(payload.data),
      });
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
      if (!uniqueWebSubscriptions.has(endpoint)) {
        uniqueWebSubscriptions.set(endpoint, row);
      }
    });

    const webResults = await Promise.allSettled(
      Array.from(uniqueWebSubscriptions.values()).map((subscription) =>
        sendWebPushNotification(subscription, payloadJson),
      ),
    );

    pushSentCount += webResults.filter((result) => result.status === 'fulfilled').length;
  }

  return {
    pushTargetCount: targetUserIds.length,
    pushSentCount,
  };
}

async function insertLegacyApprovalRequest(params: {
  supabase: SupabaseClient;
  companyName: string;
  teamName: string;
  yearMonth: string;
  assignments: ReturnType<typeof normalizeAssignments>;
  requestedBy: string;
  requestedByName: string;
  approverIds: string[];
}) {
  const { supabase, companyName, teamName, yearMonth, assignments, requestedBy, requestedByName, approverIds } = params;

  const { data, error } = await supabase
    .from('approvals')
    .insert({
      sender_id: requestedBy,
      sender_name: requestedByName,
      sender_company: companyName || null,
      current_approver_id: approverIds[0] || null,
      type: ROSTER_APPROVAL_TYPE,
      title: `${teamName} ${yearMonth} \uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD`,
      content: `${requestedByName}\uB2D8\uC758 ${teamName} ${yearMonth} \uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD\uC785\uB2C8\uB2E4.`,
      status: LEGACY_APPROVAL_PENDING_STATUS,
      meta_data: {
        type: 'approval',
        approval_view: 'roster_schedule',
        approval_source: 'approvals',
        roster_request_type: 'monthly_schedule',
        company_name: companyName || null,
        team_name: teamName,
        year_month: yearMonth,
        assignments,
        approver_line: approverIds,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return String(data?.id || '').trim();
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

    const supabase = getAdminClient();
    const companyName = String(payload?.companyName || session.user.company || '').trim();
    const teamName = String(payload?.teamName || '').trim() || '\uC804\uCCB4';
    const requestedBy = String(session.user.id || '').trim();
    const requestedByName = String(session.user.name || '').trim() || '\uC774\uB984 \uC5C6\uC74C';
    const now = new Date().toISOString();

    const approverFilter = [
      `position.eq.${ROSTER_APPROVER_POSITIONS[0]}`,
      `position.eq.${ROSTER_APPROVER_POSITIONS[1]}`,
      'role.eq.admin',
      'role.eq.master',
    ].join(',');

    const { data: staffRows, error: staffError } = await supabase
      .from('staff_members')
      .select('id, name, position, company, role')
      .or(approverFilter);

    if (staffError) {
      return NextResponse.json({ error: staffError.message }, { status: 500 });
    }

    const approvers = resolveApprovers((staffRows || []) as ApproverRow[], requestedBy, companyName);
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
    let storage: 'roster_approval_requests' | 'approvals' = 'roster_approval_requests';

    const { data: insertedRequest, error: insertError } = await supabase
      .from('roster_approval_requests')
      .insert({
        company_name: companyName || null,
        team_name: teamName,
        year_month: yearMonth,
        assignments,
        requested_by: requestedBy,
        requested_by_name: requestedByName,
        status: 'pending',
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (insertError) {
      if (!isMissingRelationError(insertError, ['roster_approval_requests'])) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      storage = 'approvals';
      try {
        requestId = await insertLegacyApprovalRequest({
          supabase,
          companyName,
          teamName,
          yearMonth,
          assignments,
          requestedBy,
          requestedByName,
          approverIds,
        });
      } catch (legacyInsertError) {
        const message =
          legacyInsertError instanceof Error
            ? legacyInsertError.message
            : '\uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD \uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.';
        return NextResponse.json({ error: message }, { status: 500 });
      }
    } else {
      requestId = String(insertedRequest?.id || '').trim();
    }

    const notificationRows = buildApprovalNotificationRows({
      approvers,
      requestId,
      storage,
      companyName,
      teamName,
      yearMonth,
      requestedBy,
      requestedByName,
    });

    let notifiedApproverCount = 0;
    let pushSentCount = 0;

    if (notificationRows.length > 0) {
      const { error: notificationError } = await supabase.from('notifications').insert(notificationRows);
      if (!notificationError) {
        notifiedApproverCount = notificationRows.length;
        const pushResult = await dispatchImmediateApprovalPush(supabase, notificationRows);
        pushSentCount = pushResult.pushSentCount;
      } else {
        console.error('roster approval notification insert failed:', notificationError);
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      storage,
      notifiedApproverCount,
      pushSentCount,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : '\uADFC\uBB34\uD45C \uC2B9\uC778\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

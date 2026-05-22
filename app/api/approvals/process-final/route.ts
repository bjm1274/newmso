import { NextResponse } from 'next/server';
import { processFinalApprovalEffects } from '@/lib/server-approval-processing';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import {
  approvals as approvalsTable,
  eq,
  getD1Binding,
  getD1Drizzle,
} from '@/lib/db';

function normalizeApprovalLineIds(line: unknown): string[] {
  if (!Array.isArray(line)) return [];
  return Array.from(
    new Set(
      line
        .map((entry) => {
          if (entry == null) return null;
          if (typeof entry === 'string' || typeof entry === 'number') return String(entry).trim();
          if (typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
            const value = (entry as Record<string, unknown>).id;
            return value != null ? String(value).trim() : null;
          }
          return null;
        })
        .filter(Boolean) as string[]
    )
  );
}

function normalizeApprovalCcUserIds(ccUsers: unknown): string[] {
  if (!Array.isArray(ccUsers)) return [];
  return Array.from(
    new Set(
      ccUsers
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const value = (entry as Record<string, unknown>).id;
          return value != null ? String(value).trim() : null;
        })
        .filter(Boolean) as string[]
    )
  );
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const approvalId = String(body?.approvalId || '').trim();
    if (!approvalId) {
      return NextResponse.json({ ok: false, error: 'approvalId is required' }, { status: 400 });
    }

    // approvals 조회 (D1)
    type ApprovalFetchRow = {
      id: string;
      status: string | null;
      meta_data: unknown;
      current_approver_id: string | null;
      approver_line: unknown;
      doc_number: string | null;
      sender_id: string | null;
      sender_company: string | null;
      title: string;
    };

    let approval: ApprovalFetchRow | null = null;

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: approvalsTable.id,
        status: approvalsTable.status,
        meta_data: approvalsTable.meta_data,
        current_approver_id: approvalsTable.current_approver_id,
        approver_line: approvalsTable.approver_line,
        doc_number: approvalsTable.doc_number,
        sender_id: approvalsTable.sender_id,
        sender_company: approvalsTable.sender_company,
        title: approvalsTable.title,
      })
      .from(approvalsTable)
      .where(eq(approvalsTable.id, approvalId));
    const row = rows[0] ?? null;
    if (row) {
      // D1 JSON 컬럼 파싱
      let parsedMetaData: unknown = null;
      if (typeof row.meta_data === 'string' && row.meta_data.length > 0) {
        try { parsedMetaData = JSON.parse(row.meta_data); } catch { parsedMetaData = null; }
      }
      let parsedApproverLine: unknown = null;
      if (typeof row.approver_line === 'string' && row.approver_line.length > 0) {
        try { parsedApproverLine = JSON.parse(row.approver_line); } catch { parsedApproverLine = null; }
      }
      approval = { ...row, meta_data: parsedMetaData, approver_line: parsedApproverLine };
    }

    if (!approval) {
      return NextResponse.json({ ok: false, error: 'Approval not found' }, { status: 404 });
    }
    if (String(approval.status || '').trim() !== '승인') {
      return NextResponse.json({ ok: false, error: 'Approval is not finalized yet' }, { status: 409 });
    }

    const metaData =
      approval.meta_data && typeof approval.meta_data === 'object'
        ? (approval.meta_data as Record<string, unknown>)
        : null;
    const sessionUserId = String(session.user.id || '').trim();
    const currentApproverId = String(
      approval.current_approver_id || metaData?.current_approver_id || ''
    ).trim();
    const approvalLineIds = normalizeApprovalLineIds(approval.approver_line ?? metaData?.approver_line);
    const referenceUserIds = normalizeApprovalCcUserIds(metaData?.cc_users);
    const canAccess =
      isAdminSession(session.user) ||
      sessionUserId === String(approval.sender_id || '').trim() ||
      sessionUserId === currentApproverId ||
      approvalLineIds.includes(sessionUserId) ||
      referenceUserIds.includes(sessionUserId);

    if (!canAccess) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const result = await processFinalApprovalEffects(
      approval as Record<string, unknown>,
      String(session.user.id || '').trim() || null,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process approval';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

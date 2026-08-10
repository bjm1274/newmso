/**
 * 퇴사 오프보딩 상태 전이 (서버 전용 경로).
 *
 * 왜 서버로 옮겼는지는 lib/offboarding-transition.ts 머리말 참조.
 * 요약하면 이 전이가 role·permissions·force_logout_at 을 쓰는데, 그 컬럼들은
 * 범용 mutate 에서 관리자에게만 열려 있어 인사담당자는 오프보딩을 아예 못 했다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  eq } from '@/lib/db';
import { hasStaffRecordScope, userId } from '@/lib/d1-api-helpers';
import { normalizeSessionUser, readSessionFromRequest } from '@/lib/server-session';
import {
  computeOffboardingTransition,
  isSystemMasterTarget,
  type OffboardingAction,
  type StaffOffboardingRow } from '@/lib/offboarding-transition';

export const dynamic = 'force-dynamic';

const ACTIONS: readonly OffboardingAction[] = ['start', 'cancel', 'finalize', 'restore'];

type OffboardingRequest = {
  action?: string;
  staffId?: string;
  exitDate?: string;
  reason?: string;
};

function isSameCompany(
  row: StaffOffboardingRow,
  user: { company_id?: unknown; company?: unknown },
): boolean {
  const myId = String(user.company_id ?? '').trim();
  const rowId = String(row.company_id ?? '').trim();
  if (myId && rowId) return myId === rowId;

  // 실데이터의 company_id 가 비어 있는 행이 많아 회사명으로 폴백한다
  // (claims.ts erpTargetStaffSameCompany 와 같은 판정).
  const myName = String(user.company ?? '').trim();
  const rowName = String(row.company ?? '').trim();
  return Boolean(myName && rowName && myName === rowName);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    const user = session?.user ? normalizeSessionUser(session.user) : null;
    if (!user || !userId(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasStaffRecordScope(user)) {
      return NextResponse.json({ error: '오프보딩 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as OffboardingRequest;
    const action = String(body.action || '').trim() as OffboardingAction;
    const staffId = String(body.staffId || '').trim();

    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: '알 수 없는 동작입니다.' }, { status: 400 });
    }
    if (!staffId) {
      return NextResponse.json({ error: '대상 직원이 필요합니다.' }, { status: 400 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ error: 'D1 binding not available' }, { status: 503 });
    }
    const db = getD1Drizzle(d1);
    const rows = (await db
      .select({
        id: staffMembersTable.id,
        name: staffMembersTable.name,
        status: staffMembersTable.status,
        role: staffMembersTable.role,
        resigned_at: staffMembersTable.resigned_at,
        permissions: staffMembersTable.permissions,
        company_id: staffMembersTable.company_id,
        company: staffMembersTable.company,
        employee_no: staffMembersTable.employee_no,
        is_system_master: staffMembersTable.is_system_master })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, staffId))
      .limit(1)) as unknown as StaffOffboardingRow[];

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: '대상 직원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const perms = (user.permissions ?? {}) as Record<string, unknown>;
    const isAdmin = Boolean(
      user.is_system_master || user.role === 'admin' || perms.admin || perms.mso || perms.system_master,
    );

    if (isSystemMasterTarget(row)) {
      return NextResponse.json({ error: '시스템 관리자 계정은 오프보딩할 수 없습니다.' }, { status: 403 });
    }
    if (!isAdmin && !isSameCompany(row, user)) {
      return NextResponse.json({ error: '같은 회사 직원만 처리할 수 있습니다.' }, { status: 403 });
    }

    let transition;
    try {
      transition = computeOffboardingTransition(action, row, {
        exitDate: body.exitDate,
        reason: body.reason,
        nowIso: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : '전이를 계산하지 못했습니다.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      status: transition.status,
      resigned_at: transition.resigned_at,
      permissions: JSON.stringify(transition.permissions) };
    if (transition.role !== undefined) patch.role = transition.role;
    if (transition.force_logout_at !== undefined) patch.force_logout_at = transition.force_logout_at;

    await db.update(staffMembersTable).set(patch).where(eq(staffMembersTable.id, staffId));

    return NextResponse.json({
      success: true,
      staffId,
      staffName: row.name,
      previous: { status: row.status, resigned_at: row.resigned_at },
      next: { status: transition.status, resigned_at: transition.resigned_at } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '오프보딩 처리 중 오류가 발생했습니다.';
    console.error('오프보딩 전이 실패:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

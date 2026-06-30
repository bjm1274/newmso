// 시스템마스터 라우트 — 얇은 디스패처.
// 세션/권한 검증 1회 수행 후 scope/action 별 핸들러로 라우팅.
// 도메인 로직은 ./handlers/* 및 공용 헬퍼는 ./_shared 에 분리(순수 추출, 계약 불변).
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  asc } from '@/lib/db';
import {
  clampLimit,
  sanitizeStaffRow,
  toLooseRecordArray,
  type StaffRow } from './_shared';
import { handleOverview } from './handlers/overview';
import { handleAudit, handlePermissionDiffs } from './handlers/audit';
import { handleChats } from './handlers/chats';
import { handleOperations } from './handlers/operations';
import { handleIntegrity } from './handlers/integrity';
import { handleDelete } from './handlers/delete-chat';
import { handlePostAction } from './handlers/actions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get('scope') || 'overview';
    const limit = clampLimit(searchParams.get('limit'), 120, 500);
    const keyword = String(searchParams.get('keyword') || '').trim();
    const roomId = String(searchParams.get('roomId') || '').trim();
    const category = String(searchParams.get('category') || 'all').trim();

    const staffQueryD1 = await getD1Binding();
    if (!staffQueryD1) {
      return NextResponse.json({ error: '직원 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
    }
    // 비밀번호 등 민감 필드는 sanitizeStaffRow에서 제거됨
    const staffRows = (await getD1Drizzle(staffQueryD1)
      .select()
      .from(staffMembersTable)
      .orderBy(asc(staffMembersTable.employee_no))
      .limit(500)) as StaffRow[];

    const safeStaffRows = toLooseRecordArray<StaffRow>(staffRows).map((row) => sanitizeStaffRow(row));
    const staffMap = new Map<string, StaffRow>(safeStaffRows.map((staff) => [String(staff.id), staff]));

    if (scope === 'overview') {
      return handleOverview(staffMap, safeStaffRows);
    }

    if (scope === 'audit') {
      return handleAudit(staffMap, { limit, keyword, category });
    }

    if (scope === 'chats') {
      return handleChats(request, staffMap, { limit, keyword, roomId });
    }

    if (scope === 'operations') {
      return handleOperations();
    }

    if (scope === 'permission-diffs') {
      return handlePermissionDiffs(staffMap, { limit, keyword });
    }

    if (scope === 'integrity') {
      return handleIntegrity(safeStaffRows);
    }

    return NextResponse.json({ error: 'Unsupported scope' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return await handleDelete(request);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    return await handlePostAction(action);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

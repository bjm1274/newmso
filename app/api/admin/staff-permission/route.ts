/**
 * 관리자 — 직원 역할·권한 변경 (SEC-1 CRITICAL 서버 가드)
 *
 * 클라이언트가 직접 staff_members.role / permissions 를 db SDK 로 update 하면
 * RLS 또는 세션 검증 없이 권한 상승이 가능하다(SEC-1). 이 라우트가 유일한 진입점이며
 * 비관리자 요청은 403 으로 차단한다.
 *
 * 허용 업데이트 컬럼 화이트리스트:
 *   - role        (text)
 *   - permissions (text — D1 에 JSON.stringify 로 저장)
 *
 * 처리 흐름:
 *   1) 세션 + admin 권한 검증.
 *   2) body 화이트리스트 검사.
 *   3) D1 staff_members UPDATE.
 *   4) 감사 로그 INSERT (실패해도 본 흐름 영향 없음).
 *   5) { ok: true } 반환.
 */
import { NextResponse } from 'next/server';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  audit_logs as auditLogsTable,
  eq } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** 서버에서 업데이트를 허용하는 컬럼 이름 집합 */
const ALLOWED_COLUMNS = new Set(['role', 'permissions'] as const);

type AllowedColumn = 'role' | 'permissions';

type RequestBody = {
  staffId?: unknown;
  updates?: unknown;
};

async function insertAuditLog(row: {
  action: string;
  target_type: string;
  target_id: string;
  user_id: string;
  user_name: string;
  details: Record<string, unknown>;
}) {
  try {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[staff-permission] D1 binding not available for audit');
    const db = getD1Drizzle(d1);
    await db.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      user_id: row.user_id,
      user_name: row.user_name,
      details: JSON.stringify(row.details),
      created_at: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[staff-permission] audit_logs insert failed:', message);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as RequestBody | null;

    const staffId =
      typeof payload?.staffId === 'string' ? payload.staffId.trim() : '';
    if (!staffId) {
      return NextResponse.json({ error: 'staffId is required' }, { status: 400 });
    }

    if (!payload?.updates || typeof payload.updates !== 'object' || Array.isArray(payload.updates)) {
      return NextResponse.json({ error: 'updates must be an object' }, { status: 400 });
    }

    const rawUpdates = payload.updates as Record<string, unknown>;

    // 화이트리스트 검사: 허용되지 않은 컬럼이 포함되면 400
    const requestedKeys = Object.keys(rawUpdates);
    const forbiddenKeys = requestedKeys.filter((k) => !ALLOWED_COLUMNS.has(k as AllowedColumn));
    if (forbiddenKeys.length > 0) {
      return NextResponse.json(
        { error: `허용되지 않은 컬럼: ${forbiddenKeys.join(', ')}` },
        { status: 400 },
      );
    }
    if (requestedKeys.length === 0) {
      return NextResponse.json({ error: 'updates must contain at least one field' }, { status: 400 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ error: 'D1 binding not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    // 대상 직원 존재 확인
    const targetRows = await db
      .select({ id: staffMembersTable.id, name: staffMembersTable.name })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, staffId))
      .limit(1);
    if (!targetRows[0]) {
      return NextResponse.json({ error: '대상 직원을 찾을 수 없습니다.' }, { status: 404 });
    }

    // D1 저장 형태로 변환:
    //   permissions 컬럼은 TEXT(JSON) 이므로 JSON.stringify 필요
    //   role 컬럼은 TEXT 이므로 string 그대로
    const dbSet: Partial<Record<AllowedColumn, string>> = {};
    if ('role' in rawUpdates) {
      const role = rawUpdates['role'];
      if (typeof role !== 'string' || !role.trim()) {
        return NextResponse.json({ error: 'role must be a non-empty string' }, { status: 400 });
      }
      dbSet.role = role.trim();
    }
    if ('permissions' in rawUpdates) {
      const perms = rawUpdates['permissions'];
      if (typeof perms !== 'object' || perms === null || Array.isArray(perms)) {
        return NextResponse.json({ error: 'permissions must be an object' }, { status: 400 });
      }
      dbSet.permissions = JSON.stringify(perms);
    }

    await db
      .update(staffMembersTable)
      .set(dbSet)
      .where(eq(staffMembersTable.id, staffId));

    // 감사 로그 기록 — 실패해도 200 응답 유지
    const adminUserId = String(session.user?.id ?? session.user?.user_id ?? 'unknown');
    const adminUserName = String(session.user?.name ?? session.user?.username ?? '');
    await insertAuditLog({
      action: '직원권한수정',
      target_type: 'staff_members',
      target_id: staffId,
      user_id: adminUserId,
      user_name: adminUserName,
      details: {
        updated_fields: requestedKeys,
        ...(dbSet.role !== undefined ? { role: dbSet.role } : {}),
        ...(dbSet.permissions !== undefined ? { permissions_updated: true } : {}) } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '권한 변경 처리 중 오류가 발생했습니다.';
    console.error('[admin/staff-permission] failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

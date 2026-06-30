import { NextResponse } from 'next/server';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { clearStaffPasswordWithFallback, updateStaffPasswordWithFallback } from '@/lib/staff-password';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  audit_logs as auditLogsTable,
  eq } from '@/lib/db';

async function insertAuditLogToD1(row: {
  action: string;
  target_type: string;
  target_id: string;
  user_id: string;
  user_name: string;
  details: Record<string, unknown>;
}) {
  try {
    const d1 = await getD1Binding();
    if (!d1) {
      throw new Error('[staff-password] D1 binding not available');
    }
    const db = getD1Drizzle(d1);
    await db.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      user_id: row.user_id,
      user_name: row.user_name,
      // details는 D1 스키마에서 text — jsonb → JSON.stringify
      details: JSON.stringify(row.details),
      created_at: new Date().toISOString() });
  } catch (err) {
    // 감사 로그 실패가 본 흐름을 막지 않도록 swallow + console (기존 Supabase 동작과 동등)
    const message = err instanceof Error ? err.message : String(err);
    console.error('[staff-password] audit_logs insert failed:', message);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const staffId = String(body?.staffId ?? '').trim();
    const password = String(body?.password ?? '');
    const clearPassword = Boolean(body?.clearPassword);

    if (!staffId) {
      return NextResponse.json({ ok: false, error: 'Staff ID is required' }, { status: 400 });
    }

    if (!clearPassword && !password.trim()) {
      return NextResponse.json({ ok: false, error: 'Password is required' }, { status: 400 });
    }

    const MIN_PASSWORD_LENGTH = 4;
    if (!clearPassword && password.trim().length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` },
        { status: 400 },
      );
    }

    const adminUserId = String(session.user?.id ?? session.user?.user_id ?? 'unknown');
    const adminUserName = String(session.user?.name ?? session.user?.username ?? '');

    if (clearPassword) {
      const { error, clearedColumns } = await clearStaffPasswordWithFallback(staffId);

      if (error) {
        const message = error instanceof Error ? error.message : String(error || 'Password clear failed');
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }

      // 비밀번호 초기화 플래그 설정 — D1 (boolean 바인딩 불가 → 정수 1)
      try {
        const d1 = await getD1Binding();
        if (d1) {
          const db = getD1Drizzle(d1);
          await db
            .update(staffMembersTable)
            .set({ password_reset_required: 1 })
            .where(eq(staffMembersTable.id, staffId));
        }
      } catch (flagErr) {
        console.error('[staff-password] D1 password_reset_required 플래그 설정 실패:', flagErr instanceof Error ? flagErr.message : String(flagErr));
        // 플래그 설정 실패가 본 흐름을 막지 않음
      }

      // 감사 로그 기록 — D1 직접 INSERT
      const clearAuditDetails = { clearedColumns };
      await insertAuditLogToD1({
        action: '비밀번호초기화',
        target_type: 'staff_members',
        target_id: staffId,
        user_id: adminUserId,
        user_name: adminUserName,
        details: clearAuditDetails });

      return NextResponse.json({ ok: true, cleared: true, clearedColumns });
    }

    const { error, updatedColumn } = await updateStaffPasswordWithFallback(staffId, password);

    if (error) {
      const message = error instanceof Error ? error.message : String(error || 'Password update failed');
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    // 감사 로그 기록 — D1 직접 INSERT
    const updateAuditDetails = { updatedColumn };
    await insertAuditLogToD1({
      action: '비밀번호변경',
      target_type: 'staff_members',
      target_id: staffId,
      user_id: adminUserId,
      user_name: adminUserName,
      details: updateAuditDetails });

    return NextResponse.json({ ok: true, updatedColumn });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { isAdminSession, isSystemMasterSession, readSessionFromRequest } from '@/lib/server-session';
import {
  clearStaffPasswordWithFallback,
  markStaffSessionsLoggedOut,
  sessionLogoutCutoffIso,
  updateStaffPasswordWithFallback } from '@/lib/staff-password';
import { SYSTEM_MASTER_ACCOUNT_ID } from '@/lib/system-master';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  audit_logs as auditLogsTable,
  eq } from '@/lib/db';

/**
 * 대상 계정이 시스템마스터인가.
 *
 * 세 가지 표식 중 하나라도 걸리면 시스템마스터로 본다. 어느 하나만 검사하면
 * 나머지 표식을 가진 계정이 그물을 빠져나간다 — 사번 '9999' 는 권한 컬럼이
 * 비어 있어도 lib/d1-api-helpers.ts 의 userId() 가 시스템마스터로 되돌려준다.
 */
function isSystemMasterRow(row: {
  employee_no?: string | null;
  is_system_master?: number | boolean | null;
  permissions?: string | null;
}): boolean {
  if (row.is_system_master === 1 || row.is_system_master === true) return true;
  if (String(row.employee_no ?? '').trim() === SYSTEM_MASTER_ACCOUNT_ID) return true;
  if (typeof row.permissions === 'string' && row.permissions.length > 0) {
    try {
      const parsed = JSON.parse(row.permissions) as Record<string, unknown> | null;
      if (parsed && typeof parsed === 'object' && parsed.system_master === true) return true;
    } catch {
      // 권한 JSON 이 깨져 있으면 판정할 수 없다 — 호출부에서 거부로 처리한다.
      return true;
    }
  }
  return false;
}

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

    // 시스템마스터 계정의 비밀번호는 시스템마스터만 바꿀 수 있다.
    //
    // 예전에는 대상 행을 아예 보지 않았다. isAdminSession 은 permissions.admin 만
    // 있어도 통과하므로, 일반 관리자가 시스템마스터 계정의 비밀번호를 재설정하고
    // 그 계정으로 로그인하면 시스템마스터센터·연차수동부여·백업복구가 전부 열렸다.
    //
    // 대상 행을 읽지 못하면 거부한다 — 시스템마스터가 아니라는 것을 확인하지
    // 못한 채로 비밀번호를 바꾸면 이 검사가 없는 것과 같다.
    if (!isSystemMasterSession(session.user)) {
      const d1 = await getD1Binding();
      if (!d1) {
        return NextResponse.json(
          { ok: false, error: '대상 계정을 확인할 수 없어 요청을 거부했습니다.' },
          { status: 503 },
        );
      }
      const rows = await getD1Drizzle(d1)
        .select({
          employee_no: staffMembersTable.employee_no,
          is_system_master: staffMembersTable.is_system_master,
          permissions: staffMembersTable.permissions })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.id, staffId))
        .limit(1);

      if (rows.length === 0) {
        return NextResponse.json({ ok: false, error: '대상 직원을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (isSystemMasterRow(rows[0])) {
        return NextResponse.json(
          { ok: false, error: '시스템마스터 계정의 비밀번호는 변경할 수 없습니다.' },
          { status: 403 },
        );
      }
    }

    const adminUserId = String(session.user?.id ?? session.user?.user_id ?? 'unknown');
    const adminUserName = String(session.user?.name ?? session.user?.username ?? '');

    if (clearPassword) {
      const { error, clearedColumns } = await clearStaffPasswordWithFallback(staffId);

      if (error) {
        const message = error instanceof Error ? error.message : String(error || 'Password clear failed');
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }

      // 비밀번호 초기화 플래그 + 초기화 시각 — D1 (boolean 바인딩 불가 → 정수 1)
      //
      // force_logout_at 을 같은 UPDATE 로 함께 쓴다. 두 가지를 동시에 하기 때문이다.
      //  (1) 초기화했는데 대상자의 기존 세션이 그대로 살아 있던 문제를 닫는다.
      //      비밀번호를 지워도 세션은 30일 슬라이딩으로 스스로 연장돼 아무 영향이 없었다.
      //  (2) master-login 의 first-login 창(초기 비밀번호를 정할 수 있는 기간) 시작점이 된다.
      //      따로 쓰면 한쪽만 실패했을 때 "플래그는 섰는데 시작점이 없는" 계정이 남는다.
      // 이 UPDATE 가 통째로 실패하면 계정은 열리는 게 아니라 잠긴다(플래그 0 → 로그인 차단).
      const clearCutoffIso = sessionLogoutCutoffIso();
      try {
        const d1 = await getD1Binding();
        if (d1) {
          const db = getD1Drizzle(d1);
          await db
            .update(staffMembersTable)
            .set({ password_reset_required: 1, force_logout_at: clearCutoffIso })
            .where(eq(staffMembersTable.id, staffId));
        }
      } catch (flagErr) {
        console.error('[staff-password] D1 password_reset_required 플래그 설정 실패:', flagErr instanceof Error ? flagErr.message : String(flagErr));
        // 플래그 설정 실패가 본 흐름을 막지 않음
      }

      // 감사 로그 기록 — D1 직접 INSERT
      const clearAuditDetails = { clearedColumns, forceLogoutAt: clearCutoffIso };
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

    // 관리자가 비밀번호를 바꿔 준 계정도 기존 세션을 끊는다.
    // 여기까지 오는 건 '분실·유출로 관리자가 대신 바꿔 준' 상황이라, 옛 비밀번호로 로그인해
    // 둔 단말이 계속 살아 있으면 변경 자체가 무의미하다. 대상자는 새 비밀번호로 다시 들어온다.
    // (관리자가 자기 계정을 대상으로 하면 자기 세션도 끊긴다 — 그게 맞는 동작이다.)
    let forceLogoutAt: string | null = null;
    try {
      forceLogoutAt = await markStaffSessionsLoggedOut(staffId);
    } catch (logoutErr) {
      console.error('[staff-password] force_logout_at 기록 실패:', logoutErr instanceof Error ? logoutErr.message : String(logoutErr));
      // 세션 종료 기록 실패가 비밀번호 변경 자체를 되돌리지는 않는다.
    }

    // 감사 로그 기록 — D1 직접 INSERT
    const updateAuditDetails = { updatedColumn, forceLogoutAt };
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

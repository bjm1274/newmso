import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { clearStaffPasswordWithFallback } from '@/lib/staff-password';
import { updateStaffPasswordWithFallback } from '@/lib/staff-password';
import {
  getD1Binding,
  getD1Drizzle,
  audit_logs as auditLogsTable,
} from '@/lib/db';

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
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // 감사 로그 실패가 본 흐름을 막지 않도록 swallow + console (기존 Supabase 동작과 동등)
    const message = err instanceof Error ? err.message : String(err);
    console.error('[staff-password] audit_logs insert failed:', message);
  }
}

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
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

    const supabase = createAdminSupabase();
    const adminUserId = String(session.user?.id ?? session.user?.user_id ?? 'unknown');
    const adminUserName = String(session.user?.name ?? session.user?.username ?? '');

    if (clearPassword) {
      const { error, clearedColumns } = await clearStaffPasswordWithFallback(supabase, staffId);

      if (error) {
        const message = error instanceof Error ? error.message : String(error?.message || 'Password clear failed');
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }

      // 감사 로그 기록 — D1 직접 INSERT
      const clearAuditDetails = { clearedColumns };
      await insertAuditLogToD1({
        action: '비밀번호초기화',
        target_type: 'staff_members',
        target_id: staffId,
        user_id: adminUserId,
        user_name: adminUserName,
        details: clearAuditDetails,
      });

      return NextResponse.json({ ok: true, cleared: true, clearedColumns });
    }

    const { error, updatedColumn } = await updateStaffPasswordWithFallback(supabase, staffId, password);

    if (error) {
      const message = error instanceof Error ? error.message : String(error?.message || 'Password update failed');
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
      details: updateAuditDetails,
    });

    return NextResponse.json({ ok: true, updatedColumn });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ============================================================
// app/api/auth/check-force-logout/route.ts
// 클라이언트가 주기적으로 호출해 본인의 force_logout_at 감지.
// Phase 5-C-1 — Supabase Realtime force-logout 채널 대체.
//
// 동작:
//   1) 세션에서 staff id 추출
//   2) staff_members SELECT 1 row by id
//   3) force_logout_at, 변경 가능성 있는 user payload 반환
// ============================================================
import { NextResponse } from 'next/server';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  eq } from '@/lib/db';

export const dynamic = 'force-dynamic';

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

function parsePermissions(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 파싱 실패 — 빈 객체
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (session?.user && (session.user.is_system_master === true || session.user.login_id === '9999' || session.user.employee_no === '9999')) {
      return NextResponse.json({ ok: true, user: session.user });
    }
    const id = userId(session?.user);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: staffMembersTable.id,
        force_logout_at: staffMembersTable.force_logout_at,
        role: staffMembersTable.role,
        permissions: staffMembersTable.permissions,
        status: staffMembersTable.status,
        name: staffMembersTable.name,
        email: staffMembersTable.email,
        phone: staffMembersTable.phone,
        company: staffMembersTable.company,
        company_id: staffMembersTable.company_id,
        department: staffMembersTable.department,
        position: staffMembersTable.position,
        team: staffMembersTable.team })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, id))
      .limit(1);
    const row = rows[0] ?? null;
    if (!row) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    // D1에서 permissions는 TEXT → 파싱
    const user = { ...row, permissions: parsePermissions(row.permissions) };
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

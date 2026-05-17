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
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key);
}

export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const id = userId(session?.user);
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('staff_members')
      .select('id, force_logout_at, role, permissions, status, name, email, phone, company, company_id, department, position, team')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, user: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

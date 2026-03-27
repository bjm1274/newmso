import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { clearStaffPasswordWithFallback } from '@/lib/staff-password';
import { updateStaffPasswordWithFallback } from '@/lib/staff-password';

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
    if (clearPassword) {
      const { error, clearedColumns } = await clearStaffPasswordWithFallback(supabase, staffId);

      if (error) {
        const message = error instanceof Error ? error.message : String(error?.message || 'Password clear failed');
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, cleared: true, clearedColumns });
    }

    const { error, updatedColumn } = await updateStaffPasswordWithFallback(supabase, staffId, password);

    if (error) {
      const message = error instanceof Error ? error.message : String(error?.message || 'Password update failed');
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updatedColumn });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

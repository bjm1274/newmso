import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { readSessionFromRequest } from '@/lib/server-session';

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

async function verifyStoredPassword(storedPassword: string, inputPassword: string) {
  if (!storedPassword) {
    return false;
  }

  if (storedPassword.startsWith('$2')) {
    return bcrypt.compare(inputPassword, storedPassword);
  }

  return storedPassword === inputPassword;
}

function isUuidLike(value: string | null | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id && !session?.user?.name) {
      return NextResponse.json({ verified: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const password = String(body?.password ?? '');
    const requestName = String(body?.name ?? '').trim();
    const requestEmployeeNo = String(body?.employeeNo ?? '').trim();
    if (!password) {
      return NextResponse.json({ verified: false, error: 'Password is required' }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    let staff: { id: string; password?: string | null; passwd?: string | null } | null = null;

    const sessionUserId = String(session?.user?.id ?? '').trim();
    if (isUuidLike(sessionUserId)) {
      const { data: staffById, error: idError } = await supabase
        .from('staff_members')
        .select('id, password, passwd')
        .eq('id', sessionUserId)
        .maybeSingle();
      if (idError) {
        throw idError;
      }
      staff = staffById;
    }

    if (!staff) {
      const sessionUserName = String(session?.user?.name ?? '').trim();
      const fallbackNames = [sessionUserName, requestName].filter(Boolean);
      for (const candidateName of fallbackNames) {
        const { data: staffRows, error: nameError } = await supabase
          .from('staff_members')
          .select('id, password, passwd')
          .eq('name', candidateName)
          .limit(1);
        if (nameError) {
          throw nameError;
        }
        if (staffRows?.[0]) {
          staff = staffRows[0];
          break;
        }
      }
    }

    if (!staff && requestEmployeeNo) {
      const { data: staffRows, error: employeeNoError } = await supabase
        .from('staff_members')
        .select('id, password, passwd')
        .eq('employee_no', requestEmployeeNo)
        .limit(1);
      if (employeeNoError) {
        throw employeeNoError;
      }
      staff = staffRows?.[0] ?? null;
    }

    if (!staff) {
      return NextResponse.json({ verified: false, error: 'Staff not found' }, { status: 404 });
    }

    const storedPassword = String(staff.password ?? staff.passwd ?? '').trim();
    const verified = await verifyStoredPassword(storedPassword, password);

    return NextResponse.json({ verified });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ verified: false, error: message }, { status: 500 });
  }
}
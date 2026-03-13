import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyPrivilegedSessionPassword } from '@/lib/admin-credentials';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  pickStoredPassword,
  selectStaffPasswordRowsWithFallback,
  type StaffCredentialRow,
  verifyStoredPassword,
} from '@/lib/staff-password';

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
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
    const requestUserId = String(body?.userId ?? '').trim();
    const requestName = String(body?.name ?? '').trim();
    const requestEmployeeNo = String(body?.employeeNo ?? '').trim();
    if (!password) {
      return NextResponse.json({ verified: false, error: 'Password is required' }, { status: 400 });
    }

    const privilegedVerification = await verifyPrivilegedSessionPassword(session?.user, password);
    if (privilegedVerification.ok) {
      return NextResponse.json({ verified: true });
    }

    const supabase = createAdminSupabase();
    const candidates = new Map<string, StaffCredentialRow>();
    const addCandidate = (staff: StaffCredentialRow | null | undefined) => {
      if (!staff?.id || candidates.has(staff.id)) return;
      candidates.set(staff.id, staff);
    };

    const fetchById = async (staffId: string) => {
      if (!isUuidLike(staffId)) return;
      const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow>(
        (selectClause) =>
          supabase
            .from('staff_members')
            .select(selectClause)
            .eq('id', staffId)
            .maybeSingle()
      );
      if (error) throw error;
      addCandidate(data);
    };

    const fetchByEmployeeNo = async (employeeNo: string) => {
      const trimmed = String(employeeNo || '').trim();
      if (!trimmed) return;
      const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow[]>(
        (selectClause) =>
          supabase
            .from('staff_members')
            .select(selectClause)
            .eq('employee_no', trimmed)
            .limit(3)
      );
      if (error) throw error;
      (data || []).forEach(addCandidate);
    };

    const fetchByName = async (name: string) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return;
      const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow[]>(
        (selectClause) =>
          supabase
            .from('staff_members')
            .select(selectClause)
            .eq('name', trimmed)
            .limit(5)
      );
      if (error) throw error;
      (data || []).forEach(addCandidate);
    };

    const sessionUserId = String(session?.user?.id ?? '').trim();
    await fetchById(sessionUserId);
    await fetchById(requestUserId);

    const sessionEmployeeNo = String(session?.user?.employee_no ?? '').trim();
    const fallbackEmployeeNos = Array.from(new Set([sessionEmployeeNo, requestEmployeeNo].filter(Boolean)));
    for (const employeeNo of fallbackEmployeeNos) {
      await fetchByEmployeeNo(employeeNo);
    }

    const sessionUserName = String(session?.user?.name ?? '').trim();
    const fallbackNames = Array.from(new Set([sessionUserName, requestName].filter(Boolean)));
    for (const candidateName of fallbackNames) {
      await fetchByName(candidateName);
    }

    const candidateRows = Array.from(candidates.values());
    if (!candidateRows.length) {
        return NextResponse.json({ verified: false, error: 'Staff not found' }, { status: 404 });
    }

    for (const staff of candidateRows) {
      const storedPassword = pickStoredPassword(staff);
      const verified = await verifyStoredPassword(storedPassword, password);
      if (verified.ok) {
        return NextResponse.json({ verified: true });
      }
    }

    return NextResponse.json({ verified: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ verified: false, error: message }, { status: 500 });
  }
}

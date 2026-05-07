import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-admin';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  pickStoredPassword,
  selectStaffPasswordRowsWithFallback,
  type StaffCredentialRow,
  updateStaffPasswordWithFallback,
  verifyStoredPassword,
} from '@/lib/staff-password';
import { isUuidLike } from '@/lib/staff-identity';

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id && !session?.user?.name) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const currentPassword = String(body?.currentPassword ?? '');
    const newPassword = String(body?.newPassword ?? '');

    if (!currentPassword) {
      return NextResponse.json({ ok: false, error: '현재 비밀번호를 입력해 주세요.' }, { status: 400 });
    }

    if (newPassword.trim().length < 4) {
      return NextResponse.json({ ok: false, error: '새 비밀번호는 4자 이상 입력해 주세요.' }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ ok: false, error: '현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const candidates = new Map<string, StaffCredentialRow>();
    const addCandidate = (staff: StaffCredentialRow | null | undefined) => {
      if (!staff?.id || candidates.has(staff.id)) return;
      candidates.set(staff.id, staff);
    };

    const sessionUserId = String(session.user.id ?? '').trim();
    const sessionEmployeeNo = String(session.user.employee_no ?? '').trim();
    const sessionUserName = String(session.user.name ?? '').trim();

    if (isUuidLike(sessionUserId)) {
      const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow>((selectClause) =>
        supabase
          .from('staff_members')
          .select(selectClause)
          .eq('id', sessionUserId)
          .maybeSingle()
      );
      if (error) throw error;
      addCandidate(data);
    }

    if (sessionEmployeeNo) {
      const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow[]>((selectClause) =>
        supabase
          .from('staff_members')
          .select(selectClause)
          .eq('employee_no', sessionEmployeeNo)
          .limit(3)
      );
      if (error) throw error;
      (data || []).forEach(addCandidate);
    }

    if (sessionUserName) {
      const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow[]>((selectClause) =>
        supabase
          .from('staff_members')
          .select(selectClause)
          .eq('name', sessionUserName)
          .limit(5)
      );
      if (error) throw error;
      (data || []).forEach(addCandidate);
    }

    const verifiedStaffs: StaffCredentialRow[] = [];
    for (const staff of candidates.values()) {
      const result = await verifyStoredPassword(pickStoredPassword(staff), currentPassword);
      if (result.ok) {
        verifiedStaffs.push(staff);
      }
    }

    if (!verifiedStaffs.length) {
      return NextResponse.json({ ok: false, error: '현재 비밀번호가 일치하지 않습니다.' }, { status: 400 });
    }

    const sessionMatchedStaff = verifiedStaffs.find((staff) => staff.id === sessionUserId);
    if (!sessionMatchedStaff && verifiedStaffs.length > 1) {
      return NextResponse.json(
        { ok: false, error: '비밀번호를 변경할 계정을 정확히 확인할 수 없습니다. 사번으로 다시 로그인해 주세요.' },
        { status: 409 }
      );
    }

    const targetStaff = sessionMatchedStaff || verifiedStaffs[0];
    const { error, updatedColumn } = await updateStaffPasswordWithFallback(supabase, targetStaff.id, newPassword);

    if (error) {
      const message = error instanceof Error ? error.message : String(error?.message || 'Password update failed');
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    await supabase
      .from('audit_logs')
      .insert({
        action: '비밀번호자체변경',
        target_type: 'staff_members',
        target_id: targetStaff.id,
        user_id: targetStaff.id,
        user_name: sessionUserName || targetStaff.name || '',
        details: { updatedColumn },
      })
      .then(() => {}, () => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

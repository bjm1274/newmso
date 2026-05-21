import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-admin';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  pickStoredPassword,
  selectStaffPasswordRowsWithFallback,
  selectStaffCredentialByIdD1,
  selectStaffCredentialsByEmployeeNoD1,
  selectStaffCredentialsByNameD1,
  type StaffCredentialRow,
  updateStaffPasswordWithFallback,
  verifyStoredPassword,
} from '@/lib/staff-password';
import { isUuidLike } from '@/lib/staff-identity';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  audit_logs as auditLogsTable,
} from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: '본인 확인을 위해 다시 로그인해 주세요.' }, { status: 401 });
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

    const backend = await resolveDataBackend();
    const candidates = new Map<string, StaffCredentialRow>();
    const addCandidate = (staff: StaffCredentialRow | null | undefined) => {
      if (!staff?.id || candidates.has(staff.id)) return;
      candidates.set(staff.id, staff);
    };

    const sessionUserId = String(session.user.id).trim();
    const sessionEmployeeNo = String(session.user.employee_no ?? '').trim();
    const sessionUserName = String(session.user.name ?? '').trim();

    if (backend === 'd1') {
      // d1 모드: Drizzle 헬퍼 사용 — Supabase withMissingColumnsFallback 불필요
      if (isUuidLike(sessionUserId)) {
        const row = await selectStaffCredentialByIdD1(sessionUserId);
        addCandidate(row);
      }

      if (candidates.size === 0 && sessionEmployeeNo) {
        const rows = await selectStaffCredentialsByEmployeeNoD1(sessionEmployeeNo);
        rows.forEach(addCandidate);
      }

      if (candidates.size === 0 && sessionUserName) {
        const rows = await selectStaffCredentialsByNameD1(sessionUserName);
        if (rows.length > 1) {
          return NextResponse.json(
            { ok: false, error: '본인 확인을 위해 다시 로그인해 주세요.' },
            { status: 403 }
          );
        }
        rows.forEach(addCandidate);
      }
    } else {
      // Supabase 경로 (dual-write / supabase 모드)
      const supabase = createServiceClient();

      // id가 보장된 상태이므로 UUID로 직접 조회를 우선한다.
      // id 조회에 성공하면 employee_no/name 폴백을 건너뛰어 동명이인 오염을 차단한다.
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

      // UUID 조회 실패 시에만 employee_no 폴백 사용 (동명이인 위험 없음)
      if (candidates.size === 0 && sessionEmployeeNo) {
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

      // employee_no 폴백도 실패 시에만 name 폴백 사용. 단, 동명이인이 있으면 거부한다.
      if (candidates.size === 0 && sessionUserName) {
        const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow[]>((selectClause) =>
          supabase
            .from('staff_members')
            .select(selectClause)
            .eq('name', sessionUserName)
            .limit(5)
        );
        if (error) throw error;
        const nameMatches = data || [];
        if (nameMatches.length > 1) {
          return NextResponse.json(
            { ok: false, error: '본인 확인을 위해 다시 로그인해 주세요.' },
            { status: 403 }
          );
        }
        nameMatches.forEach(addCandidate);
      }
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
    // updateStaffPasswordWithFallback은 내부에서 resolveDataBackend() 분기 처리 (d1 모드 자동 적용)
    // supabase 인자는 supabase/dual-write 모드에서만 실제로 사용됨
    const supabaseForUpdate = backend === 'd1' ? null : createServiceClient();
    const { error, updatedColumn } = await updateStaffPasswordWithFallback(supabaseForUpdate, targetStaff.id, newPassword);

    if (error) {
      const message = error instanceof Error ? error.message : String(error?.message || 'Password update failed');
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    // audit_logs 기록 — d1 모드는 Drizzle, 그 외 Supabase (best-effort)
    if (backend === 'd1') {
      try {
        const d1 = await getD1Binding();
        if (d1) {
          const db = getD1Drizzle(d1);
          await db.insert(auditLogsTable).values({
            id: crypto.randomUUID(),
            action: '비밀번호자체변경',
            target_type: 'staff_members',
            target_id: targetStaff.id,
            user_id: targetStaff.id,
            user_name: sessionUserName || targetStaff.name || '',
            details: JSON.stringify({ updatedColumn }),
            created_at: new Date().toISOString(),
          });
        }
      } catch {
        // 감사 로그 실패가 본 흐름을 막지 않음
      }
    } else {
      const supabaseClient = createServiceClient();
      await supabaseClient
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
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

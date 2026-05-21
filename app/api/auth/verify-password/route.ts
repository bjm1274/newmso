import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyPrivilegedSessionPassword } from '@/lib/admin-credentials';
import { readSessionFromRequest, resolveLatestSessionUser } from '@/lib/server-session';
import {
  pickStoredPassword,
  selectStaffPasswordRowsWithFallback,
  selectStaffCredentialByIdD1,
  selectStaffCredentialsByEmployeeNoD1,
  selectStaffCredentialsByNameD1,
  type StaffCredentialRow,
  verifyStoredPassword,
} from '@/lib/staff-password';
import { resolveDataBackend } from '@/lib/db';

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

function isIdentityMismatch(requestValue: string, sessionValue: string) {
  return Boolean(requestValue && sessionValue && requestValue !== sessionValue);
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ verified: false, error: '본인 확인을 위해 다시 로그인해 주세요.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const password = String(body?.password ?? '');
    const requestUserId = String(body?.userId ?? '').trim();
    const requestName = String(body?.name ?? '').trim();
    const requestEmployeeNo = String(body?.employeeNo ?? '').trim();
    if (!password) {
      return NextResponse.json({ verified: false, error: 'Password is required' }, { status: 400 });
    }

    const resolvedSessionUser = await resolveLatestSessionUser(session.user);
    const sessionUserId = String(resolvedSessionUser?.id ?? '').trim();
    const sessionAuthUserId = String(resolvedSessionUser?.auth_user_id ?? '').trim();
    const sessionEmployeeNo = String(resolvedSessionUser?.employee_no ?? '').trim();
    const sessionUserName = String(resolvedSessionUser?.name ?? '').trim();
    const allowedSessionUserIds = new Set([sessionUserId, sessionAuthUserId].filter(Boolean));

    if (
      Boolean(requestUserId && allowedSessionUserIds.size > 0 && !allowedSessionUserIds.has(requestUserId)) ||
      isIdentityMismatch(requestEmployeeNo, sessionEmployeeNo) ||
      isIdentityMismatch(requestName, sessionUserName)
    ) {
      return NextResponse.json(
        { verified: false, error: '다른 사용자 본인 확인은 허용되지 않습니다.' },
        { status: 403 }
      );
    }

    const privilegedVerification = await verifyPrivilegedSessionPassword(session?.user, password);
    if (privilegedVerification.ok) {
      return NextResponse.json({ verified: true });
    }

    const backend = await resolveDataBackend();
    const candidates = new Map<string, StaffCredentialRow>();
    const addCandidate = (staff: StaffCredentialRow | null | undefined) => {
      if (!staff?.id || candidates.has(staff.id)) return;
      candidates.set(staff.id, staff);
    };

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
            { verified: false, error: '본인 확인을 위해 다시 로그인해 주세요.' },
            { status: 403 }
          );
        }
        rows.forEach(addCandidate);
      }
    } else {
      // Supabase 경로 (dual-write / supabase 모드)
      const supabase = createAdminSupabase();

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

      // id 조회 우선. 성공하면 employee_no/name 폴백을 건너뛰어 동명이인 오염을 차단한다.
      await fetchById(sessionUserId);

      if (candidates.size === 0) {
        for (const employeeNo of Array.from(new Set([sessionEmployeeNo].filter(Boolean)))) {
          await fetchByEmployeeNo(employeeNo);
        }
      }

      // employee_no 폴백도 실패 시에만 name 폴백 사용. 동명이인이 있으면 거부한다.
      if (candidates.size === 0) {
        for (const candidateName of Array.from(new Set([sessionUserName].filter(Boolean)))) {
          const trimmed = String(candidateName || '').trim();
          if (!trimmed) continue;
          const { data, error } = await selectStaffPasswordRowsWithFallback<StaffCredentialRow[]>(
            (selectClause) =>
              supabase
                .from('staff_members')
                .select(selectClause)
                .eq('name', trimmed)
                .limit(5)
          );
          if (error) throw error;
          const nameMatches = data || [];
          if (nameMatches.length > 1) {
            return NextResponse.json(
              { verified: false, error: '본인 확인을 위해 다시 로그인해 주세요.' },
              { status: 403 }
            );
          }
          nameMatches.forEach(addCandidate);
        }
      }
    }

    const candidateRows = Array.from(candidates.values());
    if (!candidateRows.length) {
      return NextResponse.json({ verified: false, error: 'Staff not found' }, { status: 404 });
    }

    // 타이밍 공격 방지: 조기 반환하지 않고 모든 후보를 순회
    let isVerified = false;
    for (const staff of candidateRows) {
      const storedPassword = pickStoredPassword(staff);
      const result = await verifyStoredPassword(storedPassword, password);
      if (result.ok) isVerified = true;
    }

    return NextResponse.json({ verified: isVerified });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ verified: false, error: message }, { status: 500 });
  }
}

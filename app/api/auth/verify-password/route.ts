import { NextResponse } from 'next/server';
import { verifyPrivilegedSessionPassword } from '@/lib/admin-credentials';
import { readSessionFromRequest, resolveLatestSessionUser } from '@/lib/server-session';
import {
  pickStoredPassword,
  selectStaffCredentialByIdD1,
  selectStaffCredentialsByEmployeeNoD1,
  selectStaffCredentialsByNameD1,
  type StaffCredentialRow,
  verifyStoredPassword } from '@/lib/staff-password';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';

// Rate limit: 5분당 10회 per user
const VERIFY_PW_RATE_LIMIT_MAX = 10;
const VERIFY_PW_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

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

    // Rate limit: 5분당 10회 per user
    const rateKey = `verify-password:${String(session.user.id)}`;
    const rate = await checkRateLimit(rateKey, VERIFY_PW_RATE_LIMIT_MAX, VERIFY_PW_RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { verified: false, error: '비밀번호 확인 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 300) } },
      );
    }
    await recordFailedAttempt(rateKey, VERIFY_PW_RATE_LIMIT_WINDOW_MS);

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

    const candidates = new Map<string, StaffCredentialRow>();
    const addCandidate = (staff: StaffCredentialRow | null | undefined) => {
      if (!staff?.id || candidates.has(staff.id)) return;
      candidates.set(staff.id, staff);
    };

    // D1: Drizzle 헬퍼 사용. id 조회 우선 → 성공 시 employee_no/name 폴백을 건너뛰어 동명이인 오염 차단.
    if (isUuidLike(sessionUserId)) {
      const row = await selectStaffCredentialByIdD1(sessionUserId);
      addCandidate(row);
    }

    if (candidates.size === 0 && sessionEmployeeNo) {
      const rows = await selectStaffCredentialsByEmployeeNoD1(sessionEmployeeNo);
      rows.forEach(addCandidate);
    }

    // employee_no 폴백도 실패 시에만 name 폴백 사용. 동명이인이 있으면 거부한다.
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

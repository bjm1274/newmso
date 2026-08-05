import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  pickStoredPassword,
  selectStaffCredentialByIdD1,
  selectStaffCredentialsByEmployeeNoD1,
  selectStaffCredentialsByNameD1,
  type StaffCredentialRow,
  updateStaffPasswordWithFallback,
  verifyStoredPassword } from '@/lib/staff-password';
import { isUuidLike } from '@/lib/staff-identity';
import {
  getD1Binding,
  getD1Drizzle,
  audit_logs as auditLogsTable } from '@/lib/db';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';

// Rate limit: 5분당 10회 per user
const CHANGE_PW_RATE_LIMIT_MAX = 10;
const CHANGE_PW_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: '본인 확인을 위해 다시 로그인해 주세요.' }, { status: 401 });
    }

    // Rate limit: 5분당 10회 per user
    const rateKey = `change-password:${String(session.user.id)}`;
    // failClosed: 판정 불가(D1 장애·미바인딩) 시 통과가 아니라 차단.
    // 예전에는 조용히 통과시켜 현재 비밀번호 대입 시도의 상한이 사라졌다.
    const rate = await checkRateLimit(rateKey, CHANGE_PW_RATE_LIMIT_MAX, CHANGE_PW_RATE_LIMIT_WINDOW_MS, {
      failClosed: true,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: '비밀번호 변경 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 300) } },
      );
    }
    await recordFailedAttempt(rateKey, CHANGE_PW_RATE_LIMIT_WINDOW_MS);

    const body = await request.json().catch(() => null);
    const currentPassword = String(body?.currentPassword ?? '');
    const newPassword = String(body?.newPassword ?? '');

    if (!currentPassword) {
      return NextResponse.json({ ok: false, error: '현재 비밀번호를 입력해 주세요.' }, { status: 400 });
    }

    if (newPassword.trim().length < 8) {
      return NextResponse.json(
        { ok: false, error: '새 비밀번호는 8자 이상 입력해 주세요.' },
        { status: 400 },
      );
    }

    const passwordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",.<>?/`~])/;
    if (!passwordComplexityRegex.test(newPassword)) {
      return NextResponse.json(
        { ok: false, error: '비밀번호는 대문자, 소문자, 숫자, 특수문자를 각각 1자 이상 포함해야 합니다.' },
        { status: 400 },
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ ok: false, error: '현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.' }, { status: 400 });
    }

    const candidates = new Map<string, StaffCredentialRow>();
    const addCandidate = (staff: StaffCredentialRow | null | undefined) => {
      if (!staff?.id || candidates.has(staff.id)) return;
      candidates.set(staff.id, staff);
    };

    const sessionUserId = String(session.user.id).trim();
    const sessionEmployeeNo = String(session.user.employee_no ?? '').trim();
    const sessionUserName = String(session.user.name ?? '').trim();

    // D1: Drizzle 헬퍼 사용.
    // id가 보장된 상태이므로 UUID로 직접 조회를 우선한다.
    // id 조회에 성공하면 employee_no/name 폴백을 건너뛰어 동명이인 오염을 차단한다.
    if (isUuidLike(sessionUserId)) {
      const row = await selectStaffCredentialByIdD1(sessionUserId);
      addCandidate(row);
    }

    // UUID 조회 실패 시에만 employee_no 폴백 사용 (동명이인 위험 없음)
    if (candidates.size === 0 && sessionEmployeeNo) {
      const rows = await selectStaffCredentialsByEmployeeNoD1(sessionEmployeeNo);
      rows.forEach(addCandidate);
    }

    // employee_no 폴백도 실패 시에만 name 폴백 사용. 단, 동명이인이 있으면 거부한다.
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
    const { error, updatedColumn } = await updateStaffPasswordWithFallback(targetStaff.id, newPassword);

    if (error) {
      const message = error instanceof Error ? error.message : String(error || 'Password update failed');
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    // audit_logs 기록 — D1 Drizzle (best-effort)
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
          created_at: new Date().toISOString() });
      }
    } catch {
      // 감사 로그 실패가 본 흐름을 막지 않음
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

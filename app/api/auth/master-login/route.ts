import { NextRequest, NextResponse } from 'next/server';
import { isActiveStaff } from '@/lib/active-staff';
import { checkRateLimit, recordFailedAttempt, resetAttempts } from '@/lib/rate-limit';
import { createClient } from '@supabase/supabase-js';
import { getAdminCredentialConfig, getRuntimeEnv, verifyPrivilegedLogin } from '@/lib/admin-credentials';
import { createSupabaseAccessToken } from '@/lib/server-supabase-bridge';
import {
  pickStoredPassword,
  updateStaffPasswordWithFallback,
  verifyStoredPassword,
} from '@/lib/staff-password';
import { isMissingColumnError, withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionCookieOptions,
  normalizeSessionUser,
  SESSION_COOKIE_NAME,
} from '@/lib/server-session';

function getAdminClient() {
  const supabaseUrl = getRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase URL 또는 Service Role Key가 설정되지 않았습니다.');
  }

  return createClient(supabaseUrl, serviceKey);
}

async function successResponse(user: any, notice?: string) {
  const safeUser = normalizeSessionUser(user);
  const issuedAt = new Date().toISOString();
  const token = await createSessionToken(safeUser);
  const supabaseAccessToken = await createSupabaseAccessToken(safeUser);
  const response = NextResponse.json({
    success: true,
    user: safeUser,
    issuedAt,
    supabaseAccessToken,
    ...(notice ? { notice } : {}),
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}

function failureResponse(error?: string, status = 200) {
  const response = NextResponse.json(
    { success: false, ...(error ? { error } : {}) },
    { status }
  );
  return clearSessionCookie(response);
}

const isActiveStaffForLogin = (row: any) => isActiveStaff(row);
const STAFF_LOGIN_COLUMNS = [
  'id',
  'employee_no',
  'name',
  'role',
  'department',
  'company',
  'company_id',
  'position',
  'status',
  'permissions',
  'photo_url',
  'avatar_url',
  'profile_photo_path',
  'profile_photo_updated_at',
  'email',
  'phone',
  'auth_user_id',
  'is_system_master',
  'password',
  'passwd',
  'password_reset_required',
] as const;
const STAFF_LOGIN_OPTIONAL_COLUMNS = [
  'role',
  'department',
  'company',
  'company_id',
  'position',
  'status',
  'permissions',
  'photo_url',
  'avatar_url',
  'profile_photo_path',
  'profile_photo_updated_at',
  'email',
  'phone',
  'auth_user_id',
  'is_system_master',
  'password',
  'passwd',
  'password_reset_required',
];

function buildStaffLoginSelect(omittedColumns: ReadonlySet<string>) {
  return STAFF_LOGIN_COLUMNS.filter((column) => !omittedColumns.has(column)).join(', ');
}

async function runStaffLoginSelect<T>(
  runSelect: (selectClause: string) => PromiseLike<{ data: T | null; error: any }>
) {
  return withMissingColumnsFallback<T>(
    (omittedColumns) => runSelect(buildStaffLoginSelect(omittedColumns)),
    STAFF_LOGIN_OPTIONAL_COLUMNS
  );
}

function isSupabaseQuotaRestriction(error: any) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes('exceed_egress_quota') || message.includes('service for this project is restricted');
}

function authDataUnavailableResponse(error: any) {
  const status = isSupabaseQuotaRestriction(error) ? 503 : 500;
  return failureResponse(
    '현재 인증 데이터베이스를 조회할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.',
    status
  );
}

async function privilegedFallbackResponse(loginId: string, password: string) {
  const privilegedLogin = await verifyPrivilegedLogin(loginId, password);
  if (!privilegedLogin.ok) return null;

  const { adminName } = getAdminCredentialConfig();

  if (privilegedLogin.kind === 'admin') {
    const adminDisplayName = adminName || 'MSO 관리자';
    return successResponse({
      id: null,
      employee_no: /^\d+$/.test(loginId) ? loginId : '1',
      login_id: loginId,
      name: adminDisplayName,
      role: 'admin',
      department: '경영지원팀',
      company: 'SY INC.',
      company_id: null,
      permissions: {
        inventory: true,
        hr: true,
        approval: true,
        admin: true,
        mso: true,
        hr_교대근무: true,
      },
    });
  }

  return successResponse({
    id: null,
    employee_no: '0',
    login_id: loginId,
    name: '시스템관리자',
    role: 'admin',
    is_system_master: true,
    department: '경영지원팀',
    company: 'SY INC.',
    company_id: null,
    permissions: {
      inventory: true,
      hr: true,
      approval: true,
      admin: true,
      mso: true,
      system_master: true,
      hr_교대근무: true,
    },
  });
}

export async function POST(request: NextRequest) {
  let loginId = '';
  let password = '';

  try {
    const body = await request.json();
    loginId = String(body?.loginId ?? '').trim();
    password = String(body?.password ?? '');
  } catch {
    return failureResponse('잘못된 요청 형식입니다.', 400);
  }

  if (!loginId || !password) {
    return failureResponse('아이디와 비밀번호를 모두 입력해주세요.', 400);
  }

  // 아이디 단위로 차단 (IP 기반 X → 다른 사람에게 영향 없음)
  const MAX_FAILED_ATTEMPTS = 10; // 동일 아이디로 10회 연속 실패 시 차단
  const WINDOW_MS = 15 * 60 * 1000; // 15분
  const rateCheck = await checkRateLimit(loginId, MAX_FAILED_ATTEMPTS, WINDOW_MS);
  if (!rateCheck.allowed) {
    return failureResponse('비밀번호를 너무 많이 틀렸습니다. 15분 후 다시 시도해주세요.', 429);
  }

  const { adminName, adminPasswordHash, masterId, masterPasswordHash } = getAdminCredentialConfig();

  try {
    const privilegedResponse = await privilegedFallbackResponse(loginId, password);
    if (privilegedResponse) {
      return privilegedResponse;
    }

    const supabase = getAdminClient();
    let userRow: any = null;

    const { data: byEmployeeNo, error: byEmployeeNoError } = await runStaffLoginSelect((selectClause) =>
      supabase
        .from('staff_members')
        .select(selectClause)
        .eq('employee_no', loginId)
        .maybeSingle()
    );

    if (byEmployeeNoError) {
      console.error('[master-login] staff_members employee_no 조회 실패:', JSON.stringify(byEmployeeNoError));
      return authDataUnavailableResponse(byEmployeeNoError);
    }

    if (byEmployeeNo) {
      userRow = byEmployeeNo;
    } else {
      const { data: byName, error: byNameError } = await runStaffLoginSelect<any[]>((selectClause) =>
        supabase
          .from('staff_members')
          .select(selectClause)
          .eq('name', loginId)
          .limit(10)
      );

      if (byNameError) {
        console.error('[master-login] staff_members name 조회 실패:', JSON.stringify(byNameError));
        return authDataUnavailableResponse(byNameError);
      }

      const activeNameMatches = (byNameError ? [] : (byName ?? [])).filter(isActiveStaffForLogin);

      if (activeNameMatches.length > 1) {
        return failureResponse('동명이인이 있습니다. 로그인 아이디에 사번을 입력해 주세요.');
      }

      if (activeNameMatches.length === 1) {
        userRow = activeNameMatches[0];
      } else if (byName?.length === 1) {
        userRow = byName[0];
      }
    }

    if (!userRow) {
      const privilegedLogin = await verifyPrivilegedLogin(loginId, password);

      if (privilegedLogin.ok && privilegedLogin.kind === 'admin') {
        const adminDisplayName = adminName || 'MSO 관리자';
        let msoRow: any = null;

        if (adminName) {
          const { data } = await runStaffLoginSelect((selectClause) =>
            supabase
              .from('staff_members')
              .select(selectClause)
              .eq('name', adminName)
              .maybeSingle()
          );
          msoRow = data ?? null;
        }

        if (!msoRow && /^\d+$/.test(loginId)) {
          const { data } = await runStaffLoginSelect((selectClause) =>
            supabase
              .from('staff_members')
              .select(selectClause)
              .eq('employee_no', loginId)
              .maybeSingle()
          );
          msoRow = data ?? null;
        }

        const user = msoRow
          ? {
              ...msoRow,
              role: 'admin',
              permissions: {
                inventory: true,
                hr: true,
                approval: true,
                admin: true,
                mso: true,
                hr_교대근무: true,
              },
            }
          : {
              id: null,
              employee_no: '1',
              name: adminDisplayName,
              role: 'admin',
              department: '경영지원팀',
              company: 'SY INC.',
              company_id: null,
              permissions: {
                inventory: true,
                hr: true,
                approval: true,
                admin: true,
                mso: true,
                hr_교대근무: true,
              },
            };

        return successResponse(user);
      }

      if (privilegedLogin.ok && privilegedLogin.kind === 'master') {
        return successResponse({
          id: null,
          employee_no: '0',
          login_id: loginId,
          name: '시스템관리자',
          role: 'admin',
          is_system_master: true,
          department: '경영지원팀',
          company: 'SY INC.',
          company_id: null,
          permissions: {
            inventory: true,
            hr: true,
            approval: true,
            admin: true,
            mso: true,
            system_master: true,
            hr_교대근무: true,
          },
        });
      }

      return failureResponse('아이디 또는 비밀번호가 일치하지 않습니다.');
    }

    const storedPassword = pickStoredPassword(userRow);
    const isFirstLogin = !storedPassword;
    let notice: string | undefined;

    if (isFirstLogin) {
      // 보안: 비밀번호 미설정 계정 중 관리자가 명시적으로 초기화한 경우만 first-login 허용.
      // password_reset_required = true(1) 이면 입력값을 새 비밀번호로 설정하고 로그인 성공.
      // 그 외(우연한 미설정 계정)는 제3자 선점 방지를 위해 계속 차단.
      const isResetRequested = Boolean(userRow.password_reset_required);

      if (!isResetRequested) {
        await recordFailedAttempt(loginId, WINDOW_MS);
        return failureResponse(
          '비밀번호가 설정되지 않은 계정입니다. 관리자에게 초기 비밀번호 설정을 요청해 주세요.'
        );
      }

      // 관리자가 초기화한 계정 — 입력 비밀번호를 새 비밀번호로 설정
      const { error: setPasswordError } = await updateStaffPasswordWithFallback(supabase, userRow.id, password);
      if (setPasswordError) {
        const message = setPasswordError instanceof Error
          ? setPasswordError.message
          : String((setPasswordError as { message?: string }).message || '비밀번호 설정 중 오류가 발생했습니다.');
        return failureResponse(message);
      }

      // 플래그 해제 — 컬럼이 없으면 graceful skip
      const flagClearResult = await supabase
        .from('staff_members')
        .update({ password_reset_required: false })
        .eq('id', userRow.id);

      if (flagClearResult.error) {
        if (!isMissingColumnError(flagClearResult.error, 'password_reset_required')) {
          console.error('[master-login] password_reset_required 플래그 해제 실패:', flagClearResult.error);
          // 플래그 해제 실패는 로그인 성공 자체를 막지 않음
        }
      }

      await resetAttempts(loginId);
      return successResponse(userRow, '비밀번호가 설정되었습니다. 다음 로그인부터 이 비밀번호를 사용해 주세요.');
    } else {
      const verified = await verifyStoredPassword(storedPassword, password);
      if (!verified.ok) {
        // 마스터 비밀번호 재시도는 관리자 사번/마스터 ID로 로그인한 경우에만 허용
        // 일반 직원 사번으로 마스터 비밀번호를 입력해도 권한 상승 불가
        const isAdminLoginId = loginId === adminName || loginId === '1' || loginId === masterId;
        if (isAdminLoginId) {
          const privilegedLogin = await verifyPrivilegedLogin(loginId, password);

          if (privilegedLogin.ok && privilegedLogin.kind === 'admin') {
            const adminDisplayName = adminName || 'MSO 관리자';
            const user = {
              ...userRow,
              name: adminName || userRow?.name || adminDisplayName,
              role: 'admin',
              company: userRow?.company || 'SY INC.',
              company_id: userRow?.company_id ?? null,
              department: userRow?.department || '경영지원팀',
              permissions: {
                ...(userRow?.permissions || {}),
                inventory: true,
                hr: true,
                approval: true,
                admin: true,
                mso: true,
                hr_교대근무: true,
              },
            };

            return successResponse(user);
          }

          if (privilegedLogin.ok && privilegedLogin.kind === 'master') {
            return successResponse({
              id: null,
              employee_no: '0',
              login_id: loginId,
              name: '시스템관리자',
              role: 'admin',
              is_system_master: true,
              department: '경영지원팀',
              company: 'SY INC.',
              company_id: null,
              permissions: {
                inventory: true,
                hr: true,
                approval: true,
                admin: true,
                mso: true,
                system_master: true,
                hr_교대근무: true,
              },
            });
          }
        }

        await recordFailedAttempt(loginId, WINDOW_MS);
        return failureResponse('아이디 또는 비밀번호가 일치하지 않습니다.');
      }

      if (verified.needsHashUpgrade) {
        await updateStaffPasswordWithFallback(supabase, userRow.id, password);
      }
    }

    await resetAttempts(loginId); // 로그인 성공 시 실패 카운트 초기화
    return successResponse(userRow, notice);
  } catch (error) {
    console.error('[master-login] 처리 중 예외 발생:', error);
    return failureResponse('시스템 접속 중 오류가 발생했습니다.', 500);
  }
}

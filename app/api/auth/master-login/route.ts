import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminCredentialConfig, getRuntimeEnv, verifyPrivilegedLogin } from '@/lib/admin-credentials';
import { createSupabaseAccessToken } from '@/lib/server-supabase-bridge';
import {
  pickStoredPassword,
  updateStaffPasswordWithFallback,
  verifyStoredPassword,
} from '@/lib/staff-password';
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
  const token = await createSessionToken(safeUser);
  const supabaseAccessToken = await createSupabaseAccessToken(safeUser);
  const response = NextResponse.json({
    success: true,
    user: safeUser,
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

  const { adminName, adminPasswordHash, masterId, masterPasswordHash } = getAdminCredentialConfig();

  try {
    const supabase = getAdminClient();
    let userRow: any = null;

    const { data: byEmployeeNo } = await supabase
      .from('staff_members')
      .select('*')
      .eq('employee_no', loginId)
      .maybeSingle();

    if (byEmployeeNo) {
      userRow = byEmployeeNo;
    } else {
      const { data: byName, error: byNameError } = await supabase
        .from('staff_members')
        .select('*')
        .eq('name', loginId)
        .limit(2);

      if (byNameError) {
        return failureResponse('등록된 사용자 조회 중 오류가 발생했습니다.', 500);
      }

      if (!byName?.length) {
        return failureResponse('등록된 사번 또는 이름이 없습니다.');
      }

      if (byName.length > 1) {
        return failureResponse('동명이인이 있습니다. 로그인 아이디에 사번을 입력해 주세요.');
      }

      userRow = byName[0];
    }

    if (!userRow) {
      const privilegedLogin = await verifyPrivilegedLogin(loginId, password);

      if (privilegedLogin.ok && privilegedLogin.kind === 'admin') {
        const adminDisplayName = adminName || 'MSO 관리자';
        let msoRow: any = null;

        if (adminName) {
          const { data } = await supabase
            .from('staff_members')
            .select('*')
            .eq('name', adminName)
            .maybeSingle();
          msoRow = data ?? null;
        }

        if (!msoRow && /^\d+$/.test(loginId)) {
          const { data } = await supabase
            .from('staff_members')
            .select('*')
            .eq('employee_no', loginId)
            .maybeSingle();
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

      return failureResponse('등록된 사번 또는 이름이 없습니다.');
    }

    const storedPassword = pickStoredPassword(userRow);
    const isFirstLogin = !storedPassword;
    let notice: string | undefined;

    if (isFirstLogin) {
      const { error: updateError } = await updateStaffPasswordWithFallback(supabase, userRow.id, password);

      if (updateError) {
        return failureResponse('비밀번호 설정 중 오류가 발생했습니다.', 500);
      }

      notice = '비밀번호가 설정되었습니다. 다음 로그인부터 이 비밀번호를 사용해 주세요.';
    } else {
      const verified = await verifyStoredPassword(storedPassword, password);
      if (!verified.ok) {
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

        return failureResponse('비밀번호가 일치하지 않습니다.');
      }

      if (verified.needsHashUpgrade) {
        await updateStaffPasswordWithFallback(supabase, userRow.id, password);
      }
    }

    return successResponse(userRow, notice);
  } catch (error) {
    console.error('[auth] login error', error);
    return failureResponse('시스템 접속 중 오류가 발생했습니다.', 500);
  }
}

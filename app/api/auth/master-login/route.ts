import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createSupabaseAccessToken } from '@/lib/server-supabase-bridge';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionCookieOptions,
  normalizeSessionUser,
  SESSION_COOKIE_NAME,
} from '@/lib/server-session';

function readEnvFileValue(key: string) {
  const envFiles = ['.env.local', '.env'];

  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile);
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
      const separatorIndex = normalized.indexOf('=');
      if (separatorIndex === -1) continue;

      const name = normalized.slice(0, separatorIndex).trim();
      if (name !== key) continue;

      const rawValue = normalized.slice(separatorIndex + 1).trim();
      if (!rawValue) return '';

      if (
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ) {
        return rawValue.slice(1, -1);
      }

      return rawValue;
    }
  }

  return '';
}

function getRuntimeEnv(key: string) {
  return process.env[key] || readEnvFileValue(key);
}

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

async function verifyStoredPassword(storedPassword: string, inputPassword: string) {
  if (!storedPassword) {
    return { ok: false, needsHashUpgrade: false };
  }

  if (storedPassword.startsWith('$2')) {
    return {
      ok: await bcrypt.compare(inputPassword, storedPassword),
      needsHashUpgrade: false,
    };
  }

  return {
    ok: storedPassword === inputPassword,
    needsHashUpgrade: storedPassword === inputPassword,
  };
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

  const adminName = getRuntimeEnv('ADMIN_NAME');
  const adminPasswordHash = getRuntimeEnv('ADMIN_PASSWORD_HASH');
  const masterId = getRuntimeEnv('MASTER_ID');
  const masterPasswordHash = getRuntimeEnv('MASTER_PASSWORD_HASH');

  if (!adminName || !adminPasswordHash || !masterId || !masterPasswordHash) {
    return failureResponse('마스터 로그인 환경변수를 읽지 못했습니다. 서버를 재시작한 뒤 다시 시도해주세요.', 500);
  }

  let adminMatch = false;
  try {
    adminMatch = await bcrypt.compare(password, adminPasswordHash);
  } catch {
    adminMatch = false;
  }

  if (loginId === adminName && adminMatch) {
    const supabase = getAdminClient();
    const { data: msoRow } = await supabase
      .from('staff_members')
      .select('*')
      .eq('name', adminName)
      .maybeSingle();

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
          name: adminName,
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

  let masterMatch = false;
  try {
    masterMatch = await bcrypt.compare(password, masterPasswordHash);
  } catch {
    masterMatch = false;
  }

  if (loginId === masterId && masterMatch) {
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
      return failureResponse('등록된 사번 또는 이름이 없습니다.');
    }

    const storedPassword = String(userRow.password ?? userRow.passwd ?? '').trim();
    const isFirstLogin = !storedPassword;
    let notice: string | undefined;

    if (isFirstLogin) {
      const passwordHash = await bcrypt.hash(password, 10);
      const { error: updateError } = await supabase
        .from('staff_members')
        .update({ password: passwordHash })
        .eq('id', userRow.id);

      if (updateError) {
        return failureResponse('비밀번호 설정 중 오류가 발생했습니다.', 500);
      }

      notice = '비밀번호가 설정되었습니다. 다음 로그인부터 이 비밀번호를 사용해 주세요.';
    } else {
      const verified = await verifyStoredPassword(storedPassword, password);
      if (!verified.ok) {
        return failureResponse('비밀번호가 일치하지 않습니다.');
      }

      if (verified.needsHashUpgrade) {
        const passwordHash = await bcrypt.hash(password, 10);
        await supabase
          .from('staff_members')
          .update({ password: passwordHash })
          .eq('id', userRow.id);
      }
    }

    return successResponse(userRow, notice);
  } catch (error) {
    console.error('[auth] login error', error);
    return failureResponse('시스템 접속 중 오류가 발생했습니다.', 500);
  }
}

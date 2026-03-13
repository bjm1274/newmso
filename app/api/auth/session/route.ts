import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createSupabaseAccessToken } from '@/lib/server-supabase-bridge';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionCookieOptions,
  normalizeSessionUser,
  readSessionFromRequest,
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

async function readLatestSessionUser(sessionUser: any) {
  const supabase = getAdminClient();
  const normalizedUser = normalizeSessionUser(sessionUser);
  const sessionUserId = String(normalizedUser?.id ?? '').trim();
  const sessionEmployeeNo = String(normalizedUser?.employee_no ?? '').trim();
  const sessionName = String(normalizedUser?.name ?? '').trim();

  if (sessionUserId) {
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .eq('id', sessionUserId)
      .maybeSingle();

    if (!error && data) {
      return normalizeSessionUser({ ...normalizedUser, ...data });
    }
  }

  if (sessionEmployeeNo) {
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .eq('employee_no', sessionEmployeeNo)
      .maybeSingle();

    if (!error && data) {
      return normalizeSessionUser({ ...normalizedUser, ...data });
    }
  }

  if (sessionName) {
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .eq('name', sessionName)
      .limit(2);

    if (!error && Array.isArray(data) && data.length === 1) {
      return normalizeSessionUser({ ...normalizedUser, ...data[0] });
    }
  }

  return normalizedUser;
}

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session) {
    const response = NextResponse.json(
      { authenticated: false, error: '세션이 없습니다.' },
      { status: 401 }
    );
    return clearSessionCookie(response);
  }

  const currentSessionUser = normalizeSessionUser(session.user);
  let freshSessionUser = currentSessionUser;

  try {
    freshSessionUser = await readLatestSessionUser(currentSessionUser);
  } catch (error) {
    console.error('세션 사용자 동기화 실패:', error);
  }

  const supabaseAccessToken = await createSupabaseAccessToken(freshSessionUser);

  const response = NextResponse.json({
    authenticated: true,
    user: freshSessionUser,
    expiresAt: session.exp,
    supabaseAccessToken,
  });

  if (JSON.stringify(currentSessionUser) !== JSON.stringify(freshSessionUser)) {
    const remainingAgeSeconds = Math.max(1, session.exp - Math.floor(Date.now() / 1000));
    const refreshedToken = await createSessionToken(freshSessionUser, remainingAgeSeconds);
    response.cookies.set(
      SESSION_COOKIE_NAME,
      refreshedToken,
      getSessionCookieOptions(remainingAgeSeconds)
    );
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  return clearSessionCookie(response);
}

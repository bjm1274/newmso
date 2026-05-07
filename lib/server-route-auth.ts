import { NextResponse } from 'next/server';
import {
  isAdminSession,
  readSessionFromRequest,
  type SessionPayload,
} from './server-session';
import { createServiceClient } from './supabase-admin';

export type ServiceRoleClient = ReturnType<typeof createServiceClient>;

type AdminRouteAuthSuccess = {
  ok: true;
  session: SessionPayload;
  supabase: ServiceRoleClient;
};

type AdminRouteAuthFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireAdminServiceClient(
  request: Request,
): Promise<AdminRouteAuthSuccess | AdminRouteAuthFailure> {
  const session = await readSessionFromRequest(request);

  if (!session || !isAdminSession(session.user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    ok: true,
    session,
    supabase: createServiceClient(),
  };
}

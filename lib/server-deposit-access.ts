import { canAccessExtraFeature, canAccessMainMenu } from './access-control';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser,
  type SessionUser,
} from './server-session';

type SessionReadableRequest =
  | Request
  | {
      headers: Headers;
      cookies?: {
        get: (name: string) => { value: string } | undefined;
      };
    };

export async function readAuthorizedDepositUser(request: SessionReadableRequest): Promise<{
  user: SessionUser | null;
  status: 401 | 403 | null;
  error: string | null;
}> {
  const session = await readSessionFromRequest(request);
  if (!session?.user) {
    return {
      user: null,
      status: 401,
      error: 'Unauthorized',
    };
  }

  const sessionUser = normalizeSessionUser(session.user);
  if (!canAccessMainMenu(sessionUser, '추가기능')) {
    return {
      user: null,
      status: 403,
      error: 'Forbidden',
    };
  }

  const latestUser = await resolveLatestSessionUser(sessionUser);
  if (!canAccessExtraFeature(latestUser, '입금실시간조회')) {
    return {
      user: null,
      status: 403,
      error: 'Forbidden',
    };
  }

  return {
    user: latestUser,
    status: null,
    error: null,
  };
}

export function getDepositCompanyScope(user: SessionUser) {
  const companyId = String(user.company_id || '').trim();
  const isSystemMaster = user.is_system_master === true;

  if (!companyId && !isSystemMaster) {
    return null;
  }

  return {
    companyId: companyId || null,
    isSystemMaster,
  };
}

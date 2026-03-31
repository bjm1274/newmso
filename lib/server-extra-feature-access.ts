import { canAccessExtraFeature, canAccessMainMenu } from './access-control';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser,
  type SessionUser,
} from './server-session';

export type SessionReadableRequest =
  | Request
  | {
      headers: Headers;
      cookies?: {
        get: (name: string) => { value: string } | undefined;
      };
    };

export async function readAuthorizedExtraFeatureUser(
  request: SessionReadableRequest,
  featureId: string,
): Promise<{
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
  const latestUser = await resolveLatestSessionUser(sessionUser);

  if (!canAccessMainMenu(latestUser, '추가기능')) {
    return {
      user: null,
      status: 403,
      error: 'Forbidden',
    };
  }

  if (!canAccessExtraFeature(latestUser, featureId)) {
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

import {
  readAuthorizedExtraFeatureUser,
  type SessionReadableRequest,
} from './server-extra-feature-access';
import { type SessionUser } from './server-session';

export async function readAuthorizedDepositUser(request: SessionReadableRequest): Promise<{
  user: SessionUser | null;
  status: 401 | 403 | null;
  error: string | null;
}> {
  return readAuthorizedExtraFeatureUser(request, '입금실시간조회');
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

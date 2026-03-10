const SYSTEM_MASTER_ACCOUNT_ID = 'bjm127';

function normalizeIdentifier(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function hasSystemMasterPermission(user?: Record<string, any> | null) {
  return Boolean(user?.permissions?.system_master === true || user?.is_system_master === true);
}

export function isNamedSystemMasterAccount(
  user?: Record<string, any> | null,
  accountId = SYSTEM_MASTER_ACCOUNT_ID,
) {
  const target = normalizeIdentifier(accountId);
  if (!target || !hasSystemMasterPermission(user)) return false;

  const candidateValues = [
    user?.employee_no,
    user?.employeeNo,
    user?.login_id,
    user?.loginId,
    user?.username,
    user?.user_id,
    user?.userId,
    user?.master_id,
    user?.masterId,
    user?.id,
  ];

  return candidateValues.some((value) => normalizeIdentifier(value) === target);
}

export { SYSTEM_MASTER_ACCOUNT_ID };

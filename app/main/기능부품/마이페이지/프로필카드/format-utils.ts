export function toSafeText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
}

export function formatProfileRequestDateTime(value: unknown) {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getProfileRequestStatusMeta(targetType: unknown) {
  const normalized = String(targetType ?? '').trim();
  if (normalized === 'ESS_PROFILE_UPDATE_APPROVED') {
    return {
      label: '승인',
      className: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    };
  }
  if (normalized === 'ESS_PROFILE_UPDATE_REJECTED') {
    return {
      label: '반려',
      className: 'bg-rose-50 text-rose-600 border border-rose-200',
    };
  }
  return {
    label: '대기',
    className: 'bg-amber-50 text-amber-600 border border-amber-200',
  };
}

export function summarizeProfileRequestFields(details: unknown) {
  const detailObject =
    details && typeof details === 'object' && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : {};
  const requestedChanges =
    detailObject.requested_changes && typeof detailObject.requested_changes === 'object' && !Array.isArray(detailObject.requested_changes)
      ? (detailObject.requested_changes as Record<string, unknown>)
      : {};
  const originalData =
    detailObject.original_data && typeof detailObject.original_data === 'object' && !Array.isArray(detailObject.original_data)
      ? (detailObject.original_data as Record<string, unknown>)
      : {};
  const requestedPermissions =
    requestedChanges.permissions && typeof requestedChanges.permissions === 'object' && !Array.isArray(requestedChanges.permissions)
      ? (requestedChanges.permissions as Record<string, unknown>)
      : {};
  const originalPermissions =
    originalData.permissions && typeof originalData.permissions === 'object' && !Array.isArray(originalData.permissions)
      ? (originalData.permissions as Record<string, unknown>)
      : {};

  const labels = new Map<string, string>([
    ['email', '이메일'],
    ['phone', '연락처'],
    ['address', '거주지'],
    ['bank_account', '계좌번호'],
    ['bank_name', '은행명'],
    ['extension', '내선번호'],
  ]);

  const changed = new Set<string>();
  for (const [key, label] of labels.entries()) {
    const beforeValue =
      key === 'extension'
        ? toSafeText(originalData.extension) || toSafeText(originalPermissions.extension) || null
        : key === 'bank_name'
          ? toSafeText(originalData.bank_name) || toSafeText(originalPermissions.bank_name) || null
          : originalData[key] ?? null;
    const afterValue =
      key === 'extension'
        ? toSafeText(requestedChanges.extension) || toSafeText(requestedPermissions.extension) || null
        : key === 'bank_name'
          ? toSafeText(requestedChanges.bank_name) || toSafeText(requestedPermissions.bank_name) || null
          : requestedChanges[key] ?? null;
    if (String(beforeValue ?? '') !== String(afterValue ?? '')) {
      changed.add(label);
    }
  }

  return Array.from(changed);
}

export function sanitizeCommuteSummaryItems(items: Array<{ date?: string | null; status?: string | null }>) {
  return items.flatMap((item) => {
    if (!item.date || !item.status) return [];
    return [{ date: item.date, status: item.status }];
  });
}

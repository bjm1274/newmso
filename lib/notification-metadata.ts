type NotificationMetadata = Record<string, unknown> | null | undefined;

function cleanNotificationValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

export function toNotificationMetadataRecord(metadata: unknown) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {} as Record<string, unknown>;
}

export function resolveApprovalNotificationId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    cleanNotificationValue(record.approval_id) ||
    cleanNotificationValue(record.inventory_approval) ||
    cleanNotificationValue(record.id)
  );
}

export function resolveInventoryNotificationApprovalId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    cleanNotificationValue(record.inventory_approval) ||
    cleanNotificationValue(record.approval_id)
  );
}

export function notificationMatchesApprovalId(
  metadata: NotificationMetadata,
  approvalId: string | null | undefined
) {
  const normalizedApprovalId = cleanNotificationValue(approvalId);
  if (!normalizedApprovalId) return false;
  const record = toNotificationMetadataRecord(metadata);
  const linkedApprovalIds = [
    cleanNotificationValue(record.approval_id),
    cleanNotificationValue(record.inventory_approval),
  ].filter(Boolean);

  if (linkedApprovalIds.includes(normalizedApprovalId)) {
    return true;
  }

  const metadataType = cleanNotificationValue(record.type);
  const legacyApprovalId = cleanNotificationValue(record.id);
  if (!legacyApprovalId) {
    return false;
  }

  return metadataType === 'approval' && legacyApprovalId === normalizedApprovalId;
}

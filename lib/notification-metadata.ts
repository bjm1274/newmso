export type NotificationMetadata = Record<string, unknown> | null | undefined;

export const NOTIFICATION_MENU_LABELS = {
  chat: '\uCC44\uD305',
  approval: '\uC804\uC790\uACB0\uC7AC',
  board: '\uAC8C\uC2DC\uD310',
  inventory: '\uC7AC\uACE0\uAD00\uB9AC',
  myPage: '\uB0B4\uC815\uBCF4',
  notifications: '\uC54C\uB9BC',
  admin: '\uAD00\uB9AC\uC790' } as const;

export const DEFAULT_APPROVAL_VIEW = '\uACB0\uC7AC\uD568';
export const DEFAULT_BOARD_TYPE = '\uACF5\uC9C0\uC0AC\uD56D';
export const DEFAULT_INVENTORY_VIEW = '\uD604\uD669';
export const DEFAULT_ADMIN_SUBVIEW = '\uAC10\uC0AC\uC13C\uD130';

export type NotificationTarget =
  | {
      kind: 'chat';
      href: string;
      roomId: string;
      messageId: string | null;
    }
  | {
      kind: 'approval';
      href: string;
      approvalId: string | null;
      approvalView: string | null;
    }
  | {
      kind: 'inventory';
      href: string;
      approvalId: string | null;
      inventoryView: string | null;
    }
  | {
      kind: 'board';
      href: string;
      boardType: string | null;
      postId: string | null;
    }
  | {
      kind: 'menu';
      href: string;
      menu: string;
      subView: string | null;
    }
  | {
      kind: 'notifications';
      href: string;
    }
  | {
      kind: 'my_page';
      href: string;
    };

function cleanNotificationValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function createMainHref(entries?: Array<[string, string | null | undefined]>) {
  const params = new URLSearchParams();

  (entries || []).forEach(([key, value]) => {
    const normalized = cleanNotificationValue(value);
    if (!normalized) return;
    params.set(key, normalized);
  });

  const query = params.toString();
  return query ? `/main?${query}` : '/main';
}

export function toNotificationMetadataRecord(metadata: unknown) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {} as Record<string, unknown>;
}

export function resolveApprovalNotificationId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  const metadataType = cleanNotificationValue(record.type);
  return (
    cleanNotificationValue(record.approval_id) ||
    cleanNotificationValue(record.open_approval_id) ||
    ((metadataType === 'approval' || metadataType === 'electronic_approval')
      ? cleanNotificationValue(record.id)
      : '')
  );
}

export function resolveApprovalNotificationView(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  const explicitView = cleanNotificationValue(record.approval_view);
  if (explicitView) return explicitView;
  const openSubView = cleanNotificationValue(record.open_subview);
  const openMenu = cleanNotificationValue(record.open_menu);
  if (openMenu === NOTIFICATION_MENU_LABELS.approval && openSubView) {
    return openSubView;
  }
  return '';
}

function resolveExplicitInventoryApprovalId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    cleanNotificationValue(record.inventory_approval) ||
    cleanNotificationValue(record.open_inventory_approval)
  );
}

export function resolveInventoryNotificationApprovalId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    resolveExplicitInventoryApprovalId(record) ||
    cleanNotificationValue(record.approval_id)
  );
}

export function resolveInventoryNotificationView(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    cleanNotificationValue(record.inventory_view) ||
    cleanNotificationValue(record.open_inventory_view)
  );
}

export function resolveChatNotificationRoomId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    cleanNotificationValue(record.room_id) ||
    cleanNotificationValue(record.open_chat_room)
  );
}

export function resolveChatNotificationMessageId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  const metadataType = cleanNotificationValue(record.type);

  return (
    cleanNotificationValue(record.message_id) ||
    cleanNotificationValue(record.open_msg) ||
    ((metadataType === 'message' || metadataType === 'mention' || resolveChatNotificationRoomId(record))
      ? cleanNotificationValue(record.id)
      : '')
  );
}

export function resolveBoardNotificationType(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    cleanNotificationValue(record.board_type) ||
    cleanNotificationValue(record.open_board)
  );
}

export function resolveBoardNotificationPostId(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return (
    cleanNotificationValue(record.post_id) ||
    cleanNotificationValue(record.open_post)
  );
}

export function resolveNotificationOpenMenu(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return cleanNotificationValue(record.open_menu);
}

export function resolveNotificationOpenSubView(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  return cleanNotificationValue(record.open_subview);
}

export function buildChatNotificationMetadata(params: {
  roomId: string;
  messageId?: string | null;
  notificationType?: string | null;
  dedupeKey?: string | null;
  extra?: Record<string, unknown> | null;
}) {
  const metadata: Record<string, unknown> = {
    ...(params.extra || {}),
    room_id: params.roomId,
    type: cleanNotificationValue(params.notificationType) || 'message' };
  const messageId = cleanNotificationValue(params.messageId);
  if (messageId) {
    metadata.id = messageId;
    metadata.message_id = messageId;
  }
  const dedupeKey = cleanNotificationValue(params.dedupeKey);
  if (dedupeKey) {
    metadata.dedupe_key = dedupeKey;
  }
  return metadata;
}

export function buildApprovalNotificationMetadata(params: {
  approvalId?: string | null;
  approvalView?: string | null;
  dedupeKey?: string | null;
  extra?: Record<string, unknown> | null;
}) {
  const metadata: Record<string, unknown> = {
    ...(params.extra || {}),
    type: 'approval' };
  const approvalId = cleanNotificationValue(params.approvalId);
  const approvalView = cleanNotificationValue(params.approvalView);
  const dedupeKey = cleanNotificationValue(params.dedupeKey);

  if (approvalId) {
    metadata.id = approvalId;
    metadata.approval_id = approvalId;
  }
  if (approvalView) {
    metadata.approval_view = approvalView;
  }
  if (dedupeKey) {
    metadata.dedupe_key = dedupeKey;
  }
  return metadata;
}

export function buildInventoryNotificationMetadata(params: {
  approvalId?: string | null;
  inventoryView?: string | null;
  dedupeKey?: string | null;
  extra?: Record<string, unknown> | null;
}) {
  const metadata: Record<string, unknown> = {
    ...(params.extra || {}),
    type: 'inventory' };
  const approvalId = cleanNotificationValue(params.approvalId);
  const inventoryView = cleanNotificationValue(params.inventoryView);
  const dedupeKey = cleanNotificationValue(params.dedupeKey);

  if (approvalId) {
    metadata.inventory_approval = approvalId;
  }
  if (inventoryView) {
    metadata.inventory_view = inventoryView;
  }
  if (dedupeKey) {
    metadata.dedupe_key = dedupeKey;
  }
  return metadata;
}

export function buildBoardNotificationMetadata(params: {
  boardType?: string | null;
  postId?: string | null;
  dedupeKey?: string | null;
  extra?: Record<string, unknown> | null;
}) {
  const metadata: Record<string, unknown> = {
    ...(params.extra || {}),
    type: 'board' };
  const boardType = cleanNotificationValue(params.boardType);
  const postId = cleanNotificationValue(params.postId);
  const dedupeKey = cleanNotificationValue(params.dedupeKey);

  if (boardType) {
    metadata.board_type = boardType;
  }
  if (postId) {
    metadata.post_id = postId;
  }
  if (dedupeKey) {
    metadata.dedupe_key = dedupeKey;
  }
  return metadata;
}

export function buildMenuNotificationMetadata(params: {
  menu: string;
  subView?: string | null;
  dedupeKey?: string | null;
  extra?: Record<string, unknown> | null;
}) {
  const metadata: Record<string, unknown> = {
    ...(params.extra || {}),
    open_menu: params.menu };
  const subView = cleanNotificationValue(params.subView);
  const dedupeKey = cleanNotificationValue(params.dedupeKey);

  if (subView) {
    metadata.open_subview = subView;
  }
  if (dedupeKey) {
    metadata.dedupe_key = dedupeKey;
  }
  return metadata;
}

export function buildChatNotificationHref(metadata: NotificationMetadata) {
  const roomId = resolveChatNotificationRoomId(metadata);
  if (!roomId) {
    return createMainHref([
      ['open_menu', NOTIFICATION_MENU_LABELS.chat],
    ]);
  }

  return createMainHref([
    ['open_menu', NOTIFICATION_MENU_LABELS.chat],
    ['open_chat_room', roomId],
    ['open_msg', resolveChatNotificationMessageId(metadata)],
  ]);
}

export function buildApprovalNotificationHref(metadata: NotificationMetadata) {
  return createMainHref([
    ['open_menu', NOTIFICATION_MENU_LABELS.approval],
    ['open_subview', resolveApprovalNotificationView(metadata) || DEFAULT_APPROVAL_VIEW],
    ['open_approval_id', resolveApprovalNotificationId(metadata)],
  ]);
}

export function buildBoardNotificationHref(metadata: NotificationMetadata) {
  return createMainHref([
    ['open_menu', NOTIFICATION_MENU_LABELS.board],
    ['open_board', resolveBoardNotificationType(metadata) || DEFAULT_BOARD_TYPE],
    ['open_post', resolveBoardNotificationPostId(metadata)],
  ]);
}

export function buildInventoryNotificationHref(metadata: NotificationMetadata) {
  const record = toNotificationMetadataRecord(metadata);
  const approvalId = resolveInventoryNotificationApprovalId(metadata);
  const metadataType = cleanNotificationValue(record.type);
  const inventoryView =
    resolveInventoryNotificationView(record) ||
    (metadataType === 'inventory' || approvalId ? DEFAULT_INVENTORY_VIEW : '');

  return createMainHref([
    ['open_menu', NOTIFICATION_MENU_LABELS.inventory],
    ['open_inventory_view', inventoryView],
    ['open_inventory_approval', approvalId],
  ]);
}

export function buildMenuNotificationHref(
  metadata: NotificationMetadata,
  fallbackMenu: string,
) {
  return createMainHref([
    ['open_menu', resolveNotificationOpenMenu(metadata) || fallbackMenu],
    ['open_subview', resolveNotificationOpenSubView(metadata)],
  ]);
}

export function resolveNotificationTarget(
  notificationType: unknown,
  metadata: NotificationMetadata,
): NotificationTarget {
  const normalizedType = cleanNotificationValue(notificationType);
  const record = toNotificationMetadataRecord(metadata);
  
  let resolvedRecord = record;
  const linkValue = cleanNotificationValue(record.link);
  if (linkValue) {
    try {
      const queryString = linkValue.includes('?') ? linkValue.split('?')[1] : linkValue;
      const searchParams = new URLSearchParams(queryString);
      const linkRecord: Record<string, unknown> = { ...record };
      for (const [key, value] of searchParams.entries()) {
        linkRecord[key] = value;
      }
      resolvedRecord = linkRecord;
    } catch (e) {
      console.error('Failed to parse record.link:', e);
    }
  }

  const roomId = resolveChatNotificationRoomId(resolvedRecord);
  if (roomId) {
    return {
      kind: 'chat',
      href: buildChatNotificationHref(resolvedRecord),
      roomId,
      messageId: resolveChatNotificationMessageId(resolvedRecord) || null };
  }

  const explicitInventoryApprovalId = resolveExplicitInventoryApprovalId(resolvedRecord);
  const inventoryApprovalId =
    explicitInventoryApprovalId ||
    (normalizedType === 'inventory' ? resolveInventoryNotificationApprovalId(resolvedRecord) : '');
  const inventoryView = resolveInventoryNotificationView(resolvedRecord);
  if (normalizedType === 'inventory' || explicitInventoryApprovalId || inventoryView) {
    return {
      kind: 'inventory',
      href: buildInventoryNotificationHref(resolvedRecord),
      approvalId: inventoryApprovalId || null,
      inventoryView:
        inventoryView ||
        (normalizedType === 'inventory' || inventoryApprovalId ? DEFAULT_INVENTORY_VIEW : null) };
  }

  const approvalId = resolveApprovalNotificationId(resolvedRecord);
  const approvalView = resolveApprovalNotificationView(resolvedRecord);
  if (normalizedType === 'approval' || approvalId || approvalView) {
    return {
      kind: 'approval',
      href: buildApprovalNotificationHref(resolvedRecord),
      approvalId: approvalId || null,
      approvalView: approvalView || DEFAULT_APPROVAL_VIEW };
  }

  const postId = resolveBoardNotificationPostId(resolvedRecord);
  const boardType = resolveBoardNotificationType(resolvedRecord);
  if (
    normalizedType === 'board' ||
    normalizedType === 'notice' ||
    postId ||
    boardType
  ) {
    return {
      kind: 'board',
      href: buildBoardNotificationHref(resolvedRecord),
      boardType: boardType || DEFAULT_BOARD_TYPE,
      postId: postId || null };
  }

  const openMenu = resolveNotificationOpenMenu(resolvedRecord);
  if (openMenu) {
    return {
      kind: 'menu',
      href: buildMenuNotificationHref(resolvedRecord, openMenu),
      menu: openMenu,
      subView: resolveNotificationOpenSubView(resolvedRecord) || null };
  }

  if (
    normalizedType === 'payroll' ||
    normalizedType === 'education' ||
    normalizedType === 'attendance' ||
    normalizedType === 'hr' ||
    normalizedType === '\uC778\uC0AC'
  ) {
    return {
      kind: 'my_page',
      href: createMainHref([
        ['open_menu', NOTIFICATION_MENU_LABELS.myPage],
      ]) };
  }

  return {
    kind: 'notifications',
    href: createMainHref([
      ['open_menu', NOTIFICATION_MENU_LABELS.notifications],
    ]) };
}

export function buildNotificationHref(
  notificationType: unknown,
  metadata: NotificationMetadata,
) {
  return resolveNotificationTarget(notificationType, metadata).href;
}

export function notificationMatchesApprovalId(
  metadata: NotificationMetadata,
  approvalId: string | null | undefined,
) {
  const normalizedApprovalId = cleanNotificationValue(approvalId);
  if (!normalizedApprovalId) return false;

  const record = toNotificationMetadataRecord(metadata);
  const linkedApprovalIds = [
    resolveApprovalNotificationId(record),
    resolveInventoryNotificationApprovalId(record),
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

const ERP_PUSH_BADGE_URL = '/badge-72x72.png';

const ERP_PUSH_RETRY_DB_NAME = 'erp-push-retry-v1';
const ERP_PUSH_RETRY_STORE = 'requests';
const erpRecentlyShownNotifications = new Map();
let erpRetryFallbackQueue = [];
let erpRetryDbPromise = null;

async function erpGetWindowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

function erpNormalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function erpSetQueryParam(params, key, value) {
  const normalized = erpNormalizeString(value);
  if (!normalized) return;
  params.set(key, normalized);
}

const ERP_MENU_CHAT = '\uCC44\uD305';
const ERP_MENU_APPROVAL = '\uC804\uC790\uACB0\uC7AC';
const ERP_MENU_BOARD = '\uAC8C\uC2DC\uD310';
const ERP_MENU_INVENTORY = '\uC7AC\uACE0\uAD00\uB9AC';
const ERP_MENU_MY_PAGE = '\uB0B4\uC815\uBCF4';
const ERP_MENU_NOTIFICATIONS = '\uC54C\uB9BC';
const ERP_DEFAULT_APPROVAL_VIEW = '\uACB0\uC7AC\uD568';
const ERP_DEFAULT_BOARD_TYPE = '\uACF5\uC9C0\uC0AC\uD56D';
const ERP_DEFAULT_INVENTORY_VIEW = '\uD604\uD669';

function erpToMetadataRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function erpResolveChatRoomId(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(record.room_id || record.open_chat_room);
}

function erpResolveChatMessageId(metadata) {
  const record = erpToMetadataRecord(metadata);
  const metadataType = erpNormalizeString(record.type);
  return (
    erpNormalizeString(record.message_id || record.open_msg) ||
    ((metadataType === 'message' || metadataType === 'mention' || erpResolveChatRoomId(record))
      ? erpNormalizeString(record.id)
      : '')
  );
}

function erpResolveApprovalId(metadata) {
  const record = erpToMetadataRecord(metadata);
  const metadataType = erpNormalizeString(record.type);
  return (
    erpNormalizeString(record.approval_id || record.open_approval_id) ||
    ((metadataType === 'approval' || metadataType === 'electronic_approval')
      ? erpNormalizeString(record.id)
      : '')
  );
}

function erpResolveApprovalView(metadata) {
  const record = erpToMetadataRecord(metadata);
  const approvalView = erpNormalizeString(record.approval_view);
  if (approvalView) return approvalView;
  const openMenu = erpNormalizeString(record.open_menu);
  const openSubView = erpNormalizeString(record.open_subview);
  if (openMenu === ERP_MENU_APPROVAL && openSubView) {
    return openSubView;
  }
  return '';
}

function erpResolveInventoryApprovalId(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(
    record.inventory_approval || record.open_inventory_approval || record.approval_id
  );
}

function erpResolveExplicitInventoryApprovalId(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(record.inventory_approval || record.open_inventory_approval);
}

function erpResolveInventoryView(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(record.inventory_view || record.open_inventory_view);
}

function erpResolveBoardType(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(record.board_type || record.open_board);
}

function erpResolveBoardPostId(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(record.post_id || record.open_post);
}

function erpResolveOpenMenu(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(record.open_menu);
}

function erpResolveOpenSubView(metadata) {
  const record = erpToMetadataRecord(metadata);
  return erpNormalizeString(record.open_subview);
}

function erpBuildMainUrl(baseUrl, entries) {
  const params = new URLSearchParams();
  (entries || []).forEach(([key, value]) => {
    erpSetQueryParam(params, key, value);
  });
  const query = params.toString();
  return query ? `${baseUrl}/main?${query}` : `${baseUrl}/main`;
}

async function erpBroadcastMessage(type, payload) {
  const clientList = await erpGetWindowClients();
  clientList.forEach((client) => {
    try {
      client.postMessage({ type, payload });
    } catch {
      // ignore postMessage failures
    }
  });
}

async function erpBroadcastDebug(stage, message, detail) {
  await erpBroadcastMessage('erp-push-debug', {
    stage,
    message,
    ...(detail && typeof detail === 'object' ? detail : {}),
  });
}

async function erpOpenRetryDb() {
  if (typeof indexedDB === 'undefined') return null;
  if (erpRetryDbPromise) return erpRetryDbPromise;

  erpRetryDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ERP_PUSH_RETRY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ERP_PUSH_RETRY_STORE)) {
        database.createObjectStore(ERP_PUSH_RETRY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('retry-db-open-failed'));
  }).catch(() => null);

  return erpRetryDbPromise;
}

function erpBuildRetryEntry(type, payload) {
  const normalizedPayload = payload && typeof payload === 'object' ? { ...payload } : {};
  let id = '';

  if (type === 'mark-read') {
    const notificationId = erpNormalizeString(normalizedPayload.notification_id);
    if (!notificationId) return null;
    id = `mark-read:${notificationId}`;
  } else if (type === 'push-subscription-post') {
    const endpoint = erpNormalizeString(normalizedPayload.endpoint);
    if (!endpoint) return null;
    id = `push-subscription-post:${endpoint}`;
  } else if (type === 'push-subscription-delete') {
    const endpoint = erpNormalizeString(normalizedPayload.endpoint);
    if (!endpoint) return null;
    id = `push-subscription-delete:${endpoint}`;
  } else {
    return null;
  }

  return {
    id,
    type,
    payload: normalizedPayload,
    createdAt: new Date().toISOString(),
  };
}

async function erpPutRetryEntry(entry) {
  const database = await erpOpenRetryDb();
  if (!database) {
    erpRetryFallbackQueue = [
      ...erpRetryFallbackQueue.filter((item) => item.id !== entry.id),
      entry,
    ];
    return;
  }

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(ERP_PUSH_RETRY_STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('retry-db-write-failed'));
    transaction.objectStore(ERP_PUSH_RETRY_STORE).put(entry);
  }).catch(() => {
    erpRetryFallbackQueue = [
      ...erpRetryFallbackQueue.filter((item) => item.id !== entry.id),
      entry,
    ];
  });
}

async function erpReadRetryEntries() {
  const database = await erpOpenRetryDb();
  if (!database) {
    return [...erpRetryFallbackQueue].sort((left, right) =>
      String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
    );
  }

  const entries = await new Promise((resolve, reject) => {
    const transaction = database.transaction(ERP_PUSH_RETRY_STORE, 'readonly');
    const request = transaction.objectStore(ERP_PUSH_RETRY_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('retry-db-read-failed'));
  }).catch(() => [...erpRetryFallbackQueue]);

  return [...entries].sort((left, right) =>
    String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
  );
}

async function erpDeleteRetryEntries(entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length === 0) return;
  erpRetryFallbackQueue = erpRetryFallbackQueue.filter((item) => !entryIds.includes(item.id));

  const database = await erpOpenRetryDb();
  if (!database) return;

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(ERP_PUSH_RETRY_STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('retry-db-delete-failed'));
    const store = transaction.objectStore(ERP_PUSH_RETRY_STORE);
    entryIds.forEach((entryId) => {
      store.delete(entryId);
    });
  }).catch(() => {});
}

async function erpQueueRetryEntry(type, payload) {
  const entry = erpBuildRetryEntry(type, payload);
  if (!entry) return;
  await erpPutRetryEntry(entry);
  await erpBroadcastMessage('erp-push-retry-queue-state', {
    pending: true,
  });
}

async function erpSendRetryEntry(entry) {
  const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : {};

  // SSOT: 알림 읽음 = POST /api/notifications/mark-read
  // (인앱 notification-api.ts 와 동일 엔드포인트/계약)
  if (entry.type === 'mark-read') {
    const response = await fetch('/api/notifications/mark-read', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notification_id: erpNormalizeString(payload.notification_id),
      }),
    });
    if (!response.ok) {
      throw new Error(`mark-read failed (${response.status})`);
    }
    await erpBroadcastMessage('erp-notification-read-sync', {
      notificationId: erpNormalizeString(payload.notification_id),
    });
    return;
  }

  if (entry.type === 'push-subscription-post') {
    const response = await fetch('/api/notifications/push-subscription', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`push-subscription-post failed (${response.status})`);
    }
    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: true,
    });
    return;
  }

  if (entry.type === 'push-subscription-delete') {
    const response = await fetch('/api/notifications/push-subscription', {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: erpNormalizeString(payload.endpoint),
      }),
    });
    if (!response.ok) {
      throw new Error(`push-subscription-delete failed (${response.status})`);
    }
  }
}

async function erpFlushRetryQueue() {
  const entries = await erpReadRetryEntries();
  if (!entries.length) {
    await erpBroadcastMessage('erp-push-retry-queue-state', {
      pending: false,
    });
    return {
      flushed: 0,
      pending: 0,
    };
  }

  const flushedIds = [];
  for (const entry of entries) {
    try {
      await erpSendRetryEntry(entry);
      flushedIds.push(entry.id);
    } catch {
      // keep the entry in queue for the next online retry
    }
  }

  if (flushedIds.length > 0) {
    await erpDeleteRetryEntries(flushedIds);
  }

  await erpBroadcastMessage('erp-push-retry-queue-state', {
    pending: entries.length - flushedIds.length > 0,
  });

  return {
    flushed: flushedIds.length,
    pending: Math.max(0, entries.length - flushedIds.length),
  };
}

function erpIsVisibleClient(client) {
  // visibilityState만으로는 부족: 데스크톱 창이 최소화돼도 일부 브라우저에서
  // visibilityState가 'visible'로 유지된다. focused를 AND 조건으로 함께 확인해
  // 실제로 사용자가 앱을 보고 있는 경우(포커스 있음)에만 visible로 판정.
  // 최소화·다른 앱 포커스 시에는 false를 반환 → 시스템 알림 표시로 이어짐.
  return client?.visibilityState === 'visible' && client?.focused === true;
}

function erpIsMobileDevice() {
  const userAgent = erpNormalizeString(self?.navigator?.userAgent);
  return /android|iphone|ipad|ipod/i.test(userAgent);
}

// 수정 J: PC/모바일 모두 foreground에서 시스템 팝업 표시 (2026-07-24 버그 수정).
// 데스크톱도 OS 알림 팝업이 표시되어야 사용자가 알림을 인지할 수 있습니다.
function erpShouldShowForegroundPopup(payload) {
  void payload;
  return true;
}

async function erpBroadcastPreviewToVisibleClients(payload) {
  const clientList = await erpGetWindowClients();
  const visibleClients = clientList.filter(erpIsVisibleClient);

  visibleClients.forEach((client) => {
    try {
      client.postMessage({
        type: 'erp-push-preview',
        payload,
      });
    } catch {
      // ignore postMessage failures
    }
  });

  return visibleClients.length > 0;
}

function erpShouldShowNotification(key) {
  const now = Date.now();
  for (const [entryKey, timestamp] of erpRecentlyShownNotifications.entries()) {
    if (now - timestamp > 2 * 60 * 1000) {
      erpRecentlyShownNotifications.delete(entryKey);
    }
  }

  if (!key) return true;
  if (erpRecentlyShownNotifications.has(key)) return false;
  erpRecentlyShownNotifications.set(key, now);
  return true;
}

function erpNormalizeNotificationPayload(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const notification = payload.notification && typeof payload.notification === 'object'
    ? payload.notification
    : {};
  const nestedData = payload.data && typeof payload.data === 'object'
    ? payload.data
    : {};

  const title =
    payload.title ||
    notification.title ||
    nestedData.title ||
    '알림';
  const body =
    payload.body ||
    notification.body ||
    nestedData.body ||
    '새 알림이 있습니다.';

  const image =
    payload.image ||
    notification.image ||
    nestedData.image ||
    '';

  const messageId = nestedData.message_id || nestedData.id || payload.message_id || payload.id || '';
  const type = nestedData.type || payload.type || 'notification';
  const tag =
    payload.tag ||
    notification.tag ||
    nestedData.tag ||
    (messageId ? `chat-msg-${messageId}` : `${type}-${Date.now()}`);

  return {
    title,
    body,
    tag,
    image,
    data: nestedData,
  };
}

function erpBuildNotificationOptions(payload) {
  const isChatNotification = Boolean(
    payload.data && (payload.data.room_id || payload.data.type === 'message' || payload.data.type === 'mention')
  );
  
  const isMobile = erpIsMobileDevice();

  // 채팅 알림은 답장 버튼 포함 (Web Notification Actions API)
  // PC 환경(데스크톱)에서는 텍스트 입력창(type: 'text')이 있으면 알림창 크기가 너무 커지므로 일반 버튼만 제공하여 크기를 축소합니다.
  const actions = isChatNotification
    ? (isMobile
        ? [
            { action: 'reply', title: '답장', type: 'text', placeholder: '메시지 입력...' },
            { action: 'open', title: '열기' },
          ]
        : [
            { action: 'open', title: '열기' },
          ])
    : [
        { action: 'open', title: '확인하기' },
        { action: 'close', title: '닫기' },
      ];

  return {
    body: payload.body,
    badge: ERP_PUSH_BADGE_URL,
    tag: payload.tag,
    requireInteraction: true,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    data: payload.data,
    actions,
    ...(payload.image ? { image: payload.image } : {}),
  };
}

async function erpDisplayIncomingNotification(rawPayload) {
  // 중복 체크를 await 이전에 동기적으로 실행 — 레이스 컨디션 방지
  // (FCM onBackgroundMessage + raw push event가 동시에 발화하면 두 번째는 즉시 차단)
  const payload = erpNormalizeNotificationPayload(rawPayload);
  if (!erpShouldShowNotification(payload.tag)) return;

  await erpFlushRetryQueue();
  await erpBroadcastDebug('incoming', '서비스워커가 푸시를 수신했습니다.', {
    tag: payload.tag,
    title: payload.title,
  });

  try {
    if (self.navigator && 'setAppBadge' in self.navigator) {
      self.navigator.setAppBadge().catch(() => {});
    }
  } catch {
    // ignore badge failures
  }

  // 앱이 포그라운드(화면 표시 중)여도 항상 시스템 알림 표시 (카카오톡 방식)
  // 동시에 앱 내부에 preview broadcast해서 인앱 토스트도 표시
  const keepForegroundPopup = erpShouldShowForegroundPopup(payload);
  const previewPayload = keepForegroundPopup
    ? {
        ...payload,
        data: {
          ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
          _foreground_popup_shown: true,
        },
      }
    : payload;
  const previewShown = await erpBroadcastPreviewToVisibleClients(previewPayload);
  await erpBroadcastDebug('preview-sync', '앱 화면에 알림 미리보기를 전송했습니다.', {
    tag: payload.tag,
  });

  if (previewShown && !keepForegroundPopup) {
    return;
  }

  try {
    await self.registration.showNotification(
      previewPayload.title,
      erpBuildNotificationOptions(previewPayload),
    );
    await erpBroadcastDebug('show-success', '서비스워커에서 시스템 팝업 표시를 요청했습니다.', {
      tag: payload.tag,
      title: previewPayload.title,
    });
  } catch (error) {
    await erpBroadcastDebug('show-error', '서비스워커에서 시스템 팝업 표시 요청이 실패했습니다.', {
      tag: payload.tag,
      title: previewPayload.title,
      error: String(error && error.message ? error.message : error || ''),
    });
    throw error;
  }
}

async function erpShowIncomingNotification(rawPayload) {
  await erpDisplayIncomingNotification(rawPayload);
}

async function erpShowIncomingNotificationManaged(rawPayload) {
  await erpDisplayIncomingNotification(rawPayload);
}

async function erpHandleFcmBackgroundMessage(rawPayload) {
  await erpDisplayIncomingNotification(rawPayload);
}

function erpBuildTargetUrl(data) {
  const baseUrl = self.registration.scope.replace(/\/$/, '');
  const metadata = erpToMetadataRecord(data);
  const notificationType = erpNormalizeString(metadata.type);
  const roomId = erpResolveChatRoomId(metadata);
  if (roomId) {
    return erpBuildMainUrl(baseUrl, [
      ['open_menu', ERP_MENU_CHAT],
      ['open_chat_room', roomId],
      ['open_msg', erpResolveChatMessageId(metadata)],
    ]);
  }

  const explicitInventoryApprovalId = erpResolveExplicitInventoryApprovalId(metadata);
  const inventoryApprovalId =
    explicitInventoryApprovalId ||
    (notificationType === 'inventory' ? erpResolveInventoryApprovalId(metadata) : '');
  const inventoryView = erpResolveInventoryView(metadata);
  if (notificationType === 'inventory' || explicitInventoryApprovalId || inventoryView) {
    return erpBuildMainUrl(baseUrl, [
      ['open_menu', ERP_MENU_INVENTORY],
      ['open_inventory_view', inventoryView || ((notificationType === 'inventory' || inventoryApprovalId) ? ERP_DEFAULT_INVENTORY_VIEW : '')],
      ['open_inventory_approval', inventoryApprovalId],
    ]);
  }

  const approvalId = erpResolveApprovalId(metadata);
  const approvalView = erpResolveApprovalView(metadata);
  if (notificationType === 'approval' || approvalId || approvalView) {
    return erpBuildMainUrl(baseUrl, [
      ['open_menu', ERP_MENU_APPROVAL],
      ['open_subview', approvalView || ERP_DEFAULT_APPROVAL_VIEW],
      ['open_approval_id', approvalId],
    ]);
  }

  const postId = erpResolveBoardPostId(metadata);
  const boardType = erpResolveBoardType(metadata);
  if (notificationType === 'board' || notificationType === 'notice' || postId || boardType) {
    return erpBuildMainUrl(baseUrl, [
      ['open_menu', ERP_MENU_BOARD],
      ['open_board', boardType || ERP_DEFAULT_BOARD_TYPE],
      ['open_post', postId],
    ]);
  }

  const openMenu = erpResolveOpenMenu(metadata);
  if (openMenu) {
    return erpBuildMainUrl(baseUrl, [
      ['open_menu', openMenu],
      ['open_subview', erpResolveOpenSubView(metadata)],
    ]);
  }

  if (
    notificationType === 'payroll' ||
    notificationType === 'education' ||
    notificationType === 'attendance' ||
    notificationType === 'hr' ||
    notificationType === '\uC778\uC0AC'
  ) {
    return erpBuildMainUrl(baseUrl, [['open_menu', ERP_MENU_MY_PAGE]]);
  }

  if (notificationType === 'notification') {
    return erpBuildMainUrl(baseUrl, [['open_menu', ERP_MENU_NOTIFICATIONS]]);
  }

  return erpBuildMainUrl(baseUrl);
}

async function erpMarkNotificationAsRead(data) {
  const notificationId = erpNormalizeString(data?.notification_id);
  if (!notificationId) return;

  try {
    await erpSendRetryEntry({
      type: 'mark-read',
      payload: {
        notification_id: notificationId,
      },
    });
  } catch {
    await erpQueueRetryEntry('mark-read', {
      notification_id: notificationId,
    });
  }
}

function erpUrlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    out[index] = raw.charCodeAt(index);
  }
  return out;
}

async function erpHandlePushSubscriptionChange(event) {
  const oldEndpoint = erpNormalizeString(event?.oldSubscription?.endpoint);
  let pendingSubscriptionPayload = null;
  await erpFlushRetryQueue();

  try {
    let nextSubscription = event?.newSubscription || null;

    if (!nextSubscription) {
      const configResponse = await fetch('/api/notifications/push-config', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!configResponse.ok) {
        throw new Error(`push config fetch failed (${configResponse.status})`);
      }

      const config = await configResponse.json().catch(() => ({}));
      const vapidPublicKey = erpNormalizeString(config?.vapidPublicKey);
      if (!vapidPublicKey) {
        throw new Error('missing vapid public key');
      }

      nextSubscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: erpUrlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const payload = nextSubscription?.toJSON ? nextSubscription.toJSON() : null;
    if (!payload?.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
      throw new Error('invalid subscription payload');
    }
    pendingSubscriptionPayload = {
      endpoint: payload.endpoint,
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
    };

    await erpSendRetryEntry({
      type: 'push-subscription-post',
      payload: pendingSubscriptionPayload,
    });

    if (oldEndpoint && oldEndpoint !== payload.endpoint) {
      try {
        await erpSendRetryEntry({
          type: 'push-subscription-delete',
          payload: {
            endpoint: oldEndpoint,
          },
        });
      } catch {
        await erpQueueRetryEntry('push-subscription-delete', {
          endpoint: oldEndpoint,
        });
      }
    }

    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: true,
    });
  } catch {
    if (pendingSubscriptionPayload) {
      await erpQueueRetryEntry('push-subscription-post', pendingSubscriptionPayload);
    }
    if (
      pendingSubscriptionPayload &&
      oldEndpoint &&
      oldEndpoint !== erpNormalizeString(pendingSubscriptionPayload.endpoint)
    ) {
      await erpQueueRetryEntry('push-subscription-delete', {
        endpoint: oldEndpoint,
      });
    }
    await erpBroadcastMessage('erp-push-subscription-refresh', {
      active: false,
    });
  }
}

async function erpHandleClientMessage(event) {
  const message = event?.data && typeof event.data === 'object' ? event.data : null;
  if (!message?.type) return;

  if (message.type === 'erp-push-flush-retry-queue') {
    await erpFlushRetryQueue();
  }
}

async function erpHandleNotificationClick(event) {
  event.notification.close();

  try {
    if (self.navigator && 'clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge().catch(() => {});
    }
  } catch {
    // ignore badge failures
  }

  if (event.action === 'close') return;

  const data = event.notification.data || {};

  // 알림에서 답장 버튼 처리 (Notification Actions API reply)
  if (event.action === 'reply' && event.reply) {
    const replyText = erpNormalizeString(event.reply);
    const roomId = erpNormalizeString(data.room_id);
    if (roomId && replyText) {
      try {
        await fetch('/api/chat/quick-reply', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, content: replyText }),
        });
        await erpMarkNotificationAsRead(data);
        // 새 알림을 업데이트해서 답장 완료 표시
        await self.registration.showNotification('답장을 보냈습니다', {
          body: replyText,
          badge: ERP_PUSH_BADGE_URL,
          tag: `${erpNormalizeString(data.tag || data.room_id)}-reply-sent`,
          data: { room_id: roomId },
        });
      } catch {
        // 실패 시 앱 열기로 폴백 (아래 로직 계속 실행)
      }
      return;
    }
  }

  await erpMarkNotificationAsRead(data);
  await erpFlushRetryQueue();
  const targetUrl = erpBuildTargetUrl(data);
  const baseUrl = self.registration.scope.replace(/\/$/, '');
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of clientList) {
    if (client.url.startsWith(baseUrl) && 'focus' in client) {
      // SPA 라우터로 부드럽게 이동시키기 위해 deep link를 postMessage로 전달
      try {
        client.postMessage({
          type: 'erp-push-deep-link',
          payload: { deepLink: targetUrl },
        });
      } catch {
        // postMessage 실패는 무시 — 아래 navigate 폴백
      }
      if ('navigate' in client) {
        const navigated = await client.navigate(targetUrl).catch(() => null);
        if (navigated && 'focus' in navigated) {
          return navigated.focus();
        }
      }
      return client.focus();
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(targetUrl);
  }
}

self.__erpPushShared = {
  showIncomingNotification: erpShowIncomingNotificationManaged,
  handleFcmBackgroundMessage: erpHandleFcmBackgroundMessage,
  handleNotificationClick: erpHandleNotificationClick,
  handlePushSubscriptionChange: erpHandlePushSubscriptionChange,
  handleClientMessage: erpHandleClientMessage,
  flushRetryQueue: erpFlushRetryQueue,
};

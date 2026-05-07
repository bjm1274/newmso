import { logger } from '@/lib/logger';
// ─── Push 알림 관련 상수, 타입, 함수 ───

export const PUSH_STATUS_CHANGED_EVENT = 'erp-push-status-changed';
export const PUSH_DEBUG_EVENT = 'erp-push-debug';

export type PushDebugEntry = {
  source: 'app' | 'sw';
  stage: string;
  message: string;
  at: string;
  detail?: Record<string, unknown> | null;
};

export type PushConnectionStatus = {
  supported: boolean;
  secureContext: boolean;
  permission: NotificationPermission | 'unsupported';
  active: boolean;
  hasSubscription: boolean;
  requiresGesture: boolean;
  standalone: boolean;
  platform: string;
  appleMobile: boolean;
};

const PUSH_DEBUG_STORAGE_KEY = 'erp_push_debug_log';
const pushInitInFlightMap = new Map<string, Promise<void>>();

// ─── 내부 유틸 ───
function normalizePushDebugDetail(detail: Record<string, unknown> | null | undefined) {
  if (!detail) return null;
  return Object.entries(detail).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value === undefined) return acc;
    if (value === null) {
      acc[key] = null;
      return acc;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = value;
      return acc;
    }
    acc[key] = JSON.stringify(value);
    return acc;
  }, {});
}

function getPushVapidStorageKey(staffId?: string) {
  return `erp_push_vapid_public_key:${staffId || 'guest'}`;
}

function getPushSubscriptionActiveKey(staffId?: string) {
  return `erp_push_subscription_active:${staffId || 'guest'}`;
}

function getPushDeviceIdKey(staffId?: string) {
  return `erp_push_device_id:${staffId || 'guest'}`;
}

function dispatchPushStatusChanged(staffId: string | undefined, active: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(PUSH_STATUS_CHANGED_EVENT, {
      detail: {
        staffId: staffId || null,
        active,
      },
    }));
  } catch {
    // ignore
  }
}

function isAppleMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = Number((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints || 0);
  return /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone || window.matchMedia?.('(display-mode: standalone)')?.matches);
}

function requiresUserGestureForPushPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  return Notification.permission === 'default';
}

export function canRequestPushPermissionFromGesture() {
  if (!requiresUserGestureForPushPermission()) return false;
  if (isAppleMobileDevice()) {
    return isStandaloneWebApp();
  }
  return true;
}

export function getPushClientPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  if (isAppleMobileDevice()) {
    return isStandaloneWebApp() ? 'ios-webapp' : 'ios-browser';
  }
  if (/android/i.test(navigator.userAgent || '')) return 'android';
  return 'web';
}

function getOrCreatePushDeviceId(staffId?: string) {
  if (typeof window === 'undefined') return null;
  const storageKey = getPushDeviceIdKey(staffId);
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const nextId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(storageKey, nextId);
    return nextId;
  } catch {
    return null;
  }
}

async function cleanupLegacyMessagingServiceWorkers() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        const scriptUrl =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          '';
        const scope = registration.scope || '';
        const isLegacyFirebaseWorker =
          scriptUrl.includes('/firebase-messaging-sw.js') ||
          scope.includes('/firebase-cloud-messaging-push-scope');
        if (!isLegacyFirebaseWorker) return;
        await registration.unregister();
      })
    );
  } catch (error) {
    logger.warn('레거시 메시징 서비스워커 정리 실패:', error);
  }
}

async function syncPushSubscriptionOnServer(
  staffId: string | undefined,
  subscription: PushSubscriptionJSON & { fcm_token?: string | null }
) {
  if (!staffId || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return;
  const deviceId = getOrCreatePushDeviceId(staffId);

  const response = await fetch('/api/notifications/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      fcm_token: subscription.fcm_token ?? null,
      device_id: deviceId,
      platform: getPushClientPlatform(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }),
  });

  if (!response.ok) {
    throw new Error(`push subscription sync failed (${response.status})`);
  }
}

async function deletePushSubscriptionOnServer(endpoint?: string | null) {
  if (!endpoint) return;

  await fetch('/api/notifications/push-subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

// ─── 공개 함수 ───
export function recordPushDebug(entry: Omit<PushDebugEntry, 'at'> & { at?: string }) {
  if (typeof window === 'undefined') return;
  const nextEntry: PushDebugEntry = {
    source: entry.source,
    stage: entry.stage,
    message: entry.message,
    at: entry.at || new Date().toISOString(),
    detail: normalizePushDebugDetail(entry.detail),
  };

  try {
    const nextLog = [nextEntry, ...readPushDebugLog()].slice(0, 20);
    window.localStorage.setItem(PUSH_DEBUG_STORAGE_KEY, JSON.stringify(nextLog));
  } catch {
    // ignore storage failures
  }

  try {
    window.dispatchEvent(new CustomEvent(PUSH_DEBUG_EVENT, {
      detail: nextEntry,
    }));
  } catch {
    // ignore event failures
  }
}

export function readPushDebugLog(): PushDebugEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PUSH_DEBUG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PushDebugEntry[] : [];
  } catch {
    return [];
  }
}

export function setPushSubscriptionActiveState(staffId: string | undefined, isActive: boolean) {
  if (typeof window === 'undefined') return;
  const storageKey = getPushSubscriptionActiveKey(staffId);
  try {
    const wasActive = window.localStorage.getItem(storageKey) === '1';
    if (isActive) {
      window.localStorage.setItem(storageKey, '1');
    } else {
      window.localStorage.removeItem(storageKey);
    }
    if (wasActive !== isActive) {
      dispatchPushStatusChanged(staffId, isActive);
    }
  } catch {
    // ignore
  }
}

export function hasPushSubscriptionActive(staffId?: string) {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(getPushSubscriptionActiveKey(staffId)) === '1';
  } catch {
    return false;
  }
}

export async function flushPushRetryQueue() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const worker =
      registration.active ||
      navigator.serviceWorker.controller ||
      registration.waiting ||
      registration.installing;
    if (!worker || typeof worker.postMessage !== 'function') return false;
    worker.postMessage({
      type: 'erp-push-flush-retry-queue',
    });
    return true;
  } catch {
    return false;
  }
}

export function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

export function uint8ArrayToBase64Url(value: ArrayBuffer | null | undefined) {
  if (!value) return '';
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function getPushConnectionStatus(staffId?: string): Promise<PushConnectionStatus> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      secureContext: false,
      permission: 'unsupported',
      active: false,
      hasSubscription: false,
      requiresGesture: false,
      standalone: false,
      platform: 'unknown',
      appleMobile: false,
    };
  }

  const hasNotificationApi = typeof Notification !== 'undefined';
  const hasServiceWorkerApi = 'serviceWorker' in navigator;
  const supported = hasNotificationApi && hasServiceWorkerApi;
  const secureContext = Boolean(window.isSecureContext);
  const platform = getPushClientPlatform();
  const appleMobile = isAppleMobileDevice();
  const permission: NotificationPermission | 'unsupported' =
    hasNotificationApi ? Notification.permission : 'unsupported';

  let hasSubscription = false;
  if (hasServiceWorkerApi && typeof navigator.serviceWorker.getRegistration === 'function') {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.pushManager) {
        hasSubscription = Boolean(await registration.pushManager.getSubscription());
      }
    } catch {
      hasSubscription = false;
    }
  }

  return {
    supported,
    secureContext,
    permission,
    active: hasPushSubscriptionActive(staffId) || hasSubscription,
    hasSubscription,
    requiresGesture: supported && requiresUserGestureForPushPermission(),
    standalone: isStandaloneWebApp(),
    platform,
    appleMobile,
  };
}

type InitNotificationServiceOptions =
  | string
  | {
      staffId?: string;
      requestPermission?: boolean;
    };

function normalizeInitNotificationServiceOptions(options?: InitNotificationServiceOptions) {
  if (typeof options === 'string') {
    return { staffId: options, requestPermission: false };
  }
  return {
    staffId: options?.staffId,
    requestPermission: Boolean(options?.requestPermission),
  };
}

export async function initNotificationService(options?: InitNotificationServiceOptions) {
  const { staffId, requestPermission } = normalizeInitNotificationServiceOptions(options);
  const initKey = `${staffId || 'guest'}:${requestPermission ? 'request' : 'auto'}`;
  const existingInit = pushInitInFlightMap.get(initKey);
  if (existingInit) {
    await existingInit;
    return;
  }

  const runInit = async () => {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (!window.isSecureContext) return;
  recordPushDebug({
    source: 'app',
    stage: 'init-start',
    message: '푸시 초기화를 시작했습니다.',
    detail: {
      permission: Notification.permission,
      requestPermission,
      platform: getPushClientPlatform(),
    },
  });
  try {
    await cleanupLegacyMessagingServiceWorkers();
    const reg = await navigator.serviceWorker.register('/sw.js');
    if (!reg || typeof reg !== 'object' || !('pushManager' in reg) || !reg.pushManager) {
      return;
    }
    recordPushDebug({
      source: 'app',
      stage: 'sw-registered',
      message: '서비스워커 등록을 확인했습니다.',
      detail: {
        scope: reg.scope,
      },
    });
    if (Notification.permission === 'default') {
      if (requiresUserGestureForPushPermission() && !requestPermission) {
        setPushSubscriptionActiveState(staffId, false);
        recordPushDebug({
          source: 'app',
          stage: 'permission-wait-gesture',
          message: '알림 권한 요청은 첫 사용자 동작을 기다립니다.',
        });
        return;
      }
      const permission = await Notification.requestPermission();
      recordPushDebug({
        source: 'app',
        stage: 'permission-result',
        message: `알림 권한 결과: ${permission}`,
        detail: { permission },
      });
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (Notification.permission === 'granted' && vapidKey) {
      let sub = await reg.pushManager.getSubscription();
      const savedVapidKey = window.localStorage.getItem(getPushVapidStorageKey(staffId));
      const subscribedVapidKey = sub
        ? uint8ArrayToBase64Url((sub.options?.applicationServerKey as ArrayBuffer | null | undefined) || null)
        : '';
      const hasVapidMismatch = Boolean(
        sub && (
          (savedVapidKey && savedVapidKey !== vapidKey) ||
          (subscribedVapidKey && subscribedVapidKey !== vapidKey)
        )
      );
      if (sub && hasVapidMismatch) {
        const oldEndpoint = sub.endpoint;
        try {
          await sub.unsubscribe();
        } catch (unsubscribeError) {
          logger.warn('기존 푸시 구독 해제 실패:', unsubscribeError);
        }
        try {
          await deletePushSubscriptionOnServer(oldEndpoint);
        } catch (deleteError) {
          logger.warn('기존 푸시 구독 서버 정리 실패:', deleteError);
        }
        sub = null;
      }
      if (!sub) {
        try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }); }
        catch (e) { logger.warn('푸시 구독 실패:', e); }
      }
      if (sub) {
        const j: any = sub.toJSON();
        if (j.endpoint && j.keys?.p256dh && j.keys?.auth) {
          // FCM token도 함께 가져와서 저장
          let fcmToken: string | null = null;
          try {
            const fcmVapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY?.trim();
            if (fcmVapidKey && !isAppleMobileDevice()) {
              const { initializeApp, getApps } = await import('firebase/app');
              const { getMessaging, getToken } = await import('firebase/messaging');
              const firebaseConfig = {
                apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
                authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
                appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
              };
              const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
              const messaging = getMessaging(app);
              fcmToken = await getToken(messaging, {
                vapidKey: fcmVapidKey,
                serviceWorkerRegistration: reg,
              });
            }
          } catch (fcmErr) {
            logger.warn('[FCM] 토큰 발급 실패 (Web Push는 계속 사용):', fcmErr);
            recordPushDebug({
              source: 'app',
              stage: 'fcm-token-failed',
              message: 'FCM 토큰 발급에 실패해 Web Push만 사용합니다.',
              detail: {
                error: String((fcmErr as { message?: string } | null)?.message || fcmErr || ''),
              },
            });
          }
          await syncPushSubscriptionOnServer(staffId, { ...j, fcm_token: fcmToken });
          window.localStorage.setItem(getPushVapidStorageKey(staffId), vapidKey);
          setPushSubscriptionActiveState(staffId, true);
          recordPushDebug({
            source: 'app',
            stage: 'subscription-active',
            message: '푸시 구독이 활성화되었습니다.',
            detail: {
              endpoint: j.endpoint,
              hasFcmToken: Boolean(fcmToken),
            },
          });
        }
      } else {
        setPushSubscriptionActiveState(staffId, false);
        recordPushDebug({
          source: 'app',
          stage: 'subscription-missing',
          message: '브라우저 푸시 구독을 확보하지 못했습니다.',
        });
      }
    } else {
      setPushSubscriptionActiveState(staffId, false);
      recordPushDebug({
        source: 'app',
        stage: 'permission-not-granted',
        message: `알림 권한 상태가 ${Notification.permission} 입니다.`,
        detail: {
          permission: Notification.permission,
        },
      });
    }
  } catch (e) {
    setPushSubscriptionActiveState(staffId, false);
    logger.warn('SW 등록 건너뜀:', e);
    recordPushDebug({
      source: 'app',
      stage: 'init-error',
      message: '푸시 초기화 중 오류가 발생했습니다.',
      detail: {
        error: String((e as { message?: string } | null)?.message || e || ''),
      },
    });
  }
  };

  const initPromise = runInit().finally(() => {
    pushInitInFlightMap.delete(initKey);
  });
  pushInitInFlightMap.set(initKey, initPromise);
  await initPromise;
}

export function sendNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') {
    recordPushDebug({
      source: 'app',
      stage: 'show-skipped',
      message: '알림 권한이 없어 시스템 팝업을 띄우지 못했습니다.',
      detail: {
        permission: Notification.permission,
        title,
      },
    });
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(title, {
          icon: '/sy-icon-512x512.png',
          badge: '/sy-badge-72x72.png',
          tag: 'erp-noti',
          requireInteraction: false,
          ...options,
        })
      )
      .then(() => {
        recordPushDebug({
          source: 'app',
          stage: 'show-success',
          message: '앱에서 시스템 팝업 표시를 요청했습니다.',
          detail: {
            title,
            tag: String(options?.tag || 'erp-noti'),
          },
        });
      })
      .catch((error) => {
        recordPushDebug({
          source: 'app',
          stage: 'show-error',
          message: '앱에서 시스템 팝업 표시 요청이 실패했습니다.',
          detail: {
            title,
            error: String((error as { message?: string } | null)?.message || error || ''),
          },
        });
      });
    return;
  }

  try {
    new Notification(title, options);
    recordPushDebug({
      source: 'app',
      stage: 'show-success',
      message: 'Notification API로 시스템 팝업 표시를 요청했습니다.',
      detail: {
        title,
        tag: String(options?.tag || 'erp-noti'),
      },
    });
  } catch (error) {
    recordPushDebug({
      source: 'app',
      stage: 'show-error',
      message: 'Notification API 호출이 실패했습니다.',
      detail: {
        title,
        error: String((error as { message?: string } | null)?.message || error || ''),
      },
    });
  }
}

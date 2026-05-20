'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime-bus';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { canAccessAdminSection } from '@/lib/access-control';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { bindChannelHealthcheck, bindPageRefresh } from '@/lib/realtime-maintenance';
import {
  DEFAULT_ADMIN_SUBVIEW,
  DEFAULT_BOARD_TYPE,
  NOTIFICATION_MENU_LABELS,
  resolveNotificationTarget,
} from '@/lib/notification-metadata';
import { detectPayrollAnomalies } from './관리자전용서브/급여이상치감지';
import { CHAT_ACTIVE_ROOM_KEY as ACTIVE_CHAT_ROOM_SESSION_KEY } from '@/app/main/navigation-state';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { toNotificationText, getInitials, timeAgo } from '@/lib/notification-utils';
import { NOTICE_ROOM_ID } from '@/lib/constants';

// ─── 서브모듈 re-exports (외부 import 호환성 유지) ───
export type { NotifSettings } from './알림시스템/settings';
export { saveNotifSettings, loadNotifSettings } from './알림시스템/settings';

export type { NotificationDeliveryLogEntry } from './알림시스템/delivery-log';
export {
  NOTIFICATION_DELIVERY_LOG_KEY,
  NOTIFICATION_DELIVERY_EVENT,
  readNotificationDeliveryLog,
  recordNotificationDelivery,
} from './알림시스템/delivery-log';

export type { PushDebugEntry } from './알림시스템/push-debug';
export {
  PUSH_DEBUG_STORAGE_KEY,
  normalizePushDebugDetail,
  readPushDebugLog,
  recordPushDebug,
} from './알림시스템/push-debug';

// ─── 서브모듈 imports (본체 내부 사용) ───
import { loadNotifSettings } from './알림시스템/settings';
import { recordNotificationDelivery } from './알림시스템/delivery-log';
import {
  isInDND,
  isWeekendQuiet,
  matchesNotificationKeywords,
  resolveChatRoomSurfaceSuppression,
  isFollowedThreadNotification,
} from './알림시스템/filter-helpers';
import { recordPushDebug } from './알림시스템/push-debug';
import {
  urlBase64ToUint8Array,
  uint8ArrayToBase64Url,
  getPushVapidStorageKey,
  getPushSubscriptionActiveKey,
} from './알림시스템/push-utils';
import { getTypeCfg } from './알림시스템/ui-config';
import {
  isMissingTodoReminderSchema,
  setAppBadge,
  playIncomingNotificationFeedback,
} from './알림시스템/device-feedback';

/**
 * [실시간 알림 엔진 + KakaoTalk 스타일 Toast UI]
 * - DB 드리븐: 모든 알림은 notifications 테이블에 INSERT → Realtime 수신 → Toast 표시
 * - 직접 채널: approvals, inventory, payroll, education, messages, attendance → notifications 테이블에 자동 기록
 * - Toast: 우측 하단 슬라이드인, 7초 진행바, 빠른 액션, 최대 4개
 */

export const PUSH_STATUS_CHANGED_EVENT = 'erp-push-status-changed';
export const PUSH_DEBUG_EVENT = 'erp-push-debug';

const pushInitInFlightMap = new Map<string, Promise<void>>();

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

function setPushSubscriptionActiveState(staffId: string | undefined, isActive: boolean) {
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

function hasPushSubscriptionActive(staffId?: string) {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(getPushSubscriptionActiveKey(staffId)) === '1';
  } catch {
    return false;
  }
}

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

function isMobileClientDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/android|iphone|ipad|ipod/i.test(ua)) return true;
  try {
    return Boolean(window.matchMedia?.('(max-width: 768px)')?.matches);
  } catch {
    return false;
  }
}

function requiresUserGestureForPushPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  return Notification.permission === 'default';
}

function canRequestPushPermissionFromGesture() {
  if (!requiresUserGestureForPushPermission()) return false;
  if (isAppleMobileDevice()) {
    return isStandaloneWebApp();
  }
  return true;
}

function getPushClientPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  if (isAppleMobileDevice()) {
    return isStandaloneWebApp() ? 'ios-webapp' : 'ios-browser';
  }
  if (/android/i.test(navigator.userAgent || '')) return 'android';
  return 'web';
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
    console.warn('레거시 메시징 서비스워커 정리 실패:', error);
  }
}

function getVisibleActiveChatRoomId() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (document.visibilityState === 'hidden') return null;
  try {
    const activeRoomId = window.sessionStorage.getItem(ACTIVE_CHAT_ROOM_SESSION_KEY);
    return activeRoomId && activeRoomId.trim() ? activeRoomId.trim() : null;
  } catch {
    return null;
  }
}

function getNotificationDisplayKey(row: Record<string, unknown>) {
  const metadata =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {};
  const type = String(row.type || 'notification');
  const messageId = String(metadata.message_id || metadata.id || '').trim();
  if ((type === 'message' || type === 'mention') && messageId) {
    return `chat:${messageId}`;
  }

  const dedupeKey = String(metadata.dedupe_key || '').trim();
  if (dedupeKey) return dedupeKey;

  return String(row.id || '');
}

function buildNotificationRowFromPushPreview(payload: {
  title?: unknown;
  body?: unknown;
  tag?: unknown;
  data?: unknown;
}) {
  const metadata =
    payload?.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : {};
  const type =
    typeof metadata.type === 'string' && metadata.type.trim()
      ? metadata.type
      : 'notification';
  const messageId = String(metadata.message_id || metadata.id || payload?.tag || Date.now());

  return {
    id: `push-preview-${messageId}`,
    type,
    title: toNotificationText(payload?.title, '알림'),
    body: toNotificationText(payload?.body, ''),
    metadata,
    created_at: new Date().toISOString(),
  } satisfies Record<string, unknown>;
}

function claimNotificationSlot(key: string, ownerId: string, ttlMs: number) {
  if (typeof window === 'undefined') return true;
  try {
    const now = Date.now();
    const currentRaw = window.localStorage.getItem(key);
    if (currentRaw) {
      const current = JSON.parse(currentRaw);
      if (Number(current?.expiresAt || 0) > now && current?.ownerId !== ownerId) {
        return false;
      }
    }

    const nextClaim = JSON.stringify({
      ownerId,
      expiresAt: now + ttlMs,
    });
    window.localStorage.setItem(key, nextClaim);
    const confirmedRaw = window.localStorage.getItem(key);
    if (!confirmedRaw) return false;
    const confirmed = JSON.parse(confirmedRaw);
    return confirmed?.ownerId === ownerId;
  } catch {
    return true;
  }
}

async function claimNotificationSlotWithLock(key: string, ownerId: string, ttlMs: number) {
  if (typeof window === 'undefined') return true;
  try {
    const lockManager = (navigator as Navigator & {
      locks?: {
        request?: (
          name: string,
          callback: () => Promise<boolean> | boolean
        ) => Promise<boolean>;
      };
    }).locks;
    if (lockManager?.request) {
      return await lockManager.request(`erp-lock:${key}`, async () =>
        claimNotificationSlot(key, ownerId, ttlMs)
      );
    }
  } catch {
    // fall back to localStorage-only coordination
  }
  return claimNotificationSlot(key, ownerId, ttlMs);
}

async function buildDeterministicNotificationId(userId: string, dedupeKey: string) {
  const source = `erp-notification:${userId}:${dedupeKey}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const bytes = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
      ).slice(0, 16);
      bytes[6] = (bytes[6] & 0x0f) | 0x50;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
  } catch {
    // ignore and use fallback
  }

  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
          console.warn('기존 푸시 구독 해제 실패:', unsubscribeError);
        }
        try {
          await deletePushSubscriptionOnServer(oldEndpoint);
        } catch (deleteError) {
          console.warn('기존 푸시 구독 서버 정리 실패:', deleteError);
        }
        sub = null;
      }
      if (!sub) {
        try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }); }
        catch (e) { console.warn('푸시 구독 실패:', e); }
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
            console.warn('[FCM] 토큰 발급 실패 (Web Push는 계속 사용):', fcmErr);
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
    console.warn('SW 등록 건너뜀:', e);
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
          icon: '/sy-logo.png',
          badge: '/badge-72x72.png',
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

// ─── Toast 카드 컴포넌트 ───
interface ToastItem { id: string; title: string; body: string; type: string; senderName?: string; createdAt: number; data?: any; exiting?: boolean; }

function ToastCard({ notif, onClose, onAction }: { notif: ToastItem; onClose: (id: string) => void; onAction: (n: ToastItem) => void; }) {
  const cfg = getTypeCfg(notif.type);
  const isChat = notif.type === 'message' || notif.type === 'mention';
  const isApproval = notif.type === 'approval';
  const isInventory = notif.type === 'inventory';
  const initials = notif.senderName ? getInitials(notif.senderName) : null;
  return (
    <div
      data-testid={`notification-toast-${notif.id}`}
      className={`relative group flex items-start gap-3 p-3.5 rounded-2xl shadow-sm border border-white/10 dark:border-white/5 overflow-hidden cursor-pointer select-none
        bg-[var(--card)]/97 dark:bg-gray-900/97 backdrop-blur-md
        ${notif.exiting ? 'animate-slide-out-right-toast' : 'animate-slide-in-right-toast'}
        hover:scale-[1.015] active:scale-[0.99] transition-transform`}
      style={{ width: 320 }}
      onClick={() => onAction(notif)}
    >
      {/* 좌측 타입 아이콘 / 이니셜 아바타 */}
      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black shadow-sm ${cfg.bg}`}>
        {isChat && initials ? <span className="text-sm">{initials}</span> : <span className="text-base leading-none">{cfg.icon}</span>}
      </div>
      {/* 내용 */}
      <div className="flex-1 min-w-0 pr-5">
        <div className="flex items-baseline gap-2">
          <p className="text-[13px] font-bold text-[var(--foreground)] dark:text-white leading-tight truncate flex-1">{notif.title}</p>
          <span className="text-[10px] text-[var(--toss-gray-3)] dark:text-[var(--toss-gray-4)] whitespace-nowrap shrink-0">{timeAgo(notif.createdAt)}</span>
        </div>
        {notif.body && <p className="text-[11.5px] text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] mt-0.5 line-clamp-2 leading-snug">{notif.body}</p>}
        {(isChat || isApproval || isInventory) && (
          <button type="button" onClick={e => { e.stopPropagation(); onAction(notif); }}
            className={`mt-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded-full border transition-all bg-transparent
              ${isChat
                ? 'text-blue-600 border-blue-300 hover:bg-blue-500/10'
                : isApproval
                  ? 'text-violet-600 border-violet-300 hover:bg-violet-50'
                  : 'text-orange-600 border-orange-300 hover:bg-orange-500/10'}`}>
            {isChat ? '💬 채팅 열기' : isApproval ? '📋 결재하기' : '📦 재고 확인'}
          </button>
        )}
      </div>
      {/* 닫기 */}
      <button type="button" onClick={e => { e.stopPropagation(); onClose(notif.id); }}
        className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-5)] hover:bg-[var(--muted)] transition-all text-xs">✕</button>
      {/* 7초 진행바 */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[var(--tab-bg)] dark:bg-gray-800 rounded-b-2xl overflow-hidden">
        <div className={`h-full animate-progress-7s ${cfg.progress}`} style={{ transformOrigin: 'left center' }} />
      </div>
    </div>
  );
}

// ─── User 타입 ───
interface UserLike {
  id?: string | number;
  employee_no?: string | number;
  name?: string;
  auth_user_id?: string | number;
  department?: string;
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── 메인 컴포넌트 ───
export default function NotificationSystem({
  user: rawUser, onOpenChatRoom, onOpenMessage, onOpenApproval, onOpenInventory, onOpenBoard, onOpenPost, onOpenAdmin,
}: {
  user: UserLike | null | undefined;
  onOpenChatRoom?: (roomId: string) => void;
  onOpenMessage?: (roomId: string, messageId: string) => void;
  onOpenApproval?: (intent?: Record<string, unknown>) => void;
  onOpenInventory?: (intent?: { view?: string | null; approvalId?: string | null }) => void;
  onOpenBoard?: (boardId?: string) => void;
  onOpenPost?: (boardId: string, postId: string) => void;
  onOpenAdmin?: (subView?: string) => void;
}) {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const lastHiddenRef = useRef(0);
  const didPrimeNotificationsRef = useRef(false);
  const mountedAtRef = useRef(new Date().toISOString());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const chatPushFlushInFlightRef = useRef(false);
  const todoReminderDispatchRef = useRef<{ lastAt: number; inFlight: Promise<void> | null }>({
    lastAt: 0,
    inFlight: null,
  });
  const onActionRef = useRef<(n: ToastItem) => void>(() => { });
  const tabIdRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const displayChannelRef = useRef<BroadcastChannel | null>(null);
  const displayClaimWinnersRef = useRef<Map<string, { ownerId: string; expiresAt: number }>>(new Map());
  const normalizedUser = useMemo(
    () => normalizeStaffLike((rawUser ?? {}) as Record<string, unknown>) as UserLike,
    [rawUser]
  );
  const [resolvedUser, setResolvedUser] = useState<UserLike | null>(() => {
    const directId = getStaffLikeId(normalizedUser as Record<string, unknown>);
    return directId ? normalizedUser : null;
  });
  const effectiveUser = (resolvedUser || normalizedUser) as UserLike;
  const effectiveUserId = getStaffLikeId(effectiveUser as Record<string, unknown>);
  const user = effectiveUser;

  useEffect(() => {
    let cancelled = false;

    const syncUserIdentity = async () => {
      const directId = getStaffLikeId(normalizedUser as Record<string, unknown>);
      if (directId) {
        setResolvedUser(normalizedUser);
        return;
      }

      if (!normalizedUser?.name && !normalizedUser?.employee_no && !normalizedUser?.auth_user_id) {
        setResolvedUser(normalizedUser);
        return;
      }

      const recoveredUser = await resolveStaffLike(normalizedUser as Record<string, unknown>);
      if (!cancelled) {
        setResolvedUser(recoveredUser as UserLike);
      }
    };

    void syncUserIdentity();
    return () => {
      cancelled = true;
    };
  }, [normalizedUser?.id, normalizedUser?.name, normalizedUser?.employee_no, normalizedUser?.auth_user_id]);

  // 탭 타이틀 배지
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = document.title.replace(/^\(\d+\)\s*/, '') || 'SY INC. ERP';
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount]);

  // 배지 카운트 DB 동기화
  const syncBadge = useCallback(async () => {
    if (!effectiveUserId) return;
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', effectiveUserId).is('read_at', null);
    if (count !== null) { setUnreadCount(count); setAppBadge(count); }
  }, [effectiveUserId]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 230);
  }, []);

  const addToast = useCallback((item: Omit<ToastItem, 'createdAt' | 'exiting'>) => {
    const toast: ToastItem = { ...item, createdAt: Date.now() };
    setToasts(prev => [toast, ...prev.filter(t => t.id !== item.id)].slice(0, 4));
    const existing = timersRef.current.get(item.id);
    if (existing) clearTimeout(existing);
    timersRef.current.set(item.id, setTimeout(() => removeToast(item.id), 7000));
  }, [removeToast]);

  const pruneDisplayClaims = useCallback(() => {
    const now = Date.now();
    displayClaimWinnersRef.current.forEach((claim, key) => {
      if (claim.expiresAt <= now) {
        displayClaimWinnersRef.current.delete(key);
      }
    });
  }, []);

  const updateDisplayClaimWinner = useCallback((claimKey: string, ownerId: string, ttlMs: number) => {
    pruneDisplayClaims();
    const expiresAt = Date.now() + ttlMs;
    const current = displayClaimWinnersRef.current.get(claimKey);
    if (!current || current.expiresAt <= Date.now() || ownerId.localeCompare(current.ownerId) < 0) {
      displayClaimWinnersRef.current.set(claimKey, { ownerId, expiresAt });
      return;
    }
    displayClaimWinnersRef.current.set(claimKey, { ownerId: current.ownerId, expiresAt: Math.max(current.expiresAt, expiresAt) });
  }, [pruneDisplayClaims]);

  const claimCrossTabNotificationAsync = useCallback(async (scope: string, dedupeKey: string, ttlMs: number) => {
    if (!effectiveUserId) return true;
    return claimNotificationSlotWithLock(
      `erp_notification_${scope}:${effectiveUserId}:${dedupeKey}`,
      tabIdRef.current,
      ttlMs
    );
  }, [effectiveUserId]);

  const claimCrossTabDisplayNotificationAsync = useCallback(async (dedupeKey: string, ttlMs: number) => {
    if (!effectiveUserId) return true;
    const lockedWinner = await claimCrossTabNotificationAsync('display', dedupeKey, ttlMs);
    if (!lockedWinner) {
      return false;
    }

    const claimKey = `${effectiveUserId}:${dedupeKey}`;
    const channel = displayChannelRef.current;
    if (!channel) {
      return true;
    }

    updateDisplayClaimWinner(claimKey, tabIdRef.current, ttlMs);
    try {
      channel.postMessage({
        kind: 'candidate',
        claimKey,
        ownerId: tabIdRef.current,
        ttlMs,
      });
    } catch {
      return true;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 120));
    pruneDisplayClaims();
    const winner = displayClaimWinnersRef.current.get(claimKey);
    return !winner || winner.ownerId === tabIdRef.current;
  }, [claimCrossTabNotificationAsync, effectiveUserId, pruneDisplayClaims, updateDisplayClaimWinner]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('erp-notification-display');
    displayChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        kind?: string;
        claimKey?: string;
        ownerId?: string;
        ttlMs?: number;
      } | null;
      if (!data || data.kind !== 'candidate' || !data.claimKey || !data.ownerId) return;
      updateDisplayClaimWinner(data.claimKey, data.ownerId, Number(data.ttlMs || 5000));
    };
    return () => {
      if (displayChannelRef.current === channel) {
        displayChannelRef.current = null;
      }
      channel.close();
    };
  }, [updateDisplayClaimWinner]);

  const emitIncomingNotification = useCallback((row: Record<string, unknown>) => {
    if (!row?.id) return;
    const rowId = String(row.id);
    const displayKey = getNotificationDisplayKey(row);
    if (shownIdsRef.current.has(displayKey)) return;
    shownIdsRef.current.add(displayKey);

    const settings = loadNotifSettings();
    const type = String(row.type || 'notification');
    const rowMetadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata as Record<string, unknown> : {};
    const title = toNotificationText(row.title, '알림');
    const body = toNotificationText(row.body, '');
    recordNotificationDelivery({
      notificationId: rowId,
      type,
      title,
      stage: 'received',
      detail: {
        displayKey,
      },
    });
    if (settings.types[type] === false) {
      recordNotificationDelivery({
        notificationId: rowId,
        type,
        title,
        stage: 'skipped-type-disabled',
      });
      return;
    }
    if (!matchesNotificationKeywords(settings, type, title, body, rowMetadata)) {
      recordNotificationDelivery({
        notificationId: rowId,
        type,
        title,
        stage: 'skipped-keyword-filtered',
      });
      return;
    }

    const isChatType = type === 'message' || type === 'mention';
    const incomingRoomId = String(rowMetadata.room_id || '').trim();
    const roomSurfaceDecision =
      isChatType && incomingRoomId
        ? resolveChatRoomSurfaceSuppression({
            effectiveUserId,
            roomId: incomingRoomId,
            type,
            title,
            body,
            metadata: rowMetadata,
          })
        : {
            suppressLiveSurface: false,
            mode: 'all',
            keyword: '',
          };
    const isThreadReplyNotification =
      rowMetadata.is_thread_reply === true || String(rowMetadata.is_thread_reply || '').toLowerCase() === 'true';
    const isFollowedThreadAlert = Boolean(
      isChatType &&
      isThreadReplyNotification &&
      isFollowedThreadNotification(effectiveUserId, rowMetadata),
    );
    const suppressByRoomPreference = Boolean(roomSurfaceDecision.suppressLiveSurface && !isFollowedThreadAlert);
    const activeChatRoomId = getVisibleActiveChatRoomId();
    const suppressLiveDisplay = Boolean(isChatType && incomingRoomId && activeChatRoomId === incomingRoomId);
    const useMobileChatPreview = Boolean(isChatType && isMobileClientDevice());
    const wasForegroundPopupAlreadyShown = rowMetadata._foreground_popup_shown === true;
    const shouldPreferMobileNativePopup = Boolean(
      isMobileClientDevice() &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    );

    if (!suppressLiveDisplay && !useMobileChatPreview && !suppressByRoomPreference) {
      addToast({
        id: rowId,
        title,
        body,
        type,
        senderName: rowMetadata.sender_name as string | undefined,
        data: rowMetadata,
      });
      recordNotificationDelivery({
        notificationId: rowId,
        type,
        title,
        stage: 'toast-shown',
      });
    }

    if (typeof window !== 'undefined') {
      if (isChatType && incomingRoomId) {
        window.dispatchEvent(new CustomEvent('erp-chat-notification', {
          detail: {
            title,
            body,
            type,
            room_id: rowMetadata.room_id,
            message_id: rowMetadata.message_id || rowMetadata.id || row.id,
            data: rowMetadata,
            suppress_mobile_banner: suppressLiveDisplay || suppressByRoomPreference || shouldPreferMobileNativePopup,
          },
        }));
      } else if (!suppressLiveDisplay && !suppressByRoomPreference) {
        window.dispatchEvent(new CustomEvent('erp-alert', {
          detail: {
            title,
            body,
            type,
            room_id: rowMetadata.room_id,
            message_id: rowMetadata.message_id || rowMetadata.id || row.id,
            data: rowMetadata,
            suppress_mobile_banner: shouldPreferMobileNativePopup,
          },
        }));
      }
      window.dispatchEvent(new CustomEvent('erp-new-notification', { detail: row }));
    }

    const isDND = isInDND(settings);
    const isWeekendMuted = isWeekendQuiet(settings);
    const shouldPlayLocalSound = !isMobileClientDevice();
    if (
      !suppressLiveDisplay &&
      !suppressByRoomPreference &&
      !isDND &&
      !isWeekendMuted &&
      !wasForegroundPopupAlreadyShown &&
      (settings.sound || settings.vibration)
    ) {
      playIncomingNotificationFeedback({
        type,
        allowSound: Boolean(settings.sound && shouldPlayLocalSound),
        allowVibration: Boolean(settings.vibration),
      });
      recordNotificationDelivery({
        notificationId: rowId,
        type,
        title,
        stage: 'feedback-played',
      });
    }

    if (suppressLiveDisplay) {
      recordNotificationDelivery({
        notificationId: rowId,
        type,
        title,
        stage: 'suppressed-active-room',
        detail: {
          room_id: incomingRoomId,
        },
      });
      void syncBadge();
      return;
    }

    if (suppressByRoomPreference) {
      recordNotificationDelivery({
        notificationId: rowId,
        type,
        title,
        stage: 'suppressed-room-preference',
        detail: {
          room_id: incomingRoomId,
          mode: roomSurfaceDecision.mode,
          keyword: roomSurfaceDecision.keyword || null,
          thread_follow_override: isFollowedThreadAlert,
        },
      });
      void syncBadge();
      return;
    }

    void (async () => {
      const canShowNativeNotification = await claimCrossTabDisplayNotificationAsync(displayKey, 5000);
      const isBackgroundClient =
        typeof document !== 'undefined' && document.visibilityState !== 'visible';
      const shouldShowSystemNotification =
        (
          !isMobileClientDevice() ||
          isBackgroundClient ||
          shouldPreferMobileNativePopup
        ) &&
        (
          !isChatType ||
          !hasPushSubscriptionActive(effectiveUserId) ||
          shouldPreferMobileNativePopup
        );
      if (
        canShowNativeNotification &&
        shouldShowSystemNotification &&
        !wasForegroundPopupAlreadyShown
      ) {
        recordNotificationDelivery({
          notificationId: rowId,
          type,
          title,
          stage: 'system-popup-requested',
        });
        sendNotification(title, {
          body,
          tag: displayKey || type,
          data: rowMetadata,
        });
      }
    })();
    void syncBadge();
  }, [addToast, claimCrossTabDisplayNotificationAsync, effectiveUserId, syncBadge]);

  useEffect(() => {
    if (!effectiveUserId) return;
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (hasPushSubscriptionActive(effectiveUserId)) return;

    const resyncPushSubscription = () => {
      if (document.visibilityState === 'hidden') return;
      void flushPushRetryQueue();
      void initNotificationService({
        staffId: effectiveUserId,
        requestPermission: false,
      });
    };

    window.addEventListener('focus', resyncPushSubscription);
    document.addEventListener('visibilitychange', resyncPushSubscription);
    return () => {
      window.removeEventListener('focus', resyncPushSubscription);
      document.removeEventListener('visibilitychange', resyncPushSubscription);
    };
  }, [effectiveUserId]);

  useEffect(() => {
    onActionRef.current = (notif: ToastItem) => {
      removeToast(notif.id);
      const target = resolveNotificationTarget(notif.type, notif.data);

      if (target.kind === 'chat') {
        if (target.messageId && onOpenMessage) {
          onOpenMessage(target.roomId, target.messageId);
          return;
        }
        if (onOpenChatRoom) {
          onOpenChatRoom(target.roomId);
          return;
        }
      }

      if (target.kind === 'approval' && onOpenApproval) {
        onOpenApproval({
          ...(target.approvalView ? { viewMode: target.approvalView } : {}),
          ...(target.approvalId ? { approvalId: target.approvalId } : {}),
        });
        return;
      }

      if (target.kind === 'inventory' && onOpenInventory) {
        onOpenInventory({
          view: target.inventoryView,
          approvalId: target.approvalId,
        });
        return;
      }

      if (target.kind === 'board') {
        if (target.postId && onOpenPost) {
          onOpenPost(target.boardType || DEFAULT_BOARD_TYPE, target.postId);
          return;
        }
        if (onOpenBoard) {
          onOpenBoard(target.boardType || undefined);
          return;
        }
      }

      if (
        target.kind === 'menu' &&
        target.menu === NOTIFICATION_MENU_LABELS.admin &&
        onOpenAdmin
      ) {
        onOpenAdmin(target.subView || DEFAULT_ADMIN_SUBVIEW);
        return;
      }

      router.push(target.href);
    };
  }, [removeToast, onOpenAdmin, onOpenMessage, onOpenChatRoom, onOpenApproval, onOpenInventory, onOpenPost, onOpenBoard, router]);

  // ─── Supabase Realtime 구독 ───
  useEffect(() => {
    if (!effectiveUserId) return;
    void initNotificationService({
      staffId: effectiveUserId,
      requestPermission: !requiresUserGestureForPushPermission(),
    });
    const uid = effectiveUserId;
    const mountedAt = mountedAtRef.current;
    void syncBadge();
    const useServerSideChatNotifications = true;

    // insertNoti: 이벤트 → notifications 테이블 INSERT (그러면 nTableChannel이 toast 표시)
    const insertNoti = async (
      n: { type: string; title: string; body: string; data?: any; senderName?: string },
      dedupeKey?: string,
      dedupeWindowMs = 15000
    ) => {
      if (dedupeKey && !(await claimCrossTabNotificationAsync('write', dedupeKey, dedupeWindowMs))) {
        return null;
      }

      const metadata = dedupeKey
        ? { ...(n.data || {}), dedupe_key: dedupeKey }
        : (n.data || null);
      const deterministicId = dedupeKey
        ? await buildDeterministicNotificationId(uid, dedupeKey)
        : null;

      const insertPayload = {
        ...(deterministicId ? { id: deterministicId } : {}),
        user_id: uid,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      const writeQuery = deterministicId
        ? supabase
            .from('notifications')
            .upsert([insertPayload], { onConflict: 'id', ignoreDuplicates: true })
            .select()
            .maybeSingle()
        : supabase
            .from('notifications')
            .insert([insertPayload])
            .select()
            .single();

      const { data: inserted, error } = await writeQuery;

      if (!error) return inserted;

      const duplicateInsert =
        Boolean(deterministicId) &&
        (String((error as { code?: string } | null)?.code || '') === '23505' ||
          /duplicate key|unique constraint/i.test(String((error as { message?: string } | null)?.message || '')));

      if (duplicateInsert && deterministicId) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('*')
          .eq('id', deterministicId)
          .maybeSingle();
        return existing || null;
      }

      throw error;
    };

    // A. notifications 테이블 INSERT 수신 → Toast + 소리 + 진동
    const fetchUnreadNotificationsSince = async (since: string) => {
      const { data: rows } = await supabase
        .from('notifications')
        .select('id,title,body,type,metadata,read_at,created_at')
        .eq('user_id', uid)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50);

      rows?.forEach((row: Record<string, unknown>) => {
        if (!row?.read_at) emitIncomingNotification(row);
      });
      void syncBadge();
    };

    const runDueTodoReminderDispatch = async () => {
      try {
        const response = await fetch('/api/todos/reminders/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          return;
        }

        const payload = await response.json().catch(() => null);
        const serverError = payload?.error
          ? new Error(String(payload.error))
          : new Error(`todo reminder dispatch failed (${response.status})`);
        if (isMissingTodoReminderSchema(serverError)) return;
        throw serverError;
      } catch (serverError) {
        if (isMissingTodoReminderSchema(serverError)) return;
        console.warn('todo reminder server dispatch failed, using local fallback:', serverError);
      }

      try {
        const nowIso = new Date().toISOString();
        const { data: dueRows, error: dueError } = await supabase
          .from('todos')
          .select('id,content,task_date,reminder_at')
          .eq('user_id', uid)
          .eq('is_complete', false)
          .not('reminder_at', 'is', null)
          .lte('reminder_at', nowIso)
          .order('reminder_at', { ascending: true })
          .limit(20);

        if (dueError) throw dueError;

        const todos = (dueRows || []) as Array<Record<string, unknown>>;
        if (todos.length === 0) return;

        const todoIds = todos
          .map((row) => String(row.id || '').trim())
          .filter(Boolean);

        const { data: logRows, error: logError } = await supabase
          .from('todo_reminder_logs')
          .select('todo_id,reminder_at')
          .eq('user_id', uid)
          .in('todo_id', todoIds);

        if (logError) throw logError;

        const loggedKeys = new Set(
          ((logRows || []) as Array<{ todo_id?: string | null; reminder_at?: string | null }>).map(
            (row) => `${String(row.todo_id || '')}:${String(row.reminder_at || '')}`
          )
        );

        for (const row of todos) {
          const todoId = String(row.id || '').trim();
          const reminderAt = String(row.reminder_at || '').trim();
          if (!todoId || !reminderAt) continue;

          const reminderKey = `${todoId}:${reminderAt}`;
          if (loggedKeys.has(reminderKey)) continue;

          const notification = await insertNoti(
            {
              type: 'todo',
              title: '🗓️ 할일 리마인더',
              body: `${String(row.content || '할일').trim() || '할일'}${String(row.task_date || '').trim() ? ` · ${String(row.task_date)}` : ''}`,
              data: {
                type: 'todo',
                todo_id: todoId,
                task_date: row.task_date || null,
                reminder_at: reminderAt,
              },
            },
            `todo-reminder:${uid}:${todoId}:${reminderAt}`,
            60_000
          );

          const { error: writeLogError } = await supabase
            .from('todo_reminder_logs')
            .upsert(
              [
                {
                  todo_id: todoId,
                  user_id: uid,
                  reminder_at: reminderAt,
                  notification_id: notification?.id || null,
                  status: notification?.id ? 'sent' : 'duplicate',
                  title: '할일 리마인더',
                  body: String(row.content || '할일'),
                },
              ],
              { onConflict: 'user_id,todo_id,reminder_at' }
            );

          if (writeLogError) throw writeLogError;
          loggedKeys.add(reminderKey);
        }
      } catch (error) {
        if (isMissingTodoReminderSchema(error)) return;
        console.error('todo reminder processing failed:', error);
      }
    };

    const processDueTodoReminders = async () => {
      const now = Date.now();
      if (todoReminderDispatchRef.current.inFlight) {
        return todoReminderDispatchRef.current.inFlight;
      }
      if (now - todoReminderDispatchRef.current.lastAt < 15_000) return;

      todoReminderDispatchRef.current.lastAt = now;
      todoReminderDispatchRef.current.inFlight = runDueTodoReminderDispatch().finally(() => {
        todoReminderDispatchRef.current.inFlight = null;
      });
      return todoReminderDispatchRef.current.inFlight;
    };

    const queuePayrollAnomalyAlert = async () => {
      if (!canAccessAdminSection(user, '급여이상치')) {
        return;
      }

      try {
        const analysis = await detectPayrollAnomalies();

        if (analysis.visibleAnomalies.length === 0) {
          return;
        }

        const dedupeKey = [
          'payroll-anomaly',
          analysis.currentMonth,
          analysis.visibleAnomalies.length,
          analysis.criticalCount,
          analysis.warningCount,
        ].join(':');

        await insertNoti(
          {
            type: 'notification',
            title: '⚠️ 급여 이상치 감지',
            body: `${analysis.currentMonth} 급여 이상치 ${analysis.visibleAnomalies.length}건 (심각 ${analysis.criticalCount} / 주의 ${analysis.warningCount})`,
            data: {
              type: 'notification',
              open_menu: '관리자',
              open_subview: '급여이상치',
              current_month: analysis.currentMonth,
              anomaly_count: analysis.visibleAnomalies.length,
              critical_count: analysis.criticalCount,
              warning_count: analysis.warningCount,
            },
          },
          dedupeKey,
          60_000
        );
      } catch (error) {
        console.error('급여 이상치 관리자 알림 생성 실패:', error);
      }
    };

    let notificationRealtimeReady = false;

    // Phase 5-C-4 — 8개 supabase.channel 호출을 notifications polling 1개로 통합.
    // 비활성화된 7개 트리거 채널 (approvals/inventory/payroll/education/messages/
    // attendance/word-filter)은 payload 기반 즉시 알림 생성에 의존했음. 서버
    // cron이 notifications insert로 동일 효과를 줄 수 있는 경우만 동작.
    // 일부 인앱 알림(결재 차례/재고 부족/단어 필터 등)은 사라짐 — 옵션 A
    // trade-off. 운영 영향 큰 알림은 후속 phase에서 서버 cron 추가 검토.
    let lastNotificationsSeenAt = mountedAt;
    // Phase 5-D — 폴링 비용 절감(2026-05-20).
    // 알림: 3000→8000ms. 푸시(FCM)와 인앱 알림이 병행 동작하므로 8초 폴링으로 충분.
    // 인앱 뱃지 갱신은 최대 8초 지연 가능하나 푸시는 즉시 도착.
    const unsubscribeNotifications = subscribeRealtime(
      `noti-db-${uid}`,
      [{ table: 'notifications' }],
      () => {
        notificationRealtimeReady = true;
        const since = lastNotificationsSeenAt;
        lastNotificationsSeenAt = new Date().toISOString();
        void fetchUnreadNotificationsSince(since);
        void syncBadge();
      },
      { pollIntervalMs: 8000 },
    );
    // initial: fetch once + prime metadata
    void fetchUnreadNotificationsSince(mountedAt);
    void processDueTodoReminders();
    void queuePayrollAnomalyAlert();

    // 비활성화된 7개 supabase.channel (approvals/inventory/payroll/education/
    // messages/attendance/word-filter trigger). 인앱 알림은 nTableChannel
    // polling 1개로 통합 — notifications row가 도착하면 emitIncomingNotification.
    // payload 기반 즉시 분석(예: 결재 차례 / 재고 부족 / 단어 필터)은 사라짐.
    // 향후 phase: 서버 cron이 notifications insert로 보강.
    void insertNoti; // 미사용 변수 경고 회피 (다른 곳에서 호출되는 helper)

    if (!didPrimeNotificationsRef.current) {
      didPrimeNotificationsRef.current = true;
      supabase
        .from('notifications')
        .select('id,type,metadata')
        .eq('user_id', uid)
        .lt('created_at', mountedAt)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data: rows }) => {
          rows?.forEach((row: Record<string, unknown>) => {
            if (row?.id) shownIdsRef.current.add(getNotificationDisplayKey(row));
          });
        });
    }

    // 초기 렌더와 realtime 구독 사이에 들어온 unread 알림을 놓치지 않도록 한 번 더 보강 조회합니다.
    void fetchUnreadNotificationsSince(mountedAt);
    void processDueTodoReminders();

    let quickCatchupPolledAt = mountedAt;
    const quickCatchupTimer = window.setTimeout(() => {
      if (notificationRealtimeReady) return;
      const since = quickCatchupPolledAt;
      quickCatchupPolledAt = new Date().toISOString();
      void fetchUnreadNotificationsSince(since);
    }, 10_000);

    // fallbackPoll: Realtime 누락 보완용. 마지막 폴링 이후 생성된 것만 조회하여 이중 알림 방지
    let lastPolledAt = mountedAt;
    const unbindFallbackPoll = bindPageRefresh(() => {
      if (notificationRealtimeReady) return;
      const since = lastPolledAt;
      lastPolledAt = new Date().toISOString();
      void fetchUnreadNotificationsSince(since);
    }, { intervalMs: 30_000 }); // 5초 → 30초, Realtime이 주 경로이므로 보완용으로만

    const unbindTodoReminderPoll = bindPageRefresh(() => {
      void processDueTodoReminders();
    }, { intervalMs: 60_000 });

    return () => {
      notificationRealtimeReady = false;
      window.clearTimeout(quickCatchupTimer);
      unbindFallbackPoll();
      unbindTodoReminderPoll();
      unsubscribeNotifications();
    };
  }, [user?.department, user?.name, user?.permissions, claimCrossTabNotificationAsync, effectiveUserId, emitIncomingNotification, syncBadge]);

  useEffect(() => {
    if (typeof window === 'undefined' || !effectiveUserId) return;

    const onMockNotificationInsert = (event: Event) => {
      const customEvent = event as CustomEvent<{ rows?: Record<string, unknown>[]; row?: Record<string, unknown> }>;
      const rows = Array.isArray(customEvent.detail?.rows)
        ? customEvent.detail.rows
        : customEvent.detail?.row
          ? [customEvent.detail.row]
          : [];

      rows.forEach((row) => {
        if (String(row?.user_id || '') !== effectiveUserId) return;
        emitIncomingNotification(row);
      });
    };

    window.addEventListener('erp-mock-notification-insert', onMockNotificationInsert as EventListener);
    return () => {
      window.removeEventListener('erp-mock-notification-insert', onMockNotificationInsert as EventListener);
    };
  }, [effectiveUserId, emitIncomingNotification]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        payload?: {
          title?: unknown;
          body?: unknown;
          tag?: unknown;
          data?: unknown;
          active?: unknown;
          notificationId?: unknown;
          stage?: unknown;
          message?: unknown;
          [key: string]: unknown;
        };
      } | null;

      if (!message?.type) return;

      if (message.type === 'erp-push-preview' && message.payload) {
        emitIncomingNotification(buildNotificationRowFromPushPreview(message.payload));
        return;
      }

      if (message.type === 'erp-push-subscription-refresh') {
        setPushSubscriptionActiveState(
          effectiveUserId,
          message.payload?.active !== false
        );
        return;
      }

      if (message.type === 'erp-push-debug' && message.payload) {
        recordPushDebug({
          source: 'sw',
          stage: String(message.payload.stage || 'sw-debug'),
          message: toNotificationText(message.payload.message, '서비스워커 상태'),
          detail:
            message.payload && typeof message.payload === 'object'
              ? (message.payload as Record<string, unknown>)
              : null,
        });
        return;
      }

      if (message.type === 'erp-notification-read-sync') {
        void syncBadge();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    void flushPushRetryQueue();
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [effectiveUserId, emitIncomingNotification, syncBadge]);

  useEffect(() => {
    if (typeof window === 'undefined' || !effectiveUserId) return;
    if (!canRequestPushPermissionFromGesture()) return;

    let handled = false;
    const handleUserGesture = () => {
      if (handled) return;
      handled = true;
      window.removeEventListener('pointerdown', handleUserGesture, true);
      window.removeEventListener('keydown', handleUserGesture, true);
      void initNotificationService({
        staffId: effectiveUserId,
        requestPermission: true,
      });
    };

    window.addEventListener('pointerdown', handleUserGesture, true);
    window.addEventListener('keydown', handleUserGesture, true);
    return () => {
      handled = true;
      window.removeEventListener('pointerdown', handleUserGesture, true);
      window.removeEventListener('keydown', handleUserGesture, true);
    };
  }, [effectiveUserId]);

  // 백그라운드 복귀 시 놓친 알림 재조회
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') { lastHiddenRef.current = Date.now(); return; }
      if (!effectiveUserId || Date.now() - lastHiddenRef.current < 2000) return;
      const since = new Date(Date.now() - 90 * 1000).toISOString();
      supabase.from('notifications').select('id,title,body,type,metadata,created_at').eq('user_id', effectiveUserId).gte('created_at', since).order('created_at', { ascending: false }).limit(20)
        .then(({ data: rows }) => {
          rows?.forEach((row: Record<string, unknown>) => {
            emitIncomingNotification(row);
          });
          void syncBadge();
        });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [effectiveUserId, emitIncomingNotification, syncBadge]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleNotificationRead = () => {
      void syncBadge();
    };
    window.addEventListener('erp-notification-read', handleNotificationRead);
    return () => {
      window.removeEventListener('erp-notification-read', handleNotificationRead);
    };
  }, [syncBadge]);

  // 탭/앱 복귀 시 뱃지 재동기화 — 다른 기기나 탭에서 읽은 경우 반영
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncBadge();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncBadge]);

  useEffect(() => {
    if (!effectiveUserId) return;
    if (typeof window === 'undefined') return;

    const flushPendingChatPushQueue = async () => {
      if (chatPushFlushInFlightRef.current) return;
      chatPushFlushInFlightRef.current = true;
      try {
        await fetch('/api/notifications/chat-push-flush', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 12 }),
        });
      } catch {
        // ignore queue recovery failures
      } finally {
        chatPushFlushInFlightRef.current = false;
      }
    };

    // 안 읽은 알림 재발송(repush)은 KST 09:00 cron(unread-notification-repush)에서 1회만 처리.
    // 채팅 메시지는 재알림 대상에서 제외되며, 공지/전자결재 등 중요 알림만 다음날 09시에 재발송됨.
    // → 클라이언트에서 5분 interval / focus / online으로 호출하던 로직은 제거 (사용자 알림 중복 제거 목적).

    let chatSyncTimer: number | null = null;
    const handleChatSync = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      if (customEvent.detail?.action !== 'message-sent') return;
      if (chatSyncTimer) {
        window.clearTimeout(chatSyncTimer);
      }
      chatSyncTimer = window.setTimeout(() => {
        chatSyncTimer = null;
        void flushPendingChatPushQueue();
      }, 2500);
    };

    void flushPendingChatPushQueue();
    window.addEventListener('focus', flushPendingChatPushQueue);
    window.addEventListener('online', flushPendingChatPushQueue);
    window.addEventListener('erp-chat-sync', handleChatSync as EventListener);

    return () => {
      if (chatSyncTimer) {
        window.clearTimeout(chatSyncTimer);
      }
      window.removeEventListener('focus', flushPendingChatPushQueue);
      window.removeEventListener('online', flushPendingChatPushQueue);
      window.removeEventListener('erp-chat-sync', handleChatSync as EventListener);
    };
  }, [effectiveUserId]);

  useEffect(() => () => { timersRef.current.forEach(t => clearTimeout(t)); timersRef.current.clear(); }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[calc(env(safe-area-inset-top)+92px)] left-1/2 z-[999] flex w-[min(calc(100vw-24px),420px)] -translate-x-1/2 flex-col gap-2.5 items-center md:top-auto md:bottom-5 md:left-auto md:right-5 md:w-auto md:translate-x-0 md:flex-col-reverse md:items-end"
      aria-live="polite"
      aria-label="알림"
      data-testid="notification-toast-stack"
    >
      {toasts.map(notif => (
        <ToastCard key={notif.id} notif={notif} onClose={removeToast} onAction={n => onActionRef.current(n)} />
      ))}
    </div>
  );
}

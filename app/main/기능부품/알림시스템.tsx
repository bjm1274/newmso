'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { sound } from '@/lib/sounds';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';

/**
 * [실시간 알림 엔진 + KakaoTalk 스타일 Toast UI]
 * - DB 드리븐: 모든 알림은 notifications 테이블에 INSERT → Realtime 수신 → Toast 표시
 * - 직접 채널: approvals, inventory, payroll, education, messages, attendance → notifications 테이블에 자동 기록
 * - Toast: 우측 하단 슬라이드인, 7초 진행바, 빠른 액션, 최대 4개
 */

// ─── 알림 설정 (localStorage) ───
export interface NotifSettings {
  sound: boolean;
  vibration: boolean;
  dndEnabled: boolean;
  dndFrom: string;
  dndTo: string;
  types: Record<string, boolean>;
}

const DEFAULT_SETTINGS: NotifSettings = {
  sound: true, vibration: true, dndEnabled: false,
  dndFrom: '22:00', dndTo: '08:00',
  types: {
    message: true, mention: true, approval: true, payroll: true,
    inventory: true, attendance: true, board: true, 인사: true,
    education: true, notification: true,
  },
};

export function loadNotifSettings(): NotifSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem('erp_notif_settings');
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...p, types: { ...DEFAULT_SETTINGS.types, ...(p.types || {}) } };
  } catch { return DEFAULT_SETTINGS; }
}

function isInDND(s: NotifSettings): boolean {
  if (!s.dndEnabled) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = s.dndFrom.split(':').map(Number);
  const [th, tm] = s.dndTo.split(':').map(Number);
  const from = fh * 60 + fm, to = th * 60 + tm;
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

// ─── 타입별 스타일 ───
const TYPE_CFG: Record<string, { icon: string; bg: string; progress: string; accent: string }> = {
  message: { icon: '💬', bg: 'bg-blue-500', progress: 'bg-blue-400', accent: 'border-blue-400' },
  mention: { icon: '📣', bg: 'bg-indigo-500', progress: 'bg-indigo-400', accent: 'border-indigo-400' },
  approval: { icon: '📋', bg: 'bg-violet-600', progress: 'bg-violet-400', accent: 'border-violet-400' },
  payroll: { icon: '💰', bg: 'bg-emerald-600', progress: 'bg-emerald-400', accent: 'border-emerald-400' },
  inventory: { icon: '📦', bg: 'bg-orange-500', progress: 'bg-orange-400', accent: 'border-orange-400' },
  attendance: { icon: '⏰', bg: 'bg-teal-500', progress: 'bg-teal-400', accent: 'border-teal-400' },
  board: { icon: '📌', bg: 'bg-pink-500', progress: 'bg-pink-400', accent: 'border-pink-400' },
  인사: { icon: '👥', bg: 'bg-cyan-600', progress: 'bg-cyan-400', accent: 'border-cyan-400' },
  education: { icon: '📚', bg: 'bg-purple-500', progress: 'bg-purple-400', accent: 'border-purple-400' },
  notification: { icon: '🔔', bg: 'bg-[var(--toss-gray-4)]', progress: 'bg-[var(--toss-gray-3)]', accent: 'border-[var(--border)]' },
};
const DEFAULT_CFG = { icon: '🔔', bg: 'bg-[var(--toss-gray-4)]', progress: 'bg-[var(--toss-gray-3)]', accent: 'border-[var(--border)]' };
const getTypeCfg = (type: string) => TYPE_CFG[type] || DEFAULT_CFG;

function getInitials(name: string) {
  if (!name) return '?';
  const t = name.trim();
  if (/[\uAC00-\uD7A3]/.test(t[0])) return t[0];
  const parts = t.split(' ');
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : t.slice(0, 2).toUpperCase();
}

function timeAgo(ts: number) {
  const d = (Date.now() - ts) / 1000;
  if (d < 10) return '방금';
  if (d < 60) return `${Math.floor(d)}초 전`;
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  return `${Math.floor(d / 86400)}일 전`;
}

function setAppBadge(count: number) {
  try {
    if (typeof navigator === 'undefined') return;
    if (count > 0 && 'setAppBadge' in navigator) (navigator as any).setAppBadge(count).catch(() => { });
    else if (count === 0 && 'clearAppBadge' in navigator) (navigator as any).clearAppBadge().catch(() => { });
  } catch { /* ignore */ }
}

function vibrateIfSupported() {
  try { if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([100, 30, 100]); } catch { /* ignore */ }
}

function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

function uint8ArrayToBase64Url(value: ArrayBuffer | null | undefined) {
  if (!value) return '';
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getPushVapidStorageKey(staffId?: string) {
  return `erp_push_vapid_public_key:${staffId || 'guest'}`;
}

function getPushSubscriptionActiveKey(staffId?: string) {
  return `erp_push_subscription_active:${staffId || 'guest'}`;
}

function setPushSubscriptionActiveState(staffId: string | undefined, isActive: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (isActive) {
      window.localStorage.setItem(getPushSubscriptionActiveKey(staffId), '1');
      return;
    }
    window.localStorage.removeItem(getPushSubscriptionActiveKey(staffId));
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

async function syncPushSubscriptionOnServer(staffId: string | undefined, subscription: PushSubscriptionJSON & { fcm_token?: string | null }) {
  if (!staffId || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return;

  const response = await fetch('/api/notifications/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      fcm_token: subscription.fcm_token ?? null,
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

export async function initNotificationService(staffId?: string) {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (!window.isSecureContext) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    if (!reg || typeof reg !== 'object' || !('pushManager' in reg) || !reg.pushManager) {
      return;
    }
    if (Notification.permission === 'default') await Notification.requestPermission();
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
            if (fcmVapidKey) {
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
          }
          await syncPushSubscriptionOnServer(staffId, { ...j, fcm_token: fcmToken });
          window.localStorage.setItem(getPushVapidStorageKey(staffId), vapidKey);
          setPushSubscriptionActiveState(staffId, true);
        }
      } else {
        setPushSubscriptionActiveState(staffId, false);
      }
    } else {
      setPushSubscriptionActiveState(staffId, false);
    }
  } catch (e) {
    setPushSubscriptionActiveState(staffId, false);
    console.warn('SW 등록 건너뜀:', e);
  }
}

export function sendNotification(title: string, options?: NotificationOptions) {
  if (typeof window !== 'undefined' && Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { icon: '/sy-logo.png', badge: '/badge-72x72.png', tag: 'erp-noti', requireInteraction: false, ...options }));
    } else new Notification(title, options);
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
                ? 'text-blue-600 border-blue-300 hover:bg-blue-50'
                : isApproval
                  ? 'text-violet-600 border-violet-300 hover:bg-violet-50'
                  : 'text-orange-600 border-orange-300 hover:bg-orange-50'}`}>
            {isChat ? '💬 채팅 열기' : isApproval ? '📋 결재하기' : '📦 재고 확인'}
          </button>
        )}
      </div>
      {/* 닫기 */}
      <button type="button" onClick={e => { e.stopPropagation(); onClose(notif.id); }}
        className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-5)] hover:bg-[var(--tab-bg)] dark:hover:bg-gray-700 transition-all text-xs">✕</button>
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
  user: rawUser, onOpenChatRoom, onOpenMessage, onOpenApproval, onOpenInventory, onOpenBoard, onOpenPost,
}: {
  user: UserLike | null | undefined;
  onOpenChatRoom?: (roomId: string) => void;
  onOpenMessage?: (roomId: string, messageId: string) => void;
  onOpenApproval?: (intent?: Record<string, unknown>) => void;
  onOpenInventory?: (intent?: { view?: string | null; approvalId?: string | null }) => void;
  onOpenBoard?: (boardId?: string) => void;
  onOpenPost?: (boardId: string, postId: string) => void;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const lastHiddenRef = useRef(0);
  const didPrimeNotificationsRef = useRef(false);
  const mountedAtRef = useRef(new Date().toISOString());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const onActionRef = useRef<(n: ToastItem) => void>(() => { });
  const tabIdRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
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

  const claimCrossTabNotification = useCallback((scope: string, dedupeKey: string, ttlMs: number) => {
    if (!effectiveUserId) return true;
    return claimNotificationSlot(
      `erp_notification_${scope}:${effectiveUserId}:${dedupeKey}`,
      tabIdRef.current,
      ttlMs
    );
  }, [effectiveUserId]);

  const emitIncomingNotification = useCallback((row: Record<string, unknown>) => {
    if (!row?.id) return;
    const rowId = String(row.id);
    if (shownIdsRef.current.has(rowId)) return;
    shownIdsRef.current.add(rowId);

    const settings = loadNotifSettings();
    const type = String(row.type || 'notification');
    if (settings.types[type] === false) return;

    const rowMetadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata as Record<string, unknown> : {};

    addToast({
      id: rowId,
      title: String(row.title || '알림'),
      body: String(row.body || ''),
      type,
      senderName: rowMetadata.sender_name as string | undefined,
      data: rowMetadata,
    });

    if (typeof window !== 'undefined') {
      const evt = (type === 'message' || type === 'mention') ? 'erp-chat-notification' : 'erp-alert';
      window.dispatchEvent(new CustomEvent(evt, {
        detail: {
          title: row.title,
          body: row.body,
          type,
          room_id: rowMetadata.room_id,
          data: rowMetadata,
        },
      }));
      window.dispatchEvent(new CustomEvent('erp-new-notification', { detail: row }));
    }

    const isDND = isInDND(settings);
    if (settings.sound && !isDND) {
      if (type === 'message' || type === 'mention') sound.playTalk();
      else sound.playSystem();
    }
    if (settings.vibration && !isDND) vibrateIfSupported();

    const isChatType = type === 'message' || type === 'mention';
    const canShowNativeNotification = claimCrossTabNotification('display', rowId, 5000);
    if (canShowNativeNotification && (!isChatType || !hasPushSubscriptionActive(effectiveUserId))) {
      sendNotification(String(row.title || '알림'), { body: String(row.body || ''), tag: type, data: rowMetadata });
    }
    void syncBadge();
  }, [addToast, claimCrossTabNotification, effectiveUserId, syncBadge]);

  useEffect(() => {
    onActionRef.current = (notif: ToastItem) => {
      removeToast(notif.id);
      const t = notif.type;
      if ((t === 'message' || t === 'mention') && notif.data?.room_id) {
        if (notif.data.id && onOpenMessage) onOpenMessage(notif.data.room_id, notif.data.id);
        else if (onOpenChatRoom) onOpenChatRoom(notif.data.room_id);
      } else if (t === 'approval' && onOpenApproval) {
        const approvalView =
          typeof notif.data?.approval_view === 'string' && notif.data.approval_view.trim()
            ? notif.data.approval_view
            : undefined;
        onOpenApproval(approvalView ? { viewMode: approvalView } : undefined);
      }
      else if (t === 'inventory' && onOpenInventory) {
        onOpenInventory({
          view: notif.data?.approval_id ? '현황' : null,
          approvalId: notif.data?.approval_id || null,
        });
      }
      else if (t === 'board') {
        if (notif.data?.post_id && onOpenPost) onOpenPost(notif.data.board_type || '공지사항', notif.data.post_id);
        else if (onOpenBoard) onOpenBoard(notif.data?.board_type);
      } else if (t === 'notification' && notif.data?.post_id && onOpenPost) {
        onOpenPost(notif.data.board_type || '공지사항', notif.data.post_id);
      }
    };
  }, [removeToast, onOpenMessage, onOpenChatRoom, onOpenApproval, onOpenInventory, onOpenPost, onOpenBoard]);

  // ─── Supabase Realtime 구독 ───
  useEffect(() => {
    if (!effectiveUserId) return;
    initNotificationService(effectiveUserId);
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
      if (dedupeKey && !claimCrossTabNotification('write', dedupeKey, dedupeWindowMs)) {
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

      const { data: inserted, error } = await supabase
        .from('notifications')
        .insert([insertPayload])
        .select()
        .single();

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
    const nTableChannel = supabase.channel(`noti-db-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (payload: Record<string, unknown>) => {
        emitIncomingNotification(payload.new as Record<string, unknown>);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => syncBadge())
      .subscribe();

    // B. 결재 트리거 (채널명에 uid 포함 → 크로스유저 알림 누수 방지)
    const approvalsCh = supabase.channel(`approvals-trigger-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'approvals' }, (p: any) => {
        if (String(p.new.current_approver_id) === uid && p.new.status === '대기')
          insertNoti(
            { type: 'approval', title: `📋 새 결재 요청: ${p.new.title}`, body: `${p.new.sender_name || '신청자'}님이 결재를 요청했습니다.`, data: { id: p.new.id, type: 'approval' } },
            `approval:insert:${String(p.new.id)}:${uid}`
          );
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'approvals' }, (p: any) => {
        const nextApproverId = String(p.new.current_approver_id || '');
        const prevApproverId = String(p.old?.current_approver_id || '');
        const nextStatus = String(p.new.status || '');
        const prevStatus = String(p.old?.status || '');
        if (
          nextApproverId === uid &&
          nextStatus === '대기' &&
          (prevApproverId !== nextApproverId || prevStatus !== nextStatus)
        )
          insertNoti(
            { type: 'approval', title: `📋 결재 차례: ${p.new.title}`, body: `${p.new.sender_name || '신청자'} 문서의 결재 순서입니다.`, data: { id: p.new.id, type: 'approval' } },
            `approval:update:${String(p.new.id)}:${nextApproverId}:${nextStatus}`
          );
      })
      .subscribe();

    // C. 재고 부족
    const inventoryCh = supabase.channel(`inventory-trigger-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory' }, (p: any) => {
        const nextStock = Number(p.new.stock || 0);
        const nextMinStock = Number(p.new.min_stock || 0);
        const prevStock = Number(p.old?.stock ?? Number.POSITIVE_INFINITY);
        const prevMinStock = Number(p.old?.min_stock ?? nextMinStock);
        const enteredLowStock = nextStock <= nextMinStock && (prevStock > prevMinStock || prevMinStock !== nextMinStock);
        if (enteredLowStock && (user?.permissions?.inventory || user?.department === '행정팀'))
          insertNoti(
            { type: 'inventory', title: `⚠️ 재고 부족 경고`, body: `${p.new.item_name || p.new.name}: 현재 ${p.new.stock}개 (최소 ${p.new.min_stock}개)`, data: { id: p.new.id, type: 'inventory' } },
            `inventory:low:${String(p.new.id)}:${nextStock}:${nextMinStock}`,
            60000
          );
      })
      .subscribe();

    // D. 급여 정산
    const payrollCh = supabase.channel(`payroll-trigger-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payroll_records' }, (p: any) => {
        if (String(p.new.staff_id) === uid)
          insertNoti(
            { type: 'payroll', title: `💰 급여 정산 완료`, body: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 급여가 정산되었습니다.`, data: { id: p.new.id, type: 'payroll' } },
            `payroll:${String(p.new.id)}`,
            60000
          );
      })
      .subscribe();

    // E. 교육 기한 임박
    const educationCh = supabase.channel(`education-trigger-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'education_records' }, (p: any) => {
        const daysLeft = Math.ceil((new Date(p.new.deadline).getTime() - Date.now()) / 86400000);
        const previousDaysLeft = p.old?.deadline
          ? Math.ceil((new Date(p.old.deadline).getTime() - Date.now()) / 86400000)
          : Number.POSITIVE_INFINITY;
        if (daysLeft <= 7 && daysLeft > 0 && previousDaysLeft > 7 && String(p.new.staff_id) === uid)
          insertNoti(
            { type: 'education', title: `📚 교육 이수 기한 임박`, body: `${p.new.education_name}: ${daysLeft}일 남았습니다.`, data: { id: p.new.id, type: 'education' } },
            `education:deadline:${String(p.new.id)}`,
            3600000
          );
      })
      .subscribe();

    // F. 채팅 메시지
    const messagesCh = supabase.channel(`messages-trigger-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p: any) => {
        if (useServerSideChatNotifications) return;
        const msg = p.new;
        if (String(msg.sender_id) === uid) return;
        const [roomRes, senderRes] = await Promise.all([
          supabase.from('chat_rooms').select('type, members').eq('id', msg.room_id).maybeSingle(),
          msg.sender_id ? supabase.from('staff_members').select('name').eq('id', msg.sender_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        ]);
        if (roomRes.error || !roomRes.data) return;
        const members: string[] = Array.isArray(roomRes.data?.members) ? roomRes.data.members.map((id: string) => String(id)) : [];
        const isNoticeRoom = String(msg.room_id) === '00000000-0000-0000-0000-000000000000' || roomRes.data?.type === 'notice';
        const canReceive = isNoticeRoom || members.includes(uid);
        if (!canReceive) return;
        const senderName = (senderRes.data as any)?.name || '알 수 없음';
        const content = (msg.content || '').trim();
        const isMention = user?.name && content.includes(`@${String(user.name)}`);
        insertNoti({
          type: isMention ? 'mention' : 'message',
          title: isMention ? `📣 ${senderName}님이 멘션` : senderName,
          body: (content || '📎 파일').slice(0, 80),
          senderName,
          data: { room_id: msg.room_id, id: msg.id, sender_name: senderName },
        }, `message:${String(msg.id)}`);
      })
      .subscribe();

    // G. 출퇴근
    const attendanceCh = supabase.channel(`attendance-trigger-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, (p: any) => {
        if (String(p.new?.staff_id) !== uid) return;
        const s = p.new.status; const isOut = p.new.check_out != null;
        const statusKey = isOut ? 'checkout' : s === '지각' ? 'late' : 'checkin';
        insertNoti({
          type: 'attendance',
          title: s === '지각' ? '⏰ 지각 등록' : isOut ? '⏰ 퇴근 처리됨' : '⏰ 출근 처리됨',
          body: s === '지각' ? '오늘 출근이 지각으로 기록되었습니다.' : isOut ? '퇴근이 기록되었습니다.' : '정상 출근이 기록되었습니다.',
          data: { id: p.new.id, type: 'attendance' },
        }, `attendance:${String(p.new.id)}:${statusKey}`, 60000);
      })
      .subscribe();

    // H. 마스터 전용 — 단어 필터 감지 알림
    const isMaster = isNamedSystemMasterAccount(user);
    const wordFilterCh = isMaster
      ? supabase.channel(`word-filter-master-${uid}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p: any) => {
            const content: string = String(p.new?.content || '');
            if (!content) return;
            try {
              const raw = localStorage.getItem('erp-banned-words');
              const banned: string[] = raw ? JSON.parse(raw) : [];
              if (!banned.length) return;
              const matched = banned.filter((w) => content.toLowerCase().includes(w.toLowerCase()));
              if (!matched.length) return;
              insertNoti(
                {
                  type: 'notification',
                  title: `🔍 단어 필터 감지`,
                  body: `필터 단어 "${matched[0]}" 포함 메시지가 발송되었습니다.`,
                  data: { type: 'word_filter', room_id: p.new?.room_id, message_id: p.new?.id },
                },
                `word-filter:${String(p.new?.id)}`,
              );
            } catch { /* ignore */ }
          })
          .subscribe()
      : null;

    const channels = [nTableChannel, approvalsCh, inventoryCh, payrollCh, educationCh, messagesCh, attendanceCh, ...(wordFilterCh ? [wordFilterCh] : [])];

    if (!didPrimeNotificationsRef.current) {
      didPrimeNotificationsRef.current = true;
      supabase
        .from('notifications')
        .select('id')
        .eq('user_id', uid)
        .lt('created_at', mountedAt)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data: rows }) => {
          rows?.forEach((row: Record<string, unknown>) => {
            if (row?.id) shownIdsRef.current.add(String(row.id));
          });
        });
    }

    // 초기 렌더와 realtime 구독 사이에 들어온 unread 알림을 놓치지 않도록 한 번 더 보강 조회합니다.
    supabase
      .from('notifications')
      .select('id,title,body,type,metadata,read_at,created_at')
      .eq('user_id', uid)
      .gte('created_at', mountedAt)
      .order('created_at', { ascending: true })
      .limit(20)
      .then(({ data: rows }) => {
        rows?.forEach((row: Record<string, unknown>) => {
          if (!row?.read_at) emitIncomingNotification(row);
        });
        void syncBadge();
      });

    const fallbackPoll = setInterval(() => {
      supabase
        .from('notifications')
        .select('id,title,body,type,metadata,read_at,created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data: rows }) => {
          rows?.forEach((row: Record<string, unknown>) => {
            if (!row?.read_at) emitIncomingNotification(row);
          });
          void syncBadge();
        });
    }, 5000);

    // 30초 헬스체크
    const hc = setInterval(() => {
      channels.forEach(ch => { try { const s = (ch as any).state; if (s === 'closed' || s === 'errored') ch.subscribe(); } catch { /* ignore */ } });
    }, 30_000);

    return () => {
      clearInterval(hc);
      clearInterval(fallbackPoll);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user?.department, user?.name, user?.permissions?.inventory, claimCrossTabNotification, effectiveUserId, emitIncomingNotification, syncBadge]);

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

  useEffect(() => () => { timersRef.current.forEach(t => clearTimeout(t)); timersRef.current.clear(); }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-1/2 z-[999] flex w-[min(calc(100vw-24px),420px)] -translate-x-1/2 flex-col gap-2.5 items-center md:top-auto md:bottom-5 md:left-auto md:right-5 md:w-auto md:translate-x-0 md:flex-col-reverse md:items-end"
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

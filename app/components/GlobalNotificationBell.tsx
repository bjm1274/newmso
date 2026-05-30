'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  FileText,
  Package,
  Wallet,
  GraduationCap,
  MessageCircle,
  Clock,
  Users,
  ClipboardList,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  buildApprovalNotificationHref,
  buildBoardNotificationHref,
  buildChatNotificationHref,
  buildInventoryNotificationHref,
  buildMenuNotificationHref,
  resolveNotificationOpenMenu,
} from '@/lib/notification-metadata';
import { NOTIFICATION_LIST_UPDATED_EVENT } from '@/app/main/기능부품/알림시스템';

const TYPE_ICONS: Record<string, LucideIcon> = {
  approval: FileText,
  inventory: Package,
  payroll: Wallet,
  education: GraduationCap,
  mention: MessageCircle,
  attendance: Clock,
  인사: Users,
  board: ClipboardList,
  system: Settings,
  default: Bell,
};

type NotificationBellUser = {
  id?: string | null;
};

type NotificationItem = {
  id: string;
  user_id?: string | null;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  is_read?: boolean | null;
  metadata?: {
    room_id?: string | null;
    [key: string]: unknown;
  } | null;
  created_at?: string | null;
};

const NOTIFICATION_SELECT = 'id, user_id, type, title, body, read_at, metadata, created_at';

/** unknown payload를 NotificationItem으로 안전하게 정규화 (JM4)
 *  - is_read 컬럼이 없는 경우(read_at만 있는 경우) read_at 존재 여부로 파생.
 */
function normalizePayload(raw: unknown): NotificationItem | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  let isRead: boolean | null = null;
  if (typeof r.is_read === 'boolean') {
    isRead = r.is_read;
  } else if (typeof r.read_at === 'string' && r.read_at) {
    isRead = true;
  } else if (r.read_at === null) {
    isRead = false;
  }
  return {
    id: r.id,
    user_id: typeof r.user_id === 'string' ? r.user_id : null,
    type: typeof r.type === 'string' ? r.type : null,
    title: typeof r.title === 'string' ? r.title : null,
    body: typeof r.body === 'string' ? r.body : null,
    is_read: isRead,
    metadata: r.metadata !== null && typeof r.metadata === 'object'
      ? (r.metadata as NotificationItem['metadata'])
      : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : null,
  };
}

export default function GlobalNotificationBell({
  user,
  onOpenFull,
}: {
  user: NotificationBellUser | null;
  onOpenFull: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastFetchedAtRef = useRef<number>(0);
  const router = useRouter();

  // 브라우저 Notification API 지원 여부 + 현재 권한 상태 초기화 (JM5: 명시적 제스처 후 요청)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    // prevIds를 closure에 담아 변경 감지 시 diff 수행 (toast 발화 판정용)
    let prevIds: Set<string> = new Set();
    let isPrimed = false;

    // JM4: unknown payload를 안전하게 NotificationItem[]로 정규화
    const normalizeList = (raw: unknown): NotificationItem[] => {
      if (!Array.isArray(raw)) return [];
      const normalized: NotificationItem[] = [];
      for (const entry of raw) {
        const item = normalizePayload(entry);
        if (item) normalized.push(item);
      }
      return normalized;
    };

    const applyList = (nextList: NotificationItem[]) => {
      lastFetchedAtRef.current = Date.now();
      // 상위 10건만 화면에 사용
      const slim = nextList.slice(0, 10);
      setList(slim);
      setUnreadCount(slim.filter((item) => !item.is_read).length);

      // toast: 이전 id 셋에 없던 항목이면 가장 최신 1건만 알림
      if (isPrimed) {
        const newItems = slim.filter((item) => !prevIds.has(item.id));
        if (newItems.length > 0) {
          const newest = newItems[0];
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(newest.title || '새 알림', {
                body: newest.body || '확인할 새 알림이 있습니다.',
                icon: '/sy-logo.png',
              });
            } catch {
              // ignore browser notification failures
            }
          }
          setToastNotification(newest);
          if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
          toastTimerRef.current = window.setTimeout(() => setToastNotification(null), 5000);
        }
      }
      prevIds = new Set(slim.map((item) => item.id));
      isPrimed = true;
    };

    // mount 시 1회 초기 fetch — NotificationSystem 미마운트 화면(로그인 직후 등)에서도 안전.
    // 이후 갱신은 NOTIFICATION_LIST_UPDATED_EVENT 또는 visibility/SW 트리거로 수행 (JM2).
    const fetchOnce = async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select(NOTIFICATION_SELECT)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);
        applyList(normalizeList(data));
      } catch {
        // ignore — 다음 이벤트/visibility로 다시 갱신
      }
    };

    void fetchOnce();

    // JM3: SSR/구형 브라우저에서도 안전하도록 window 가드.
    if (typeof window === 'undefined') {
      return () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      };
    }

    // NotificationSystem이 broadcast하는 전체 list를 수신해 자기 상태 갱신.
    const handleListUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ notifications?: unknown }>).detail;
      const nextList = normalizeList(detail?.notifications);
      applyList(nextList);
    };
    window.addEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handleListUpdated as EventListener);

    // visibility 복귀 시 짧은 cooldown(5초) 후 1회 즉시 fetch — push 누락 보완.
    const handleVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchedAtRef.current < 5000) return;
      void fetchOnce();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // SW push 메시지 직접 수신 → 즉시 fetch (NotificationSystem이 없는 화면에서도 동작).
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string } | null;
      if (message?.type === 'erp-push-preview') {
        if (Date.now() - lastFetchedAtRef.current < 1500) return;
        void fetchOnce();
      }
    };
    let swSupported = false;
    if ('serviceWorker' in navigator) {
      try {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        swSupported = true;
      } catch {
        swSupported = false;
      }
    }

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      window.removeEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handleListUpdated as EventListener);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (swSupported) {
        try {
          navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
        } catch {
          // ignore
        }
      }
    };
  }, [user?.id]);

  useEffect(() => {
    const onOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, []);

  const markRead = useCallback(async (id: string) => {
    // D1 정본 스키마는 read_at 컬럼만 존재 (is_read 컬럼 없음)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setList((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNotificationClick = useCallback((notification: NotificationItem) => {
    if (!notification.is_read) {
      void markRead(notification.id);
    }

    setOpen(false);
    setToastNotification(null);

    const metadata = notification.metadata || {};

    if (notification.type === 'message' || notification.type === 'mention') {
      router.push(buildChatNotificationHref(metadata));
      return;
    }

    if (resolveNotificationOpenMenu(metadata) === '관리자') {
      router.push(buildMenuNotificationHref(metadata, '관리자'));
      return;
    }

    if (notification.type === 'approval') {
      router.push(buildApprovalNotificationHref(metadata));
      return;
    }

    if (notification.type === 'inventory') {
      router.push(buildInventoryNotificationHref(metadata));
      return;
    }

    if (
      notification.type === 'payroll' ||
      notification.type === 'education' ||
      notification.type === '인사' ||
      notification.type === 'attendance'
    ) {
      router.push('/main?open_menu=인사관리');
      return;
    }

    if (notification.type === 'board' || (notification.type === 'notification' && metadata.post_id)) {
      router.push(buildBoardNotificationHref(metadata));
    }
  }, [markRead, router]);

  return (
    <>
      {toastNotification && (
        <div
          className="fixed left-1/2 top-4 z-[9999] w-[90%] max-w-[360px] -translate-x-1/2 cursor-pointer"
          onClick={() => handleNotificationClick(toastNotification)}
        >
          <div className="flex gap-3 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-2xl animate-in slide-in-from-top-10 fade-in duration-300">
            {(() => { const ToastIcon = TYPE_ICONS[toastNotification.type || ''] ?? TYPE_ICONS.default; return <ToastIcon className="h-6 w-6 shrink-0 text-[var(--accent)]" />; })()}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--foreground)]">{toastNotification.title || '새 알림'}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--toss-gray-3)]">{toastNotification.body}</p>
            </div>
            <button
              type="button"
              aria-label="알림 닫기"
              onClick={(event) => {
                event.stopPropagation();
                setToastNotification(null);
              }}
              className="self-start border-0 bg-transparent p-1 text-[var(--toss-gray-2)] hover:text-[var(--toss-gray-4)]"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="relative flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-[12px] p-2 text-[var(--toss-gray-3)] transition-all hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)]"
          aria-label="알림"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-[190] md:hidden" onClick={() => setOpen(false)} />
            <div className="absolute bottom-[calc(100%+12px)] right-0 z-[200] mt-0 flex max-h-[60vh] w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 sm:w-[320px] md:left-0 md:right-auto md:top-full md:mt-1 md:max-h-[400px] md:rounded-[16px] md:slide-in-from-top-2">
              <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--toss-border)] p-4 md:p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[var(--foreground)]">실시간 알림</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">읽지 않음 {unreadCount}건</span>
                  )}
                </div>
                {notifPermission === 'default' && (
                  <button
                    type="button"
                    aria-label="브라우저 알림 권한 허용"
                    onClick={async () => {
                      try {
                        const result = await Notification.requestPermission();
                        setNotifPermission(result);
                      } catch {
                        // 권한 요청 실패 시 무시 (JM3)
                      }
                    }}
                    className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                  >
                    알림 받기
                  </button>
                )}
                {notifPermission === 'denied' && (
                  <p className="text-[10px] text-[var(--toss-gray-3)]">
                    브라우저 설정에서 알림을 허용해 주세요.
                  </p>
                )}
              </div>

              <div className="custom-scrollbar max-h-[60vh] flex-1 overflow-y-auto md:max-h-[320px]">
                {list.length === 0 ? (
                  <div className="p-6 text-center text-xs font-bold text-[var(--toss-gray-3)]">알림이 없습니다.</div>
                ) : (
                  list.slice(0, 8).map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full border-b border-[var(--toss-gray-1)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--toss-gray-1)] ${!notification.is_read ? 'bg-[var(--toss-blue-light)]/50' : ''}`}
                    >
                      <div className="flex gap-2">
                        {(() => { const ListIcon = TYPE_ICONS[notification.type || ''] ?? TYPE_ICONS.default; return <ListIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />; })()}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-bold text-[var(--foreground)]">{notification.title}</p>
                          <p className="line-clamp-2 text-[10px] text-[var(--toss-gray-3)]">{notification.body}</p>
                          <p className="mt-0.5 text-[9px] text-[var(--toss-gray-3)]">
                            {notification.created_at
                              ? new Date(notification.created_at).toLocaleString('ko-KR', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </p>
                        </div>
                        {!notification.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--toss-blue)]" />}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="shrink-0 border-t border-[var(--toss-border)] bg-[var(--toss-card)] p-2">
                <button
                  type="button"
                  onClick={() => {
                    onOpenFull();
                    setOpen(false);
                  }}
                  className="w-full rounded-[12px] py-3 text-xs font-bold text-[var(--toss-blue)] transition-colors hover:bg-[var(--toss-blue-light)] md:py-2"
                >
                  전체 보기
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

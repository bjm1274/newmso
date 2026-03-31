'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const TYPE_ICONS: Record<string, string> = {
  approval: '📝',
  inventory: '📦',
  payroll: '💰',
  education: '🎓',
  mention: '💬',
  attendance: '🕒',
  인사: '👥',
  board: '📌',
  default: '🔔',
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

const NOTIFICATION_SELECT = 'id, user_id, type, title, body, is_read, metadata, created_at';

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
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!user?.id) return;

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    const fetchList = async () => {
      const { data } = await supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const nextList = Array.isArray(data) ? (data as NotificationItem[]) : [];
      setList(nextList);
      setUnreadCount(nextList.filter((item) => !item.is_read).length);
    };

    void fetchList();

    const channel = supabase
      .channel('global-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${String(user.id)}` },
        (payload) => {
          const newNotification = payload.new as NotificationItem;

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(newNotification.title || '새 알림', {
                body: newNotification.body || '확인할 새 알림이 있습니다.',
                icon: '/sy-logo.png',
              });
            } catch {
              // ignore browser notification failures
            }
          }

          setToastNotification(newNotification);
          window.setTimeout(() => setToastNotification(null), 5000);
          void fetchList();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${String(user.id)}` },
        () => {
          void fetchList();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setList((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNotificationClick = useCallback((notification: NotificationItem) => {
    if (!notification.is_read) {
      void markRead(notification.id);
    }

    setOpen(false);
    setToastNotification(null);

    if (notification.metadata?.room_id) {
      router.push(`/main?open_chat_room=${notification.metadata.room_id}`);
      return;
    }

    if (notification.type === 'approval') {
      router.push('/main?open_menu=전자결재');
      return;
    }

    if (notification.type === 'inventory') {
      router.push('/main?open_menu=재고관리');
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

    if (notification.type === 'board') {
      const isCondolenceBoard =
        String(notification.title || '').includes('경조사') ||
        String(notification.body || '').includes('경조사');
      router.push(isCondolenceBoard ? '/main?open_menu=게시판&open_board=경조사' : '/main?open_menu=게시판');
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
            <span className="shrink-0 text-2xl">{TYPE_ICONS[toastNotification.type || ''] || TYPE_ICONS.default}</span>
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
          <span className="text-xl">🔔</span>
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
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--toss-border)] p-4 md:p-3">
                <span className="text-xs font-black text-[var(--foreground)]">실시간 알림</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">읽지 않음 {unreadCount}건</span>
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
                        <span className="shrink-0 text-base">{TYPE_ICONS[notification.type || ''] || TYPE_ICONS.default}</span>
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

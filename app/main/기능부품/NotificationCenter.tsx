'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { sound } from '@/lib/sounds';

const TYPE_CFG: Record<string, { icon: string; color: string; label: string }> = {
  message: { icon: '💬', color: 'text-blue-500', label: '채팅' },
  mention: { icon: '@', color: 'text-indigo-500', label: '멘션' },
  approval: { icon: '📝', color: 'text-violet-600', label: '전자결재' },
  payroll: { icon: '💰', color: 'text-emerald-600', label: '급여' },
  inventory: { icon: '📦', color: 'text-orange-500', label: '재고' },
  attendance: { icon: '⏰', color: 'text-teal-500', label: '근태' },
  board: { icon: '📋', color: 'text-pink-500', label: '게시판' },
  hr: { icon: '👥', color: 'text-cyan-600', label: '인사' },
  인사: { icon: '👥', color: 'text-cyan-600', label: '인사' },
  education: { icon: '📚', color: 'text-purple-500', label: '교육' },
  default: { icon: '🔔', color: 'text-[var(--toss-gray-4)]', label: '알림' },
};

const getTypeCfg = (type: string) => TYPE_CFG[type] || TYPE_CFG.default;

function timeAgo(dateStr: string) {
  const elapsedSeconds = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (elapsedSeconds < 60) return '방금 전';
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}분 전`;
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}시간 전`;
  if (elapsedSeconds < 604800) return `${Math.floor(elapsedSeconds / 86400)}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

function buildInventoryNotificationHref(metadata: Record<string, any>) {
  const params = new URLSearchParams({
    open_menu: '재고관리',
  });

  if (metadata?.approval_id) {
    params.set('open_inventory_view', '현황');
    params.set('open_inventory_approval', String(metadata.approval_id));
  }

  return `/main?${params.toString()}`;
}

export default function NotificationCenter({
  user,
  onOpenMenu,
}: {
  user: any;
  onOpenMenu?: (menuId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellShaking, setBellShaking] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const prevCountRef = useRef(0);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const list = data || [];
    setNotifications(list);

    const unread = list.filter((notification: any) => !notification.read_at).length;
    setUnreadCount(unread);
    return unread;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    void fetchNotifications();

    const handleNewNotification = async () => {
      const unread = await fetchNotifications();
      if (typeof unread === 'number' && unread > prevCountRef.current) {
        setBellShaking(true);
        setTimeout(() => setBellShaking(false), 700);
      }
      prevCountRef.current = typeof unread === 'number' ? unread : prevCountRef.current;
    };

    const handleClickOutside = (event: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('erp-new-notification', handleNewNotification);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });

    const fallbackPoll = window.setInterval(() => {
      void fetchNotifications();
    }, 10000);

    return () => {
      window.removeEventListener('erp-new-notification', handleNewNotification);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.clearInterval(fallbackPoll);
    };
  }, [user?.id, fetchNotifications]);

  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current > 0) {
      setBellShaking(true);
      setTimeout(() => setBellShaking(false), 700);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    const readAt = new Date().toISOString();
    await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', user.id)
      .is('read_at', null);

    setNotifications((prev) => prev.map((notification) => ({
      ...notification,
      read_at: notification.read_at || readAt,
    })));
    setUnreadCount(0);
    sound.playSystem();
  }, [user?.id]);

  const markAsRead = useCallback(async (id: string) => {
    const readAt = new Date().toISOString();
    await supabase.from('notifications').update({ read_at: readAt }).eq('id', id);
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, read_at: readAt } : notification
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const openMyPage = useCallback(() => {
    if (onOpenMenu) {
      onOpenMenu('내정보');
      return;
    }
    router.push('/main?open_menu=내정보');
  }, [onOpenMenu, router]);

  const openMyNotifications = useCallback(() => {
    if (onOpenMenu) {
      onOpenMenu('알림');
      return;
    }
    router.push('/main?open_menu=알림');
  }, [onOpenMenu, router]);

  const handleNotiClick = useCallback((notification: any) => {
    if (!notification.read_at) {
      void markAsRead(notification.id);
    }

    setIsOpen(false);

    const meta = notification.metadata || {};
    if (notification.type === 'message' || notification.type === 'mention') {
      router.push(meta.room_id ? `/main?open_chat_room=${meta.room_id}` : '/main?open_menu=채팅');
      return;
    }

    if (notification.type === 'approval') {
      router.push('/main?open_menu=전자결재');
      return;
    }

    if (notification.type === 'inventory') {
      router.push(buildInventoryNotificationHref(meta));
      return;
    }

    if (
      notification.type === 'payroll' ||
      notification.type === 'education' ||
      notification.type === 'attendance' ||
      notification.type === 'hr' ||
      notification.type === '인사'
    ) {
      openMyNotifications();
      return;
    }

    if (notification.type === 'board') {
      router.push('/main?open_menu=게시판');
      return;
    }

    openMyPage();
  }, [markAsRead, openMyNotifications, openMyPage, router]);

  const unread = useMemo(
    () => notifications.filter((notification) => !notification.read_at),
    [notifications]
  );
  const read = useMemo(
    () => notifications.filter((notification) => !!notification.read_at),
    [notifications]
  );

  return (
    <div className="relative z-[260]" ref={dropdownRef} data-testid="notification-center">
      <button
        type="button"
        data-testid="notification-bell"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) void fetchNotifications();
          if (!isOpen) sound.playSystem();
        }}
        className="relative p-2.5 rounded-[var(--radius-lg)] hover:bg-[var(--muted)] transition-all group touch-manipulation"
        aria-label="알림"
      >
        <span
          className={`text-2xl block ${bellShaking ? 'animate-bell-shake' : ''}`}
          style={{ transformOrigin: 'top center' }}
        >
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-black rounded-[var(--radius-md)] border-2 border-[var(--card)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute bottom-[calc(100%+12px)] right-0 w-[min(20rem,calc(100vw-16px))] max-w-[calc(100vw-16px)] bg-[var(--card)]/95 backdrop-blur-xl border border-[var(--border)] rounded-[var(--radius-xl)] shadow-sm z-[320] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-bottom-right md:bottom-auto md:top-0 md:left-[calc(100%+12px)] md:right-auto md:w-80 md:max-w-none md:origin-top-left"
          data-testid="notification-dropdown"
        >
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[13px] text-[var(--foreground)]">알림</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-[var(--radius-md)]">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-bold text-[var(--accent)] hover:underline"
              >
                모두 읽음
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-3xl mb-2 opacity-20">🔕</p>
                <p className="text-xs text-[var(--toss-gray-3)] font-medium">받은 알림이 없습니다.</p>
              </div>
            ) : (
              <>
                {unread.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-[var(--muted)]/60 sticky top-0">
                      <span className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">
                        새 알림 {unread.length}건
                      </span>
                    </div>
                    {unread.map((notification) => {
                      const cfg = getTypeCfg(notification.type);
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          data-testid={`notification-item-${notification.id}`}
                          onClick={() => handleNotiClick(notification)}
                          className="w-full text-left px-4 py-3 flex gap-3 hover:bg-[var(--muted)] transition-colors border-b border-[var(--border)]/50 bg-[var(--toss-blue-light)]/20 last:border-0 group"
                        >
                          <span className={`text-xl shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-1">
                              <p className="text-[12px] font-bold text-[var(--foreground)] truncate flex-1">
                                {notification.title}
                              </p>
                              <span className="text-[9px] text-[var(--toss-gray-3)] shrink-0 mt-0.5">
                                {timeAgo(notification.created_at)}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold mt-0.5">
                              {cfg.label}
                            </p>
                            {notification.body && (
                              <p className="text-[11px] text-[var(--toss-gray-4)] line-clamp-2 mt-0.5 leading-relaxed">
                                {notification.body}
                              </p>
                            )}
                          </div>
                          <span className="w-2 h-2 bg-[var(--accent)] rounded-full shrink-0 mt-2 animate-pulse" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {read.length > 0 && (
                  <div>
                    {unread.length > 0 && (
                      <div className="px-4 py-1.5 bg-[var(--muted)]/60 sticky top-0">
                        <span className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">
                          읽은 알림
                        </span>
                      </div>
                    )}
                    {read.map((notification) => {
                      const cfg = getTypeCfg(notification.type);
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          data-testid={`notification-item-${notification.id}`}
                          onClick={() => handleNotiClick(notification)}
                          className="w-full text-left px-4 py-3 flex gap-3 hover:bg-[var(--muted)] transition-colors border-b border-[var(--border)]/50 opacity-60 last:border-0"
                        >
                          <span className={`text-lg shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-1">
                              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] truncate flex-1">
                                {notification.title}
                              </p>
                              <span className="text-[9px] text-[var(--toss-gray-3)] shrink-0 mt-0.5">
                                {timeAgo(notification.created_at)}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold mt-0.5">
                              {cfg.label}
                            </p>
                            {notification.body && (
                              <p className="text-[10px] text-[var(--toss-gray-3)] line-clamp-1 mt-0.5">
                                {notification.body}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--muted)]/40 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openMyNotifications();
              }}
              className="text-[11px] font-bold text-[var(--accent)] hover:underline"
            >
              전체 알림 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

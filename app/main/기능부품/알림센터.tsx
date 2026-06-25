'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  Bell,
  BellOff,
  Check,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  MessageCircle,
  Package,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { sound } from '@/lib/sounds';
import {
  NOTIFICATION_MENU_LABELS,
  resolveNotificationTarget,
  toNotificationMetadataRecord,
} from '@/lib/notification-metadata';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { toNotificationText, timeAgo } from '@/lib/notification-utils';
import {
  countUnreadNotifications,
  deleteNotificationById,
  emitNotificationReadEvent,
  fetchNotificationList,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NOTIFICATION_LIST_UPDATED_EVENT,
} from './알림시스템/notification-api';
import { SwipeableCard, type SwipeAction } from '@/app/components/SwipeableCard';
import { useIsMobile } from '@/app/components/useIsMobile';

// 알림 타입별 Lucide 아이콘 매핑 — 이모지 대신 사용해 플랫폼 간 렌더 차이 제거 (P2-3, T-006)
const TYPE_CFG: Record<string, { Icon: LucideIcon; color: string; label: string }> = {
  message: { Icon: MessageCircle, color: 'text-blue-500', label: '채팅' },
  mention: { Icon: AtSign, color: 'text-indigo-500', label: '멘션' },
  approval: { Icon: FileText, color: 'text-violet-600', label: '전자결재' },
  payroll: { Icon: Wallet, color: 'text-emerald-600', label: '급여' },
  inventory: { Icon: Package, color: 'text-orange-500', label: '재고' },
  attendance: { Icon: Clock, color: 'text-teal-500', label: '근태' },
  board: { Icon: ClipboardList, color: 'text-pink-500', label: '게시판' },
  hr: { Icon: Users, color: 'text-cyan-600', label: '인사' },
  인사: { Icon: Users, color: 'text-cyan-600', label: '인사' },
  education: { Icon: GraduationCap, color: 'text-purple-500', label: '교육' },
  default: { Icon: Bell, color: 'text-[var(--toss-gray-4)]', label: '알림' },
};

const getTypeCfg = (type: string) => TYPE_CFG[type] || TYPE_CFG.default;


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
  const isMobile = useIsMobile();
  const normalizedUser = useMemo(
    () => normalizeStaffLike((user ?? {}) as Record<string, unknown>),
    [user]
  );
  const [resolvedUser, setResolvedUser] = useState<Record<string, unknown> | null>(() => {
    const directId = getStaffLikeId(normalizedUser);
    return directId ? normalizedUser : null;
  });
  const effectiveUser = (resolvedUser || normalizedUser) as Record<string, unknown>;
  const effectiveUserId = getStaffLikeId(effectiveUser);

  useEffect(() => {
    let cancelled = false;

    const syncUserIdentity = async () => {
      const directId = getStaffLikeId(normalizedUser);
      if (directId) {
        setResolvedUser(normalizedUser);
        return;
      }

      if (!normalizedUser?.name && !normalizedUser?.employee_no && !normalizedUser?.auth_user_id) {
        setResolvedUser(normalizedUser);
        return;
      }

      const recoveredUser = await resolveStaffLike(normalizedUser);
      if (!cancelled) {
        setResolvedUser(recoveredUser as Record<string, unknown>);
      }
    };

    void syncUserIdentity();
    return () => {
      cancelled = true;
    };
  }, [normalizedUser?.id, normalizedUser?.name, normalizedUser?.employee_no, normalizedUser?.auth_user_id]);

  const fetchNotifications = useCallback(async () => {
    if (!effectiveUserId) return;

    try {
      const [totalUnread, list] = await Promise.all([
        fetchUnreadNotificationCount(),
        fetchNotificationList(50),
      ]);

      setNotifications(list);

      const unread = totalUnread ?? countUnreadNotifications(list);
      setUnreadCount(unread);
      return unread;
    } catch (err) {
      // 조회 실패는 다음 이벤트/폴링에서 보강 — 호출부(handleNewNotification)가 reject되지 않도록 흡수 (JM3)
      console.warn('[notification-center] fetch failed', err);
      return undefined;
    }
  }, [effectiveUserId]);

  useEffect(() => {
    if (!effectiveUserId) return;

    // JM2: NotificationSystem이 단일 polling 진실원. 알림센터는 mount 시 1회 fetch한 뒤
    // NOTIFICATION_LIST_UPDATED_EVENT로 broadcast된 전체 list를 받아 갱신한다.
    // (독자 10초 setInterval 폴링 제거 — 알림시스템의 단일폴링 설계와 통일.)
    void fetchNotifications();

    let shakeTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerShake = () => {
      setBellShaking(true);
      if (shakeTimer) clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => setBellShaking(false), 700);
    };

    // 새 알림 도착: 알림시스템이 dispatch한 row를 받아 shake만 트리거.
    // 실제 list/카운트 갱신은 뒤이어 오는 NOTIFICATION_LIST_UPDATED_EVENT가 담당.
    const handleNewNotification = () => triggerShake();

    // 알림시스템이 한 번 조회한 전체 list를 broadcast → 중복 fetch 없이 자기 상태 갱신.
    const handleListUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ notifications?: unknown }>).detail;
      const next = Array.isArray(detail?.notifications) ? (detail!.notifications as any[]) : null;
      if (!next) return;
      setNotifications(next);
      const unread = countUnreadNotifications(next);
      if (unread > prevCountRef.current) triggerShake();
      setUnreadCount(unread);
      prevCountRef.current = unread;
    };

    const handleNotificationRead = () => void fetchNotifications();

    const handleClickOutside = (event: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('erp-new-notification', handleNewNotification);
    window.addEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handleListUpdated as EventListener);
    window.addEventListener('erp-notification-read', handleNotificationRead);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });

    // visibility 복귀 시 1회 즉시 fetch — push/이벤트 누락 보완 (독자 폴링 대체).
    const handleVisibility = () => {
      if (document.hidden) return;
      void fetchNotifications();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (shakeTimer) clearTimeout(shakeTimer);
      window.removeEventListener('erp-new-notification', handleNewNotification);
      window.removeEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handleListUpdated as EventListener);
      window.removeEventListener('erp-notification-read', handleNotificationRead);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [effectiveUserId, fetchNotifications]);

  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current > 0) {
      setBellShaking(true);
      const timer = setTimeout(() => setBellShaking(false), 700);
      prevCountRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const markAllAsRead = useCallback(async () => {
    if (!effectiveUserId) return;

    const readAt = new Date().toISOString();
    await markAllNotificationsAsRead().catch(() => null);

    setNotifications((prev) => prev.map((notification) => ({
      ...notification,
      read_at: notification.read_at || readAt,
    })));
    setUnreadCount(0);
    emitNotificationReadEvent();
    sound.playSystem();
  }, [effectiveUserId]);

  const markAsRead = useCallback(async (id: string) => {
    const readAt = new Date().toISOString();
    await markNotificationAsRead(id).catch(() => null);
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, read_at: readAt } : notification
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    emitNotificationReadEvent();
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    // 낙관적 업데이트 — 실패 시 다음 fetch에서 복구된다(JM3)
    let wasUnread = false;
    setNotifications((prev) => {
      const target = prev.find((notification) => notification.id === id);
      wasUnread = !!target && !target.read_at;
      return prev.filter((notification) => notification.id !== id);
    });
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    try {
      await deleteNotificationById(id);
    } catch (err) {
      console.warn('[notification-center] delete failed', err);
    }
    emitNotificationReadEvent();
  }, []);

  const openNotificationTarget = useCallback((notification: any) => {
    const target = resolveNotificationTarget(
      notification.type,
      toNotificationMetadataRecord(notification.metadata),
    );

    if (target.kind === 'my_page' && onOpenMenu) {
      onOpenMenu(NOTIFICATION_MENU_LABELS.myPage);
      return;
    }

    if (target.kind === 'notifications' && onOpenMenu) {
      onOpenMenu(NOTIFICATION_MENU_LABELS.notifications);
      return;
    }

    router.push(target.href);
  }, [onOpenMenu, router]);

  const openNotificationsInbox = useCallback(() => {
    if (onOpenMenu) {
      onOpenMenu(NOTIFICATION_MENU_LABELS.notifications);
      return;
    }
    router.push('/main?open_menu=알림');
  }, [onOpenMenu, router]);

  const handleNotiClick = useCallback((notification: any) => {
    if (!notification.read_at) {
      void markAsRead(notification.id);
    }

    setIsOpen(false);
    openNotificationTarget(notification);
  }, [markAsRead, openNotificationTarget]);

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
        className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--zinc-400)] transition-colors duration-150 hover:bg-[var(--muted)] hover:text-[var(--foreground)] touch-manipulation"
        aria-label="알림"
      >
        <span
          className={`block leading-none ${bellShaking ? 'animate-bell-shake' : ''}`}
          style={{ transformOrigin: 'top center' }}
        >
          <Bell className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 min-w-[8px] h-[8px] rounded-full bg-red-500/100 text-[0px] leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute bottom-[calc(100%+8px)] right-0 w-[min(20rem,calc(100vw-16px))] max-w-[calc(100vw-16px)] bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] z-[320] overflow-hidden animate-scale-in origin-bottom-right md:bottom-auto md:top-0 md:left-[calc(100%+8px)] md:right-auto md:w-[320px] md:max-w-none md:origin-top-left"
          style={{ boxShadow: 'var(--shadow-dropdown)' }}
          data-testid="notification-dropdown"
        >
          {/* 헤더 */}
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--card)]">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[13px] text-[var(--foreground)] tracking-tight">알림</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500/100 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--accent-light)] transition-colors"
              >
                모두 읽음
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <BellOff
                  className="mx-auto mb-2 h-7 w-7 text-[var(--toss-gray-3)] opacity-30"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <p className="text-[12px] text-[var(--toss-gray-3)] font-medium">받은 알림이 없습니다.</p>
              </div>
            ) : (
              <>
                {unread.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-[var(--muted)] sticky top-0 z-10 border-b border-[var(--border-subtle)]">
                      <span className="text-[10px] font-bold text-[var(--zinc-400)] uppercase tracking-widest">
                        새 알림 {unread.length}건
                      </span>
                    </div>
                    {unread.map((notification) => {
                      const cfg = getTypeCfg(notification.type);
                      const TypeIcon = cfg.Icon;
                      const itemContent = (
                        <div className="flex gap-3 w-full text-left">
                          <TypeIcon
                            className={`h-[18px] w-[18px] shrink-0 mt-0.5 ${cfg.color}`}
                            strokeWidth={1.8}
                            aria-label={cfg.label}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-1">
                              <p className="text-[12px] font-semibold text-[var(--foreground)] truncate flex-1 leading-snug">
                                {toNotificationText(notification.title, '알림')}
                              </p>
                              <span className="text-[10px] text-[var(--zinc-400)] shrink-0 mt-0.5 font-medium">
                                {timeAgo(notification.created_at)}
                              </span>
                            </div>
                            <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--zinc-400)' }}>
                              {cfg.label}
                            </p>
                            {toNotificationText(notification.body, '') && (
                              <p className="text-[11px] text-[var(--toss-gray-4)] line-clamp-2 mt-0.5 leading-relaxed">
                                {toNotificationText(notification.body, '')}
                              </p>
                            )}
                          </div>
                          <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full shrink-0 mt-1.5" />
                        </div>
                      );

                      if (isMobile) {
                        const leftActions: SwipeAction[] = [{
                          id: 'mark-read',
                          label: '읽음',
                          icon: <Check className="w-4 h-4" />,
                          tone: 'ok',
                          onTrigger: () => { void markAsRead(notification.id); },
                        }];
                        const rightActions: SwipeAction[] = [{
                          id: 'delete',
                          label: '삭제',
                          icon: <Trash2 className="w-4 h-4" />,
                          tone: 'danger',
                          onTrigger: () => { void deleteNotification(notification.id); },
                        }];
                        return (
                          <SwipeableCard
                            key={notification.id}
                            leftActions={leftActions}
                            rightActions={rightActions}
                            className="border-b border-[var(--border-subtle)] last:border-0 rounded-none"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              data-testid={`notification-item-${notification.id}`}
                              onClick={() => handleNotiClick(notification)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleNotiClick(notification);
                                }
                              }}
                              className="px-4 py-2.5 hover:bg-[var(--muted)] transition-colors duration-100 cursor-pointer touch-manipulation"
                              style={{ background: 'rgba(37,99,235,0.03)' }}
                            >
                              {itemContent}
                            </div>
                          </SwipeableCard>
                        );
                      }

                      return (
                        <button
                          key={notification.id}
                          type="button"
                          data-testid={`notification-item-${notification.id}`}
                          onClick={() => handleNotiClick(notification)}
                          className="w-full text-left px-4 py-2.5 hover:bg-[var(--muted)] transition-colors duration-100 border-b border-[var(--border-subtle)] last:border-0"
                          style={{ background: 'rgba(37,99,235,0.03)' }}
                        >
                          {itemContent}
                        </button>
                      );
                    })}
                  </div>
                )}

                {read.length > 0 && (
                  <div>
                    {unread.length > 0 && (
                      <div className="px-4 py-1.5 bg-[var(--muted)] sticky top-0 z-10 border-b border-[var(--border-subtle)]">
                        <span className="text-[10px] font-bold text-[var(--zinc-400)] uppercase tracking-widest">
                          읽은 알림
                        </span>
                      </div>
                    )}
                    {read.map((notification) => {
                      const cfg = getTypeCfg(notification.type);
                      const TypeIcon = cfg.Icon;
                      const itemContent = (
                        <div className="flex gap-3 w-full text-left">
                          <TypeIcon
                            className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.color}`}
                            strokeWidth={1.8}
                            aria-label={cfg.label}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-1">
                              <p className="text-[11px] font-medium text-[var(--toss-gray-3)] truncate flex-1 leading-snug">
                                {toNotificationText(notification.title, '알림')}
                              </p>
                              <span className="text-[10px] text-[var(--zinc-400)] shrink-0 mt-0.5">
                                {timeAgo(notification.created_at)}
                              </span>
                            </div>
                            {toNotificationText(notification.body, '') && (
                              <p className="text-[10px] text-[var(--toss-gray-3)] line-clamp-1 mt-0.5">
                                {toNotificationText(notification.body, '')}
                              </p>
                            )}
                          </div>
                        </div>
                      );

                      if (isMobile) {
                        const rightActions: SwipeAction[] = [{
                          id: 'delete',
                          label: '삭제',
                          icon: <Trash2 className="w-4 h-4" />,
                          tone: 'danger',
                          onTrigger: () => { void deleteNotification(notification.id); },
                        }];
                        return (
                          <SwipeableCard
                            key={notification.id}
                            rightActions={rightActions}
                            className="border-b border-[var(--border-subtle)] last:border-0 rounded-none opacity-55"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              data-testid={`notification-item-${notification.id}`}
                              onClick={() => handleNotiClick(notification)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleNotiClick(notification);
                                }
                              }}
                              className="px-4 py-2.5 hover:bg-[var(--muted)] transition-colors duration-100 cursor-pointer touch-manipulation"
                            >
                              {itemContent}
                            </div>
                          </SwipeableCard>
                        );
                      }

                      return (
                        <button
                          key={notification.id}
                          type="button"
                          data-testid={`notification-item-${notification.id}`}
                          onClick={() => handleNotiClick(notification)}
                          className="w-full text-left px-4 py-2.5 hover:bg-[var(--muted)] transition-colors duration-100 border-b border-[var(--border-subtle)] opacity-55 last:border-0"
                        >
                          {itemContent}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 푸터 */}
          <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--muted)] flex justify-center">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openNotificationsInbox();
              }}
              className="text-[11px] font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              전체 알림 보기 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

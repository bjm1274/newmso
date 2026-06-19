'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { sound } from '@/lib/sounds';
import {
  NOTIFICATION_MENU_LABELS,
  resolveNotificationTarget,
  toNotificationMetadataRecord,
} from '@/lib/notification-metadata';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { NOTIFICATION_LIST_UPDATED_EVENT } from '@/app/main/기능부품/알림시스템';

export function useCenterState(
  user: any,
  onOpenMenu?: (menuId: string) => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellShaking, setBellShaking] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const prevCountRef = useRef(0);

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
      // D1 API count
      const countRes = await fetch('/api/notifications?count=true');
      let totalUnread = 0;
      if (countRes.ok) {
        const countData = await countRes.json();
        if (countData.ok && typeof countData.count === 'number') {
          totalUnread = countData.count;
        }
      }

      // D1 API list
      const listRes = await fetch('/api/notifications?limit=50');
      let list = [];
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.ok && Array.isArray(listData.data)) {
          list = listData.data;
        }
      }

      setNotifications(list);

      const unread = totalUnread ?? list.filter((notification: any) => !notification.read_at).length;
      setUnreadCount(unread);
      return unread;
    } catch (err) {
      console.warn('[notification-center] fetch failed', err);
      return undefined;
    }
  }, [effectiveUserId]);

  useEffect(() => {
    if (!effectiveUserId) return;

    void fetchNotifications();

    let shakeTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerShake = () => {
      setBellShaking(true);
      if (shakeTimer) clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => setBellShaking(false), 700);
    };

    const handleNewNotification = () => triggerShake();

    const handleListUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ notifications?: unknown }>).detail;
      const next = Array.isArray(detail?.notifications) ? (detail!.notifications as any[]) : null;
      if (!next) return;
      setNotifications(next);
      const unread = next.filter((notification: any) => !notification.read_at).length;
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
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });

    setNotifications((prev) => prev.map((notification) => ({
      ...notification,
      read_at: notification.read_at || readAt,
    })));
    setUnreadCount(0);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-notification-read'));
    }
    sound.playSystem();
  }, [effectiveUserId]);

  const markAsRead = useCallback(async (id: string) => {
    const readAt = new Date().toISOString();
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, read_at: readAt } : notification
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-notification-read'));
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
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
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      console.warn('[notification-center] delete failed', err);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-notification-read'));
    }
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

  return {
    isOpen,
    setIsOpen,
    notifications,
    unreadCount,
    bellShaking,
    dropdownRef,
    markAllAsRead,
    markAsRead,
    deleteNotification,
    openNotificationsInbox,
    handleNotiClick,
    fetchNotifications,
    effectiveUserId,
  };
}

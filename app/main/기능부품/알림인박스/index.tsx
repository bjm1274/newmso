'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  resolveNotificationTarget,
  toNotificationMetadataRecord,
  DEFAULT_BOARD_TYPE,
  NOTIFICATION_MENU_LABELS,
  DEFAULT_ADMIN_SUBVIEW,
} from '@/lib/notification-metadata';
import { timeAgo } from '@/lib/notification-utils';
import { SettingsTab } from './알림설정탭';
import { LucideIcon } from '../조직도서브/조직도측면창';

// ─── 타입/상수 ───
const TABS = [
  { id: 'all', label: '전체', icon: 'Bell', types: null },
  { id: 'chat', label: '채팅', icon: 'MessageSquare', types: ['message', 'mention'] },
  { id: 'approval', label: '결재', icon: 'ClipboardCheck', types: ['approval'] },
  { id: 'hr', label: '인사', icon: 'Users', types: ['인사', 'payroll', 'education', 'attendance'] },
  { id: 'inventory', label: '재고', icon: 'Package', types: ['inventory'] },
  { id: 'other', label: '기타', icon: 'Pin', types: ['board', 'notification'] },
] as const;

type InboxDateRange = 'all' | 'today' | '7d' | '30d';

const INBOX_DATE_FILTERS: Array<{ id: InboxDateRange; label: string }> = [
  { id: 'all', label: '전체 기간' },
  { id: 'today', label: '오늘' },
  { id: '7d', label: '최근 7일' },
  { id: '30d', label: '최근 30일' },
];
const INBOX_REALTIME_REFRESH_DEBOUNCE_MS = 350;

type NotificationTypeConfig = { icon: string; bg: string; text: string; border: string };

const TYPE_CFG: Record<string, NotificationTypeConfig> = {
  message: { icon: 'MessageSquare', bg: 'bg-[var(--accent-light)]', text: 'text-[var(--accent)]', border: 'border-[var(--accent)]/25' },
  mention: { icon: 'Megaphone', bg: 'bg-[var(--accent-subtle)]', text: 'text-[var(--accent)]', border: 'border-[var(--accent)]/25' },
  approval: { icon: 'ClipboardCheck', bg: 'bg-[var(--accent-selected-subtle)]', text: 'text-[var(--accent)]', border: 'border-[var(--accent)]/25' },
  payroll: { icon: 'ReceiptText', bg: 'bg-[var(--success-light)]', text: 'text-[var(--success)]', border: 'border-[var(--success)]/25' },
  inventory: { icon: 'Package', bg: 'bg-[var(--warning-light)]', text: 'text-[var(--warning)]', border: 'border-[var(--warning)]/25' },
  attendance: { icon: 'Clock3', bg: 'bg-[var(--muted)]', text: 'text-[var(--toss-gray-4)]', border: 'border-[var(--border)]' },
  board: { icon: 'Pin', bg: 'bg-[var(--muted)]', text: 'text-[var(--toss-gray-4)]', border: 'border-[var(--border)]' },
  인사: { icon: 'Users', bg: 'bg-[var(--accent-light)]', text: 'text-[var(--accent)]', border: 'border-[var(--accent)]/20' },
  education: { icon: 'BookOpen', bg: 'bg-[var(--success-light)]', text: 'text-[var(--success)]', border: 'border-[var(--success)]/20' },
  notification: { icon: 'Bell', bg: 'bg-[var(--tab-bg)]', text: 'text-[var(--toss-gray-4)]', border: 'border-[var(--border)]' },
};
const DEFAULT_CFG: NotificationTypeConfig = { icon: 'Bell', bg: 'bg-[var(--tab-bg)]', text: 'text-[var(--toss-gray-4)]', border: 'border-[var(--border)]' };
const getTypeCfg = (t: string) => TYPE_CFG[t] || DEFAULT_CFG;

// ─── 필터 유틸 함수들 ───
function isWithinInboxDateRange(dateValue: string, range: InboxDateRange) {
  if (range === 'all') return true;
  const targetTime = new Date(dateValue).getTime();
  if (Number.isNaN(targetTime)) return false;
  const now = new Date();

  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return targetTime >= start;
  }

  const days = range === '7d' ? 7 : 30;
  return targetTime >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

function matchesNotificationSearch(notification: Record<string, unknown>, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const metadata =
    notification.metadata && typeof notification.metadata === 'object'
      ? notification.metadata as Record<string, unknown>
      : {};

  const haystack = [
    notification.title,
    notification.body,
    notification.type,
    metadata.sender_name,
    metadata.room_name,
    metadata.board_type,
    metadata.open_menu,
    metadata.open_subview,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return haystack.includes(query);
}

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStr = now.toDateString();
  const yestStr = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  if (d.toDateString() === todayStr) return '오늘';
  if (d.toDateString() === yestStr) return '어제';
  if (d >= weekAgo) return '이번 주';
  return '이전';
}

// ─── 메인 컴포넌트 ───
function NotificationInbox({
  user: _rawUser,
  onRefresh,
  onOpenChatRoom,
  onOpenMessage,
  onOpenApproval,
  onOpenInventory,
  onOpenBoard,
  onOpenPost,
  onOpenAdmin,
  setMainMenu,
}: Record<string, unknown> & {
  onOpenChatRoom?: (roomId: string) => void;
  onOpenMessage?: (roomId: string, messageId: string) => void;
  onOpenApproval?: (intent?: Record<string, unknown>) => void;
  onOpenInventory?: (intent?: { view?: string | null; approvalId?: string | null }) => void;
  onOpenBoard?: (boardId?: string) => void;
  onOpenPost?: (boardId: string, postId: string) => void;
  onOpenAdmin?: (subView?: string) => void;
  setMainMenu?: (menu: string) => void;
}) {
  const _u = (_rawUser ?? {}) as Record<string, unknown>;
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [activeInnerTab, setActiveInnerTab] = useState<'list' | 'settings'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [dateRange, setDateRange] = useState<InboxDateRange>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchNotificationsInFlightRef = useRef(false);
  const fetchNotificationsQueuedRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!_u?.id) { setLoading(false); return; }
    if (fetchNotificationsInFlightRef.current) {
      fetchNotificationsQueuedRef.current = true;
      return;
    }
    fetchNotificationsInFlightRef.current = true;
    try {
      const { data } = await supabase.from('notifications').select('*').eq('user_id', _u.id as string).order('created_at', { ascending: false }).limit(200);
      setNotifications(data || []);
    } catch { setNotifications([]); } finally {
      fetchNotificationsInFlightRef.current = false;
      setLoading(false);
      if (fetchNotificationsQueuedRef.current) {
        fetchNotificationsQueuedRef.current = false;
        void fetchNotifications();
      }
    }
  }, [_u?.id]);

  const scheduleFetchNotifications = useCallback(() => {
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
    realtimeRefreshTimerRef.current = setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void fetchNotifications();
    }, INBOX_REALTIME_REFRESH_DEBOUNCE_MS);
  }, [fetchNotifications]);

  const applyRealtimeNotificationPayload = useCallback((payload: Record<string, unknown>) => {
    const eventType = String(payload.eventType || payload.event || '').toUpperCase();
    const nextRow = payload.new as Record<string, unknown> | null | undefined;
    const previousRow = payload.old as Record<string, unknown> | null | undefined;
    const rowId = String(nextRow?.id || previousRow?.id || '').trim();
    if (!rowId) {
      scheduleFetchNotifications();
      return;
    }

    if (eventType === 'DELETE') {
      setNotifications((prev) => prev.filter((notification) => String(notification.id) !== rowId));
      return;
    }

    if (!nextRow) {
      scheduleFetchNotifications();
      return;
    }

    setNotifications((prev) => {
      const nextNotification = nextRow as any;
      const index = prev.findIndex((notification) => String(notification.id) === rowId);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], ...nextNotification };
        return next;
      }
      return [nextNotification, ...prev]
        .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
        .slice(0, 200);
    });
  }, [scheduleFetchNotifications]);

  useEffect(() => {
    setLoading(true);
    fetchNotifications();
    if (!_u?.id) return;
    const ch = supabase.channel(`inbox-${_u.id as string}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${_u.id as string}` }, applyRealtimeNotificationPayload)
      .subscribe();
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      supabase.removeChannel(ch);
    };
  }, [_u?.id, applyRealtimeNotificationPayload, fetchNotifications]);

  // 인박스가 열리면 1.5초 후 자동으로 전체 읽음 처리 (뱃지 클리어)
  useEffect(() => {
    if (!_u?.id) return;
    const timer = setTimeout(async () => {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', _u.id as string).is('read_at', null);
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('erp-notification-read'));
    }, 1500);
    return () => clearTimeout(timer);
  }, [_u?.id]);

  useEffect(() => {
    if (selectionMode) return;
    if (selectedIds.length === 0) return;
    setSelectedIds([]);
  }, [selectedIds, selectionMode]);

  const emitNotificationReadSync = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-notification-read'));
    }
    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  }, [onRefresh]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    emitNotificationReadSync();
  };

  const markAllAsRead = async () => {
    if (!_u?.id) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', _u.id as string).is('read_at', null);
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    emitNotificationReadSync();
  };

  const deleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    emitNotificationReadSync();
  };

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((targetId) => targetId !== id) : [...prev, id]
    );
  }, []);

  const markSelectedAsRead = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const readAt = new Date().toISOString();
    await supabase.from('notifications').update({ read_at: readAt }).in('id', selectedIds);
    setNotifications((prev) =>
      prev.map((notification) =>
        selectedIds.includes(String(notification.id))
          ? { ...notification, read_at: notification.read_at || readAt }
          : notification
      )
    );
    setSelectedIds([]);
    setSelectionMode(false);
    emitNotificationReadSync();
  }, [emitNotificationReadSync, selectedIds]);

  const deleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await supabase.from('notifications').delete().in('id', selectedIds);
    setNotifications((prev) =>
      prev.filter((notification) => !selectedIds.includes(String(notification.id)))
    );
    setSelectedIds([]);
    setSelectionMode(false);
    emitNotificationReadSync();
  }, [emitNotificationReadSync, selectedIds]);

  const handleClick = (n: any) => {
    if (selectionMode) {
      toggleSelected(String(n.id));
      return;
    }
    if (!n.read_at) markAsRead(n.id);
    const target = resolveNotificationTarget(n.type, toNotificationMetadataRecord(n.metadata));

    // SPA 콜백 우선 사용 — 콜백이 없으면 router.push 폴백
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

    if (target.kind === 'my_page' && setMainMenu) {
      setMainMenu('내정보');
      return;
    }

    router.push(target.href);
  };

  // 탭 필터링
  const tabDef = TABS.find(t => t.id === activeTab)!;
  const tabTypes = tabDef.types ? [...tabDef.types] : null;
  const filtered = useMemo(
    () =>
      notifications.filter((notification) => {
        if (tabTypes && !tabTypes.includes(notification.type)) return false;
        if (showUnreadOnly && notification.read_at) return false;
        if (!isWithinInboxDateRange(String(notification.created_at || ''), dateRange)) return false;
        if (!matchesNotificationSearch(notification, searchQuery)) return false;
        return true;
      }),
    [dateRange, notifications, searchQuery, showUnreadOnly, tabTypes]
  );

  // 안읽음 배지 per 탭
  const tabBadge = (types: readonly string[] | null) =>
    types ? notifications.filter(n => types.includes(n.type) && !n.read_at).length
      : notifications.filter(n => !n.read_at).length;

  const unreadCount = notifications.filter(n => !n.read_at).length;
  const selectedCount = selectedIds.length;

  // 날짜 그룹화
  const grouped: Record<string, any[]> = {};
  const GROUP_ORDER = ['오늘', '어제', '이번 주', '이전'];
  filtered.forEach(n => {
    const g = getDateGroup(n.created_at);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(n);
  });

  return (
    <div className="flex h-full flex-col overflow-hidden app-page">
      {/* 헤더 */}
      <header className="px-5 pt-6 pb-0 shrink-0 bg-[var(--card)] border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">알림</h2>
            {unreadCount > 0 && <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">안읽음 {unreadCount}건</p>}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && activeInnerTab === 'list' && (
              <button onClick={markAllAsRead} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent-light)]">전체 읽음</button>
            )}
            {activeInnerTab === 'list' && (
              <button
                type="button"
                data-testid="notification-selection-toggle"
                onClick={() => setSelectionMode((prev) => !prev)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                {selectionMode ? '선택 취소' : '여러 개 선택'}
              </button>
            )}
          </div>
        </div>

        {/* 상단 탭바: 목록 / 설정 */}
        <div className="flex gap-1 mb-[-1px]">
          {([{ id: 'list', label: '알림 목록', icon: 'List' }, { id: 'settings', label: '설정', icon: 'Settings' }] as const).map(t => (
            <button key={t.id} type="button" data-testid={`notification-inner-tab-${t.id}`} onClick={() => setActiveInnerTab(t.id)}
              className={`flex items-center gap-1.5 rounded-t-[var(--radius-md)] border-b-2 px-4 py-2 text-xs font-bold transition-all ${activeInnerTab === t.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}>
              <LucideIcon name={t.icon} size={14} strokeWidth={2} />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {activeInnerTab === 'settings' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar"><SettingsTab userId={_u?.id as string | undefined} /></div>
      ) : (
        <>
          <div className="shrink-0 space-y-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                data-testid="notification-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="제목, 본문, 발신자, 메뉴명 검색"
                className="h-10 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="notification-unread-filter"
                  onClick={() => setShowUnreadOnly((prev) => !prev)}
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-xs font-bold transition-colors ${
                    showUnreadOnly
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'
                  }`}
                >
                  안읽음만
                </button>
                <select
                  data-testid="notification-date-filter"
                  value={dateRange}
                  onChange={(event) => setDateRange(event.target.value as InboxDateRange)}
                  className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]"
                >
                  {INBOX_DATE_FILTERS.map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectionMode && (
              <div className="flex flex-wrap items-center gap-2" data-testid="notification-selection-toolbar">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">선택 {selectedCount}건</span>
                <button
                  type="button"
                  onClick={markSelectedAsRead}
                  disabled={selectedCount === 0}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-40"
                >
                  선택 읽음
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={selectedCount === 0}
                  className="rounded-[var(--radius-md)] border border-[var(--danger)]/20 bg-[var(--danger-light)] px-3 py-1.5 text-xs font-bold text-[var(--danger)] transition-colors hover:bg-[var(--danger-light)] disabled:opacity-40"
                >
                  선택 삭제
                </button>
              </div>
            )}
          </div>

          {/* 타입 탭 가로 스크롤 */}
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 no-scrollbar">
            {TABS.map(tab => {
              const badge = tabBadge(tab.types as string[] | null);
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-bold transition-all ${activeTab === tab.id
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'}`}>
                  <LucideIcon name={tab.icon} size={14} strokeWidth={activeTab === tab.id ? 2.2 : 1.8} />
                  <span>{tab.label}</span>
                  {badge > 0 && (
                    <span className={`rounded-[var(--radius-sm)] px-1 py-0 text-[9px] font-black ${activeTab === tab.id ? 'bg-[var(--card)]/30 text-white' : 'bg-[var(--danger)] text-white'}`}>{badge}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 알림 목록 */}
          <main className="flex-1 overflow-y-auto bg-[var(--page-bg)] custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 md:py-20 gap-3">
                <LucideIcon name="LoaderCircle" size={32} className="animate-spin text-[var(--accent)]" />
                <p className="text-xs text-[var(--toss-gray-3)] font-medium">알림을 불러오는 중...</p>
              </div>
            ) : !_u?.id ? (
              <div className="text-center py-8 md:py-20 text-[var(--toss-gray-3)] text-sm font-medium">직원 계정으로 로그인하면 알림을 확인할 수 있습니다.</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 md:py-20">
                <div className="mb-3 flex justify-center text-[var(--toss-gray-3)] opacity-40">
                  <LucideIcon name="Inbox" size={36} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-[var(--toss-gray-3)]">알림이 없습니다</p>
              </div>
            ) : (
              <div>
                {GROUP_ORDER.filter(g => grouped[g]?.length).map(group => (
                  <div key={group}>
                    {/* 날짜 그룹 헤더 */}
                    <div className="sticky top-0 z-10 border-b border-[var(--border)]/50 bg-[var(--page-bg)]/90 px-5 py-2 backdrop-blur-sm">
                      <span className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">{group}</span>
                    </div>

                    {/* 알림 아이템 */}
                    <div className="divide-y divide-[var(--border)]/50">
                      {grouped[group].map(n => {
                        const cfg = getTypeCfg(n.type);
                        const isSelected = selectedIds.includes(String(n.id));
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleClick(n)}
                            className={`group relative flex cursor-pointer items-start gap-3.5 border-l-4 bg-[var(--card)] px-5 py-4 transition-colors hover:bg-[var(--muted)]
                              ${!n.read_at ? cfg.border : 'border-transparent opacity-80'}
                              ${isSelected ? 'bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]' : ''}`}
                            data-testid={`notification-inbox-item-${n.id}`}
                          >
                            {selectionMode && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSelected(String(n.id));
                                }}
                                className={`mt-1 h-5 w-5 shrink-0 rounded-[var(--radius-md)] border text-[11px] font-black ${
                                  isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                    : 'border-[var(--border)] text-transparent'
                                }`}
                                aria-label="선택"
                              >
                                <LucideIcon name="Check" size={12} strokeWidth={3} />
                              </button>
                            )}
                            {/* 타입 아이콘 */}
                            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] ${n.read_at ? 'bg-[var(--muted)]' : cfg.bg}`}>
                              <LucideIcon name={cfg.icon} size={18} strokeWidth={2} className={n.read_at ? 'text-[var(--toss-gray-3)]' : cfg.text} />
                            </div>

                            {/* 내용 */}
                            <div className="flex-1 min-w-0 pr-8">
                              <div className="flex items-baseline gap-2">
                                <p className={`text-sm leading-snug flex-1 ${n.read_at ? 'font-medium text-[var(--toss-gray-3)]' : 'font-bold text-[var(--foreground)]'}`}>
                                  {n.title}
                                </p>
                                <span className="text-[10px] text-[var(--toss-gray-3)] whitespace-nowrap shrink-0">{n.created_at ? timeAgo(n.created_at) : ''}</span>
                              </div>
                              {n.body && (
                                <p className="text-xs text-[var(--toss-gray-3)] mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                              )}
                            </div>

                            {/* 안읽음 점 */}
                            {!n.read_at && (
                              <span className="absolute right-5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-[var(--radius-sm)] bg-[var(--accent)]" />
                            )}

                            {/* 삭제 버튼 (hover 시 표시) */}
                            <button type="button" onClick={e => deleteNotif(n.id, e)}
                              className="absolute right-5 top-3.5 flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] opacity-0 transition-all hover:bg-[var(--danger-light)] hover:text-[var(--danger)] group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                              aria-label="삭제"><LucideIcon name="X" size={13} strokeWidth={2.4} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default memo(NotificationInbox);

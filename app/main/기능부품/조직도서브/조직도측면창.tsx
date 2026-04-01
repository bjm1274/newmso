'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { canAccessMainMenu } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { ADMIN_SIDEBAR_ITEMS } from '../../admin-menu-config';
import NotificationCenter from '../NotificationCenter';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';

const MYPAGE_TAB_KEY = 'erp_mypage_tab';

type SubMenuItem = {
  id: string;
  label: string;
  group?: string;
  icon?: string;
  hidden?: boolean;
};

export const SUB_MENUS: Record<string, SubMenuItem[]> = {
  재고관리: [
    { id: '현황', label: '현황', group: '조회', icon: '📊' },
    { id: '이력', label: '이력', group: '조회', icon: '🕘' },
    { id: '수요예측', label: '수요예측', group: '조회', icon: '🔮' },
    { id: '등록', label: '등록', group: '입출고', icon: '📝' },
    { id: '스캔', label: '스캔', group: '입출고', icon: '📷' },
    { id: '발주', label: '발주', group: '발주문서', icon: '📦' },
    { id: '재고실사', label: '재고실사', group: '입출고', icon: '🔎' },
    { id: '이관', label: '이관', group: '입출고', icon: '🔄' },
    { id: '납품확인서', label: '납품확인서', group: '발주문서', icon: '📋' },
    { id: 'UDI', label: 'UDI', group: '발주문서', icon: '🏷️' },
    { id: '자산', label: '자산', group: '설정', icon: '🔖' },
    { id: '비품대여설정', label: '비품대여 설정', group: '설정', icon: '🧰' },
    { id: '거래처', label: '거래처 / 명세서', group: '설정', icon: '🏭' },
    { id: '카테고리', label: '카테고리', group: '설정', icon: '🗂️' },
    { id: 'AS반품', label: 'AS반품', group: '설정', icon: '↩️' },
    { id: '소모품통계', label: '소모품통계', group: '설정', icon: '📉' },
  ],
  게시판: [
    { id: '공지사항', label: '공지사항', icon: '📢' },
    { id: '자유게시판', label: '자유게시판', icon: '📝' },
    { id: '경조사', label: '경조사', icon: '🎊' },
    { id: '수술일정', label: '수술일정', icon: '🏥' },
    { id: 'MRI일정', label: 'MRI일정', icon: '🧠' },
    { id: '사내위키', label: '사내위키', icon: '📚' },
  ],
  전자결재: [
    { id: '기안함', label: '기안함', icon: '📝' },
    { id: '결재함', label: '결재함', icon: '✅' },
    { id: '참조 문서함', label: '참조 문서함', icon: '📎' },
    { id: '작성하기', label: '작성하기', icon: '✍️' },
  ],
  인사관리: [
    { id: '구성원', label: '구성원', group: '인력관리', icon: '👥' },
    { id: '인사변동', label: '인사변동', group: '인력관리', icon: '🗂️' },
    { id: '입퇴사·교육센터', label: '입퇴사·교육센터', group: '인력관리', icon: '🧭' },
    { id: '근태', label: '근태', group: '근태/급여', icon: '⏰' },
    { id: '교대근무', label: '교대근무', group: '근태/급여', icon: '🔄' },
    { id: '연차/휴가', label: '연차/휴가', group: '근태/급여', icon: '🌴' },
    { id: '급여', label: '급여', group: '근태/급여', icon: '💰' },
    { id: '경조사', label: '경조사', group: '복무/복지', icon: '🎊' },
    { id: '자격·안전센터', label: '자격·안전센터', group: '복무/복지', icon: '🛡️' },
    { id: '계약', label: '계약', group: '문서/기타', icon: '📝' },
    { id: '문서센터', label: '문서센터', group: '문서/기타', icon: '🗃️' },
    { id: '캘린더', label: '캘린더', group: '문서/기타', icon: '📅' },
  ],
  관리자: ADMIN_SIDEBAR_ITEMS,
};

const MAIN_MENUS = [
  { id: '내정보', icon: '👤', label: '내정보', testId: 'sidebar-menu-home' },
  { id: '추가기능', icon: '➕', label: '추가기능', testId: 'sidebar-menu-extra' },
  { id: '채팅', icon: '💬', label: '채팅', testId: 'sidebar-menu-chat' },
  { id: '게시판', icon: '📋', label: '게시판', testId: 'sidebar-menu-board' },
  { id: '전자결재', icon: '✍️', label: '전자결재', testId: 'sidebar-menu-approval' },
  { id: '인사관리', icon: '👥', label: '인사관리', testId: 'sidebar-menu-hr' },
  { id: '재고관리', icon: '📦', label: '재고관리', testId: 'sidebar-menu-inventory' },
  { id: '관리자', icon: '⚙️', label: '관리자', testId: 'sidebar-menu-admin' },
];

type SidebarUser = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  company?: string | null;
  permissions?: Record<string, unknown> | null;
  department?: string | null;
  [key: string]: unknown;
};

export default function Sidebar({ user, mainMenu, onMenuChange }: { user?: SidebarUser | null; mainMenu?: string; onMenuChange: (menuId: string) => void }) {
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const normalizedUser = useMemo(
    () => normalizeStaffLike((user ?? {}) as Record<string, unknown>) as SidebarUser,
    [user]
  );
  const [resolvedUser, setResolvedUser] = useState<SidebarUser | null>(() => {
    const directId = getStaffLikeId(normalizedUser as Record<string, unknown>);
    return directId ? normalizedUser : null;
  });
  const effectiveUser = (resolvedUser || normalizedUser) as SidebarUser;
  const effectiveUserId = getStaffLikeId(effectiveUser as Record<string, unknown>);

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
        setResolvedUser(recoveredUser as SidebarUser);
      }
    };

    void syncUserIdentity();
    return () => {
      cancelled = true;
    };
  }, [normalizedUser?.id, normalizedUser?.name, normalizedUser?.employee_no, normalizedUser?.auth_user_id]);

  const visibleMenus = useMemo(
    () => MAIN_MENUS.filter((menu) => canAccessMainMenu(effectiveUser, menu.id)),
    [effectiveUser]
  );

  const fetchChatUnreadCount = useCallback(async () => {
    if (!effectiveUserId) {
      setChatUnreadCount(0);
      return;
    }

    try {
      const { data: rooms, error: roomsError } = await supabase
        .from('chat_rooms')
        .select('id, members');

      if (roomsError) throw roomsError;

      const myRooms = (rooms || []).filter((room: any) => {
        if (room.id === NOTICE_ROOM_ID) return true;
        return Array.isArray(room.members) && room.members.some((id: string) => String(id) === effectiveUserId);
      });

      if (myRooms.length === 0) {
        setChatUnreadCount(0);
        return;
      }

      const roomIds = myRooms.map((room: any) => room.id);
      const { data: cursors, error: cursorError } = await supabase
        .from('room_read_cursors')
        .select('room_id, last_read_at')
        .eq('user_id', effectiveUserId)
        .in('room_id', roomIds);

      if (cursorError) throw cursorError;

      const cursorMap: Record<string, string | null> = {};
      (cursors || []).forEach((cursor: any) => {
        cursorMap[cursor.room_id] = cursor.last_read_at;
      });

      let totalUnread = 0;
      for (const roomId of roomIds) {
        let query = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .neq('sender_id', effectiveUserId)
          .eq('is_deleted', false);

        const lastReadAt = cursorMap[roomId];
        if (lastReadAt) {
          query = query.gt('created_at', lastReadAt);
        }

        const { count, error: countError } = await query;
        if (countError) throw countError;
        totalUnread += count || 0;
      }

      setChatUnreadCount(totalUnread);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      if (errorMessage.includes('Failed to fetch')) {
        setChatUnreadCount(0);
        return;
      }
      console.error('메인 메뉴 채팅 안읽음 계산 실패:', error);
      setChatUnreadCount(0);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    void fetchChatUnreadCount();
  }, [fetchChatUnreadCount]);

  useEffect(() => {
    if (!effectiveUserId) return;

    const handleChatSync = () => {
      void fetchChatUnreadCount();
    };

    const channel = supabase
      .channel(`sidebar-chat-unread-${effectiveUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void fetchChatUnreadCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_read_cursors' }, () => {
        void fetchChatUnreadCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => {
        void fetchChatUnreadCount();
      })
      .subscribe();

    if (typeof window !== 'undefined') {
      window.addEventListener('erp-chat-sync', handleChatSync);
      document.addEventListener('visibilitychange', handleChatSync);
    }

    return () => {
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('erp-chat-sync', handleChatSync);
        document.removeEventListener('visibilitychange', handleChatSync);
      }
    };
  }, [effectiveUserId, fetchChatUnreadCount]);

  const handleMenuClick = useCallback((menuId: string) => {
    if (menuId === '내정보' && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(MYPAGE_TAB_KEY);
      } catch {
        // ignore localStorage failures
      }
    }

    onMenuChange(menuId);
  }, [onMenuChange]);

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside
        className="sticky top-0 z-[240] hidden h-[100dvh] w-[var(--sidebar-width)] shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--sidebar-bg)] py-3 md:flex"
        data-testid="desktop-sidebar"
      >
        <div className="mb-2 flex w-full shrink-0 flex-col items-center px-1.5">
          {effectiveUserId && <NotificationCenter user={effectiveUser} onOpenMenu={onMenuChange} />}
        </div>

        <div className="no-scrollbar flex w-full flex-1 flex-col gap-0.5 overflow-y-auto px-1.5">
          {visibleMenus.map((menu) => {
            const isActive = mainMenu === menu.id;
            return (
              <button
                key={menu.id}
                type="button"
                data-testid={menu.testId}
                onClick={() => handleMenuClick(menu.id)}
                className={`relative flex w-full flex-col items-center justify-center rounded-[var(--radius-md)] py-2 transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--toss-gray-3)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="relative text-[17px] leading-none">
                  {menu.icon}
                  {menu.id === '채팅' && chatUnreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/100 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </span>
                  )}
                </span>
                <span className="mt-1 text-[10px] font-semibold">{menu.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 모바일 하단 탭바 */}
      <nav
        className="safe-area-pb no-scrollbar fixed bottom-0 left-0 right-0 z-[100] flex items-center gap-0.5 overflow-x-auto border-t border-[var(--border)] bg-[var(--card)] px-1.5 py-1 md:hidden"
        style={{ boxShadow: '0 -1px 0 var(--border)' }}
        data-testid="mobile-tabbar"
      >
        {visibleMenus.map((menu) => {
          const isActive = mainMenu === menu.id;
          return (
            <button
              key={menu.id}
              type="button"
              data-testid={`${menu.testId}-mobile`}
              onClick={() => handleMenuClick(menu.id)}
              className={`flex min-h-[56px] flex-1 touch-manipulation flex-col items-center justify-center rounded-[var(--radius-md)] px-1 py-1.5 transition-all duration-150 ${
                isActive ? 'text-[var(--accent)]' : 'text-[var(--toss-gray-3)]'
              }`}
            >
              <span className="relative text-[22px] leading-none">
                {menu.icon}
                {menu.id === '채팅' && chatUnreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500/100 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                )}
              </span>
              <span className="mt-0.5 w-full truncate text-center text-[11px] font-bold">{menu.label}</span>
            </button>
          );
        })}
        {/* 알림 버튼 자리 확보 */}
        <div className="min-h-[56px] w-[56px] flex-none" />
      </nav>
      {/* 알림버튼 - overflow 클리핑 방지를 위해 nav 외부에 fixed 위치로 렌더링 */}
      {effectiveUserId && (
        <div className="fixed bottom-0 right-0 z-[200] flex min-h-[56px] w-[56px] flex-col items-center justify-center md:hidden safe-area-pb">
          <NotificationCenter user={effectiveUser} onOpenMenu={onMenuChange} />
        </div>
      )}
    </>
  );
}

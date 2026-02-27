'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const TYPE_ICONS: Record<string, string> = {
  approval: '📋',
  inventory: '📦',
  payroll: '💰',
  education: '📚',
  mention: '📣',
  인사: '👥',
  default: '🔔',
};

export default function GlobalNotificationBell({ user, onOpenFull }: { user: any; onOpenFull: () => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastNoti, setToastNoti] = useState<any>(null); // 신규 수신 시 노출할 토스트 상태
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!user?.id) return;

    // 알림 권한 요청 (웹/모바일 푸시용)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    const fetchList = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setList(data || []);
      const unread = (data || []).filter((n: any) => !n.is_read).length;
      setUnreadCount(unread);
    };

    fetchList();

    const channel = supabase
      .channel('global-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${String(user.id)}` }, (payload) => {
        const newNoti: any = payload.new;

        // 브라우저 네이티브 푸시 알림 발생 (웹/모바일 호환)
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const iconRef = TYPE_ICONS[newNoti.type] || TYPE_ICONS.default;
            new Notification(newNoti.title || '새로운 알림', {
              body: newNoti.body || '확인하지 않은 시스템 알림이 있습니다.',
              icon: '/sy-logo.png', // 기본 알림 아이콘
            });
          } catch (e) {
            console.error('Notification display failed:', e);
          }
        }

        // 앱 내장 Toast 알림 팝업 (권한 미부여 또는 네이티브 알림 불가 환경 대비)
        setToastNoti(newNoti);
        setTimeout(() => setToastNoti(null), 5000); // 5초 후 토스트 닫기

        // in-app 알림 목록 갱신
        fetchList();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${String(user.id)}` }, () => {
        // 읽음 처리 등 업데이트 발생 시 리스트만 갱신
        fetchList();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, []);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setList(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleNotificationClick = (n: any) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    setToastNoti(null);

    if (n.metadata?.room_id) {
      router.push(`/main?open_chat_room=${n.metadata.room_id}`);
    } else if (n.type === 'approval') {
      router.push(`/main?open_menu=전자결재`);
    } else if (n.type === 'inventory') {
      router.push(`/main?open_menu=재고관리`);
    } else if (n.type === 'payroll' || n.type === 'education' || n.type === '인사' || n.type === 'attendance') {
      router.push(`/main?open_menu=인사관리`);
    } else if (n.type === 'board') {
      if ((n.title || '').includes('경조사') || (n.body || '').includes('경조사')) {
        router.push(`/main?open_menu=게시판&open_board=경조사`);
      } else {
        router.push(`/main?open_menu=게시판`);
      }
    }
  };

  return (
    <>
      {/* Toast Notification Layer */}
      {toastNoti && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-[360px] cursor-pointer" onClick={() => handleNotificationClick(toastNoti)}>
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-2xl rounded-[16px] p-4 flex gap-3 animate-in slide-in-from-top-10 fade-in duration-300">
            <span className="text-2xl shrink-0">{TYPE_ICONS[toastNoti.type] || TYPE_ICONS.default}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--foreground)] truncate">{toastNoti.title || '새로운 알림'}</p>
              <p className="text-[11px] text-[var(--toss-gray-3)] line-clamp-2 mt-0.5">{toastNoti.body}</p>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); setToastNoti(null); }} className="text-[var(--toss-gray-2)] hover:text-[var(--toss-gray-4)] p-1 shrink-0 bg-transparent border-0 self-start">
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="relative min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-[12px] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)] transition-all touch-manipulation"
          aria-label="알림"
        >
          <span className="text-xl">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-black rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-[190] md:hidden" onClick={() => setOpen(false)} />
            <div className="absolute right-0 bottom-[calc(100%+12px)] md:bottom-auto top-auto md:top-full md:left-0 md:right-auto mt-0 md:mt-1 w-[calc(100vw-32px)] sm:w-[320px] max-h-[60vh] md:max-h-[400px] bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[20px] md:rounded-[16px] shadow-2xl z-[200] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-top-2 duration-200">
              <div className="p-4 md:p-3 border-b border-[var(--toss-border)] flex items-center justify-between shrink-0">
                <span className="text-xs font-black text-[var(--foreground)]">시스템 알림</span>
                {unreadCount > 0 && <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">안읽음 {unreadCount}건</span>}
              </div>
              <div className="overflow-y-auto flex-1 max-h-[60vh] md:max-h-[320px] custom-scrollbar">
                {list.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--toss-gray-3)] font-bold">알림이 없습니다.</div>
                ) : (
                  list.slice(0, 8).map((n: any) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left px-3 py-2.5 border-b border-[var(--toss-gray-1)] transition-colors hover:bg-[var(--toss-gray-1)] ${!n.is_read ? 'bg-[var(--toss-blue-light)]/50' : ''}`}
                    >
                      <div className="flex gap-2">
                        <span className="text-base shrink-0">{TYPE_ICONS[n.type] || TYPE_ICONS.default}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-[var(--foreground)] truncate">{n.title}</p>
                          <p className="text-[10px] text-[var(--toss-gray-3)] line-clamp-2">{n.body}</p>
                          <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{new Date(n.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        {!n.is_read && <span className="w-1.5 h-1.5 bg-[var(--toss-blue)] rounded-full shrink-0 mt-1.5" />}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="p-2 border-t border-[var(--toss-border)] shrink-0 bg-[var(--toss-card)]">
                <button
                  type="button"
                  onClick={() => { onOpenFull(); setOpen(false); }}
                  className="w-full py-3 md:py-2 rounded-[12px] text-xs font-bold text-[var(--toss-blue)] hover:bg-[var(--toss-blue-light)] transition-colors"
                >
                  전체 보기 (내 정보 → 알림)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

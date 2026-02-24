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
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!user?.id) return;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${String(user.id)}` }, () => fetchList())
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
        <div className="absolute left-0 top-full mt-1 w-[320px] max-h-[400px] bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-lg z-[200] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 border-b border-[var(--toss-border)] flex items-center justify-between shrink-0">
            <span className="text-xs font-black text-[var(--foreground)]">알림</span>
            {unreadCount > 0 && <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">안읽음 {unreadCount}건</span>}
          </div>
          <div className="overflow-y-auto flex-1 max-h-[320px] custom-scrollbar">
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
          <div className="p-2 border-t border-[var(--toss-border)] shrink-0">
            <button
              type="button"
              onClick={() => { onOpenFull(); setOpen(false); }}
              className="w-full py-2 rounded-[12px] text-xs font-bold text-[var(--toss-blue)] hover:bg-[var(--toss-blue-light)] transition-colors"
            >
              전체 보기 (내 정보 → 알림)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

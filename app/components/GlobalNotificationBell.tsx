'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const TYPE_ICONS: Record<string, string> = {
  approval: '📋',
  inventory: '📦',
  payroll: '💰',
  education: '📚',
  인사: '👥',
  default: '🔔',
};

export default function GlobalNotificationBell({ user, onOpenFull }: { user: any; onOpenFull: () => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchList())
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-[12px] text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#191F28] transition-all"
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
        <div className="absolute right-0 top-full mt-1 w-[320px] max-h-[400px] bg-white border border-[#E5E8EB] rounded-[16px] shadow-lg z-[200] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 border-b border-[#E5E8EB] flex items-center justify-between shrink-0">
            <span className="text-xs font-black text-[#191F28]">알림</span>
            {unreadCount > 0 && <span className="text-[10px] font-bold text-[#8B95A1]">안읽음 {unreadCount}건</span>}
          </div>
          <div className="overflow-y-auto flex-1 max-h-[320px] custom-scrollbar">
            {list.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#8B95A1] font-bold">알림이 없습니다.</div>
            ) : (
              list.slice(0, 8).map((n: any) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { if (!n.is_read) markRead(n.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 border-b border-[#F2F4F6] transition-colors hover:bg-[#F8FAFC] ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex gap-2">
                    <span className="text-base shrink-0">{TYPE_ICONS[n.type] || TYPE_ICONS.default}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-[#191F28] truncate">{n.title}</p>
                      <p className="text-[10px] text-[#8B95A1] line-clamp-2">{n.body}</p>
                      <p className="text-[9px] text-[#8B95A1] mt-0.5">{new Date(n.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {!n.is_read && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 mt-1.5" />}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-[#E5E8EB] shrink-0">
            <button
              type="button"
              onClick={() => { onOpenFull(); setOpen(false); }}
              className="w-full py-2 rounded-[12px] text-xs font-bold text-[#3182F6] hover:bg-[#E8F3FF] transition-colors"
            >
              전체 보기 (내 정보 → 알림)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

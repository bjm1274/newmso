'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { sound } from '@/lib/sounds';

const TYPE_CFG: Record<string, { icon: string; color: string; label: string }> = {
  message: { icon: '💬', color: 'text-blue-500', label: '채팅' },
  mention: { icon: '📣', color: 'text-indigo-500', label: '멘션' },
  approval: { icon: '📋', color: 'text-violet-600', label: '결재' },
  payroll: { icon: '💰', color: 'text-emerald-600', label: '급여' },
  inventory: { icon: '📦', color: 'text-orange-500', label: '재고' },
  attendance: { icon: '⏰', color: 'text-teal-500', label: '근태' },
  board: { icon: '📌', color: 'text-pink-500', label: '게시판' },
  인사: { icon: '👥', color: 'text-cyan-600', label: '인사' },
  education: { icon: '📚', color: 'text-purple-500', label: '교육' },
  default: { icon: '🔔', color: 'text-slate-500', label: '알림' },
};
const getTypeCfg = (t: string) => TYPE_CFG[t] || TYPE_CFG.default;

function timeAgo(dateStr: string) {
  const d = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (d < 60) return '방금';
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  if (d < 604800) return `${Math.floor(d / 86400)}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function NotificationCenter({ user }: { user: any }) {
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
    const unread = list.filter((n: any) => !n.read_at).length;
    setUnreadCount(unread);
    return unread;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchNotifications();

    const handleNewNoti = async () => {
      const unread = await fetchNotifications();
      // 벨 흔들기 (새 알림이 이전보다 많을 때)
      if (typeof unread === 'number' && unread > prevCountRef.current) {
        setBellShaking(true);
        setTimeout(() => setBellShaking(false), 700);
      }
      prevCountRef.current = typeof unread === 'number' ? unread : prevCountRef.current;
    };

    window.addEventListener('erp-new-notification', handleNewNoti);

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('erp-new-notification', handleNewNoti);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user?.id, fetchNotifications]);

  // unread 변화 감지해서 벨 흔들기
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current > 0) {
      setBellShaking(true);
      setTimeout(() => setBellShaking(false), 700);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const markAllAsRead = async () => {
    if (!user?.id) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnreadCount(0);
    sound.playSystem();
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleNotiClick = (n: any) => {
    if (!n.read_at) markAsRead(n.id);
    setIsOpen(false);
    const meta = n.metadata || {};
    if (n.type === 'message' || n.type === 'mention') {
      router.push(meta.room_id ? `/main?open_chat_room=${meta.room_id}` : '/main?open_menu=채팅');
    } else if (n.type === 'approval') {
      router.push('/main?open_menu=전자결재');
    } else if (n.type === 'inventory') {
      router.push('/main?open_menu=재고관리');
    } else if (n.type === 'payroll' || n.type === 'education' || n.type === 'attendance' || n.type === '인사') {
      router.push('/main?open_menu=내정보');
    } else if (n.type === 'board') {
      router.push('/main?open_menu=게시판');
    }
  };

  const unread = notifications.filter(n => !n.read_at);
  const read = notifications.filter(n => !!n.read_at);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 벨 버튼 */}
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) sound.playSystem(); }}
        className="relative p-2.5 rounded-[14px] hover:bg-[var(--toss-gray-1)] transition-all group touch-manipulation"
        aria-label="알림"
      >
        <span className={`text-2xl block ${bellShaking ? 'animate-bell-shake' : ''}`} style={{ transformOrigin: 'top center' }}>
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-black rounded-full border-2 border-[var(--toss-card)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--toss-card)]/95 backdrop-blur-xl border border-[var(--toss-border)] rounded-[20px] shadow-2xl z-[200] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b border-[var(--toss-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[13px] text-[var(--foreground)]">알림</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline">
                모두 읽음
              </button>
            )}
          </div>

          {/* 알림 목록 */}
          <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-3xl mb-2 opacity-20">📭</p>
                <p className="text-xs text-[var(--toss-gray-3)] font-medium">받은 알림이 없습니다</p>
              </div>
            ) : (
              <>
                {/* 안읽음 섹션 */}
                {unread.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-[var(--toss-gray-1)]/60 sticky top-0">
                      <span className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">새 알림 {unread.length}건</span>
                    </div>
                    {unread.map(n => {
                      const cfg = getTypeCfg(n.type);
                      return (
                        <button key={n.id} type="button" onClick={() => handleNotiClick(n)}
                          className="w-full text-left px-4 py-3 flex gap-3 hover:bg-[var(--toss-gray-1)] transition-colors border-b border-[var(--toss-border)]/50 bg-[var(--toss-blue-light)]/20 last:border-0 group">
                          <span className={`text-xl shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-1">
                              <p className="text-[12px] font-bold text-[var(--foreground)] truncate flex-1">{n.title}</p>
                              <span className="text-[9px] text-[var(--toss-gray-3)] shrink-0 mt-0.5">{timeAgo(n.created_at)}</span>
                            </div>
                            {n.body && <p className="text-[11px] text-[var(--toss-gray-4)] line-clamp-2 mt-0.5 leading-relaxed">{n.body}</p>}
                          </div>
                          <span className="w-2 h-2 bg-[var(--toss-blue)] rounded-full shrink-0 mt-2 animate-pulse" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 읽음 섹션 */}
                {read.length > 0 && (
                  <div>
                    {unread.length > 0 && (
                      <div className="px-4 py-1.5 bg-[var(--toss-gray-1)]/60 sticky top-0">
                        <span className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">읽은 알림</span>
                      </div>
                    )}
                    {read.map(n => {
                      const cfg = getTypeCfg(n.type);
                      return (
                        <button key={n.id} type="button" onClick={() => handleNotiClick(n)}
                          className="w-full text-left px-4 py-3 flex gap-3 hover:bg-[var(--toss-gray-1)] transition-colors border-b border-[var(--toss-border)]/50 opacity-60 last:border-0">
                          <span className={`text-lg shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-1">
                              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] truncate flex-1">{n.title}</p>
                              <span className="text-[9px] text-[var(--toss-gray-3)] shrink-0 mt-0.5">{timeAgo(n.created_at)}</span>
                            </div>
                            {n.body && <p className="text-[10px] text-[var(--toss-gray-3)] line-clamp-1 mt-0.5">{n.body}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 하단 */}
          <div className="px-4 py-2.5 border-t border-[var(--toss-border)] bg-[var(--toss-gray-1)]/40 flex justify-center">
            <button
              type="button"
              onClick={() => { setIsOpen(false); router.push('/main?open_menu=내정보'); }}
              className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
            >
              전체 알림 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

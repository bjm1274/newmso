'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  approval: { icon: '📋', color: 'bg-[var(--toss-blue-light)] border-[var(--toss-blue)]' },
  inventory: { icon: '📦', color: 'bg-orange-50 border-orange-200' },
  payroll: { icon: '💰', color: 'bg-green-50 border-green-200' },
  education: { icon: '📚', color: 'bg-purple-50 border-purple-200' },
  인사: { icon: '👥', color: 'bg-teal-50 border-teal-200' },
  default: { icon: '🔔', color: 'bg-[var(--toss-gray-1)] border-[var(--toss-border)]' },
};

export default function NotificationInbox({ user, onRefresh }: any) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);
        setNotifications(data || []);
      } catch (_) {
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchNotifications();

    const channel = supabase
      .channel(`inbox-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const filtered =
    filter === 'unread'
      ? notifications.filter((n: any) => !n.is_read)
      : notifications;

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const handleNotificationClick = (n: any) => {
    if (!n.is_read) markAsRead(n.id);
    const roomId = n.metadata?.room_id;
    if ((n.type === 'message' || n.type === 'mention') && roomId) {
      router.push('/main?open_chat_room=' + encodeURIComponent(roomId));
    } else if (n.type === 'approval') {
      router.push('/main?open_menu=전자결재');
    } else if (n.type === 'board' || n.type === 'notice') {
      router.push('/main?open_menu=게시판');
    } else if (n.type === '인사' || n.type === 'payroll' || n.type === 'education') {
      router.push('/main?open_menu=인사관리');
    } else if (n.type === 'inventory') {
      router.push('/main?open_menu=재고관리');
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const getTypeStyle = (type: string) => {
    return TYPE_ICONS[type] || TYPE_ICONS.default;
  };

  return (
    <div className="flex flex-col h-full app-page overflow-hidden">
      <header className="p-6 md:p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] shrink-0">
        <h2 className="text-xl md:text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">
          알림 센터
        </h2>
        <p className="text-[11px] md:text-xs text-[var(--toss-gray-3)] font-bold uppercase mt-1 tracking-widest">
          전체 알림 · 읽음/안읽음 필터
        </p>

        <div className="flex items-center gap-4 mt-6">
          <div className="flex gap-2">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-[16px] text-xs font-bold transition-all ${filter === f
                    ? 'bg-[var(--toss-blue)] text-white'
                    : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-border)]'
                  }`}
              >
                {f === 'all' ? '전체' : '안읽음'}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs font-bold text-[var(--toss-blue)] hover:text-[var(--toss-blue)]"
            >
              전체 읽음 처리
            </button>
          )}
          {unreadCount > 0 && (
            <span className="text-xs text-[var(--toss-gray-3)]">
              안읽음 {unreadCount}건
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-[var(--toss-blue-light)] border-t-[var(--toss-blue)] rounded-full animate-spin" />
            <p className="text-xs text-[var(--toss-gray-3)] font-bold">알림을 불러오는 중...</p>
          </div>
        ) : !user?.id ? (
          <div className="text-center py-20 text-[var(--toss-gray-3)] text-sm font-bold">
            직원 계정으로 로그인하면 알림을 확인할 수 있습니다.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-[var(--toss-gray-3)] text-sm font-bold">
            알림이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((n: any) => {
              const style = getTypeStyle(n.type || 'default');
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-4 rounded-[12px] border cursor-pointer transition-all ${n.is_read
                      ? 'bg-[var(--toss-card)] border-[var(--toss-border)] opacity-70'
                      : `border-l-4 ${style.color}`
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-bold ${n.is_read ? 'text-[var(--toss-gray-3)]' : 'text-[var(--foreground)]'
                          }`}
                      >
                        {n.title}
                      </h4>
                      <p className="text-xs text-[var(--toss-gray-3)] mt-1 line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[11px] text-[var(--toss-gray-3)] mt-2">
                        {new Date(n.created_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 bg-[var(--toss-blue)] rounded-full shrink-0 mt-2" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

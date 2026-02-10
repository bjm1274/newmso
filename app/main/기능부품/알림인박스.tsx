'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  approval: { icon: '📋', color: 'bg-blue-50 border-blue-200' },
  inventory: { icon: '📦', color: 'bg-orange-50 border-orange-200' },
  payroll: { icon: '💰', color: 'bg-green-50 border-green-200' },
  education: { icon: '📚', color: 'bg-purple-50 border-purple-200' },
  인사: { icon: '👥', color: 'bg-teal-50 border-teal-200' },
  default: { icon: '🔔', color: 'bg-gray-50 border-gray-200' },
};

export default function NotificationInbox({ user, onRefresh }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      setNotifications(data || []);
      setLoading(false);
    };

    fetchNotifications();
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
    <div className="flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
      <header className="p-6 md:p-8 border-b border-gray-100 bg-white shrink-0">
        <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tighter italic">
          알림 센터
        </h2>
        <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1 tracking-widest">
          전체 알림 · 읽음/안읽음 필터
        </p>

        <div className="flex items-center gap-4 mt-6">
          <div className="flex gap-2">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? '전체' : '안읽음'}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              전체 읽음 처리
            </button>
          )}
          {unreadCount > 0 && (
            <span className="text-xs text-gray-400">
              안읽음 {unreadCount}건
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm font-bold">
            알림이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((n: any) => {
              const style = getTypeStyle(n.type || 'default');
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markAsRead(n.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    n.is_read
                      ? 'bg-white border-gray-100 opacity-70'
                      : `border-l-4 ${style.color}`
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-bold ${
                          n.is_read ? 'text-gray-500' : 'text-gray-800'
                        }`}
                      >
                        {n.title}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-2">
                        {new Date(n.created_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-2" />
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

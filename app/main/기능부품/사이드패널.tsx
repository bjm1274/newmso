'use client';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';

export default function StatusPanel({ user, tasks, surgeries, mris, attStatus, onRefresh }: any) {
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('알림');

  // 알림 조회
  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setNotifications(data as any);
      const unread = data.filter((n: any) => !n.is_read).length;
      setUnreadCount(unread);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    fetchNotifications();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'approval':
        return '📋';
      case 'inventory':
        return '📦';
      case 'payroll':
        return '💰';
      case 'education':
        return '📚';
      default:
        return '🔔';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'approval':
        return 'bg-[var(--toss-blue-light)] border-[var(--toss-blue)]/30';
      case 'inventory':
        return 'bg-orange-50 border-orange-200';
      case 'payroll':
        return 'bg-green-50 border-green-200';
      case 'education':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-[var(--toss-gray-1)] border-[var(--toss-border)]';
    }
  };

  const handleAttendance = async (type: 'in' | 'out') => {
    setLoading(true);
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    try {
      if (type === 'in') {
        const { error } = await supabase.from('attendance').upsert(
          [{ staff_id: user.id, date: today, check_in: now, status: '정상' }],
          { onConflict: 'staff_id,date' }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance')
          .update({ check_out: now })
          .eq('staff_id', user.id)
          .eq('date', today)
          .is('check_out', null);
        if (error) throw error;
      }
      if (typeof onRefresh === 'function') await onRefresh();
    } catch (e: any) {
      console.error('근태 오류', e);
      alert('출퇴근 처리 실패: ' + (e?.message || '잠시 후 다시 시도해 주세요.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="w-80 bg-[var(--toss-card)] border-l border-[var(--toss-border)] p-8 flex flex-col shadow-sm overflow-y-auto">
      {/* 탭 */}
      <div className="flex gap-0.5 mb-6 p-1 app-tab-bar">
        <button
          onClick={() => setActiveTab('알림')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            activeTab === '알림'
              ? 'bg-[var(--toss-card)] shadow-sm text-[var(--toss-blue)]'
              : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
          }`}
        >
          🔔 {unreadCount > 0 && <span className="text-red-400">{unreadCount}</span>}
        </button>
        <button
          onClick={() => setActiveTab('일정')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            activeTab === '일정'
              ? 'bg-[var(--toss-card)] shadow-sm text-[var(--toss-blue)]'
              : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
          }`}
        >
          📅
        </button>
        <button
          onClick={() => setActiveTab('근태')}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
            activeTab === '근태'
              ? 'bg-[var(--toss-card)] shadow-sm text-[var(--toss-blue)]'
              : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
          }`}
        >
          ⏰
        </button>
      </div>

      {/* 알림 탭 */}
      {activeTab === '알림' && (
        <div className="space-y-3 flex-1 overflow-y-auto">
          {notifications.length > 0 ? (
            notifications.map((notif, idx) => (
              <div
                key={notif.id || idx}
                onClick={() => markAsRead(notif.id)}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${getNotificationColor(
                  notif.type
                )} ${notif.is_read ? 'opacity-60' : 'opacity-100'}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">{getNotificationIcon(notif.type)}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-xs text-[var(--foreground)] line-clamp-2">{notif.title}</h4>
                    <p className="text-[9px] text-[var(--toss-gray-4)] font-bold mt-0.5 line-clamp-2">{notif.body}</p>
                    <p className="text-[8px] text-[var(--toss-gray-3)] font-bold mt-1">
                      {new Date(notif.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  {!notif.is_read && (
                    <div className="w-2 h-2 bg-[var(--toss-blue)] rounded-full shrink-0 mt-1" />
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-[var(--toss-gray-3)]">
              <p className="font-bold text-xs italic">알림이 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 일정 탭 */}
      {activeTab === '일정' && (
        <div className="space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-3">
            <p className="px-2 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">오늘 수술</p>
            <div className="bg-[var(--toss-gray-1)] rounded-lg p-4 space-y-3 shadow-inner">
              {surgeries && surgeries.length > 0 ? (
                surgeries.map((s: any, i: number) => (
                  <div key={i} className="flex flex-col border-b border-[var(--toss-border)] pb-2">
                    <span className="text-[10px] font-semibold text-orange-600">{s.surgery_time?.slice(0, 5)}</span>
                    <span className="text-[11px] font-semibold text-[var(--foreground)]">{s.patient_name} ({s.surgery_name})</span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">일정이 없습니다.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="px-2 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">오늘 MRI</p>
            <div className="bg-[var(--toss-gray-1)] rounded-lg p-4 space-y-3 shadow-inner">
              {mris && mris.length > 0 ? (
                mris.map((m: any, i: number) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      m.is_fasting ? 'border-[var(--toss-blue)]/30 bg-[var(--toss-blue-light)]/50' : 'bg-[var(--toss-card)] border-[var(--toss-border)]'
                    }`}
                  >
                    <span className="text-[10px] font-semibold text-[var(--toss-blue)]">{m.mri_time?.slice(0, 5)}</span>
                    <p className="text-[11px] font-semibold text-[var(--foreground)]">
                      {m.patient_name} {m.is_fasting && '(금식)'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">일정이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 근태 탭 */}
      {activeTab === '근태' && (
        <div className="space-y-4 flex-1">
          <p className="px-2 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">실시간 근태 현황</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={attStatus !== 'none' || loading}
              onClick={() => handleAttendance('in')}
              className={`py-5 rounded-3xl font-semibold text-xs transition-all ${
                attStatus === 'none'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'
              }`}
            >
              {attStatus === 'none' ? '출근하기' : '출근완료'}
            </button>
            <button
              disabled={attStatus !== 'checked_in' || loading}
              onClick={() => handleAttendance('out')}
              className={`py-5 rounded-3xl font-semibold text-xs transition-all ${
                attStatus === 'checked_in'
                  ? 'bg-orange-500 text-white shadow-lg'
                  : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'
              }`}
            >
              {attStatus === 'checked_out' ? '퇴근완료' : '퇴근하기'}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { loadNotifSettings, NotifSettings } from './알림시스템';

// ─── 타입 설정 ───
const TABS = [
  { id: 'all', label: '전체', icon: '🔔', types: null },
  { id: 'chat', label: '채팅', icon: '💬', types: ['message', 'mention'] },
  { id: 'approval', label: '결재', icon: '📋', types: ['approval'] },
  { id: 'hr', label: '인사', icon: '👥', types: ['인사', 'payroll', 'education', 'attendance'] },
  { id: 'inventory', label: '재고', icon: '📦', types: ['inventory'] },
  { id: 'other', label: '기타', icon: '📌', types: ['board', 'notification'] },
] as const;

const TYPE_CFG: Record<string, { icon: string; bg: string; text: string; border: string }> = {
  message: { icon: '💬', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600', border: 'border-blue-300' },
  mention: { icon: '📣', bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-600', border: 'border-indigo-300' },
  approval: { icon: '📋', bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-600', border: 'border-violet-300' },
  payroll: { icon: '💰', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600', border: 'border-emerald-300' },
  inventory: { icon: '📦', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600', border: 'border-orange-300' },
  attendance: { icon: '⏰', bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-600', border: 'border-teal-300' },
  board: { icon: '📌', bg: 'bg-pink-50 dark:bg-pink-950/30', text: 'text-pink-600', border: 'border-pink-300' },
  인사: { icon: '👥', bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-700', border: 'border-cyan-300' },
  education: { icon: '📚', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600', border: 'border-purple-300' },
  notification: { icon: '🔔', bg: 'bg-[var(--tab-bg)] dark:bg-slate-800/30', text: 'text-[var(--toss-gray-4)]', border: 'border-[var(--border)]' },
};
const DEFAULT_CFG = { icon: '🔔', bg: 'bg-[var(--tab-bg)] dark:bg-slate-800/30', text: 'text-[var(--toss-gray-4)]', border: 'border-[var(--border)]' };
const getTypeCfg = (t: string) => TYPE_CFG[t] || DEFAULT_CFG;

// 날짜 그룹 분류
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

function timeAgo(dateStr: string) {
  const d = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (d < 60) return '방금';
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

const NOTIF_TYPES_FOR_SETTINGS = [
  { id: 'message', label: '채팅 메시지', icon: '💬', desc: '새 채팅 메시지' },
  { id: 'mention', label: '멘션', icon: '📣', desc: '@멘션 알림' },
  { id: 'approval', label: '전자결재', icon: '📋', desc: '결재 요청·차례' },
  { id: 'payroll', label: '급여', icon: '💰', desc: '급여 정산 완료' },
  { id: 'inventory', label: '재고', icon: '📦', desc: '재고 부족 경고' },
  { id: 'attendance', label: '출퇴근', icon: '⏰', desc: '출근·퇴근 기록' },
  { id: 'board', label: '게시판', icon: '📌', desc: '공지사항·게시물' },
  { id: '인사', label: '인사', icon: '👥', desc: '연차촉진·인사발령' },
  { id: 'education', label: '교육', icon: '📚', desc: '교육 기한 임박' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-checked={checked} role="switch"
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-[var(--accent)]' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--card)] rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

// ─── 알림 설정 탭 ───
function SettingsTab() {
  const [settings, setSettings] = useState<NotifSettings>(loadNotifSettings);

  const update = (partial: Partial<NotifSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    if (typeof window !== 'undefined') localStorage.setItem('erp_notif_settings', JSON.stringify(next));
  };

  const updateType = (id: string, val: boolean) => {
    const next = { ...settings, types: { ...settings.types, [id]: val } };
    setSettings(next);
    if (typeof window !== 'undefined') localStorage.setItem('erp_notif_settings', JSON.stringify(next));
  };

  return (
    <div className="space-y-4 p-4 md:p-4">
      {/* 기본 설정 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">기본 설정</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {[
            { key: 'sound', label: '알림음', desc: '소리로 새 알림 알리기', icon: '🔊' },
            { key: 'vibration', label: '진동', desc: '진동으로 새 알림 알리기', icon: '📳' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
                  <p className="text-xs text-[var(--toss-gray-3)]">{item.desc}</p>
                </div>
              </div>
              <Toggle checked={(settings as any)[item.key]} onChange={v => update({ [item.key]: v } as any)} />
            </div>
          ))}
        </div>
      </div>

      {/* 방해금지 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">방해금지 모드</h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🌙</span>
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">방해금지</p>
                <p className="text-xs text-[var(--toss-gray-3)]">설정 시간 동안 소리·진동 차단</p>
              </div>
            </div>
            <Toggle checked={settings.dndEnabled} onChange={v => update({ dndEnabled: v })} />
          </div>
          {settings.dndEnabled && (
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1">
                <label className="text-xs font-medium text-[var(--toss-gray-3)] block mb-1">시작</label>
                <input type="time" value={settings.dndFrom} onChange={e => update({ dndFrom: e.target.value })}
                  className="w-full h-9 px-3 bg-[var(--muted)] border border-[var(--border)] rounded-xl text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
              </div>
              <span className="text-[var(--toss-gray-3)] mt-5 text-sm">~</span>
              <div className="flex-1">
                <label className="text-xs font-medium text-[var(--toss-gray-3)] block mb-1">종료</label>
                <input type="time" value={settings.dndTo} onChange={e => update({ dndTo: e.target.value })}
                  className="w-full h-9 px-3 bg-[var(--muted)] border border-[var(--border)] rounded-xl text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 알림 타입별 설정 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">알림 유형별 설정</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {NOTIF_TYPES_FOR_SETTINGS.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-lg">{t.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{t.label}</p>
                  <p className="text-xs text-[var(--toss-gray-3)]">{t.desc}</p>
                </div>
              </div>
              <Toggle checked={settings.types[t.id] !== false} onChange={v => updateType(t.id, v)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───
export default function NotificationInbox({ user: _rawUser, onRefresh }: Record<string, unknown>) {
  const _u = (_rawUser ?? {}) as Record<string, unknown>;
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [activeInnerTab, setActiveInnerTab] = useState<'list' | 'settings'>('list');
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!_u?.id) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('notifications').select('*').eq('user_id', _u.id as string).order('created_at', { ascending: false }).limit(200);
      setNotifications(data || []);
    } catch { setNotifications([]); } finally { setLoading(false); }
  }, [_u?.id]);

  useEffect(() => {
    setLoading(true);
    fetchNotifications();
    if (!_u?.id) return;
    const ch = supabase.channel(`inbox-${_u.id as string}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${_u.id as string}` }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [_u?.id, fetchNotifications]);

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

  const handleClick = (n: any) => {
    if (!n.read_at) markAsRead(n.id);
    const meta = n.metadata || {};
    if (n.type === 'message' || n.type === 'mention') router.push(meta.room_id ? `/main?open_chat_room=${meta.room_id}` : '/main?open_menu=채팅');
    else if (n.type === 'approval') {
      const approvalView =
        typeof meta.approval_view === 'string' && meta.approval_view.trim()
          ? encodeURIComponent(meta.approval_view)
          : null;
      router.push(
        approvalView
          ? `/main?open_menu=전자결재&open_subview=${approvalView}`
          : '/main?open_menu=전자결재'
      );
    }
    else if (n.type === 'board' || n.type === 'notice') router.push('/main?open_menu=게시판');
    else if (n.type === '인사' || n.type === 'payroll' || n.type === 'education' || n.type === 'attendance') router.push('/main?open_menu=내정보');
    else if (n.type === 'inventory') router.push('/main?open_menu=재고관리');
  };

  // 탭 필터링
  const tabDef = TABS.find(t => t.id === activeTab)!;
  const tabTypes = tabDef.types ? [...tabDef.types] : null;
  const filtered = tabTypes
    ? notifications.filter(n => tabTypes.includes(n.type))
    : notifications;

  // 안읽음 배지 per 탭
  const tabBadge = (types: readonly string[] | null) =>
    types ? notifications.filter(n => types.includes(n.type) && !n.read_at).length
      : notifications.filter(n => !n.read_at).length;

  const unreadCount = notifications.filter(n => !n.read_at).length;

  // 날짜 그룹화
  const grouped: Record<string, any[]> = {};
  const GROUP_ORDER = ['오늘', '어제', '이번 주', '이전'];
  filtered.forEach(n => {
    const g = getDateGroup(n.created_at);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(n);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* 헤더 */}
      <header className="px-5 pt-6 pb-0 shrink-0 bg-[var(--card)] border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">알림</h2>
            {unreadCount > 0 && <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">안읽음 {unreadCount}건</p>}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && activeInnerTab === 'list' && (
              <button onClick={markAllAsRead} className="text-xs font-bold text-[var(--accent)] hover:underline">전체 읽음</button>
            )}
          </div>
        </div>

        {/* 상단 탭바: 목록 / 설정 */}
        <div className="flex gap-1 mb-[-1px]">
          {([{ id: 'list', label: '알림 목록' }, { id: 'settings', label: '⚙️ 설정' }] as const).map(t => (
            <button key={t.id} type="button" onClick={() => setActiveInnerTab(t.id)}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all ${activeInnerTab === t.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {activeInnerTab === 'settings' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar"><SettingsTab /></div>
      ) : (
        <>
          {/* 타입 탭 가로 스크롤 */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--card)] border-b border-[var(--border)] overflow-x-auto no-scrollbar shrink-0">
            {TABS.map(tab => {
              const badge = tabBadge(tab.types as string[] | null);
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold whitespace-nowrap transition-all shrink-0 ${activeTab === tab.id
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-3)] hover:bg-[var(--border)]'}`}>
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {badge > 0 && (
                    <span className={`text-[9px] font-black px-1 py-0 rounded-[var(--radius-md)] ${activeTab === tab.id ? 'bg-[var(--card)]/30 text-white' : 'bg-red-500 text-white'}`}>{badge}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 알림 목록 */}
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-2 border-[var(--toss-blue-light)] border-t-[var(--accent)] rounded-full animate-spin" />
                <p className="text-xs text-[var(--toss-gray-3)] font-medium">알림을 불러오는 중...</p>
              </div>
            ) : !_u?.id ? (
              <div className="text-center py-20 text-[var(--toss-gray-3)] text-sm font-medium">직원 계정으로 로그인하면 알림을 확인할 수 있습니다.</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-3 opacity-20">📭</p>
                <p className="text-sm font-medium text-[var(--toss-gray-3)]">알림이 없습니다</p>
              </div>
            ) : (
              <div>
                {GROUP_ORDER.filter(g => grouped[g]?.length).map(group => (
                  <div key={group}>
                    {/* 날짜 그룹 헤더 */}
                    <div className="sticky top-0 px-5 py-2 bg-[var(--background)]/90 backdrop-blur-sm z-10 border-b border-[var(--border)]/50">
                      <span className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">{group}</span>
                    </div>

                    {/* 알림 아이템 */}
                    <div className="divide-y divide-[var(--border)]/50">
                      {grouped[group].map(n => {
                        const cfg = getTypeCfg(n.type);
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleClick(n)}
                            className={`relative flex items-start gap-3.5 px-5 py-4 cursor-pointer transition-colors hover:bg-[var(--muted)] group
                              ${!n.read_at ? `border-l-4 ${cfg.border} bg-opacity-30` : 'opacity-75'}`}
                          >
                            {/* 타입 아이콘 */}
                            <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xl ${n.read_at ? 'bg-[var(--muted)]' : cfg.bg}`}>
                              {cfg.icon}
                            </div>

                            {/* 내용 */}
                            <div className="flex-1 min-w-0 pr-8">
                              <div className="flex items-baseline gap-2">
                                <p className={`text-sm leading-snug flex-1 ${n.read_at ? 'font-medium text-[var(--toss-gray-3)]' : 'font-bold text-[var(--foreground)]'}`}>
                                  {n.title}
                                </p>
                                <span className="text-[10px] text-[var(--toss-gray-3)] whitespace-nowrap shrink-0">{timeAgo(n.created_at)}</span>
                              </div>
                              {n.body && (
                                <p className="text-xs text-[var(--toss-gray-3)] mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                              )}
                            </div>

                            {/* 안읽음 점 */}
                            {!n.read_at && (
                              <span className="absolute right-5 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--accent)] rounded-full" />
                            )}

                            {/* 삭제 버튼 (hover 시 표시) */}
                            <button type="button" onClick={e => deleteNotif(n.id, e)}
                              className="absolute right-5 top-3.5 w-6 h-6 flex items-center justify-center rounded-full text-[var(--toss-gray-3)] hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 text-xs"
                              aria-label="삭제">✕</button>
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

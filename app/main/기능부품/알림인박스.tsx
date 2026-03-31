'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  getPushConnectionStatus,
  initNotificationService,
  loadNotifSettings,
  NotifSettings,
  PUSH_STATUS_CHANGED_EVENT,
  type PushConnectionStatus,
} from './알림시스템';

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
  message: { icon: '💬', bg: 'bg-blue-500/10 dark:bg-blue-950/30', text: 'text-blue-600', border: 'border-blue-300' },
  mention: { icon: '📣', bg: 'bg-indigo-500/10 dark:bg-indigo-950/30', text: 'text-indigo-600', border: 'border-indigo-300' },
  approval: { icon: '📋', bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-600', border: 'border-violet-300' },
  payroll: { icon: '💰', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600', border: 'border-emerald-300' },
  inventory: { icon: '📦', bg: 'bg-orange-500/10 dark:bg-orange-950/30', text: 'text-orange-600', border: 'border-orange-300' },
  attendance: { icon: '⏰', bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-600', border: 'border-teal-300' },
  board: { icon: '📌', bg: 'bg-pink-500/10 dark:bg-pink-950/30', text: 'text-pink-600', border: 'border-pink-300' },
  인사: { icon: '👥', bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-700', border: 'border-cyan-300' },
  education: { icon: '📚', bg: 'bg-purple-500/10 dark:bg-purple-950/30', text: 'text-purple-600', border: 'border-purple-300' },
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

function buildApprovalNotificationHref(metadata: Record<string, any>) {
  const params = new URLSearchParams({
    open_menu: '전자결재',
  });

  if (typeof metadata?.approval_view === 'string' && metadata.approval_view.trim()) {
    params.set('open_subview', metadata.approval_view.trim());
  }

  const approvalId = String(metadata?.approval_id || '').trim();
  if (approvalId) {
    params.set('open_approval_id', approvalId);
  }

  return `/main?${params.toString()}`;
}

function buildBoardNotificationHref(metadata: Record<string, any>) {
  const params = new URLSearchParams({
    open_menu: '게시판',
  });

  if (typeof metadata?.board_type === 'string' && metadata.board_type.trim()) {
    params.set('open_board', metadata.board_type.trim());
  }

  const postId = String(metadata?.post_id || '').trim();
  if (postId) {
    params.set('open_post', postId);
  }

  return `/main?${params.toString()}`;
}

function buildInventoryNotificationHref(metadata: Record<string, any>) {
  const params = new URLSearchParams({
    open_menu: '재고관리',
  });

  const inventoryView =
    typeof metadata?.inventory_view === 'string' && metadata.inventory_view.trim()
      ? metadata.inventory_view.trim()
      : '';
  const approvalId = String(metadata?.inventory_approval || metadata?.approval_id || '').trim();

  if (inventoryView || approvalId) {
    params.set('open_inventory_view', inventoryView || '현황');
  }

  if (approvalId) {
    params.set('open_inventory_approval', approvalId);
  }

  return `/main?${params.toString()}`;
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
function SettingsTab({ userId }: { userId?: string | null }) {
  const [settings, setSettings] = useState<NotifSettings>(loadNotifSettings);
  const [pushStatus, setPushStatus] = useState<PushConnectionStatus | null>(null);
  const [pushStatusError, setPushStatusError] = useState<string | null>(null);
  const [pushActionPending, setPushActionPending] = useState(false);

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

  const refreshPushStatus = useCallback(async () => {
    if (!userId) {
      setPushStatus(null);
      setPushStatusError(null);
      return;
    }

    try {
      setPushStatus(await getPushConnectionStatus(userId));
      setPushStatusError(null);
    } catch {
      setPushStatusError('푸시 상태를 확인하지 못했습니다.');
    }
  }, [userId]);

  useEffect(() => {
    void refreshPushStatus();
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handlePushStatusRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshPushStatus();
    };

    window.addEventListener('focus', handlePushStatusRefresh);
    document.addEventListener('visibilitychange', handlePushStatusRefresh);
    window.addEventListener(PUSH_STATUS_CHANGED_EVENT, handlePushStatusRefresh);

    return () => {
      window.removeEventListener('focus', handlePushStatusRefresh);
      document.removeEventListener('visibilitychange', handlePushStatusRefresh);
      window.removeEventListener(PUSH_STATUS_CHANGED_EVENT, handlePushStatusRefresh);
    };
  }, [refreshPushStatus]);

  const handleReconnectPush = useCallback(async () => {
    if (!userId) return;

    setPushActionPending(true);
    setPushStatusError(null);
    try {
      const currentStatus = await getPushConnectionStatus(userId);
      await initNotificationService({
        staffId: userId,
        requestPermission:
          currentStatus.permission !== 'granted' && currentStatus.permission !== 'denied',
      });
    } catch {
      setPushStatusError('푸시 재연결에 실패했습니다.');
    } finally {
      await refreshPushStatus();
      setPushActionPending(false);
    }
  }, [refreshPushStatus, userId]);

  const pushPermissionLabel =
    pushStatus?.permission === 'granted'
      ? '허용됨'
      : pushStatus?.permission === 'denied'
        ? '차단됨'
        : pushStatus?.permission === 'default'
          ? '미설정'
          : '미지원';

  const pushConnectionLabel = !pushStatus
    ? '상태 확인 중'
    : !pushStatus.supported
      ? '이 기기에서는 웹 푸시를 지원하지 않습니다.'
      : !pushStatus.secureContext
        ? '보안 연결에서만 푸시를 사용할 수 있습니다.'
        : pushStatus.active
          ? '푸시가 이 기기에 연결되어 있습니다.'
          : pushStatus.permission === 'denied'
            ? '브라우저 또는 OS 설정에서 알림 권한을 다시 허용해야 합니다.'
            : pushStatus.permission === 'default'
              ? '알림 권한을 허용하면 닫힌 상태에서도 푸시를 받을 수 있습니다.'
              : '권한은 허용됐지만 현재 구독이 끊겨 있습니다.';

  const canReconnectPush = Boolean(
    userId &&
    pushStatus?.supported &&
    pushStatus.secureContext &&
    pushStatus.permission !== 'denied'
  );
  const pushActionLabel =
    pushStatus?.permission === 'default' ? '알림 권한 켜기' : '푸시 다시 연결';

  return (
    <div className="space-y-4 p-4 md:p-4">
      <div
        data-testid="notification-settings-push-status"
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">푸시 연결 상태</h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">모바일 상단 미리보기 / 닫힌 상태 알림</p>
              <p
                data-testid="notification-settings-push-connection"
                className="text-xs text-[var(--toss-gray-3)] mt-1 leading-relaxed"
              >
                {userId ? pushConnectionLabel : '직원 계정으로 로그인하면 푸시 상태를 확인할 수 있습니다.'}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                pushStatus?.active
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {pushStatus?.active ? '연결됨' : '확인 필요'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <p className="text-[var(--toss-gray-3)]">권한</p>
              <p data-testid="notification-settings-push-permission" className="mt-1 font-bold text-[var(--foreground)]">
                {pushPermissionLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <p className="text-[var(--toss-gray-3)]">구독</p>
              <p className="mt-1 font-bold text-[var(--foreground)]">
                {pushStatus?.hasSubscription ? '브라우저 등록됨' : '브라우저 등록 없음'}
              </p>
            </div>
          </div>

          {pushStatus?.permission === 'denied' && (
            <p className="text-xs text-amber-600">
              현재는 브라우저 또는 OS 설정에서 알림 권한을 다시 허용해야 합니다.
            </p>
          )}
          {pushStatusError && (
            <p className="text-xs text-red-500">{pushStatusError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {canReconnectPush && (
              <button
                type="button"
                data-testid="notification-settings-push-action"
                onClick={() => void handleReconnectPush()}
                disabled={pushActionPending}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold disabled:opacity-60"
              >
                {pushActionPending ? '연결 중...' : pushActionLabel}
              </button>
            )}
            <button
              type="button"
              data-testid="notification-settings-push-refresh"
              onClick={() => void refreshPushStatus()}
              className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--foreground)]"
            >
              상태 새로고침
            </button>
          </div>
        </div>
      </div>

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
      router.push(buildApprovalNotificationHref(meta));
    }
    else if (n.type === 'board' || n.type === 'notice' || (n.type === 'notification' && meta?.post_id)) {
      router.push(buildBoardNotificationHref(meta));
    }
    else if (n.type === '인사' || n.type === 'payroll' || n.type === 'education' || n.type === 'attendance') router.push('/main?open_menu=내정보');
    else if (n.type === 'inventory') router.push(buildInventoryNotificationHref(meta));
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
        <div className="flex-1 overflow-y-auto custom-scrollbar"><SettingsTab userId={_u?.id as string | undefined} /></div>
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
                    <span className={`text-[9px] font-black px-1 py-0 rounded-[var(--radius-md)] ${activeTab === tab.id ? 'bg-[var(--card)]/30 text-white' : 'bg-red-500/100 text-white'}`}>{badge}</span>
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
                              className="absolute right-5 top-3.5 w-6 h-6 flex items-center justify-center rounded-full text-[var(--toss-gray-3)] hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 text-xs"
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

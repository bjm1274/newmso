'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime-bus';
import {
  resolveNotificationTarget,
  toNotificationMetadataRecord,
} from '@/lib/notification-metadata';
import {
  flushPushRetryQueue,
  getPushConnectionStatus,
  initNotificationService,
  loadNotifSettings,
  NOTIFICATION_DELIVERY_EVENT,
  NotifSettings,
  PUSH_DEBUG_EVENT,
  PUSH_STATUS_CHANGED_EVENT,
  readNotificationDeliveryLog,
  readPushDebugLog,
  saveNotifSettings,
  sendNotification,
  type NotificationDeliveryLogEntry,
  type PushConnectionStatus,
} from './알림시스템';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { timeAgo } from '@/lib/notification-utils';

// ─── 타입 설정 ───
const TABS = [
  { id: 'all', label: '전체', icon: '🔔', types: null },
  { id: 'chat', label: '채팅', icon: '💬', types: ['message', 'mention'] },
  { id: 'approval', label: '결재', icon: '📋', types: ['approval'] },
  { id: 'hr', label: '인사', icon: '👥', types: ['인사', 'payroll', 'education', 'attendance'] },
  { id: 'inventory', label: '재고', icon: '📦', types: ['inventory'] },
  { id: 'other', label: '기타', icon: '📌', types: ['board', 'notification'] },
] as const;

type InboxDateRange = 'all' | 'today' | '7d' | '30d';
type InboxStateFilter = 'all' | 'unread' | 'action';

const INBOX_DATE_FILTERS: Array<{ id: InboxDateRange; label: string }> = [
  { id: 'all', label: '전체 기간' },
  { id: 'today', label: '오늘' },
  { id: '7d', label: '최근 7일' },
  { id: '30d', label: '최근 30일' },
];

function normalizeKeywordInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((token) => token.trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  );
}

function isWithinInboxDateRange(dateValue: string, range: InboxDateRange) {
  if (range === 'all') return true;
  const targetTime = new Date(dateValue).getTime();
  if (Number.isNaN(targetTime)) return false;
  const now = new Date();

  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return targetTime >= start;
  }

  const days = range === '7d' ? 7 : 30;
  return targetTime >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

function matchesNotificationSearch(notification: Record<string, unknown>, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const metadata =
    notification.metadata && typeof notification.metadata === 'object'
      ? notification.metadata as Record<string, unknown>
      : {};

  const haystack = [
    notification.title,
    notification.body,
    notification.type,
    metadata.sender_name,
    metadata.room_name,
    metadata.board_type,
    metadata.open_menu,
    metadata.open_subview,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return haystack.includes(query);
}

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

function isActionRequiredNotification(notification: Record<string, unknown>) {
  const metadata =
    notification.metadata && typeof notification.metadata === 'object'
      ? notification.metadata as Record<string, unknown>
      : {};
  const type = String(notification.type || '');
  const actionValue = String(metadata.action_required || metadata.requires_action || metadata.action || '').toLowerCase();
  return Boolean(metadata.action_required || metadata.requires_action)
    || actionValue === 'true'
    || actionValue === 'required'
    || type === 'approval';
}

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
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--card)] rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

// ─── 알림 설정 탭 ───
function SettingsTab({ userId }: { userId?: string | null }) {
  const [settings, setSettings] = useState<NotifSettings>(loadNotifSettings);
  const [keywordInput, setKeywordInput] = useState('');
  const [pushStatus, setPushStatus] = useState<PushConnectionStatus | null>(null);
  const [pushStatusError, setPushStatusError] = useState<string | null>(null);
  const [pushActionPending, setPushActionPending] = useState(false);
  const [pushTestPending, setPushTestPending] = useState(false);
  const [pushTestResult, setPushTestResult] = useState<string | null>(null);
  const [pushDebugLog, setPushDebugLog] = useState(() => readPushDebugLog());
  const [deliveryLog, setDeliveryLog] = useState<NotificationDeliveryLogEntry[]>(() => readNotificationDeliveryLog());
  const [serverTestPending, setServerTestPending] = useState(false);
  const [serverTestResult, setServerTestResult] = useState<string | null>(null);

  const update = (partial: Partial<NotifSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveNotifSettings(next);
  };

  const updateType = (id: string, val: boolean) => {
    const next = { ...settings, types: { ...settings.types, [id]: val } };
    setSettings(next);
    saveNotifSettings(next);
  };

  const commitKeywords = () => {
    const nextKeywords = normalizeKeywordInput(keywordInput);
    update({ keywords: nextKeywords });
    setKeywordInput(nextKeywords.join(', '));
  };

  const refreshPushStatus = useCallback(async () => {
    if (!userId) {
      setPushStatus(null);
      setPushStatusError(null);
      return;
    }

    try {
      await flushPushRetryQueue();
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncPushDebugLog = () => {
      setPushDebugLog(readPushDebugLog());
    };

    syncPushDebugLog();
    window.addEventListener(PUSH_DEBUG_EVENT, syncPushDebugLog as EventListener);
    return () => {
      window.removeEventListener(PUSH_DEBUG_EVENT, syncPushDebugLog as EventListener);
    };
  }, []);

  useEffect(() => {
    setKeywordInput(settings.keywords.join(', '));
  }, [settings.keywords]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncDeliveryLog = () => {
      setDeliveryLog(readNotificationDeliveryLog());
    };

    syncDeliveryLog();
    window.addEventListener(NOTIFICATION_DELIVERY_EVENT, syncDeliveryLog as EventListener);
    return () => {
      window.removeEventListener(NOTIFICATION_DELIVERY_EVENT, syncDeliveryLog as EventListener);
    };
  }, []);

  const handleReconnectPush = useCallback(async () => {
    if (!userId) return;

    setPushActionPending(true);
    setPushStatusError(null);
    try {
      const currentStatus = await getPushConnectionStatus(userId);
      await flushPushRetryQueue();
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

  const handleServerPushTest = useCallback(async () => {
    setServerTestResult(null);
    setServerTestPending(true);
    try {
      const res = await fetch('/api/notifications/push-self-test', { method: 'POST' });
      const data = await res.json();
      if (data.diagnostics?.env) {
        const env = data.diagnostics.env as Record<string, string>;
        const missing = Object.entries(env).filter(([, v]) => String(v).startsWith('❌')).map(([k]) => k);
        if (missing.length > 0) {
          setServerTestResult(`❌ Cloudflare 환경변수 없음: ${missing.join(', ')}\n→ Cloudflare Workers Settings > Variables에 추가 필요`);
          return;
        }
      }
      setServerTestResult(data.summary || (data.ok ? '✅ 서버 발송 성공! 기기 알림창 확인' : `❌ 실패: ${JSON.stringify(data.results)}`));
    } catch (e) {
      setServerTestResult('❌ 테스트 API 호출 실패');
    } finally {
      setServerTestPending(false);
      setTimeout(() => setPushDebugLog(readPushDebugLog()), 2000);
    }
  }, []);

  const handlePushPopupTest = useCallback(async () => {
    setPushTestResult(null);
    if (!pushStatus?.supported) {
      setPushTestResult('이 기기에서는 웹 알림 팝업을 지원하지 않습니다.');
      return;
    }
    if (!pushStatus.secureContext) {
      setPushTestResult('현재 주소가 보안 연결이 아니어서 시스템 팝업을 띄울 수 없습니다. 휴대폰에서는 HTTPS 또는 설치형 앱으로 접속해 주세요.');
      return;
    }
    if (pushStatus.permission !== 'granted') {
      setPushTestResult('알림 권한이 아직 허용되지 않았습니다. 먼저 알림 권한을 켜 주세요.');
      return;
    }

    setPushTestPending(true);
    try {
      sendNotification('메시지 팝업 테스트', {
        body: '이 알림이 보이면 현재 기기에서 시스템 팝업 경로가 정상입니다.',
        tag: 'erp-push-popup-self-test',
        data: {
          type: 'notification',
          source: 'push-popup-self-test',
        },
      });
      setPushTestResult('테스트 팝업을 보냈습니다. 화면 상단이 아니라 기기 알림 영역도 함께 확인해 주세요.');
    } catch {
      setPushTestResult('테스트 팝업 호출에 실패했습니다.');
    } finally {
      setPushTestPending(false);
    }
  }, [pushStatus]);

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
  const showIosGuide = Boolean(pushStatus?.appleMobile);
  const canRunPopupTest = Boolean(
    pushStatus?.supported &&
    pushStatus.secureContext &&
    pushStatus.permission === 'granted'
  );
  const currentOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';

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
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <p className="text-[var(--toss-gray-3)]">접속</p>
              <p data-testid="notification-settings-push-secure-context" className="mt-1 font-bold text-[var(--foreground)]">
                {pushStatus?.secureContext ? '보안 연결' : '비보안 연결'}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <p className="text-[var(--toss-gray-3)]">플랫폼</p>
              <p data-testid="notification-settings-push-platform" className="mt-1 font-bold text-[var(--foreground)]">
                {pushStatus?.platform || 'unknown'}
              </p>
            </div>
          </div>

          {currentOrigin && (
            <p
              data-testid="notification-settings-push-origin"
              className="text-xs text-[var(--toss-gray-3)] break-all"
            >
              현재 주소: {currentOrigin}
            </p>
          )}

          {!pushStatus?.secureContext && (
            <p
              data-testid="notification-settings-push-secure-guide"
              className="text-xs text-amber-600 leading-relaxed"
            >
              휴대폰에서 `http://192.168...` 같은 사설 IP 주소로 연 개발 서버는 시스템 팝업이 동작하지 않습니다. HTTPS 주소나 홈 화면에 추가한 설치형 앱으로 접속해 주세요.
            </p>
          )}

          {showIosGuide && (
            <div
              data-testid="notification-settings-ios-guide"
              className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-xs text-sky-800 dark:text-sky-200"
            >
              <p className="font-bold">iPhone 안내</p>
              {!pushStatus?.standalone && (
                <p className="mt-1 leading-relaxed">
                  iPhone은 Safari 탭보다 홈 화면에 추가한 설치형 앱에서 푸시가 더 안정적으로 동작합니다.
                </p>
              )}
              {pushStatus?.permission === 'default' && (
                <p className="mt-1 leading-relaxed">
                  설치형 앱에서 화면을 한 번 터치한 뒤 권한 요청을 허용해야 닫힌 상태 알림이 살아납니다.
                </p>
              )}
              {pushStatus?.permission === 'denied' && (
                <p className="mt-1 leading-relaxed">
                  설정 앱 또는 Safari 설정에서 알림 권한을 다시 허용한 뒤 이 화면으로 돌아와 재연결해 주세요.
                </p>
              )}
            </div>
          )}

          {pushStatus?.permission === 'denied' && (
            <p className="text-xs text-amber-600">
              현재는 브라우저 또는 OS 설정에서 알림 권한을 다시 허용해야 합니다.
            </p>
          )}
          {pushStatusError && (
            <p className="text-xs text-red-500">{pushStatusError}</p>
          )}
          {pushTestResult && (
            <p data-testid="notification-settings-push-test-result" className="text-xs text-[var(--toss-gray-3)]">
              {pushTestResult}
            </p>
          )}
          {serverTestResult && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap">
              <p className="font-bold text-[var(--foreground)] mb-1">🖥️ 서버 발송 테스트 결과</p>
              <p className="text-[var(--toss-gray-3)]">{serverTestResult}</p>
            </div>
          )}
          {pushDebugLog.length > 0 && (
            <div
              data-testid="notification-settings-push-debug-log"
              className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3"
            >
              <p className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">최근 푸시 진단</p>
              <div className="mt-2 space-y-2">
                {pushDebugLog.slice(0, 5).map((entry, index) => (
                  <div key={`${entry.at}-${entry.stage}-${index}`} className="text-xs text-[var(--toss-gray-3)] leading-relaxed">
                    <p className="font-semibold text-[var(--foreground)]">
                      [{entry.source === 'sw' ? 'SW' : 'APP'}] {entry.message}
                    </p>
                    <p>{timeAgo(entry.at)}</p>
                    {entry.detail && Object.keys(entry.detail).length > 0 && (
                      <p className="break-all">
                        {Object.entries(entry.detail)
                          .filter(([key]) => key !== 'message' && key !== 'stage')
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(' / ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
              data-testid="notification-settings-push-test"
              onClick={() => void handlePushPopupTest()}
              disabled={pushTestPending}
              className={`px-4 py-2 rounded-xl text-xs font-bold border ${
                canRunPopupTest
                  ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700'
                  : 'border-[var(--border)] text-[var(--toss-gray-3)]'
              } disabled:opacity-60`}
            >
              {pushTestPending ? '테스트 중...' : '팝업 테스트'}
            </button>
            <button
              type="button"
              onClick={() => void handleServerPushTest()}
              disabled={serverTestPending}
              className="px-4 py-2 rounded-xl border border-orange-300 bg-orange-500/10 text-orange-700 text-xs font-bold disabled:opacity-60"
            >
              {serverTestPending ? '테스트 중...' : '서버 발송 테스트'}
            </button>
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

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">개인 알림 정책</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">🗓️</span>
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">주말 무음</p>
                <p className="text-xs text-[var(--toss-gray-3)]">주말에는 알림 표시는 유지하고 소리와 진동만 끕니다.</p>
              </div>
            </div>
            <Toggle checked={settings.weekendMute} onChange={v => update({ weekendMute: v })} />
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏷️</span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">키워드 알림 우선</p>
                  <p className="text-xs text-[var(--toss-gray-3)]">일반 채팅·게시판·기타 알림은 등록한 키워드가 있을 때만 토스트를 띄웁니다.</p>
                </div>
              </div>
              <Toggle checked={settings.keywordAlertsEnabled} onChange={v => update({ keywordAlertsEnabled: v })} />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--toss-gray-3)]">키워드</label>
              <textarea
                data-testid="notification-settings-keywords"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onBlur={commitKeywords}
                rows={3}
                placeholder="예: 결재, 재고, 장애, 야간"
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--toss-gray-3)]">쉼표나 줄바꿈으로 여러 키워드를 등록할 수 있습니다.</p>
                <button
                  type="button"
                  onClick={commitKeywords}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--foreground)]"
                >
                  키워드 저장
                </button>
              </div>
            </div>
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

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">최근 전달 이력</h3>
        </div>
        <div className="px-5 py-4">
          {deliveryLog.length === 0 ? (
            <p className="text-xs text-[var(--toss-gray-3)]">아직 기록된 전달 이력이 없습니다.</p>
          ) : (
            <div className="space-y-2" data-testid="notification-settings-delivery-log">
              {deliveryLog.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--foreground)] truncate">{entry.title}</p>
                      <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">
                        {entry.type} 쨌 {entry.stage}
                      </p>
                    </div>
                    <span className="text-[10px] text-[var(--toss-gray-3)] shrink-0">{timeAgo(entry.at)}</span>
                  </div>
                  {entry.detail && Object.keys(entry.detail).length > 0 && (
                    <p className="text-[11px] text-[var(--toss-gray-3)] mt-2 break-all">
                      {Object.entries(entry.detail)
                        .map(([key, value]) => `${key}: ${String(value)}`)
                        .join(' / ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───
function NotificationInbox({ user: _rawUser, onRefresh }: Record<string, unknown>) {
  const _u = (_rawUser ?? {}) as Record<string, unknown>;
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [activeInnerTab, setActiveInnerTab] = useState<'list' | 'settings'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [dateRange, setDateRange] = useState<InboxDateRange>('all');
  const [stateFilter, setStateFilter] = useState<InboxStateFilter>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    const userId = _u.id as string;
    const unsub = subscribeRealtime(
      `inbox-${userId}`,
      [{ table: 'notifications', filter: `user_id=eq.${userId}` }],
      () => fetchNotifications(),
    );
    return () => unsub();
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

  useEffect(() => {
    if (selectionMode) return;
    if (selectedIds.length === 0) return;
    setSelectedIds([]);
  }, [selectedIds.length, selectionMode]);

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

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((targetId) => targetId !== id) : [...prev, id]
    );
  }, []);

  const markSelectedAsRead = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const readAt = new Date().toISOString();
    await supabase.from('notifications').update({ read_at: readAt }).in('id', selectedIds);
    setNotifications((prev) =>
      prev.map((notification) =>
        selectedIds.includes(String(notification.id))
          ? { ...notification, read_at: notification.read_at || readAt }
          : notification
      )
    );
    setSelectedIds([]);
    setSelectionMode(false);
    emitNotificationReadSync();
  }, [emitNotificationReadSync, selectedIds]);

  const deleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await supabase.from('notifications').delete().in('id', selectedIds);
    setNotifications((prev) =>
      prev.filter((notification) => !selectedIds.includes(String(notification.id)))
    );
    setSelectedIds([]);
    setSelectionMode(false);
    emitNotificationReadSync();
  }, [emitNotificationReadSync, selectedIds]);

  const handleClick = (n: any) => {
    if (selectionMode) {
      toggleSelected(String(n.id));
      return;
    }
    if (!n.read_at) markAsRead(n.id);
    const target = resolveNotificationTarget(n.type, toNotificationMetadataRecord(n.metadata));
    router.push(target.href);
  };

  // 탭 필터링
  const tabDef = TABS.find(t => t.id === activeTab)!;
  const tabTypes = tabDef.types ? [...tabDef.types] : null;
  const filtered = useMemo(
    () =>
      notifications.filter((notification) => {
        if (tabTypes && !tabTypes.includes(notification.type)) return false;
        if ((showUnreadOnly || stateFilter === 'unread') && notification.read_at) return false;
        if (stateFilter === 'action' && !isActionRequiredNotification(notification)) return false;
        if (!isWithinInboxDateRange(String(notification.created_at || ''), dateRange)) return false;
        if (!matchesNotificationSearch(notification, searchQuery)) return false;
        return true;
      }),
    [dateRange, notifications, searchQuery, showUnreadOnly, stateFilter, tabTypes]
  );

  // 안읽음 배지 per 탭
  const tabBadge = (types: readonly string[] | null) =>
    types ? notifications.filter(n => types.includes(n.type) && !n.read_at).length
      : notifications.filter(n => !n.read_at).length;

  const unreadCount = notifications.filter(n => !n.read_at).length;
  const actionRequiredCount = notifications.filter((notification) => isActionRequiredNotification(notification)).length;
  const selectedCount = selectedIds.length;

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
            {activeInnerTab === 'list' && (
              <button
                type="button"
                data-testid="notification-selection-toggle"
                onClick={() => setSelectionMode((prev) => !prev)}
                className="text-xs font-bold text-[var(--toss-gray-3)] hover:text-[var(--foreground)]"
              >
                {selectionMode ? '선택 취소' : '여러 개 선택'}
              </button>
            )}
          </div>
        </div>

        {/* 상단 탭바: 목록 / 설정 */}
        <div className="flex gap-1 mb-[-1px]">
          {([{ id: 'list', label: '알림 목록' }, { id: 'settings', label: '⚙️ 설정' }] as const).map(t => (
            <button key={t.id} type="button" data-testid={`notification-inner-tab-${t.id}`} onClick={() => setActiveInnerTab(t.id)}
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
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                data-testid="notification-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="제목, 본문, 발신자, 메뉴명 검색"
                className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="notification-unread-filter"
                  onClick={() => {
                    const next = stateFilter === 'unread' ? 'all' : 'unread';
                    setStateFilter(next);
                    setShowUnreadOnly(next === 'unread');
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                    showUnreadOnly || stateFilter === 'unread'
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--border)] text-[var(--toss-gray-3)]'
                  }`}
                >
                  안읽음만
                </button>
                <button
                  type="button"
                  data-testid="notification-action-required-filter"
                  onClick={() => {
                    const next = stateFilter === 'action' ? 'all' : 'action';
                    setStateFilter(next);
                    setShowUnreadOnly(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                    stateFilter === 'action'
                      ? 'border-[var(--warning)] bg-[var(--warning)] text-white'
                      : 'border-[var(--border)] text-[var(--toss-gray-3)]'
                  }`}
                >
                  액션 필요 {actionRequiredCount > 0 ? actionRequiredCount : ''}
                </button>
                <select
                  data-testid="notification-date-filter"
                  value={dateRange}
                  onChange={(event) => setDateRange(event.target.value as InboxDateRange)}
                  className="h-10 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-xs font-bold text-[var(--foreground)] outline-none"
                >
                  {INBOX_DATE_FILTERS.map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectionMode && (
              <div className="flex flex-wrap items-center gap-2" data-testid="notification-selection-toolbar">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">선택 {selectedCount}건</span>
                <button
                  type="button"
                  onClick={markSelectedAsRead}
                  disabled={selectedCount === 0}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--foreground)] disabled:opacity-40"
                >
                  선택 읽음
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={selectedCount === 0}
                  className="px-3 py-1.5 rounded-xl border border-red-200 bg-red-500/10 text-xs font-bold text-red-600 disabled:opacity-40"
                >
                  선택 삭제
                </button>
              </div>
            )}
          </div>

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
                        const isSelected = selectedIds.includes(String(n.id));
                        const isUnread = !n.read_at;
                        const needsAction = isActionRequiredNotification(n);
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleClick(n)}
                            className={`relative flex items-start gap-3.5 px-5 py-4 cursor-pointer transition-colors hover:bg-[var(--muted)] group
                              ${isUnread ? `border-l-4 ${cfg.border} bg-opacity-30` : 'opacity-75'}
                              ${needsAction ? 'ring-1 ring-[var(--warning)]/20' : ''}
                              ${isSelected ? 'bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]' : ''}`}
                            data-testid={`notification-inbox-item-${n.id}`}
                          >
                            {selectionMode && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSelected(String(n.id));
                                }}
                                className={`mt-1 h-5 w-5 shrink-0 rounded-md border text-[11px] font-black ${
                                  isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                    : 'border-[var(--border)] text-transparent'
                                }`}
                                aria-label="선택"
                              >
                                ✓
                              </button>
                            )}
                            {/* 타입 아이콘 */}
                            <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-xl ${n.read_at ? 'bg-[var(--muted)]' : cfg.bg}`}>
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
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-[var(--radius-sm)] px-2 py-1 text-[10px] font-black ${
                                  isUnread
                                    ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                                    : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                                }`}>
                                  {isUnread ? '안읽음' : '읽음'}
                                </span>
                                {needsAction ? (
                                  <span className="rounded-[var(--radius-sm)] bg-[var(--warning-light)] px-2 py-1 text-[10px] font-black text-[var(--warning)]">
                                    액션 필요
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* 안읽음 점 */}
                            {isUnread && (
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

export default memo(NotificationInbox);

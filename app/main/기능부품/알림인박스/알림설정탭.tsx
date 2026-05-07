'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '../알림시스템';
import { timeAgo } from '@/lib/notification-utils';
import { LucideIcon } from '../조직도서브/조직도측면창';

// ─── 알림 유형별 설정 상수 ───
const NOTIF_TYPES_FOR_SETTINGS = [
  { id: 'message', label: '채팅 메시지', icon: 'MessageSquare', desc: '새 채팅 메시지' },
  { id: 'mention', label: '멘션', icon: 'Megaphone', desc: '@멘션 알림' },
  { id: 'approval', label: '전자결재', icon: 'ClipboardCheck', desc: '결재 요청·차례' },
  { id: 'payroll', label: '급여', icon: 'ReceiptText', desc: '급여 정산 완료' },
  { id: 'inventory', label: '재고', icon: 'Package', desc: '재고 부족 경고' },
  { id: 'attendance', label: '출퇴근', icon: 'Clock3', desc: '출근·퇴근 기록' },
  { id: 'board', label: '게시판', icon: 'Pin', desc: '공지사항·게시물' },
  { id: '인사', label: '인사', icon: 'Users', desc: '연차촉진·인사발령' },
  { id: 'education', label: '교육', icon: 'BookOpen', desc: '교육 기한 임박' },
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

// ─── Toggle 컴포넌트 ───
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-checked={checked} role="switch"
      className={`relative h-6 w-11 rounded-[var(--radius-lg)] transition-colors duration-200 focus:outline-none ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-[var(--radius-md)] bg-[var(--card)] shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

// ─── 알림 설정 탭 ───
export function SettingsTab({ userId }: { userId?: string | null }) {
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
        const missing = Object.entries(env).filter(([, v]) => String(v).startsWith('\u274c')).map(([k]) => k);
        if (missing.length > 0) {
          setServerTestResult(`배포 환경변수 없음: ${missing.join(', ')}\n배포 대시보드의 환경변수 설정에 추가 필요`);
          return;
        }
      }
      setServerTestResult(data.summary || (data.ok ? '서버 발송 성공. 기기 알림창을 확인해 주세요.' : `실패: ${JSON.stringify(data.results)}`));
    } catch {
      setServerTestResult('테스트 API 호출 실패');
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
        className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]"
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
              className={`shrink-0 rounded-[var(--radius-md)] border px-2.5 py-1 text-[10px] font-black ${
                pushStatus?.active
                  ? 'border-[var(--success)]/20 bg-[var(--success-light)] text-[var(--success)]'
                  : 'border-[var(--warning)]/20 bg-[var(--warning-light)] text-[var(--warning)]'
              }`}
            >
              {pushStatus?.active ? '연결됨' : '확인 필요'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <p className="text-[var(--toss-gray-3)]">권한</p>
              <p data-testid="notification-settings-push-permission" className="mt-1 font-bold text-[var(--foreground)]">
                {pushPermissionLabel}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <p className="text-[var(--toss-gray-3)]">구독</p>
              <p className="mt-1 font-bold text-[var(--foreground)]">
                {pushStatus?.hasSubscription ? '브라우저 등록됨' : '브라우저 등록 없음'}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <p className="text-[var(--toss-gray-3)]">접속</p>
              <p data-testid="notification-settings-push-secure-context" className="mt-1 font-bold text-[var(--foreground)]">
                {pushStatus?.secureContext ? '보안 연결' : '비보안 연결'}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
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
              className="text-xs leading-relaxed text-[var(--warning)]"
            >
              보안 연결이 필요합니다.
            </p>
          )}

          {pushStatus?.permission === 'denied' && (
            <p className="text-xs text-[var(--warning)]">
              알림 권한이 거부되었습니다.
            </p>
          )}
          {pushStatusError && (
            <p className="text-xs text-[var(--danger)]">{pushStatusError}</p>
          )}
          {pushTestResult && (
            <p data-testid="notification-settings-push-test-result" className="text-xs text-[var(--toss-gray-3)]">
              {pushTestResult}
            </p>
          )}
          {serverTestResult && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap">
              <p className="mb-1 flex items-center gap-1.5 font-bold text-[var(--foreground)]">
                <LucideIcon name="Server" size={14} strokeWidth={2} />
                서버 발송 테스트 결과
              </p>
              <p className="text-[var(--toss-gray-3)]">{serverTestResult}</p>
            </div>
          )}
          {pushDebugLog.length > 0 && (
            <div
              data-testid="notification-settings-push-debug-log"
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3"
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
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {pushActionPending ? '연결 중...' : pushActionLabel}
              </button>
            )}
            <button
              type="button"
              data-testid="notification-settings-push-test"
              onClick={() => void handlePushPopupTest()}
              disabled={pushTestPending}
              className={`rounded-[var(--radius-md)] border px-4 py-2 text-xs font-bold ${
                canRunPopupTest
                  ? 'border-[var(--success)]/20 bg-[var(--success-light)] text-[var(--success)]'
                  : 'border-[var(--border)] text-[var(--toss-gray-3)]'
              } disabled:opacity-60`}
            >
              {pushTestPending ? '테스트 중...' : '팝업 테스트'}
            </button>
            <button
              type="button"
              onClick={() => void handleServerPushTest()}
              disabled={serverTestPending}
              className="rounded-[var(--radius-md)] border border-[var(--warning)]/20 bg-[var(--warning-light)] px-4 py-2 text-xs font-bold text-[var(--warning)] disabled:opacity-60"
            >
              {serverTestPending ? '테스트 중...' : '서버 발송 테스트'}
            </button>
            <button
              type="button"
              data-testid="notification-settings-push-refresh"
              onClick={() => void refreshPushStatus()}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--foreground)]"
            >
              상태 새로고침
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">개인 알림 정책</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)]">
                <LucideIcon name="CalendarDays" size={17} strokeWidth={2} />
              </span>
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
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)]">
                  <LucideIcon name="Tags" size={17} strokeWidth={2} />
                </span>
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
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={commitKeywords}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]"
                >
                  키워드 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 기본 설정 */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">기본 설정</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {[
            { key: 'sound', label: '알림음', desc: '소리로 새 알림 알리기', icon: 'Volume2' },
            { key: 'vibration', label: '진동', desc: '진동으로 새 알림 알리기', icon: 'Vibrate' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)]">
                  <LucideIcon name={item.icon} size={17} strokeWidth={2} />
                </span>
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
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">방해금지 모드</h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)]">
                <LucideIcon name="Moon" size={17} strokeWidth={2} />
              </span>
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
                  className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
              </div>
              <span className="text-[var(--toss-gray-3)] mt-5 text-sm">~</span>
              <div className="flex-1">
                <label className="text-xs font-medium text-[var(--toss-gray-3)] block mb-1">종료</label>
                <input type="time" value={settings.dndTo} onChange={e => update({ dndTo: e.target.value })}
                  className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 알림 타입별 설정 */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">알림 유형별 설정</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {NOTIF_TYPES_FOR_SETTINGS.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)]">
                  <LucideIcon name={t.icon} size={17} strokeWidth={2} />
                </span>
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

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--muted)]/50">
          <h3 className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wider">최근 전달 이력</h3>
        </div>
        <div className="px-5 py-4">
          {deliveryLog.length === 0 ? (
            <p className="text-xs text-[var(--toss-gray-3)]">아직 기록된 전달 이력이 없습니다.</p>
          ) : (
            <div className="space-y-2" data-testid="notification-settings-delivery-log">
              {deliveryLog.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2.5">
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import {
  flushPushRetryQueue,
  getPushConnectionStatus,
  initNotificationService,
  loadNotifSettings,
  NotifSettings,
  PUSH_DEBUG_EVENT,
  PUSH_STATUS_CHANGED_EVENT,
  readPushDebugLog,
  saveNotifSettings,
  sendNotification,
  type PushConnectionStatus,
} from '../../기능부품/알림시스템';
import { normalizeKeywordList } from '../../기능부품/알림시스템/filter-helpers';
import { timeAgo } from '@/lib/notification-utils';

export type 알림설정Props = {
  user: ErpUser;
  onBack: () => void;
};

// 토글 스위치 컴포넌트
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (val: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
      style={{ minWidth: 44 }}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--card)] rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

function MobileNotificationSettings({ user, onBack }: 알림설정Props) {
  const userId = typeof user.id === 'string' ? user.id : null;
  const [settings, setSettings] = useState<NotifSettings>(loadNotifSettings);
  const [keywordInput, setKeywordInput] = useState('');
  const [pushStatus, setPushStatus] = useState<PushConnectionStatus | null>(null);
  const [pushStatusError, setPushStatusError] = useState<string | null>(null);
  const [pushActionPending, setPushActionPending] = useState(false);
  const [pushTestPending, setPushTestPending] = useState(false);
  const [pushTestResult, setPushTestResult] = useState<string | null>(null);
  const [pushDebugLog, setPushDebugLog] = useState(() => readPushDebugLog());
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
    const nextKeywords = normalizeKeywordList(keywordInput);
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
          setServerTestResult(`❌ Cloudflare 환경변수 없음: ${missing.join(', ')}`);
          return;
        }
      }
      setServerTestResult(data.summary || (data.ok ? '✅ 서버 발송 성공! 기기 알림 확인' : `❌ 실패: ${JSON.stringify(data.results)}`));
    } catch {
      setServerTestResult('❌ 테스트 API 호출 실패');
    } finally {
      setServerTestPending(false);
      setTimeout(() => setPushDebugLog(readPushDebugLog()), 2000);
    }
  }, []);

  const handlePushPopupTest = useCallback(async () => {
    setPushTestResult(null);
    if (!pushStatus?.supported) {
      setPushTestResult('이 기기에서는 알림 팝업을 지원하지 않습니다.');
      return;
    }
    if (!pushStatus.secureContext) {
      setPushTestResult('보안 연결(HTTPS)이 아니어서 팝업을 띄울 수 없습니다.');
      return;
    }
    if (pushStatus.permission !== 'granted') {
      setPushTestResult('알림 권한이 허용되지 않았습니다. 먼저 알림 권한을 켜 주세요.');
      return;
    }

    setPushTestPending(true);
    try {
      sendNotification('메시지 팝업 테스트', {
        body: '모바일 기기에서 시스템 알림 동작이 정상적입니다.',
        tag: 'erp-push-popup-self-test',
        data: {
          type: 'notification',
          source: 'push-popup-self-test',
        },
      });
      setPushTestResult('테스트 알림을 보냈습니다. 기기 알림창을 확인해 주세요.');
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

  const showIosGuide = Boolean(pushStatus?.appleMobile);

  return (
    <div className="m-screen bg-[var(--page-bg)]">
      <MobileHeader title="알림 설정" eyebrow="내정보" back={onBack} />
      
      <div className="m-scroll p-4 space-y-4">
        {/* 1. 푸시 연결 상태 */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <h4 className="text-sm font-bold text-[var(--foreground)]">푸시 연결 상태</h4>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${pushStatus?.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
              {pushStatus?.active ? '연결됨' : '확인 필요'}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[var(--muted)]/40 p-2.5 rounded-xl border border-[var(--border)]">
              <span className="text-[var(--toss-gray-3)] block mb-0.5">알림 권한</span>
              <span className="font-bold text-[var(--foreground)]">{pushPermissionLabel}</span>
            </div>
            <div className="bg-[var(--muted)]/40 p-2.5 rounded-xl border border-[var(--border)]">
              <span className="text-[var(--toss-gray-3)] block mb-0.5">브라우저 등록</span>
              <span className="font-bold text-[var(--foreground)]">{pushStatus?.hasSubscription ? '등록됨' : '등록 안됨'}</span>
            </div>
          </div>

          {showIosGuide && (
            <div className="bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-200 p-3 rounded-xl text-xs space-y-1">
              <p className="font-bold">💡 iPhone 사용자 안내</p>
              <p className="leading-relaxed">iPhone은 하단 공유 버튼 📤 을 눌러 <b>[홈 화면에 추가]</b>를 진행한 후 앱을 실행해야 알림 푸시를 받을 수 있습니다.</p>
            </div>
          )}

          {pushStatusError && <p className="text-xs text-red-500">{pushStatusError}</p>}
          {pushTestResult && <p className="text-xs text-[var(--toss-gray-3)]">{pushTestResult}</p>}
          {serverTestResult && (
            <div className="bg-[var(--muted)]/40 p-2.5 rounded-xl border border-[var(--border)] text-xs text-[var(--toss-gray-3)] leading-normal">
              <b>🖥️ 서버 테스트 결과:</b> {serverTestResult}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {userId && pushStatus?.supported && pushStatus.secureContext && pushStatus.permission !== 'denied' && (
              <button
                type="button"
                onClick={() => void handleReconnectPush()}
                disabled={pushActionPending}
                className="bg-[var(--accent)] text-white text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-60"
              >
                {pushActionPending ? '연결 중...' : pushStatus?.permission === 'default' ? '알림 권한 켜기' : '푸시 재연결'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handlePushPopupTest()}
              disabled={pushTestPending}
              className="bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-xs font-bold px-3 py-2 rounded-xl"
            >
              팝업 테스트
            </button>
            <button
              type="button"
              onClick={() => void handleServerPushTest()}
              disabled={serverTestPending}
              className="bg-orange-500/10 border border-orange-300 text-orange-700 text-xs font-bold px-3 py-2 rounded-xl"
            >
              서버 알림 테스트
            </button>
          </div>
        </div>

        {/* 2. 알림 환경설정 */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
          <h4 className="text-sm font-bold text-[var(--foreground)] border-b border-[var(--border)] pb-2">기본 수신 정책</h4>

          {/* 소리 / 진동 */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[var(--foreground)] block">소리 알림</span>
              <span className="text-[11px] text-[var(--toss-gray-3)]">알림 수신 시 효과음 재생</span>
            </div>
            <Toggle checked={settings.sound} onChange={(val) => update({ sound: val })} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[var(--foreground)] block">진동 / 햅틱</span>
              <span className="text-[11px] text-[var(--toss-gray-3)]">모바일 웹 햅틱 진동 피드백</span>
            </div>
            <Toggle checked={settings.vibration} onChange={(val) => update({ vibration: val })} />
          </div>

          {/* 주말 무음 */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[var(--foreground)] block">주말 무음 모드</span>
              <span className="text-[11px] text-[var(--toss-gray-3)]">토요일, 일요일에는 알림 소리/진동 안함</span>
            </div>
            <Toggle checked={settings.weekendMute} onChange={(val) => update({ weekendMute: val })} />
          </div>

          {/* 방해 금지 시간 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[var(--foreground)] block">방해금지 시간대 (DND)</span>
                <span className="text-[11px] text-[var(--toss-gray-3)]">지정 시간 동안 알림 소리/진동 음소거</span>
              </div>
              <Toggle checked={settings.dndEnabled} onChange={(val) => update({ dndEnabled: val })} />
            </div>
            {settings.dndEnabled && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="time"
                  value={settings.dndFrom}
                  onChange={(e) => update({ dndFrom: e.target.value })}
                  className="bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs text-[var(--foreground)] focus:outline-none"
                />
                <span className="text-xs text-[var(--toss-gray-3)]">부터</span>
                <input
                  type="time"
                  value={settings.dndTo}
                  onChange={(e) => update({ dndTo: e.target.value })}
                  className="bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs text-[var(--foreground)] focus:outline-none"
                />
                <span className="text-xs text-[var(--toss-gray-3)]">까지</span>
              </div>
            )}
          </div>

          {/* 알림 키워드 */}
          <div className="space-y-2">
            <div>
              <span className="text-xs font-bold text-[var(--foreground)] block">관심 키워드 설정</span>
              <span className="text-[11px] text-[var(--toss-gray-3)]">키워드가 포함된 알림을 중요하게 표시 (쉼표로 구분)</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="예: 긴급, 결재요청, 회의"
                className="flex-1 bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={commitKeywords}
                className="bg-[var(--accent)] text-white text-xs font-bold px-3 py-2 rounded-xl"
              >
                저장
              </button>
            </div>
          </div>
        </div>

        {/* 3. 유형별 알림 켜기/끄기 */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
          <h4 className="text-sm font-bold text-[var(--foreground)] border-b border-[var(--border)] pb-2">유형별 알림 설정</h4>
          
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--foreground)]">💬 채팅방 메시지 알림</span>
            <Toggle checked={settings.types.message} onChange={(val) => updateType('message', val)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--foreground)]">🏷️ 나를 멘션(@이름)한 알림</span>
            <Toggle checked={settings.types.mention} onChange={(val) => updateType('mention', val)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--foreground)]">📋 전자결재문서 결재 대기 알림</span>
            <Toggle checked={settings.types.approval} onChange={(val) => updateType('approval', val)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--foreground)]">📦 재고관리 및 저재고 경고 알림</span>
            <Toggle checked={settings.types.inventory} onChange={(val) => updateType('inventory', val)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--foreground)]">👥 근무/출퇴근 및 인사관리 알림</span>
            <Toggle checked={settings.types.hr} onChange={(val) => updateType('hr', val)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--foreground)]">📌 전사 게시판 및 공지사항 알림</span>
            <Toggle checked={settings.types.board} onChange={(val) => updateType('board', val)} />
          </div>
        </div>

        {/* 4. 최근 진단 로그 */}
        {pushDebugLog.length > 0 && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">최근 푸시 수신 로그</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {pushDebugLog.slice(0, 5).map((entry, index) => (
                <div key={index} className="text-[11px] text-[var(--toss-gray-3)] border-b border-[var(--border)]/40 pb-1.5">
                  <p className="font-semibold text-[var(--foreground)]">[{entry.source}] {entry.message}</p>
                  <p>{timeAgo(entry.at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MobileNotificationSettings;

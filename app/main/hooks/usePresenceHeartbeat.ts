'use client';

/**
 * 온라인 presence heartbeat 훅.
 *
 * 로그인 사용자가 앱에 머무는 동안 주기적으로 /api/chat/presence(POST)를 호출해
 * staff_members.presence_status='online', last_seen_at=now 를 갱신한다.
 * 탭을 닫거나 로그아웃하면 away로 전환한다.
 *
 * 온라인 판정 freshness 윈도(메신저유틸 isRecentPresenceTimestamp)는 5분이므로,
 * 그보다 충분히 잦은 60초 간격으로 heartbeat 한다. 백그라운드 탭에서는 멈췄다가
 * 다시 보일 때(visibilitychange) 즉시 1회 갱신한다.
 */

import { useEffect } from 'react';

const HEARTBEAT_MS = 60_000;

export function usePresenceHeartbeat(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return;
    let stopped = false;

    const beat = () => {
      if (stopped || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
        return;
      }
      void fetch('/api/chat/presence', { method: 'POST', keepalive: true }).catch(() => {});
    };
    const goAway = () => {
      void fetch('/api/chat/presence', { method: 'DELETE', keepalive: true }).catch(() => {});
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') beat();
    };

    beat(); // 즉시 1회
    const timer = setInterval(beat, HEARTBEAT_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', goAway);
    }

    return () => {
      stopped = true;
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', goAway);
      }
      goAway();
    };
  }, [userId]);
}

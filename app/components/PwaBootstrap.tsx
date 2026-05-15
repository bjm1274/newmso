'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOfflineQueue, type QueuedAction } from '@/lib/offline-queue';

type PushDeepLinkMessage = {
  type: 'erp-push-deep-link';
  payload?: {
    deepLink?: unknown;
  };
};

function isPushDeepLinkMessage(value: unknown): value is PushDeepLinkMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.type === 'erp-push-deep-link';
}

export default function PwaBootstrap() {
  const router = useRouter();

  // 서비스워커 등록
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const registerServiceWorker = async () => {
      try {
        const registration =
          (await navigator.serviceWorker.getRegistration('/')) ??
          (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));

        if (!cancelled) {
          void registration.update().catch(() => {});
        }
      } catch (error) {
        console.warn('PWA 서비스워커 등록 실패:', error);
      }
    };

    void registerServiceWorker();
    return () => {
      cancelled = true;
    };
  }, []);

  // 푸시 알림 deep link 수신 → 라우터로 SPA 이동
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (!isPushDeepLinkMessage(event.data)) return;
      const deepLink = event.data.payload?.deepLink;
      if (typeof deepLink !== 'string' || deepLink.length === 0) return;

      try {
        // 절대 URL이 같은 origin이면 path만 추출해 SPA 라우팅
        if (deepLink.startsWith('http')) {
          const url = new URL(deepLink);
          if (url.origin === window.location.origin) {
            router.push(`${url.pathname}${url.search}${url.hash}`);
            return;
          }
          // 외부 URL은 그냥 location 이동 (보안: 외부 도메인 SPA 이동 불가)
          window.location.href = deepLink;
          return;
        }
        router.push(deepLink);
      } catch {
        // URL 파싱 실패 시 무시
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }, [router]);

  // 오프라인 큐 자동 플러시 (네트워크 복구 시 재시도)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const queue = getOfflineQueue();
    const stop = queue.startAutoFlush(async (action: QueuedAction) => {
      const endpoint = resolveQueueEndpoint(action.type);
      if (!endpoint) {
        // 알 수 없는 액션 타입은 영구 제거되지 않도록 throw하여 retry 카운트만 올림
        throw new Error(`unknown queue action type: ${action.type}`);
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: action.type, payload: action.payload }),
      });
      if (!response.ok) {
        throw new Error(`offline queue flush failed (${response.status})`);
      }
    });

    return () => {
      stop();
    };
  }, []);

  return null;
}

/**
 * 오프라인 큐 액션 타입 → API 엔드포인트 매핑.
 * 신규 큐 액션 타입을 추가할 때 이 매핑도 함께 갱신한다.
 * 현재 화이트리스트가 비어 있어 모든 enqueue된 액션은 매핑 추가 전까지 retry 한도까지만 시도된다.
 */
function resolveQueueEndpoint(type: string): string | null {
  switch (type) {
    // 예: case 'create-note': return '/api/notes';
    default:
      return null;
  }
}

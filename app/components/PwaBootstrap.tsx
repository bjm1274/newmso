'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOfflineQueue, type QueuedAction } from '@/lib/offline-queue';
import { resolveInjectedPayload } from '@/lib/offline-queue-transaction';

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

/** Payload shape stored by `enqueueD1Mutation` / offline-queue-transaction. */
type QueuedMutationPayload = {
  kind: 'insert' | 'update' | 'upsert' | 'delete';
  table: string;
  data: Record<string, unknown> | Record<string, unknown>[];
  match?: Record<string, unknown>;
  onConflict?: string;
  ignoreDuplicates?: boolean;
};

function isQueuedMutationPayload(value: unknown): value is QueuedMutationPayload {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.kind === 'string' &&
    typeof r.table === 'string' &&
    (typeof r.data === 'object' && r.data !== null)
  );
}

/**
 * Convert offline-queue `db:*` payload → `/api/d1/mutate` body
 * (same contract as lib/d1-compat/mutation-builders.ts).
 */
function buildD1MutateBody(
  payload: QueuedMutationPayload,
  data: Record<string, unknown> | Record<string, unknown>[],
): Record<string, unknown> | null {
  const { kind, table, match, onConflict, ignoreDuplicates } = payload;
  if (!table) return null;

  switch (kind) {
    case 'insert': {
      const values = Array.isArray(data) ? data : [data];
      return { op: 'insert', table, values, returning: ['*'] };
    }
    case 'upsert': {
      const values = Array.isArray(data) ? data : [data];
      const body: Record<string, unknown> = {
        op: 'insert',
        table,
        values,
        returning: ['*'],
      };
      if (onConflict) {
        body.conflict = {
          columns: onConflict
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
          action: ignoreDuplicates ? 'ignore' : 'update',
        };
      } else {
        body.onConflict = 'replace';
      }
      return body;
    }
    case 'update': {
      if (!match || Object.keys(match).length === 0) return null;
      const set = Array.isArray(data) ? data[0] : data;
      return {
        op: 'update',
        table,
        set,
        where: Object.entries(match).map(([field, value]) => ({
          field,
          op: 'eq',
          value,
        })),
        returning: ['*'],
      };
    }
    case 'delete': {
      if (!match || Object.keys(match).length === 0) return null;
      return {
        op: 'delete',
        table,
        where: Object.entries(match).map(([field, value]) => ({
          field,
          op: 'eq',
          value,
        })),
      };
    }
    default:
      return null;
  }
}

export default function PwaBootstrap() {
  const router = useRouter();

  // 서비스워커 등록 (Chrome/브라우저 PWA 전용 — Electron 설치형은 네이티브 알림 사용)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) return;
    if (!('serviceWorker' in navigator)) return;
    // Electron: 웹푸시/SW 알림 경로를 타면 "Google Chrome" 스타일 토스트가 섞일 수 있음
    if (
      /Electron/i.test(navigator.userAgent || '') ||
      Boolean((window as Window & { allerpDesktop?: { isElectron?: boolean } }).allerpDesktop?.isElectron)
    ) {
      return;
    }

    let cancelled = false;

    const registerServiceWorker = async () => {
      try {
        const registration =
          (await navigator.serviceWorker.getRegistration('/')) ??
          (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));

        if (!cancelled) {
          void registration.update().catch(() => {});

          // Background Sync 등록
          if ('sync' in registration) {
            try {
              await (registration as ServiceWorkerRegistration & {
                sync: { register: (tag: string) => Promise<void> };
              }).sync.register('erp-background-sync');
            } catch (err) {
              console.warn('PWA Background Sync 등록 실패:', err);
            }
          }

          // Periodic Background Sync 등록
          if ('periodicSync' in registration) {
            try {
              const status = await navigator.permissions.query({
                name: 'periodic-background-sync' as PermissionName,
              });
              if (status.state === 'granted') {
                await (registration as ServiceWorkerRegistration & {
                  periodicSync: {
                    register: (tag: string, opts: { minInterval: number }) => Promise<void>;
                  };
                }).periodicSync.register('erp-periodic-sync', {
                  minInterval: 12 * 60 * 60 * 1000, // 12시간
                });
              }
            } catch (err) {
              console.warn('PWA Periodic Background Sync 등록 실패:', err);
            }
          }
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
    if (
      /Electron/i.test(navigator.userAgent || '') ||
      Boolean((window as Window & { allerpDesktop?: { isElectron?: boolean } }).allerpDesktop?.isElectron)
    ) {
      return;
    }

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
  // 알려진 액션은 전부 `db:{kind}:{table}` (enqueueD1Mutation / offline-queue-transaction).
  // → 실제 write API는 /api/d1/mutate (db-client mutation-builders와 동일).
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 트랜잭션 그룹별 이전 step 결과 (inject `$prev[n]` 해소용)
    const transactionGroupResults = new Map<string, unknown[]>();

    const queue = getOfflineQueue();
    const stop = queue.startAutoFlush(async (action: QueuedAction) => {
      const endpoint = resolveQueueEndpoint(action.type);
      if (!endpoint) {
        // 알 수 없는 액션 타입은 영구 제거되지 않도록 throw하여 retry 카운트만 올림
        throw new Error(`unknown queue action type: ${action.type}`);
      }

      // D1 mutation 경로: 큐 payload → mutate API body 변환
      if (endpoint === '/api/d1/mutate') {
        if (!isQueuedMutationPayload(action.payload)) {
          throw new Error(`[offline-queue] invalid mutation payload for ${action.type}`);
        }

        let resolvedData = action.payload.data;
        if (action.groupId) {
          let groupResults = transactionGroupResults.get(action.groupId);
          if (!groupResults) {
            groupResults = [];
            transactionGroupResults.set(action.groupId, groupResults);
          }
          resolvedData = resolveInjectedPayload(action.payload.data, groupResults) as
            | Record<string, unknown>
            | Record<string, unknown>[];
        }

        const body = buildD1MutateBody(action.payload, resolvedData);
        if (!body) {
          throw new Error(`[offline-queue] cannot build mutate body for ${action.type}`);
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          throw new Error(`offline queue flush failed (${response.status})`);
        }
        const json = (await response.json().catch(() => null)) as
          | { ok?: boolean; data?: unknown; error?: string }
          | null;
        if (json && json.ok === false) {
          throw new Error(json.error || `offline queue flush failed for ${action.type}`);
        }

        if (action.groupId) {
          transactionGroupResults.get(action.groupId)?.push(json?.data ?? null);
        }
        return;
      }

      // 기타 명시 매핑: type + payload 그대로 POST
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
 *
 * 실제 enqueue 출처 (grep 2026-07):
 *  - lib/offline-queue-d1.ts  → `db:{insert|update|upsert|delete}:{table}`
 *  - lib/offline-queue-transaction.ts → 동일 형식
 *
 * 앱 코드에서 확인된 table 예:
 *  attendance, approvals, leave_requests, board_posts, inventory,
 *  purchase_orders, handover_notes, daily_closures, op_consultations,
 *  op_patient_checks, staff_evaluations, staff_members, attendance_corrections,
 *  messages
 *
 * write 경로는 모두 db-client → POST /api/d1/mutate.
 * 신규 큐 액션 타입을 추가할 때 이 매핑도 함께 갱신한다.
 */
function resolveQueueEndpoint(type: string): string | null {
  // Pattern: db:{kind}:{table}  (kind = insert|update|upsert|delete)
  if (/^db:(insert|update|upsert|delete):[A-Za-z_][A-Za-z0-9_]*$/.test(type)) {
    return '/api/d1/mutate';
  }

  switch (type) {
    // 향후 non-db 액션 타입이 생기면 여기에 실제 존재하는 라우트만 추가.
    // 예: case 'chat-upload': return '/api/chat/upload';  (현재는 offline-upload-queue 별도 경로)
    default:
      return null;
  }
}

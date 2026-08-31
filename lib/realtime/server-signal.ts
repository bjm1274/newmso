import { isCloudflareWorkerRuntime } from '@/lib/cloudflare-runtime';

export async function emitRealtimeSignal(input: {
  channels: string[];
  payload?: unknown;
  source?: string;
}): Promise<void> {
  if (typeof window !== 'undefined') {
    return;
  }

  // 1. Cloudflare Workers 환경 (Durable Object) 시도 — 실제 워커에서만
  if (isCloudflareWorkerRuntime()) {
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const { env } = await getCloudflareContext({ async: true });

      const hub = (env as any)?.REALTIME_HUB;
      if (hub && typeof hub.idFromName === 'function') {
        const doId = hub.idFromName('pchos-realtime-v1');
        const stub = hub.get(doId);

        const response = await stub.fetch('http://do.local/internal/realtime/signal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channels: input.channels,
            payload: input.payload,
            source: input.source,
          }),
        });

        if (!response.ok) {
          console.warn(`[emitRealtimeSignal] Failed to send signal to DO: ${response.statusText}`);
        }
        return;
      }
    } catch {
      // Node.js 환경으로 진행
    }
  }

  // 2. Node.js WebSocket Hub 직접 브로드캐스트
  const globalHub = (globalThis as any).__allerp_realtime_hub;
  if (globalHub && typeof globalHub.broadcastChange === 'function') {
    globalHub.broadcastChange(input.channels, input.payload);
    return;
  }

  if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    try {
      const { globalRealtimeHub } = await import('./node-realtime-hub');
      globalRealtimeHub.broadcastChange(input.channels, input.payload);
    } catch (err) {
      console.error('[emitRealtimeSignal] Error sending signal via NodeRealtimeHub:', err);
    }
  }
}

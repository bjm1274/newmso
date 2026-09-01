// ============================================================
// lib/realtime/server-signal.ts
// Node.js Standalone / WebSocket Hub 실시간 변경 브로드캐스트 모듈
// ============================================================

export async function emitRealtimeSignal(input: {
  channels: string[];
  payload?: unknown;
  source?: string;
}): Promise<void> {
  if (typeof window !== 'undefined') {
    return;
  }

  // 1. Standalone / server.mjs WebSocket Hub 직접 브로드캐스트 (0ms)
  const globalHub = (globalThis as any).__allerp_realtime_hub;
  if (globalHub && typeof globalHub.broadcastChange === 'function') {
    globalHub.broadcastChange(input.channels, input.payload);
    return;
  }

  // 2. Node.js 프로세스 내부 Realtime Hub 폴백
  if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    try {
      const { globalRealtimeHub } = await import('./node-realtime-hub');
      globalRealtimeHub.broadcastChange(input.channels, input.payload);
    } catch (err) {
      console.error('[emitRealtimeSignal] Error sending signal via NodeRealtimeHub:', err);
    }
  }
}

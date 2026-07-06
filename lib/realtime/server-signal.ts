export async function emitRealtimeSignal(input: {
  channels: string[];
  payload?: unknown;
  source?: string;
}): Promise<void> {
  if (typeof window !== 'undefined') {
    return;
  }

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    
    const hub = (env as any).REALTIME_HUB;
    if (!hub) {
      return;
    }

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
      console.warn(`[emitRealtimeSignal] Failed to send signal: ${response.statusText}`);
    }
  } catch (err) {
    console.error('[emitRealtimeSignal] Error sending signal to DO:', err);
  }
}

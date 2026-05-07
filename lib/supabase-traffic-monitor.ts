type TrafficEventDetails = Record<string, unknown>;

type ClientTrafficStore = {
  counts: Record<string, number>;
  recent: Array<{
    scope: string;
    at: string;
    details: TrafficEventDetails;
  }>;
};

const MAX_RECENT_EVENTS = 50;

declare global {
  interface Window {
    __ERP_SUPABASE_TRAFFIC_MONITOR__?: ClientTrafficStore;
  }
}

function normalizeDetails(details: TrafficEventDetails) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      value instanceof Error
        ? value.message
        : typeof value === 'bigint'
          ? value.toString()
          : value,
    ]),
  );
}

function isClientMonitoringEnabled() {
  return String(process.env.NEXT_PUBLIC_SUPABASE_TRAFFIC_MONITOR || '').trim() === '1';
}

function isServerMonitoringEnabled() {
  const explicitServerFlag = String(process.env.SUPABASE_TRAFFIC_MONITOR || '').trim();
  if (explicitServerFlag) {
    return explicitServerFlag === '1';
  }
  return isClientMonitoringEnabled();
}

export function recordClientTrafficEvent(scope: string, details: TrafficEventDetails) {
  if (typeof window === 'undefined') return;

  const nextDetails = normalizeDetails(details);
  const store = (window.__ERP_SUPABASE_TRAFFIC_MONITOR__ ||= {
    counts: {},
    recent: [],
  });

  store.counts[scope] = (store.counts[scope] || 0) + 1;
  store.recent.unshift({
    scope,
    at: new Date().toISOString(),
    details: nextDetails,
  });
  if (store.recent.length > MAX_RECENT_EVENTS) {
    store.recent.length = MAX_RECENT_EVENTS;
  }

  if (isClientMonitoringEnabled()) {
    console.info('[traffic-monitor]', scope, nextDetails);
  }
}

export function recordServerTrafficEvent(scope: string, details: TrafficEventDetails) {
  if (!isServerMonitoringEnabled()) return;
  console.info(
    '[traffic-monitor]',
    JSON.stringify({
      scope,
      at: new Date().toISOString(),
      details: normalizeDetails(details),
    }),
  );
}

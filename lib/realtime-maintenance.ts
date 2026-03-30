type ChannelLike = {
  state?: string;
  subscribe?: () => unknown;
};

type BindPageRefreshOptions = {
  intervalMs: number;
  skipWhenHidden?: boolean;
  onFocus?: boolean;
  onVisibilityChange?: boolean;
};

function shouldSkipRefresh(skipWhenHidden = true) {
  if (!skipWhenHidden) return false;
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

export function bindPageRefresh(
  refresh: () => void,
  {
    intervalMs,
    skipWhenHidden = true,
    onFocus = true,
    onVisibilityChange = true,
  }: BindPageRefreshOptions
) {
  const runRefresh = () => {
    if (shouldSkipRefresh(skipWhenHidden)) return;
    refresh();
  };

  const interval = window.setInterval(runRefresh, intervalMs);

  if (onFocus) {
    window.addEventListener('focus', runRefresh);
  }
  if (onVisibilityChange && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', runRefresh);
  }

  return () => {
    window.clearInterval(interval);
    if (onFocus) {
      window.removeEventListener('focus', runRefresh);
    }
    if (onVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', runRefresh);
    }
  };
}

export function bindChannelHealthcheck(channels: ChannelLike[], intervalMs = 30_000) {
  const interval = window.setInterval(() => {
    channels.forEach((channel) => {
      try {
        if (channel?.state === 'closed' || channel?.state === 'errored') {
          channel.subscribe?.();
        }
      } catch {
        // ignore channel healthcheck errors
      }
    });
  }, intervalMs);

  return () => {
    window.clearInterval(interval);
  };
}

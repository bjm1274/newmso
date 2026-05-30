import { sound } from '@/lib/sounds';

export function isMissingTodoReminderSchema(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '').trim();
  const message = `${String((error as { message?: string } | null)?.message || '')} ${String((error as { details?: string } | null)?.details || '')}`.toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    message.includes('todo_reminder_logs') ||
    message.includes('repeat_parent_id') ||
    message.includes('reminder_at')
  );
}

export function setAppBadge(count: number) {
  try {
    if (typeof navigator === 'undefined') return;
    if (count > 0 && 'setAppBadge' in navigator) (navigator as any).setAppBadge(count).catch(() => { });
    else if (count === 0 && 'clearAppBadge' in navigator) (navigator as any).clearAppBadge().catch(() => { });
  } catch { /* ignore */ }
}

function vibrateIfSupported(pattern: number | number[] = [180]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* ignore */ }
}

function getNotificationHapticPattern(type: string) {
  if (type === 'message' || type === 'mention') {
    return [90, 40, 120];
  }
  return [180];
}

export function playIncomingNotificationFeedback({
  type,
  allowSound,
  allowVibration,
}: {
  type: string;
  allowSound: boolean;
  allowVibration: boolean;
}) {
  const run = () => {
    if (allowSound) {
      if (type === 'message' || type === 'mention') sound.playTalk();
      else sound.playSystem();
    }
    if (allowVibration) {
      vibrateIfSupported(getNotificationHapticPattern(type));
    }
  };

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(run);
    return;
  }

  run();
}

'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

type ChatDetail = {
  title?: unknown;
  body?: unknown;
  room_id?: unknown;
  message_id?: unknown;
  type?: unknown;
  data?: unknown;
};

type BannerItem = {
  id: string;
  title: string;
  body: string;
  roomId?: string;
  messageId?: string;
  senderName: string;
  roomName: string;
  type: 'message' | 'mention';
};

const DISPLAY_MS = 6000;

function toBannerText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'MSG';
  if (/[\uAC00-\uD7A3]/.test(trimmed[0])) return trimmed[0];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export default function ChatAlertBanner(props: {
  onOpenChat: (roomId: string) => void;
  onOpenApproval?: () => void;
  onOpenNotifications?: () => void;
  onOpenInventory?: () => void;
}) {
  const { onOpenChat } = props;
  const [current, setCurrent] = useState<BannerItem | null>(null);
  const [progressKey, setProgressKey] = useState(0);
  const queueRef = useRef<BannerItem[]>([]);
  const currentRef = useRef<BannerItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showingRef = useRef(false);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      showingRef.current = false;
      setCurrent(null);
      return;
    }

    const next = queueRef.current.shift()!;
    showingRef.current = true;
    setCurrent(next);
    setProgressKey((value) => value + 1);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(showNext, DISPLAY_MS);
  }, []);

  const enqueue = useCallback(
    (item: BannerItem) => {
      if (queueRef.current.some((queued) => queued.id === item.id)) return;
      if (currentRef.current?.id === item.id) return;

      queueRef.current.push(item);
      if (!showingRef.current) {
        showNext();
      }
    },
    [showNext]
  );

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    showNext();
  }, [showNext]);

  useEffect(() => {
    const chatHandler = (event: Event) => {
      const detail = (event as CustomEvent<ChatDetail>).detail;
      const roomId = toBannerText(detail?.room_id, '');
      const messageId = toBannerText(detail?.message_id, '');
      const payload =
        detail?.data && typeof detail.data === 'object'
          ? (detail.data as Record<string, unknown>)
          : {};
      const type = toBannerText(detail?.type || payload.type, 'message') === 'mention' ? 'mention' : 'message';
      const senderName = toBannerText(payload.sender_name, toBannerText(detail?.title, '새 메시지'));
      const roomName = toBannerText(payload.room_name, '');
      const title = senderName || toBannerText(detail?.title, '새 메시지');
      const body = toBannerText(detail?.body, '메시지를 확인해 주세요.');

      if (!title || !roomId) return;

      enqueue({
        id: messageId || `${roomId}:${title}:${body}`,
        title,
        body,
        roomId,
        messageId: messageId || undefined,
        senderName,
        roomName,
        type,
      });
    };

    window.addEventListener('erp-chat-notification', chatHandler);

    return () => {
      window.removeEventListener('erp-chat-notification', chatHandler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enqueue]);

  if (!current) return null;

  const pendingCount = queueRef.current.length;
  const initials = getInitials(current.senderName || current.title);
  const eyebrow = current.type === 'mention' ? '멘션 도착' : '메시지 미리보기';
  const roomLabel =
    current.roomName && current.roomName !== current.senderName ? current.roomName : current.type === 'mention' ? '채팅방에서 불렀어요' : '채팅방에서 도착';

  const handleClick = () => {
    if (current.roomId) {
      onOpenChat(current.roomId);
    }
    dismiss();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleClick();
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[500] flex justify-center px-3 md:hidden"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
      aria-live="polite"
    >
      <div
        role="button"
        tabIndex={0}
        data-testid="chat-preview-banner"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="pointer-events-auto relative flex w-full max-w-[420px] items-center gap-3 overflow-hidden rounded-[28px] border border-white/80 bg-[color:rgba(255,255,255,0.94)] px-3 py-3 text-left shadow-[0_18px_44px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-transform duration-150 active:scale-[0.985] dark:border-white/10 dark:bg-[color:rgba(15,23,42,0.88)] animate-in slide-in-from-top duration-300"
      >
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-[#FEE500] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <span className="text-[10px] font-black tracking-[0.16em] text-zinc-900">MSG</span>
          {pendingCount > 0 && (
            <span
              data-testid="chat-preview-count"
              className="absolute -right-1 -top-1 inline-flex min-w-[22px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm"
            >
              +{pendingCount}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold tracking-[0.02em] text-[var(--toss-gray-4)] dark:bg-white/10 dark:text-zinc-200">
              {eyebrow}
            </span>
            <span
              data-testid="chat-preview-room"
              className="truncate text-[10px] font-semibold text-[var(--toss-gray-3)] dark:text-zinc-400"
            >
              {roomLabel}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-[11px] font-black text-[var(--accent)] dark:bg-blue-500/100/15 dark:text-blue-200">
              {initials}
            </div>
            <p
              data-testid="chat-preview-title"
              className="min-w-0 flex-1 truncate text-[13.5px] font-black text-[var(--foreground)] dark:text-white"
            >
              {current.title}
            </p>
          </div>

          <p
            data-testid="chat-preview-body"
            className="mt-1 line-clamp-2 text-[11.5px] font-medium leading-snug text-[var(--toss-gray-4)] dark:text-zinc-300"
          >
            {current.body}
          </p>

          <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold text-[var(--toss-gray-3)] dark:text-zinc-400">
            <span>{current.type === 'mention' ? '눌러서 멘션 확인' : '눌러서 채팅 확인'}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-[10px] font-bold text-[var(--foreground)] dark:bg-white/10 dark:text-white">
              열기
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 4.5 12.5 10 7 15.5" />
              </svg>
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label="메시지 미리보기 닫기"
          onClick={(event) => {
            event.stopPropagation();
            dismiss();
          }}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[var(--toss-gray-3)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M6 6 14 14" />
            <path d="M14 6 6 14" />
          </svg>
        </button>

        <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-black/5 dark:bg-white/10">
          <div
            key={progressKey}
            className="chat-preview-progress h-full bg-[var(--accent)]/75 dark:bg-blue-300/80"
            style={{ animationDuration: `${DISPLAY_MS}ms` }}
          />
        </div>
      </div>
    </div>
  );
}

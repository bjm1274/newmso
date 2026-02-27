'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

type ChatDetail = { title: string; body: string; room_id?: string };
type AlertDetail = { title: string; body: string; type: string; data?: any };

type BannerItem =
  | { kind: 'chat'; id: string; title: string; body: string; room_id?: string }
  | { kind: 'alert'; id: string; title: string; body: string; type: string; data?: any };

const DISPLAY_DURATION = 6000; // 6초 표시 (카카오톡 수준)

/** 채팅·전자결재·재고·출퇴근 등 실시간 알림 통합 배너 — 큐 기반 (여러 알림 순차 표시) */
export default function ChatAlertBanner({
  onOpenChat,
  onOpenApproval,
  onOpenNotifications,
  onOpenInventory,
}: {
  onOpenChat: (roomId: string) => void;
  onOpenApproval?: () => void;
  onOpenNotifications?: () => void;
  onOpenInventory?: () => void;
}) {
  const [current, setCurrent] = useState<BannerItem | null>(null);
  const queueRef = useRef<BannerItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isShowingRef = useRef(false);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      isShowingRef.current = false;
      setCurrent(null);
      return;
    }
    const next = queueRef.current.shift()!;
    isShowingRef.current = true;
    setCurrent(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      showNext();
    }, DISPLAY_DURATION);
  }, []);

  const enqueue = useCallback((item: BannerItem) => {
    // 같은 room_id 중복 방지 (채팅)
    if (item.kind === 'chat' && item.room_id) {
      const alreadyQueued = queueRef.current.some(q => q.kind === 'chat' && q.room_id === item.room_id);
      if (alreadyQueued) return;
    }
    queueRef.current.push(item);
    if (!isShowingRef.current) {
      showNext();
    }
  }, [showNext]);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    showNext();
  }, [showNext]);

  useEffect(() => {
    const chatHandler = (e: Event) => {
      const d = (e as CustomEvent<ChatDetail>).detail;
      if (!d?.title) return;
      enqueue({ kind: 'chat', id: Date.now().toString(), title: d.title, body: d.body || '', room_id: d.room_id });
    };
    const alertHandler = (e: Event) => {
      const d = (e as CustomEvent<AlertDetail>).detail;
      if (!d?.title) return;
      enqueue({ kind: 'alert', id: Date.now().toString(), title: d.title, body: d.body || '', type: d.type || 'notification', data: d.data });
    };
    window.addEventListener('erp-chat-notification', chatHandler);
    window.addEventListener('erp-alert', alertHandler);
    return () => {
      window.removeEventListener('erp-chat-notification', chatHandler);
      window.removeEventListener('erp-alert', alertHandler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enqueue]);

  if (!current) return null;

  const handleClick = () => {
    if (current.kind === 'chat' && current.room_id) {
      onOpenChat(current.room_id);
    } else if (current.kind === 'alert') {
      if (current.type === 'approval' && onOpenApproval) onOpenApproval();
      else if ((current.type === 'inventory') && onOpenInventory) onOpenInventory();
      else if (onOpenNotifications) onOpenNotifications();
    }
    dismiss();
  };

  const typeConfig: Record<string, { bg: string; icon: string; label: string }> = {
    message:    { bg: 'bg-[var(--toss-blue)]',  icon: '💬', label: '채팅 열기' },
    mention:    { bg: 'bg-indigo-600',           icon: '📣', label: '채팅 열기' },
    approval:   { bg: 'bg-violet-600',           icon: '📋', label: '결재 확인' },
    inventory:  { bg: 'bg-orange-500',           icon: '📦', label: '재고 확인' },
    payroll:    { bg: 'bg-emerald-600',          icon: '💰', label: '확인' },
    attendance: { bg: 'bg-emerald-600',          icon: '⏰', label: '확인' },
    education:  { bg: 'bg-amber-500',            icon: '📚', label: '확인' },
    board:      { bg: 'bg-pink-600',             icon: '📌', label: '게시물 열기' },
  };

  const cfg = current.kind === 'chat'
    ? typeConfig['message']
    : typeConfig[current.type] || { bg: 'bg-[var(--toss-blue)]', icon: '🔔', label: '확인' };

  const pendingCount = queueRef.current.length;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center gap-3 px-4 py-3 ${cfg.bg} text-white shadow-lg animate-in slide-in-from-top duration-200 safe-area-inset-top`}
    >
      <span className="text-xl shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-bold text-sm truncate">{current.title}</p>
        <p className="text-xs opacity-90 truncate">{current.body}</p>
      </div>
      {pendingCount > 0 && (
        <span className="bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
          +{pendingCount}
        </span>
      )}
      <span className="text-xs font-bold shrink-0 opacity-90">{cfg.label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        className="text-white/70 hover:text-white text-lg shrink-0 ml-1"
      >
        ✕
      </button>
    </button>
  );
}

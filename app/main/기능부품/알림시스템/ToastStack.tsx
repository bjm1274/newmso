'use client';

import { memo } from 'react';
import { getInitials, timeAgo } from '@/lib/notification-utils';
import { getTypeCfg } from './ui-config';

export type ToastItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  senderName?: string;
  createdAt: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- notification metadata is heterogeneous
  data?: any;
  exiting?: boolean;
};

type ToastCardProps = {
  notif: ToastItem;
  onClose: (id: string) => void;
  onAction: (n: ToastItem) => void;
};

const ToastCard = memo(function ToastCard({ notif, onClose, onAction }: ToastCardProps) {
  const cfg = getTypeCfg(notif.type);
  const isChat = notif.type === 'message' || notif.type === 'mention';
  const isApproval = notif.type === 'approval';
  const isInventory = notif.type === 'inventory';
  const initials = notif.senderName ? getInitials(notif.senderName) : null;
  return (
    <div
      data-testid={`notification-toast-${notif.id}`}
      className={`relative group flex items-start gap-3 p-3.5 rounded-2xl shadow-sm border border-white/10 dark:border-white/5 overflow-hidden cursor-pointer select-none
        bg-[var(--card)]/97 dark:bg-gray-900/97 backdrop-blur-md
        ${notif.exiting ? 'animate-slide-out-right-toast' : 'animate-slide-in-right-toast'}
        hover:scale-[1.015] active:scale-[0.99] transition-transform`}
      style={{ width: 320 }}
      onClick={() => onAction(notif)}
    >
      {/* 좌측 타입 아이콘 / 이니셜 아바타 */}
      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black shadow-sm ${cfg.bg}`}>
        {isChat && initials ? (
          <span className="text-sm">{initials}</span>
        ) : (
          <span className="text-base leading-none">{cfg.icon}</span>
        )}
      </div>
      {/* 내용 */}
      <div className="flex-1 min-w-0 pr-5">
        <div className="flex items-baseline gap-2">
          <p className="text-[13px] font-bold text-[var(--foreground)] dark:text-white leading-tight truncate flex-1">
            {notif.title}
          </p>
          <span className="text-[10px] text-[var(--toss-gray-3)] dark:text-[var(--toss-gray-4)] whitespace-nowrap shrink-0">
            {timeAgo(notif.createdAt)}
          </span>
        </div>
        {notif.body && (
          <p className="text-[11.5px] text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] mt-0.5 line-clamp-2 leading-snug">
            {notif.body}
          </p>
        )}
        {(isChat || isApproval || isInventory) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction(notif);
            }}
            className={`mt-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded-full border transition-all bg-transparent
              ${
                isChat
                  ? 'text-blue-600 border-blue-300 hover:bg-blue-500/10'
                  : isApproval
                    ? 'text-violet-600 border-violet-300 hover:bg-violet-50'
                    : 'text-orange-600 border-orange-300 hover:bg-orange-500/10'
              }`}
          >
            {isChat ? '💬 채팅 열기' : isApproval ? '📋 결재하기' : '📦 재고 확인'}
          </button>
        )}
      </div>
      {/* 닫기 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose(notif.id);
        }}
        className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-5)] hover:bg-[var(--muted)] transition-all text-xs"
      >
        ✕
      </button>
      {/* 7초 진행바 */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[var(--tab-bg)] dark:bg-gray-800 rounded-b-2xl overflow-hidden">
        <div className={`h-full animate-progress-7s ${cfg.progress}`} style={{ transformOrigin: 'left center' }} />
      </div>
    </div>
  );
});

export type NotificationToastStackProps = {
  toasts: ToastItem[];
  onClose: (id: string) => void;
  onAction: (n: ToastItem) => void;
};

/** Toast 스택 UI — NotificationSystem 본체에서 분리해 코드 스플릿 가능. */
export default function NotificationToastStack({
  toasts,
  onClose,
  onAction,
}: NotificationToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[calc(env(safe-area-inset-top)+92px)] left-1/2 z-[999] flex w-[min(calc(100vw-24px),420px)] -translate-x-1/2 flex-col gap-2.5 items-center md:top-auto md:bottom-5 md:left-auto md:right-5 md:w-auto md:translate-x-0 md:flex-col-reverse md:items-end"
      aria-live="polite"
      aria-label="알림"
      data-testid="notification-toast-stack"
    >
      {toasts.map((notif) => (
        <ToastCard key={notif.id} notif={notif} onClose={onClose} onAction={onAction} />
      ))}
    </div>
  );
}

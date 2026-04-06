'use client';

import { toast } from '@/lib/toast';
import type { ChatMessage, StaffMember } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import { MessengerStatusUserRow } from './메신저공통';

type MessengerMessageActionsProps = {
  message: ChatMessage | null;
  currentUserId: string | null | undefined;
  isPinned: boolean;
  isBookmarked: boolean;
  onClose: () => void;
  onToggleReaction: (emoji: string) => void | Promise<void>;
  onAddTask: () => void | Promise<void>;
  onTogglePin: () => void | Promise<void>;
  onToggleBookmark: () => void | Promise<void>;
  onStartEdit: () => void;
  onDelete: () => void | Promise<void>;
  onReply: () => void;
  onForward: () => void;
  onOpenReadStatus: () => void;
  onOpenThread: () => void;
};

type ReactionDetailModalProps = {
  target: { message: ChatMessage; emoji: string } | null;
  users: StaffMember[];
  onClose: () => void;
};

const MOBILE_REACTIONS = ['👍', '👏', '❤️', '😂', '🙏', '🎉', '🔥', '✅'];
const DESKTOP_REACTIONS = ['👍', '👏', '❤️', '🔥', '✅'];

async function copyMessageFor(message: ChatMessage, prefix: string, successMessage: string) {
  try {
    const base = `[채팅] ${(message.staff as { name?: string } | null | undefined)?.name || '이름 없음'} (${new Date(message.created_at || 0).toLocaleString('ko-KR')})\n${message.content || ''}${message.file_url ? `\n파일: ${message.file_url}` : ''}`;
    await navigator.clipboard?.writeText(`${prefix}\n${base}`);
    toast(successMessage);
  } catch {
    toast('복사 실패', 'error');
  }
}

export function MessengerMessageActions({
  message,
  currentUserId,
  isPinned,
  isBookmarked,
  onClose,
  onToggleReaction,
  onAddTask,
  onTogglePin,
  onToggleBookmark,
  onStartEdit,
  onDelete,
  onReply,
  onForward,
  onOpenReadStatus,
  onOpenThread,
}: MessengerMessageActionsProps) {
  if (!message) return null;

  const isMine = String(message.sender_id) === String(currentUserId || '');
  const canEdit = isMine && !message.is_deleted;
  const canDelete = isMine;

  return (
    <>
      <div className="absolute inset-0 bg-black/10 z-30 animate-in fade-in duration-200" onClick={onClose} aria-hidden="true" />

      <div className="md:hidden absolute left-0 right-0 bottom-0 bg-[var(--card)] dark:bg-zinc-900 rounded-t-[24px] shadow-sm z-40 flex flex-col animate-in slide-in-from-bottom duration-300 max-h-[70vh] overflow-hidden">
        <div className="w-12 h-1.5 bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />
        <div className="px-4 pb-8 space-y-4 overflow-y-auto">
          <div className="flex justify-between items-center bg-[var(--tab-bg)] dark:bg-zinc-800/50 p-2 rounded-[var(--radius-xl)] gap-1 px-4">
            {MOBILE_REACTIONS.map((emoji) => (
              <button key={emoji} onClick={() => { void onToggleReaction(emoji); onClose(); }} className="text-2xl hover:scale-110 transition-transform p-1">
                {emoji}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <button onClick={() => { void onAddTask(); onClose(); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
              <span className="text-xl">📋</span>
              <span className="text-sm font-bold">할일 추가</span>
            </button>
            <button onClick={() => { void onTogglePin(); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
              <span className="text-xl">📌</span>
              <span className="text-sm font-bold">{isPinned ? '공지 해제' : '공지 등록'}</span>
            </button>
            <button data-testid="chat-message-action-bookmark-mobile" onClick={() => { void onToggleBookmark(); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
              <span className="text-xl">🔖</span>
              <span className="text-sm font-bold">{isBookmarked ? '북마크 해제' : '북마크 등록'}</span>
            </button>
            <button onClick={async () => { await navigator.clipboard?.writeText(message.content || ''); toast('복사했습니다.'); onClose(); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
              <span className="text-xl">📄</span>
              <span className="text-sm font-bold">복사</span>
            </button>
            {canEdit && (
              <button data-testid="chat-message-action-edit-mobile" onClick={onStartEdit} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                <span className="text-xl">✏️</span>
                <span className="text-sm font-bold">수정</span>
              </button>
            )}
            {canDelete && (
              <button onClick={() => { void onDelete(); }} className="w-full flex items-center gap-4 p-4 hover:bg-red-500/10 dark:hover:bg-red-900/20 rounded-[var(--radius-md)] transition-colors text-red-500">
                <span className="text-xl">🗑️</span>
                <span className="text-sm font-bold">삭제</span>
              </button>
            )}
            <button onClick={onReply} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
              <span className="text-xl">↩️</span>
              <span className="text-sm font-bold">답글</span>
            </button>
            <button onClick={onForward} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
              <span className="text-xl">📤</span>
              <span className="text-sm font-bold">전달</span>
            </button>
          </div>
        </div>
      </div>

      <div data-testid="chat-message-actions-panel" className="hidden md:flex absolute top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-40 flex-col animate-in slide-in-from-right duration-300">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">메시지 작업</span>
          <button onClick={onClose} className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">닫기</button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">빠른 반응</p>
          <div className="flex gap-2 flex-wrap">
            {DESKTOP_REACTIONS.map((emoji) => (
              <button key={emoji} onClick={() => { void onToggleReaction(emoji); }} className="w-11 h-11 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] hover:bg-[var(--toss-blue-light)] text-xl transition-colors" title={emoji}>
                {emoji}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase pt-2">기능</p>
          <div className="space-y-1">
            <button onClick={onReply} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">
              답글 달기
            </button>
            {canEdit && (
              <button data-testid="chat-message-action-edit" onClick={onStartEdit} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">메시지 수정</button>
            )}
            {canDelete && (
              <button data-testid="chat-message-action-delete" onClick={() => { void onDelete(); }} className="w-full p-3 text-left hover:bg-red-500/10 rounded-[var(--radius-md)] text-xs font-semibold text-red-600 transition-colors">메시지 삭제</button>
            )}
            <button data-testid="chat-message-action-pin" onClick={() => { void onTogglePin(); }} className={`w-full p-3 text-left rounded-[var(--radius-md)] text-xs font-semibold transition-colors ${isPinned ? 'hover:bg-[var(--muted)] text-[var(--toss-gray-3)]' : 'hover:bg-orange-500/10 text-orange-500'}`}>
              {isPinned ? '공지 해제' : '공지로 등록'}
            </button>
            <button onClick={() => { void onAddTask(); onClose(); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">할일로 등록</button>
            <button data-testid="chat-message-action-read-status" onClick={onOpenReadStatus} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">
              읽음 확인
            </button>
            <button data-testid="chat-message-action-forward" onClick={onForward} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">
              다른 채팅방으로 전달
            </button>
            <button data-testid="chat-message-action-thread" onClick={onOpenThread} className="w-full p-3 text-left hover:bg-[var(--toss-blue-light)] rounded-[var(--radius-md)] text-xs font-semibold text-[var(--accent)] transition-colors">
              이 메시지 스레드 보기
            </button>
            <button onClick={async () => { await copyMessageFor(message, '[전자결재 메모]', '전자결재용으로 복사했습니다.'); onClose(); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">
              전자결재용 내용 복사
            </button>
            <button onClick={async () => { await copyMessageFor(message, '[게시판 메모]', '게시판용으로 복사했습니다.'); onClose(); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">
              게시판용 내용 복사
            </button>
            <button data-testid="chat-message-action-bookmark" onClick={() => { void onToggleBookmark(); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">
              {isBookmarked ? '북마크 해제' : '중요 메시지 북마크'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function ReactionDetailModal({
  target,
  users,
  onClose,
}: ReactionDetailModalProps) {
  if (!target) return null;

  return (
    <div
      data-testid="chat-reaction-detail-modal"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
              반응 상세
            </p>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-bold text-[var(--foreground)]">
                {target.emoji} {users.length}
              </span>
              <p className="text-xs font-semibold text-[var(--foreground)] line-clamp-1 opacity-60">
                {getMessageDisplayText(
                  target.message.content,
                  target.message.file_name,
                  target.message.file_url,
                  '첨부 파일 메시지'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
          >
            닫기
          </button>
        </div>

        <div className="border-t border-[var(--border)] pt-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {users.length === 0 ? (
            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">
              아직 이 반응을 누른 사람이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {users.map((staff) => (
                <MessengerStatusUserRow
                  key={`${target.emoji}-${staff.id}`}
                  staff={staff}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

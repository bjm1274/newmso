'use client';

import type { ChatMessage, StaffMember } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import { MessengerStatusUserRow } from './메신저공통';

type ReactionDetailModalProps = {
  target: { message: ChatMessage; emoji: string } | null;
  users: StaffMember[];
  onClose: () => void;
};

export function ReactionDetailModal({
  target,
  users,
  onClose }: ReactionDetailModalProps) {
  if (!target) return null;

  return (
    <div
      data-testid="chat-reaction-detail-modal"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[var(--z-modal)] p-4"
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

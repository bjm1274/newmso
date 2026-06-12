'use client';

import type { ChatMessage, StaffMember } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import { MessengerStatusUserRow } from './메신저공통';

type ReadStatusModalProps = {
  message: ChatMessage | null;
  loading: boolean;
  unreadUsers: StaffMember[];
  readUsers: StaffMember[];
  onClose: () => void;
};

export function ReadStatusModal({
  message,
  loading,
  unreadUsers,
  readUsers,
  onClose,
}: ReadStatusModalProps) {
  if (!message) return null;

  return (
    <div data-testid="chat-read-status-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4">
      <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">읽음 확인 상세</p>
            <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-1 opacity-60">
              {getMessageDisplayText(message.content, message.file_name, message.file_url, '첨부 파일 메시지')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">
            닫기
          </button>
        </div>

        <div className="border-t border-[var(--border)] pt-3 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
          {loading ? (
            <div className="py-5 flex justify-center">
              <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">읽지 않음 ({unreadUsers.length})</p>
                </div>
                {unreadUsers.length === 0 ? (
                  <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">모두 읽었습니다.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {unreadUsers.map((user) => (
                      <MessengerStatusUserRow key={user.id} staff={user} />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">읽음 ({readUsers.length})</p>
                </div>
                {readUsers.length === 0 ? (
                  <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">아직 읽은 사람이 없습니다.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {readUsers.map((user) => (
                      <MessengerStatusUserRow key={user.id} staff={user} tone="success" />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
  onClose }: ReadStatusModalProps) {
  if (!message) return null;

  return (
    <div data-testid="chat-read-status-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4">
      <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          {/* min-w-0 이 없으면 제목이 길 때 flex 가 제목 쪽을 못 줄이고 버튼을
              최소 폭까지 짜부라뜨려 '닫기' 두 글자가 세로로 쪼개져 보였다. */}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">읽음 확인 상세</p>
            <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-1 opacity-60">
              {getMessageDisplayText(message.content, message.file_name, message.file_url, '첨부 파일 메시지')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            title="닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[var(--zinc-500)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
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

'use client';

import type { ChatMessage, StaffMember } from '@/types';
import {
  AttachmentListCard,
  getAttachmentDisplayName,
  getMessageDisplayText,
  resolveAttachmentKind,
} from './메신저첨부';

type ThreadPanelProps = {
  rootMessage: ChatMessage | null;
  messages: ChatMessage[];
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  isFollowingThread?: boolean;
  onClose: () => void;
  onToggleFollowThread?: (message: ChatMessage) => void;
  onPreviewAttachment: (message: ChatMessage) => void;
  onReplyMessage: (message: ChatMessage) => void;
};

export function ThreadPanel({
  rootMessage,
  messages,
  resolveStaffProfile,
  isFollowingThread = false,
  onClose,
  onToggleFollowThread = () => {},
  onPreviewAttachment,
  onReplyMessage,
}: ThreadPanelProps) {
  if (!rootMessage) return null;

  const participantCount = new Set(
    messages
      .map((message) => String(message.sender_id || '').trim())
      .filter(Boolean)
  ).size;
  const replyCount = Math.max(
    0,
    messages.filter((message) => String(message.id) !== String(rootMessage.id)).length,
  );

  return (
    <>
      <div className="absolute inset-0 bg-black/10 z-40" onClick={onClose} aria-hidden="true" />
      <aside data-testid="chat-thread-panel" className="absolute top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">스레드</p>
            <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-2">
              {getMessageDisplayText(rootMessage.content, rootMessage.file_name, rootMessage.file_url, '첨부 파일 메시지')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="chat-thread-summary-replies"
                className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]"
              >
                답글 {replyCount}개
              </span>
              <span
                data-testid="chat-thread-summary-participants"
                className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]"
              >
                참여 {participantCount}명
              </span>
              <button
                type="button"
                data-testid="chat-thread-reply-root"
                onClick={() => onReplyMessage(rootMessage)}
                className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
              >
                답글 작성
              </button>
              <button
                type="button"
                data-testid="chat-thread-toggle-follow"
                onClick={() => onToggleFollowThread(rootMessage)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
                  isFollowingThread
                    ? 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/15'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)]'
                }`}
              >
                {isFollowingThread ? '알림 켜짐' : '알림 켜기'}
              </button>
            </div>
          </div>
          <button data-testid="chat-thread-close" onClick={onClose} className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">
            닫기
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          {messages.length === 0 ? (
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-4 text-center">
              연결된 스레드 메시지가 없습니다.
            </p>
          ) : (
            messages.map((message) => {
              const isRoot = message.id === rootMessage.id;
              const staff = (message.staff as { name?: string; position?: string } | null | undefined) || resolveStaffProfile(message.sender_id, message.sender_name);
              const createdAt = new Date(message.created_at || 0);
              return (
                <div
                  key={message.id}
                  className={`border rounded-[var(--radius-md)] p-3 text-[11px] space-y-1 ${isRoot ? 'bg-[var(--toss-blue-light)] border-[var(--accent)]' : 'bg-[var(--muted)] border-[var(--border)]'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--foreground)] truncate">
                      {staff?.name || '이름 없음'} {staff?.position || ''}
                    </span>
                    <span className="text-[11px] text-[var(--toss-gray-3)]">
                      {createdAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })}{' '}
                      {createdAt.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--foreground)] whitespace-pre-wrap break-words">
                    {getMessageDisplayText(message.content, message.file_name, message.file_url, '첨부 파일 메시지')}
                  </p>
                  {message.file_url && (() => {
                    const attachmentUrl = String(message.file_url);
                    const attachmentName = getAttachmentDisplayName(message.file_name, attachmentUrl);
                    const attachmentKind = resolveAttachmentKind(attachmentUrl, message.file_kind);
                    return (
                      <AttachmentListCard
                        url={attachmentUrl}
                        name={attachmentName}
                        kind={attachmentKind}
                        meta={`${staff?.name || '이름 없음'} · ${createdAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} ${createdAt.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}`}
                        onPreview={() => onPreviewAttachment(message)}
                        onReply={() => onReplyMessage(message)}
                        replyTestId={`chat-attachment-reply-${message.id}`}
                        actionVariant="subtle"
                        className="mt-2"
                      />
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

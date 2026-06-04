'use client';

import { AttachmentListCard, getAttachmentDisplayName, resolveAttachmentKind } from './메신저첨부';
import type { ChatMessage } from '@/types';

export type MessengerMediaFilter = 'all' | 'media' | 'image' | 'video' | 'file';

type MediaArchivePanelProps = {
  open: boolean;
  mediaFilter: MessengerMediaFilter;
  filteredMediaMessages: ChatMessage[];
  onClose: () => void;
  onFilterChange: (filter: MessengerMediaFilter) => void;
  onPreviewMessage: (message: ChatMessage) => void;
  onReplyMessage: (message: ChatMessage) => void;
};

export function MediaArchivePanel({
  open,
  mediaFilter,
  filteredMediaMessages,
  onClose,
  onFilterChange,
  onPreviewMessage,
  onReplyMessage,
}: MediaArchivePanelProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/5 z-[100] md:z-30 animate-in fade-in" onClick={onClose} />
      <aside
        data-testid="chat-media-panel"
        className="fixed top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-[101] md:z-40 flex flex-col animate-in slide-in-from-right duration-300"
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-xs font-black text-[var(--toss-gray-4)] uppercase tracking-widest">첨부 내역</span>
          <button
            data-testid="chat-media-panel-close"
            onClick={onClose}
            className="p-2 text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-xl"
          >
            닫기
          </button>
        </div>

        <div className="flex p-2 gap-1 bg-[var(--tab-bg)] dark:bg-zinc-900 border-b border-[var(--border)]">
          {(['all', 'media', 'image', 'video', 'file'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => onFilterChange(filter)}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                mediaFilter === filter
                  ? 'bg-[var(--card)] dark:bg-zinc-800 text-blue-600 shadow-soft'
                  : 'text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)]'
              }`}
            >
              {filter === 'all' ? '전체' : filter === 'media' ? '사진/동영상' : filter === 'image' ? '이미지' : filter === 'video' ? '동영상' : '파일'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {filteredMediaMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-[var(--toss-gray-3)]">
              <span className="text-4xl mb-2">📭</span>
              <p className="text-[11px] font-bold">내역이 없습니다.</p>
            </div>
          ) : (
            filteredMediaMessages.map((message: ChatMessage) => {
              const fileUrl = String(message.file_url || '');
              const attachmentName = getAttachmentDisplayName(message.file_name, fileUrl);
              const previewKind = resolveAttachmentKind(fileUrl, message.file_kind);
              return (
                <AttachmentListCard
                  key={message.id}
                  url={fileUrl}
                  name={attachmentName}
                  kind={previewKind}
                  summary={message.content || null}
                  meta={new Date(message.created_at || 0).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  onPreview={() => onPreviewMessage(message)}
                  onReply={() => onReplyMessage(message)}
                  replyTestId={`chat-media-reply-${message.id}`}
                  actionVariant="subtle"
                />
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

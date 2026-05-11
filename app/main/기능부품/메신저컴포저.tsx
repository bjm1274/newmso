'use client';

import { useRef, useState, memo, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react';
import type { ChatMessage, StaffMember } from '@/types';
import { getPendingAttachmentDisplayName } from './메신저첨부';
import { buildMessengerImageAlt } from './메신저공통';
import { isMobileChatViewport, NOTICE_ROOM_ID } from './메신저유틸';
import type { AttachmentRetryQueueEntry } from './메신저첨부재시도큐';

type MessengerComposerProps = {
  replyTo: ChatMessage | null;
  pendingAlbumFiles: File[];
  albumPreviewUrls: string[];
  pendingAttachmentFiles: File[];
  failedAttachmentRetryEntries: AttachmentRetryQueueEntry[];
  fileUploading: boolean;
  selectedRoomId: string | null;
  canWriteNotice: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  inputMsg: string;
  showScrollToLatest?: boolean;
  onScrollToLatest?: () => void;
  showMentionList: boolean;
  mentionCandidates: StaffMember[];
  onCloseReply: () => void;
  onCancelAlbumUpload: () => void;
  onRemoveAlbumFile: (index: number) => void;
  onSendAlbum: () => void | Promise<unknown>;
  onCancelPendingAttachmentUpload: () => void;
  onConfirmPendingAttachmentUpload: () => void | Promise<unknown>;
  onRetryFailedAttachmentUpload: (entryId: string) => void | Promise<unknown>;
  onRetryAllFailedAttachmentUploads: () => void | Promise<unknown>;
  onDismissFailedAttachmentUpload: (entryId: string) => void | Promise<unknown>;
  onClearAllFailedAttachmentUploads: () => void | Promise<unknown>;
  onAttachmentSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onAlbumFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onQueueDroppedFiles: (files: File[]) => void;
  onComposerChange: (value: string, caret: number) => void;
  onComposerPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void | Promise<void>;
  onSendMessage: () => void | Promise<unknown>;
  onSelectMention: (name: string) => void;
};

function MessengerComposerImpl({
  replyTo,
  pendingAlbumFiles,
  albumPreviewUrls,
  pendingAttachmentFiles,
  failedAttachmentRetryEntries,
  fileUploading,
  selectedRoomId,
  canWriteNotice,
  composerRef,
  inputMsg,
  showMentionList,
  mentionCandidates,
  onCloseReply,
  onCancelAlbumUpload,
  onRemoveAlbumFile,
  onSendAlbum,
  onCancelPendingAttachmentUpload,
  onConfirmPendingAttachmentUpload,
  onRetryFailedAttachmentUpload,
  onRetryAllFailedAttachmentUploads,
  onDismissFailedAttachmentUpload,
  onClearAllFailedAttachmentUploads,
  onAttachmentSelect,
  onAlbumFileSelect,
  onQueueDroppedFiles,
  onComposerChange,
  onComposerPaste,
  onSendMessage,
  onSelectMention,
}: MessengerComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const albumFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files || []).filter((file): file is File => Boolean(file));
    onQueueDroppedFiles(files);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;
    if (event.nativeEvent.isComposing) return;

    const isMobileComposer = isMobileChatViewport();
    if (isMobileComposer || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void onSendMessage();
  };

  return (
    <div
      data-testid="chat-upload-dropzone"
      className={`relative z-10 shrink-0 bg-[var(--card)] px-2 py-1 pb-[calc(env(safe-area-inset-bottom)+4px)] md:px-3 md:py-2 md:pb-2 transition-all ${isDragging ? 'border-t-2 border-[var(--accent)] border-dashed bg-blue-500/10 dark:bg-blue-900/20' : 'border-t border-[var(--border)]'}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {replyTo && (
        <div
          data-testid="chat-reply-banner"
          className="mb-1 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)] px-2 py-1 animate-in slide-in-from-bottom-2"
        >
          <p className="text-[11px] font-bold text-[var(--accent)]">
            @{(replyTo.staff as { name?: string } | null | undefined)?.name}님에게 답글 작성 중...
          </p>
          <button type="button" onClick={onCloseReply} className="text-[var(--accent)] hover:text-[var(--accent)] font-semibold">
            닫기
          </button>
        </div>
      )}

      {pendingAlbumFiles.length > 0 && (
        <div
          data-testid="chat-pending-album-panel"
          className="mb-2 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--accent)]/30 bg-blue-500/10 dark:bg-blue-950/20 px-3 py-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[var(--accent)]">📷 사진 {pendingAlbumFiles.length}장 묶어 보내기</span>
            <button type="button"
              data-testid="chat-pending-album-cancel-button"
              onClick={onCancelAlbumUpload}
              className="min-h-[44px] rounded-[var(--radius-md)] px-3 text-[11px] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] hover:text-red-500 font-semibold"
            >
              취소
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {albumPreviewUrls.map((url, index) => (
              <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0">
                <img
                  src={url}
                  alt={buildMessengerImageAlt(pendingAlbumFiles[index]?.name, `업로드 예정 사진 ${index + 1}`)}
                  className="w-full h-full object-cover"
                />
                <button type="button"
                  onClick={() => onRemoveAlbumFile(index)}
                  aria-label={`앨범 미리보기 ${index + 1} 제거`}
                  className="absolute top-0.5 right-0.5 min-h-[24px] min-w-[24px] bg-black/60 rounded-full flex items-center justify-center text-white text-[9px] font-bold hover:bg-red-600 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button"
              onClick={() => albumFileInputRef.current?.click()}
              aria-label="앨범에 사진 추가"
              className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--border)] flex items-center justify-center text-[var(--toss-gray-3)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-xl shrink-0"
              title="사진 추가"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="chat-pending-album-send-button"
              onClick={() => void onSendAlbum()}
              disabled={fileUploading}
              className="flex min-h-[44px] items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {fileUploading ? <span className="animate-pulse">전송 중...</span> : '📤 묶어서 전송'}
            </button>
          </div>
        </div>
      )}

      {pendingAttachmentFiles.length > 0 && (
        <div
          data-testid="chat-pending-upload-panel"
          className="mb-2 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[12px] text-blue-900"
        >
          <p className="font-semibold">선택한 파일 {pendingAttachmentFiles.length}개를 채팅방에 전송할까요?</p>
          <div className="flex flex-wrap gap-1.5">
            {pendingAttachmentFiles.map((file, index) => {
              const displayName = getPendingAttachmentDisplayName(file);
              return (
                <span
                  key={`${displayName}-${index}`}
                  data-testid={`chat-pending-upload-file-${index}`}
                  className="max-w-full truncate rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)]"
                  title={displayName}
                >
                  {displayName}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="chat-pending-upload-cancel-button"
              onClick={onCancelPendingAttachmentUpload}
              className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 text-[11px] font-bold text-[var(--foreground)]"
            >
              취소
            </button>
            <button
              type="button"
              data-testid="chat-pending-upload-send-button"
              onClick={() => void onConfirmPendingAttachmentUpload()}
              className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[11px] font-bold text-white"
            >
              전송
            </button>
          </div>
        </div>
      )}

      {failedAttachmentRetryEntries.length > 0 && (
        <div
          data-testid="chat-failed-attachment-retry-panel"
          className="mb-1 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-amber-700">업로드 실패 파일 {failedAttachmentRetryEntries.length}개</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="chat-failed-attachment-retry-all"
                onClick={() => void onRetryAllFailedAttachmentUploads()}
                className="rounded-[var(--radius-md)] bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-700"
              >
                모두 재시도
              </button>
              <button
                type="button"
                data-testid="chat-failed-attachment-clear-all"
                onClick={() => void onClearAllFailedAttachmentUploads()}
                className="rounded-[var(--radius-md)] border border-amber-500/20 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-700"
              >
                모두 지우기
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {failedAttachmentRetryEntries.slice(0, 4).map((entry) => (
              <div
                key={entry.id}
                data-testid={`chat-failed-attachment-${entry.id}`}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-amber-500/10 bg-white/70 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-amber-800">{entry.fileName}</p>
                  <p className="truncate text-[10px] text-amber-700/80">{entry.error || '업로드 실패'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`chat-failed-attachment-retry-${entry.id}`}
                    onClick={() => void onRetryFailedAttachmentUpload(entry.id)}
                    className="min-h-[36px] rounded-[var(--radius-md)] bg-amber-500/15 px-3 text-[10px] font-bold text-amber-700"
                  >
                    재시도
                  </button>
                  <button
                    type="button"
                    data-testid={`chat-failed-attachment-dismiss-${entry.id}`}
                    onClick={() => void onDismissFailedAttachmentUpload(entry.id)}
                    className="min-h-[36px] rounded-[var(--radius-md)] border border-amber-500/20 bg-white/80 px-3 text-[10px] font-bold text-amber-700"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`flex items-end gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/50 px-1.5 py-1 transition-all md:gap-2.5 md:px-2.5 md:py-2 ${selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice
        ? 'opacity-60 pointer-events-none'
        : ''
        }`}>
        <input
          data-testid="chat-file-input"
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={onAttachmentSelect}
          accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.avif,video/*,.mp4,.mov,.webm,.m4v,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.hwp,.hwpx,.csv"
          multiple
        />
        <input
          data-testid="chat-album-file-input"
          type="file"
          ref={albumFileInputRef}
          className="hidden"
          onChange={onAlbumFileSelect}
          accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.avif"
          multiple
        />
        <button type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={fileUploading}
          aria-label="사진 또는 파일 첨부"
          title="사진/파일 첨부"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 md:h-11 md:w-11"
        >
          {fileUploading ? <span className="animate-pulse text-xs">...</span> : <span className="text-[11px] font-bold md:text-xs">첨부</span>}
        </button>
        <div className="relative flex-1">
          <textarea
            ref={composerRef}
            data-testid="chat-message-input"
            rows={1}
            className="block min-h-[30px] w-full min-w-0 resize-none bg-transparent px-1 py-1 text-[16px] font-semibold leading-5 outline-none md:min-h-[44px] md:px-1.5 md:py-2.5 md:text-sm md:leading-5"
            placeholder={selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice ? '부서장 이상만 공지 작성 가능' : '메시지를 입력하세요... (@이름 멘션 가능)'}
            value={inputMsg}
            onChange={(event) => {
              const value = event.target.value;
              onComposerChange(value, event.target.selectionStart ?? value.length);
            }}
            onPaste={(event) => {
              void onComposerPaste(event);
            }}
            onKeyDown={handleComposerKeyDown}
          />
          {showMentionList && mentionCandidates.length > 0 && (
            <div className="absolute left-0 bottom-full mb-1 w-full max-h-48 overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm z-20 text-xs">
              {mentionCandidates.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onSelectMention(member.name || '')}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--toss-blue-light)] text-left"
                >
                  <span className="text-[11px] font-semibold text-[var(--foreground)] truncate">{member.name}</span>
                  <span className="text-[11px] text-[var(--toss-gray-3)] truncate">
                    {(member.department || '')}{member.position ? ` · ${member.position}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button"
          data-testid="chat-send-button"
          onClick={() => void onSendMessage()}
          className="flex h-8 min-w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] px-2 text-[11px] font-bold text-white shadow-sm transition-all hover:scale-105 active:scale-95 md:h-11 md:min-w-[60px] md:px-3 md:text-xs"
        >
          전송
        </button>
      </div>
    </div>
  );
}

export const MessengerComposer = memo(MessengerComposerImpl);

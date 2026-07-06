'use client';

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject } from 'react';
import type { ChatMessage, StaffMember } from '@/types';
import { getPendingAttachmentDisplayName } from './메신저첨부';
import { buildMessengerImageAlt } from './메신저공통';
import { isMobileChatViewport, NOTICE_ROOM_ID } from './메신저유틸';
import type { AttachmentRetryQueueEntry } from './메신저첨부재시도큐';
import EmojiPicker from './메신저액션서브/EmojiPicker';

const QUICK_EMOJIS = ['👍', '😊', '😂', '❤️', '🔥', '✅', '👏', '🎉', '🙏', '😅', '💪', '😄'] as const;

type AttachmentFilePreviewProps = {
  file: File;
  onRemove?: () => void;
};

function AttachmentFilePreview({ file, onRemove }: AttachmentFilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const displayName = getPendingAttachmentDisplayName(file);

  if (previewUrl) {
    return (
      <div className="relative flex flex-col items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-2 w-20 shadow-sm shrink-0">
        <div className="relative w-16 h-16 rounded-[var(--radius-md)] overflow-hidden shrink-0">
          <img
            src={previewUrl}
            alt={displayName}
            className="w-full h-full object-cover"
          />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`${displayName} 제거`}
              className="absolute -top-1.5 -right-1.5 min-h-[28px] min-w-[28px] bg-black/60 rounded-full flex items-center justify-center text-white text-[10px] font-bold hover:bg-red-600 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
        <span className="w-full truncate text-center text-[10px] text-[var(--foreground)] font-semibold px-0.5" title={displayName}>
          {displayName}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent)] max-w-full shadow-sm shrink-0">
      <span className="truncate" title={displayName}>
        {displayName}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${displayName} 제거`}
          className="min-h-[28px] min-w-[28px] flex items-center justify-center text-[var(--toss-gray-3)] hover:text-red-500 text-[11px] font-bold"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// 부모(메신저.tsx)가 컴포저 내부 value를 imperative하게 갱신하기 위한 핸들.
// 키 입력마다 발생하던 부모 전체 리렌더를 피하려고 value state를 컴포저로 끌어내림.
export type MessengerComposerHandle = {
  setValue: (value: string) => void;
};

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
  // 부모가 최신 입력값을 동기로 읽기 위한 ref. 컴포저가 onChange마다 동기 갱신.
  inputMsgRef: MutableRefObject<string>;
  canAttachFile?: boolean;
  showScrollToLatest?: boolean;
  onScrollToLatest?: () => void;
  showMentionList: boolean;
  mentionCandidates: StaffMember[];
  onCloseReply: () => void;
  onCancelAlbumUpload: () => void;
  onRemoveAlbumFile: (index: number) => void;
  onSendAlbum: () => void | Promise<unknown>;
  onCancelPendingAttachmentUpload: () => void;
  onRemovePendingAttachmentFile?: (index: number) => void;
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
  onOpenPollModal?: () => void;
  selectedRoomName?: string;
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
  inputMsgRef,
  canAttachFile = true,
  showMentionList,
  mentionCandidates,
  onCloseReply,
  onCancelAlbumUpload,
  onRemoveAlbumFile,
  onSendAlbum,
  onCancelPendingAttachmentUpload,
  onRemovePendingAttachmentFile,
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
  onOpenPollModal,
  selectedRoomName }: MessengerComposerProps, controlRef: React.ForwardedRef<MessengerComposerHandle>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const albumFileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleEmojiButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setPickerAnchor({ x: rect.left, y: rect.top - 8 });
    setShowEmojiPicker((prev) => !prev);
  };

  // 컴포저 내부에서 value를 관리. 부모 메신저.tsx가 직접 state로 들고 있던
  // 시절엔 모든 키 입력이 3,448줄짜리 부모 함수 전체를 리렌더시켜 입력 지연
  // 주범이었음. 부모는 setInputMsg를 호출하면 controlRef.setValue로 전달됨.
  // eslint-disable-next-line react-hooks/refs
  const [inputMsg, setInputMsg] = useState<string>(() => inputMsgRef.current || '');

  useImperativeHandle(
    controlRef,
    () => ({
      setValue: (next: string) => {
        inputMsgRef.current = next;
        setInputMsg(next);
      } }),
    [inputMsgRef],
  );

  // 부모가 동기로 inputMsgRef를 읽을 때 항상 최신 textarea 값을 보장하기 위해
  // change 핸들러 안에서 ref를 함께 갱신한다(아래 textarea onChange 참조).
  const propagateChange = (next: string, caret: number) => {
    inputMsgRef.current = next;
    setInputMsg(next);
    onComposerChange(next, caret);
  };

  // 입력 폭/줄바꿈에 맞춰 textarea 높이 자동 조절 — 부모에 있던 effect를
  // value owner인 컴포저로 함께 이동. 매 입력마다 부모 함수 재실행을 피한다.
  useEffect(() => {
    const composerEl = composerRef.current;
    if (!composerEl) return;
    const maxHeight = isMobileChatViewport() ? 72 : 72;
    composerEl.style.height = 'auto';
    composerEl.style.height = `${Math.min(maxHeight, composerEl.scrollHeight)}px`;
    composerEl.style.overflowY = composerEl.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [inputMsg, composerRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handleResize = () => {
      const offsetBottom = window.innerHeight - vv.height - vv.offsetTop;
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translateY(-${Math.max(0, offsetBottom)}px)`;
      }
    };
    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);
    handleResize();
    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
    };
  }, []);

  const handleInsertEmoji = (emoji: string) => {
    setShowEmojiPicker(false);
    
    if (emoji.startsWith('[stat:')) {
      propagateChange(emoji, emoji.length);
      setTimeout(() => {
        void onSendMessage();
      }, 0);
      return;
    }

    const ta = composerRef.current;
    if (!ta) {
      propagateChange(inputMsg + emoji, (inputMsg + emoji).length);
      return;
    }
    const start = ta.selectionStart ?? inputMsg.length;
    const end = ta.selectionEnd ?? inputMsg.length;
    const next = inputMsg.slice(0, start) + emoji + inputMsg.slice(end);
    propagateChange(next, start + emoji.length);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const handleInsertMention = () => {
    const ta = composerRef.current;
    const start = ta ? (ta.selectionStart ?? inputMsg.length) : inputMsg.length;
    const end = ta ? (ta.selectionEnd ?? inputMsg.length) : inputMsg.length;
    const next = inputMsg.slice(0, start) + '@' + inputMsg.slice(end);
    propagateChange(next, start + 1);
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(start + 1, start + 1);
      }
    });
  };

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
      ref={wrapperRef}
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
                  className="absolute -top-1.5 -right-1.5 min-h-[28px] min-w-[28px] bg-black/60 rounded-full flex items-center justify-center text-white text-[10px] font-bold hover:bg-red-600 transition-colors"
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
          <div className="flex flex-wrap gap-2 items-end">
            {pendingAttachmentFiles.map((file, index) => (
              <AttachmentFilePreview
                key={`${file.name}-${index}`}
                file={file}
                onRemove={() => onRemovePendingAttachmentFile?.(index)}
              />
            ))}
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

      <div className={`chat-composer items-end ${selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice
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

        {/* 좌측 액션바: +(첨부) / 이모지 — 투표는 채팅방 정보(드로어)에서, 멘션은 @ 입력으로 */}
        <div className="chat-comp-actions shrink-0 pb-0.5">
          {/* 첨부 */}
          {canAttachFile && (
            <button
              type="button"
              data-testid="chat-attach-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              aria-label="파일 첨부"
              title="파일 첨부"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] disabled:opacity-40"
            >
              {fileUploading ? (
                <span className="animate-pulse text-[10px]">…</span>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 4v12M4 10h12" />
                </svg>
              )}
            </button>
          )}
          {/* 이모지 팝오버 */}
          <div className="relative">
            <button
              type="button"
              data-testid="chat-emoji-button"
              onClick={handleEmojiButtonClick}
              aria-label="이모지 삽입"
              aria-expanded={showEmojiPicker}
              title="이모지"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)]"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="7.5" />
                <path d="M7 11.5s.8 1.5 3 1.5 3-1.5 3-1.5" />
                <circle cx="7.5" cy="8.5" r="0.8" fill="currentColor" stroke="none" />
                <circle cx="12.5" cy="8.5" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                x={pickerAnchor.x}
                y={pickerAnchor.y}
                onPick={handleInsertEmoji}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>
        </div>

        {/* 가운데: 자라나는 textarea */}
        <div className="chat-comp-input relative flex-1">
          <textarea
            ref={composerRef}
            data-testid="chat-message-input"
            rows={1}
            className="block min-h-[30px] w-full min-w-0 resize-none bg-transparent px-1 py-1 text-[16px] font-semibold leading-5 outline-none md:min-h-[36px] md:px-1.5 md:py-2 md:text-sm md:leading-5"
            placeholder={
              selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice
                ? '부서장 이상만 공지 작성 가능'
                : '메시지를 입력하세요'
            }
            value={inputMsg}
            onChange={(event) => {
              const value = event.target.value;
              propagateChange(value, event.target.selectionStart ?? value.length);
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

        {/* 우측: 라이브 §2-2 .chat-comp-send */}
        <button
          type="button"
          data-testid="chat-send-button"
          onClick={() => void onSendMessage()}
          aria-label="메시지 전송"
          className="chat-comp-send shrink-0 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 mb-0.5"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10l12-6-4 6 4 6-12-6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export const MessengerComposer = memo(forwardRef(MessengerComposerImpl));

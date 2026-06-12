'use client';

import type { ChatMessage } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import type { MessageEditHistoryEntry } from './메신저상태훅';

type MessageEditModalProps = {
  open: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

type MessageEditHistoryModalProps = {
  open: boolean;
  message: ChatMessage | null;
  loading: boolean;
  entries: MessageEditHistoryEntry[];
  onClose: () => void;
};

export function MessageEditModal({
  open,
  draft,
  onDraftChange,
  onClose,
  onSave,
}: MessageEditModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[115] p-4">
      <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-5 shadow-sm border border-[var(--border)] space-y-4" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-foreground">메시지 수정</h3>
          <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">전송한 메시지를 수정하면 모든 참여자에게 바로 반영됩니다.</p>
        </div>
        <textarea
          data-testid="chat-message-edit-input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={4}
          className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm font-medium outline-none resize-none focus:border-[var(--accent)]"
          placeholder="수정할 메시지를 입력해 주세요"
        />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-sm">
            취소
          </button>
          <button data-testid="chat-message-edit-save" type="button" onClick={() => void onSave()} className="flex-1 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessageEditHistoryModal({
  open,
  message,
  loading,
  entries,
  onClose,
}: MessageEditHistoryModalProps) {
  if (!open || !message) return null;

  return (
    <div
      data-testid="chat-message-edit-history-modal"
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[116] p-4"
    >
      <div
        className="bg-[var(--card)] w-full max-w-xl rounded-2xl p-5 shadow-sm border border-[var(--border)] space-y-4 max-h-[80vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1 shrink-0">
          <h3 className="text-lg font-bold text-foreground">수정 이력</h3>
          <p className="text-[11px] font-medium text-[var(--toss-gray-3)] line-clamp-2">
            {getMessageDisplayText(message.content, message.file_name, message.file_url, '메시지')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
          {loading ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] px-4 py-6 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
              수정 이력을 불러오는 중입니다.
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] px-4 py-6 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
              저장된 수정 이력이 없습니다.
            </div>
          ) : (
            entries.map((entry, index) => (
              <article
                key={entry.id}
                data-testid={`chat-message-edit-history-entry-${index}`}
                className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{entry.editorName}</p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">
                      {entry.editedAt
                        ? new Date(entry.editedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                        : '시간 정보 없음'}
                    </p>
                  </div>
                  {entry.isFallback ? (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                      현재 버전만 확인 가능
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">수정 전</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                      {entry.previousContent || '기록 없음'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">수정 후</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                      {entry.nextContent || '기록 없음'}
                    </p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] bg-[var(--muted)] px-4 py-2 text-sm font-semibold text-[var(--toss-gray-3)]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

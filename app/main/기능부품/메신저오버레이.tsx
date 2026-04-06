'use client';

import type { ChatMessage, StaffMember } from '@/types';
import {
  AttachmentListCard,
  getAttachmentDisplayName,
  getMessageDisplayText,
  resolveAttachmentKind,
} from './메신저첨부';
import { MessengerStatusUserRow } from './메신저공통';

type SlashCommandForm = {
  startDate: string;
  endDate: string;
  reason: string;
  itemName: string;
  quantity: number;
};

type MessageEditModalProps = {
  open: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

type PollComposerModalProps = {
  open: boolean;
  question: string;
  options: string[];
  onQuestionChange: (value: string) => void;
  onOptionChange: (index: number, value: string) => void;
  onRemoveOption: (index: number) => void;
  onAddOption: () => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
};

type SlashCommandModalProps = {
  open: boolean;
  command: 'annual_leave' | 'purchase' | null;
  form: SlashCommandForm;
  onFieldChange: <K extends keyof SlashCommandForm>(field: K, value: SlashCommandForm[K]) => void;
  onClose: () => void;
  onSubmitAnnualLeave: () => void | Promise<void>;
  onSubmitPurchase: () => void | Promise<void>;
};

type ThreadPanelProps = {
  rootMessage: ChatMessage | null;
  messages: ChatMessage[];
  resolveStaffProfile: (staffId: string | null | undefined) => StaffMember | null;
  onClose: () => void;
  onPreviewAttachment: (message: ChatMessage) => void;
  onReplyMessage: (message: ChatMessage) => void;
};

type ReadStatusModalProps = {
  message: ChatMessage | null;
  loading: boolean;
  unreadUsers: StaffMember[];
  readUsers: StaffMember[];
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[115] p-4" onClick={onClose}>
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

export function PollComposerModal({
  open,
  question,
  options,
  onQuestionChange,
  onOptionChange,
  onRemoveOption,
  onAddOption,
  onClose,
  onSubmit,
}: PollComposerModalProps) {
  if (!open) return null;

  return (
    <div data-testid="chat-poll-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">새 투표 만들기</h3>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
          질문과 선택지를 입력해 주세요. 선택지는 항목별로 따로 입력합니다.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">질문</label>
            <input
              data-testid="chat-poll-question"
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              className="w-full mt-1 p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
              placeholder="예: 이번 주 회의 시간은 언제가 좋을까요?"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">선택지</label>
            <div className="mt-1 space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    data-testid={`chat-poll-option-${index}`}
                    value={option}
                    onChange={(event) => onOptionChange(index, event.target.value)}
                    className="flex-1 p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                    placeholder={`선택지 ${index + 1}`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => onRemoveOption(index)}
                      className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20"
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={onAddOption}
                className="w-full py-3 border-2 border-dashed border-[var(--border)] rounded-xl text-xs font-bold text-[var(--toss-gray-4)] hover:text-blue-500 hover:border-blue-300"
              >
                + 항목 추가
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">
            취소
          </button>
          <button data-testid="chat-poll-submit" type="button" onClick={() => void onSubmit()} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md">
            투표 생성
          </button>
        </div>
      </div>
    </div>
  );
}

export function SlashCommandModal({
  open,
  command,
  form,
  onFieldChange,
  onClose,
  onSubmitAnnualLeave,
  onSubmitPurchase,
}: SlashCommandModalProps) {
  if (!open || !command) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          {command === 'annual_leave' ? '연차 요청 초안 만들기' : '발주 요청 초안 만들기'}
        </h3>
        {command === 'annual_leave' ? (
          <>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              시작일, 종료일, 사유를 입력하면 전자결재용 연차/휴가 초안을 생성합니다.
            </p>
            <div className="space-y-3 text-xs font-bold">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">시작일</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => onFieldChange('startDate', event.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">종료일</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => onFieldChange('endDate', event.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">사유(선택)</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(event) => onFieldChange('reason', event.target.value)}
                  placeholder="예: 개인 일정, 병원 방문"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">
                취소
              </button>
              <button type="button" onClick={() => void onSubmitAnnualLeave()} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md">
                전자결재 초안 생성
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              항목명과 수량을 입력하면 비품구매(발주) 결재 초안을 생성합니다.
            </p>
            <div className="space-y-3 text-xs font-bold">
              <div>
                <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">항목명</label>
                <input
                  type="text"
                  value={form.itemName}
                  onChange={(event) => onFieldChange('itemName', event.target.value)}
                  placeholder="예: A4 용지, 프린터 토너"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">수량</label>
                  <input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(event) => onFieldChange('quantity', Number(event.target.value) || 1)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">비고(선택)</label>
                  <input
                    type="text"
                    value={form.reason}
                    onChange={(event) => onFieldChange('reason', event.target.value)}
                    placeholder="예: 재고 부족, 교체 주기 도래"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">
                취소
              </button>
              <button type="button" onClick={() => void onSubmitPurchase()} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md">
                전자결재 초안 생성
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ThreadPanel({
  rootMessage,
  messages,
  resolveStaffProfile,
  onClose,
  onPreviewAttachment,
  onReplyMessage,
}: ThreadPanelProps) {
  if (!rootMessage) return null;

  return (
    <>
      <div className="absolute inset-0 bg-black/10 z-40" onClick={onClose} aria-hidden="true" />
      <aside data-testid="chat-thread-panel" className="absolute top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">스레드</p>
            <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-2">
              {getMessageDisplayText(rootMessage.content, rootMessage.file_name, rootMessage.file_url, '첨부 파일 메시지')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">
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
              const staff = (message.staff as { name?: string; position?: string } | null | undefined) || resolveStaffProfile(message.sender_id);
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
                      {createdAt.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}{' '}
                      {createdAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
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
                        meta={`${staff?.name || '이름 없음'} · ${createdAt.toLocaleDateString('ko-KR')} ${createdAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
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

export function ReadStatusModal({
  message,
  loading,
  unreadUsers,
  readUsers,
  onClose,
}: ReadStatusModalProps) {
  if (!message) return null;

  return (
    <div data-testid="chat-read-status-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={onClose}>
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

'use client';
import type { StaffMember } from '@/types';

type SlashCommandForm = {
  startDate: string;
  endDate: string;
  reason: string;
  itemName: string;
  quantity: number;
};

type PollComposerModalProps = {
  open: boolean;
  roomMembers: StaffMember[];
  question: string;
  options: string[];
  deadlineAt: string;
  prizeEnabled: boolean;
  prizeWinnerCount: number;
  prizeName: string;
  onQuestionChange: (value: string) => void;
  onDeadlineAtChange: (value: string) => void;
  onOptionChange: (index: number, value: string) => void;
  onRemoveOption: (index: number) => void;
  onAddOption: () => void;
  onPrizeEnabledChange: (value: boolean) => void;
  onPrizeWinnerCountChange: (value: number) => void;
  onPrizeNameChange: (value: string) => void;
  isKickPoll: boolean;
  onIsKickPollChange: (value: boolean) => void;
  anonymous: boolean;
  onAnonymousChange: (value: boolean) => void;
  kickTargetId: string;
  onKickTargetIdChange: (value: string) => void;
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

export function PollComposerModal({
  open,
  roomMembers,
  question,
  options,
  deadlineAt,
  prizeEnabled,
  prizeWinnerCount,
  prizeName,
  onQuestionChange,
  onDeadlineAtChange,
  onOptionChange,
  onRemoveOption,
  onAddOption,
  onPrizeEnabledChange,
  onPrizeWinnerCountChange,
  onPrizeNameChange,
  isKickPoll,
  onIsKickPollChange,
  anonymous,
  onAnonymousChange,
  kickTargetId,
  onKickTargetIdChange,
  onClose,
  onSubmit }: PollComposerModalProps) {
  if (!open) return null;

  return (
    <div data-testid="chat-poll-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4">
      <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)] max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
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
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">마감시간</label>
            <input
              data-testid="chat-poll-deadline"
              type="datetime-local"
              value={deadlineAt}
              onChange={(event) => onDeadlineAtChange(event.target.value)}
              className="w-full mt-1 p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
            />
          </div>
          {/*
            익명 투표. 체크만으로 화면에서 이름을 가리는 방식이면 개발자도구로
            그대로 보인다 — /api/chat/poll-votes 가 익명 투표의 user_id 를
            응답에서 아예 빼는 것이 실제 동작이다.
          */}
          <label className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--muted)] p-3 cursor-pointer">
            <input
              type="checkbox"
              data-testid="chat-poll-anonymous"
              checked={anonymous}
              onChange={(event) => onAnonymousChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-[var(--foreground)]">익명 투표</span>
              <span className="mt-0.5 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
                {anonymous
                  ? '누가 무엇을 골랐는지 아무도 볼 수 없습니다'
                  : '선택지 아래에 투표한 사람이 표시됩니다'}
              </span>
            </span>
          </label>
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

          <div className="pt-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="poll-prize-enabled"
                checked={prizeEnabled}
                onChange={(event) => onPrizeEnabledChange(event.target.checked)}
                className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              />
              <label htmlFor="poll-prize-enabled" className="text-xs font-semibold text-[var(--foreground)] cursor-pointer select-none">
                상품 추첨 진행
              </label>
            </div>
            {prizeEnabled && (
              <div className="mt-3 space-y-2 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="poll-prize-winner-count" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">당첨 인원</label>
                    <input
                      id="poll-prize-winner-count"
                      type="number"
                      min={1}
                      value={prizeWinnerCount}
                      onChange={(event) => onPrizeWinnerCountChange(Math.max(1, Number(event.target.value) || 1))}
                      className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="poll-prize-name" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">상품명</label>
                    <input
                      id="poll-prize-name"
                      type="text"
                      value={prizeName}
                      onChange={(event) => onPrizeNameChange(event.target.value)}
                      placeholder="예: 아메리카노 쿠폰"
                      className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="poll-kick-enabled"
                checked={isKickPoll}
                onChange={(event) => {
                  onIsKickPollChange(event.target.checked);
                  if (event.target.checked && roomMembers.length > 0) {
                    onKickTargetIdChange(String(roomMembers[0].id));
                  }
                }}
                className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              />
              <label htmlFor="poll-kick-enabled" className="text-xs font-semibold text-[var(--foreground)] cursor-pointer select-none">
                강퇴 투표 진행
              </label>
            </div>
            {isKickPoll && (
              <div className="mt-3 space-y-2 pl-1">
                <label htmlFor="poll-kick-target" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">강퇴 대상 선택</label>
                <select
                  id="poll-kick-target"
                  value={kickTargetId}
                  onChange={(event) => onKickTargetIdChange(event.target.value)}
                  className="w-full p-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                >
                  <option value="" disabled>대상을 선택하세요</option>
                  {roomMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.department})
                    </option>
                  ))}
                </select>
              </div>
            )}
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
  onSubmitPurchase }: SlashCommandModalProps) {
  if (!open || !command) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4">
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
                  <input type="date" value={form.startDate} onChange={(event) => onFieldChange('startDate', event.target.value)} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">종료일</label>
                  <input type="date" value={form.endDate} onChange={(event) => onFieldChange('endDate', event.target.value)} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">사유(선택)</label>
                <input type="text" value={form.reason} onChange={(event) => onFieldChange('reason', event.target.value)} placeholder="예: 개인 일정, 병원 방문" className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">취소</button>
              <button type="button" onClick={() => void onSubmitAnnualLeave()} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md">전자결재 초안 생성</button>
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
                <input type="text" value={form.itemName} onChange={(event) => onFieldChange('itemName', event.target.value)} placeholder="예: A4 용지, 프린터 토너" className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">수량</label>
                  <input type="number" min={1} value={form.quantity} onChange={(event) => onFieldChange('quantity', Number(event.target.value) || 1)} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">비고(선택)</label>
                  <input type="text" value={form.reason} onChange={(event) => onFieldChange('reason', event.target.value)} placeholder="예: 재고 부족, 교체 주기 도래" className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">취소</button>
              <button type="button" onClick={() => void onSubmitPurchase()} className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md">전자결재 초안 생성</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

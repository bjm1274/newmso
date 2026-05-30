'use client';

// OP체크 병동(수술실 이동요청) 메시지 전송 다이얼로그 본문
// 순수 프레젠테이션 — 포커스트랩/스크롤락/createPortal/ref 는 부모(OP체크.tsx)가 관리.
// OP체크.tsx 에서 그대로 추출됨 (동작 보존).

import type { RefObject } from 'react';
import { stripHiddenMetaBlocks } from '../op-check-utils';

type WardStaffRow = {
  id: string;
  name: string;
  department?: string | null;
  position?: string | null;
  company?: string | null;
  company_id?: string | null;
  status?: string | null;
};

type WardMessageTemplateOption = {
  id: string;
  label: string;
  text: string;
};

type OpCheckWardMessageDialogProps = {
  dialogRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  recipientSearchInputRef: RefObject<HTMLInputElement | null>;
  wardMsgTargets: string[];
  wardMsgText: string;
  wardStaffs: WardStaffRow[];
  recentWardStaffs: WardStaffRow[];
  favoriteWardStaffs: WardStaffRow[];
  selectedWardStaffs: WardStaffRow[];
  filteredWardStaffs: WardStaffRow[];
  wardFavoriteTargets: string[];
  wardRecipientPickerOpen: boolean;
  wardRecipientSearch: string;
  wardMessageTemplates: WardMessageTemplateOption[];
  normalizedWardMessageText: string;
  wardMessageValidationText: string;
  sendingMsg: boolean;
  onClose: () => void;
  onAddTarget: (targetId: string) => void;
  onRemoveTarget: (targetId: string) => void;
  onToggleFavorite: (targetId: string) => void;
  onClearTargets: () => void;
  onToggleRecipientPicker: () => void;
  onRecipientSearchChange: (value: string) => void;
  onMessageTextChange: (value: string) => void;
  onSend: () => void;
};

export function OpCheckWardMessageDialog({
  dialogRef,
  closeButtonRef,
  recipientSearchInputRef,
  wardMsgTargets,
  wardMsgText,
  wardStaffs,
  recentWardStaffs,
  favoriteWardStaffs,
  selectedWardStaffs,
  filteredWardStaffs,
  wardFavoriteTargets,
  wardRecipientPickerOpen,
  wardRecipientSearch,
  wardMessageTemplates,
  normalizedWardMessageText,
  wardMessageValidationText,
  sendingMsg,
  onClose,
  onAddTarget,
  onRemoveTarget,
  onToggleFavorite,
  onClearTargets,
  onToggleRecipientPicker,
  onRecipientSearchChange,
  onMessageTextChange,
  onSend,
}: OpCheckWardMessageDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[360] flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="op-check-ward-message-title"
        aria-describedby="op-check-ward-message-description"
        data-testid="op-check-ward-message-modal"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h3
              id="op-check-ward-message-title"
              className="text-base font-bold text-[var(--foreground)]"
            >
              메시지 전송
            </h3>
            <p
              id="op-check-ward-message-description"
              className="mt-0.5 text-[12px] font-medium text-[var(--toss-gray-3)]"
            >
              환자를 수술실로 올려달라고 병동팀에게 메시지를 보냅니다.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            data-testid="op-check-ward-message-close"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            닫기
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
              받는 사람 선택 ({wardMsgTargets.length}명 선택)
            </p>
            <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
              <div>
                <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  최근 보낸 사람
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentWardStaffs.length === 0 ? (
                    <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                      최근에 전송한 대상이 아직 없습니다.
                    </p>
                  ) : (
                    recentWardStaffs.map((staff) => {
                      const selected = wardMsgTargets.includes(staff.id);
                      return (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() =>
                            selected ? onRemoveTarget(staff.id) : onAddTarget(staff.id)
                          }
                          data-testid={`op-check-ward-recent-chip-${staff.id}`}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                            selected
                              ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                              : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--accent)]'
                          }`}
                        >
                          {staff.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  즐겨찾는 사람
                </p>
                <div className="flex flex-wrap gap-2">
                  {favoriteWardStaffs.length === 0 ? (
                    <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                      자주 보내는 대상을 추가해 두면 여기서 바로 선택할 수 있습니다.
                    </p>
                  ) : (
                    favoriteWardStaffs.map((staff) => {
                      const selected = wardMsgTargets.includes(staff.id);
                      return (
                        <div
                          key={staff.id}
                          className={`flex items-center gap-1 rounded-full border px-2 py-1 ${
                            selected
                              ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                              : 'border-[var(--border)] bg-[var(--card)]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              selected
                                ? onRemoveTarget(staff.id)
                                : onAddTarget(staff.id)
                            }
                            data-testid={`op-check-ward-favorite-chip-${staff.id}`}
                            className="text-[11px] font-semibold text-[var(--foreground)]"
                          >
                            {staff.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(staff.id)}
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                          >
                            해제
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={onToggleRecipientPicker}
                  data-testid="op-check-ward-recipient-dropdown-button"
                  aria-haspopup="listbox"
                  aria-expanded={wardRecipientPickerOpen}
                  className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm font-semibold text-[var(--foreground)]"
                >
                  <span>
                    {selectedWardStaffs.length > 0
                      ? `받는 사람 추가 (${selectedWardStaffs.length}명 선택됨)`
                      : '받는 사람 추가...'}
                  </span>
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">
                    {wardRecipientPickerOpen ? '닫기' : '열기'}
                  </span>
                </button>

                {wardRecipientPickerOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg">
                    <input
                      ref={recipientSearchInputRef}
                      value={wardRecipientSearch}
                      onChange={(e) => onRecipientSearchChange(e.target.value)}
                      data-testid="op-check-ward-recipient-search"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
                      placeholder="이름, 소속, 직책으로 검색"
                    />
                    <div className="mt-2 max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                      {wardStaffs.length === 0 ? (
                        <p className="py-4 text-center text-[11px] font-medium text-[var(--toss-gray-3)]">
                          직원 목록이 없습니다.
                        </p>
                      ) : filteredWardStaffs.length === 0 ? (
                        <p className="py-4 text-center text-[11px] font-medium text-[var(--toss-gray-3)]">
                          조건에 맞는 직원이 없습니다.
                        </p>
                      ) : (
                        filteredWardStaffs.map((staff) => {
                          const isFavorite = wardFavoriteTargets.includes(staff.id);
                          return (
                            <div
                              key={staff.id}
                              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-transparent px-1 py-1 hover:bg-[var(--muted)]/60"
                            >
                              <button
                                type="button"
                                onClick={() => onAddTarget(staff.id)}
                                data-testid={`op-check-ward-recipient-option-${staff.id}`}
                                className="flex flex-1 items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left"
                              >
                                <span className="flex-1 text-sm font-semibold text-[var(--foreground)]">
                                  {staff.name}
                                </span>
                                {staff.department && (
                                  <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--toss-gray-3)]">
                                    {staff.department}
                                  </span>
                                )}
                                {staff.position && (
                                  <span className="text-[11px] font-medium text-[var(--toss-gray-4)]">
                                    {staff.position}
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleFavorite(staff.id)}
                                data-testid={`op-check-ward-favorite-toggle-${staff.id}`}
                                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  isFavorite
                                    ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                                }`}
                              >
                                {isFavorite ? '저장됨' : '즐겨찾기'}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    선택된 받는 사람
                  </p>
                  {selectedWardStaffs.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearTargets}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                    >
                      전체 해제
                    </button>
                  )}
                </div>
                {selectedWardStaffs.length === 0 ? (
                  <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                    드롭다운에서 받는 사람을 추가해 주세요.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedWardStaffs.map((staff) => {
                      const isFavorite = wardFavoriteTargets.includes(staff.id);
                      return (
                        <div
                          key={staff.id}
                          data-testid={`op-check-ward-selected-recipient-${staff.id}`}
                          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[var(--foreground)]">{staff.name}</p>
                            <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
                              {[staff.department, staff.position].filter(Boolean).join(' · ') || '직원'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(staff.id)}
                            className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                              isFavorite
                                ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                            }`}
                          >
                            {isFavorite ? '저장됨' : '즐겨찾기'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveTarget(staff.id)}
                            className="rounded-full px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                          >
                            제거
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">메시지 내용</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {wardMessageTemplates.map((template) => {
                const selectedTemplate =
                  normalizedWardMessageText === stripHiddenMetaBlocks(template.text).trim();
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onMessageTextChange(template.text)}
                    data-testid={`op-check-ward-template-${template.id}`}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                      selectedTemplate
                        ? 'bg-[var(--accent)] text-white'
                        : 'border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    {template.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={wardMsgText}
              onChange={(e) => onMessageTextChange(e.target.value)}
              data-testid="op-check-ward-message-textarea"
              className="min-h-[120px] w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
              placeholder="전송할 메시지를 입력해 주세요."
            />
            {wardMessageValidationText ? (
              <p
                data-testid="op-check-ward-validation-text"
                className="mt-2 text-[11px] font-semibold text-rose-600"
              >
                {wardMessageValidationText}
              </p>
            ) : (
              <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                최근/즐겨찾기에서 받는 사람을 빠르게 추가할 수 있습니다.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={sendingMsg || wardMsgTargets.length === 0 || !normalizedWardMessageText}
              data-testid="op-check-ward-message-send"
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {sendingMsg ? '전송 중...' : `메시지 보내기 (${wardMsgTargets.length}명)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import type { ChatMessage, ChatRoom, StaffMember } from '@/types';

export type ForwardRoomItem = {
  room: ChatRoom;
  unreadCount: number;
};

type GroupChatModalProps = {
  open: boolean;
  groupName: string;
  selectedMembers: string[];
  selectableStaffs: StaffMember[];
  onGroupNameChange: (value: string) => void;
  onToggleMember: (memberId: string, checked: boolean) => void;
  onClose: () => void;
  onCreate: () => void;
};

export function GroupChatModal({
  open,
  groupName,
  selectedMembers,
  selectableStaffs,
  onGroupNameChange,
  onToggleMember,
  onClose,
  onCreate,
}: GroupChatModalProps) {
  if (!open) return null;

  return (
    <div
      data-testid="chat-group-modal"
      className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[110] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] w-full max-w-md rounded-2xl p-5 shadow-sm space-y-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-xl font-semibold text-[var(--foreground)] italic">새 그룹 채팅방</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">
              방 이름
            </label>
            <input
              value={groupName}
              onChange={(event) => onGroupNameChange(event.target.value)}
              className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="예: 운영팀 공지방"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">
              멤버 선택 ({selectedMembers.length}명)
            </label>
            <div className="h-48 overflow-y-auto border border-[var(--border)] rounded-[var(--radius-md)] p-4 space-y-2 custom-scrollbar bg-[var(--muted)]/30">
              {selectableStaffs.map((staff) => (
                <label
                  key={staff.id}
                  className="flex items-center gap-3 p-3 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] transition-all"
                >
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(staff.id)}
                    onChange={(event) => onToggleMember(staff.id, event.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <span className="text-xs font-bold text-[var(--foreground)]">
                    {staff.name} ({staff.company ? `${staff.company} · ` : ''}
                    {staff.position})
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-xs"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onCreate}
              className="flex-2 py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-xs shadow-sm shadow-[var(--accent)]"
            >
              채팅방 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type ForwardMessageModalProps = {
  open: boolean;
  targetRooms: ForwardRoomItem[];
  onClose: () => void;
  onForward: (room: ChatRoom) => void | Promise<void>;
};

export function ForwardMessageModal({
  open,
  targetRooms,
  onClose,
  onForward,
}: ForwardMessageModalProps) {
  if (!open) return null;

  return (
    <div
      data-testid="chat-forward-modal"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[var(--foreground)]">다른 채팅방으로 전달</h3>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
          선택한 메시지를 전달할 채팅방을 선택하세요.
        </p>
        <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
          {targetRooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--toss-gray-3)]">
              전달할 수 있는 채팅방이 없습니다.
            </div>
          ) : (
            targetRooms.map(({ room, unreadCount }) => (
              <button
                data-testid={`chat-forward-target-${room.id}`}
                key={room.id}
                type="button"
                onClick={() => void onForward(room)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] hover:bg-[var(--toss-blue-light)] text-left text-xs font-bold text-[var(--foreground)]"
              >
                <span className="truncate">{room.name || '채팅방'}</span>
                <span className="text-[11px] text-[var(--toss-gray-3)]">
                  {unreadCount ? String(unreadCount) : ''}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

type AddMemberModalProps = {
  open: boolean;
  selectedRoom: ChatRoom | null;
  search: string;
  addableMembers: StaffMember[];
  selectingIds: string[];
  onSearchChange: (value: string) => void;
  onToggleMember: (memberId: string, checked: boolean) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
};

export function AddMemberModal({
  open,
  selectedRoom,
  search,
  addableMembers,
  selectingIds,
  onSearchChange,
  onToggleMember,
  onClose,
  onSubmit,
}: AddMemberModalProps) {
  if (!open || !selectedRoom) return null;

  return (
    <div
      data-testid="chat-add-member-modal"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[var(--foreground)]">참여자 추가</h3>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
          현재 채팅방에 새로 초대할 직원을 선택하세요.
        </p>
        <input
          data-testid="chat-add-member-search"
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          placeholder="이름, 부서, 직급으로 검색"
        />
        <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
          {addableMembers.length === 0 ? (
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold py-4 text-center">
              추가할 수 있는 직원이 없습니다.
            </p>
          ) : (
            addableMembers.map((staff) => {
              const checked = selectingIds.includes(staff.id);
              return (
                <label
                  data-testid={`chat-add-member-option-${staff.id}`}
                  key={staff.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer text-[11px]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onToggleMember(staff.id, event.target.checked)}
                    className="w-3 h-3"
                  />
                  <span className="flex-1">
                    <span className="font-semibold text-[var(--foreground)]">{staff.name}</span>
                    <span className="ml-1 text-[var(--toss-gray-3)]">
                      {staff.position ? ` ${staff.position}` : ''}
                      {staff.company || staff.department
                        ? ` · ${staff.company || staff.department}`
                        : ''}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button
            data-testid="chat-add-member-cancel"
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
          >
            취소
          </button>
          <button
            data-testid="chat-add-member-submit"
            type="button"
            disabled={selectingIds.length === 0}
            onClick={() => void onSubmit()}
            className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-white bg-[var(--accent)] disabled:bg-[var(--toss-gray-3)] hover:bg-[var(--accent)]"
          >
            추가하기
          </button>
        </div>
      </div>
    </div>
  );
}

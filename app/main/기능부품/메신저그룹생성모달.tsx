'use client';

import type { StaffMember } from '@/types';

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
  onCreate }: GroupChatModalProps) {
  if (!open) return null;

  return (
    <div
      data-testid="chat-group-modal"
      className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[110] p-4"
    >
      <div
        className="bg-[var(--card)] w-full max-w-md rounded-2xl p-5 shadow-sm space-y-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-xl font-semibold text-[var(--foreground)] italic">새 그룹 채팅방</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">방 이름</label>
            <input
              value={groupName}
              onChange={(event) => onGroupNameChange(event.target.value)}
              className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="예: 운영팀 공지방"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">멤버 선택 ({selectedMembers.length}명)</label>
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
                    {staff.name} ({staff.company ? `${staff.company} · ` : ''}{staff.position})
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-xs">취소</button>
            <button type="button" onClick={onCreate} className="flex-2 py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-xs shadow-sm shadow-[var(--accent)]">채팅방 생성</button>
          </div>
        </div>
      </div>
    </div>
  );
}

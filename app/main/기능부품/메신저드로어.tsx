'use client';

import { toast } from '@/lib/toast';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import {
  AttachmentListCard,
  AttachmentQuickActions,
  extractFirstLinkUrl,
  getAttachmentDisplayName,
  resolveAttachmentKind,
} from './메신저첨부';
import { buildMessengerImageAlt, MessengerAvatar } from './메신저공통';
import { isSelfChatRoom, NOTICE_ROOM_ID } from './메신저유틸';

type MessengerDrawerProps = {
  isOpen: boolean;
  roomNotifyOn: boolean;
  currentNoticeMessage: ChatMessage | null;
  sharedMediaPreviewMessages: ChatMessage[];
  sharedFilePreviewMessages: ChatMessage[];
  sharedLinkPreviewMessages: ChatMessage[];
  roomMembers: StaffMember[];
  selectedRoom: ChatRoom | null;
  currentUserId: string | null | undefined;
  editingRoomName: boolean;
  roomNameDraft: string;
  resolveRoomMemberProfile: (room: ChatRoom, memberId: string) => StaffMember | null;
  onClose: () => void;
  onToggleRoomNotify: () => void | Promise<void>;
  onOpenPollModal: () => void;
  onOpenMediaArchive: (filter: 'media' | 'file') => void;
  onPreviewMessage: (message: ChatMessage) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onOpenAddMemberModal: () => void;
  onRemoveRoomMember: (memberId: string) => void | Promise<void>;
  onRoomNameDraftChange: (value: string) => void;
  onSaveRoomName: () => void | Promise<void>;
  onCancelEditingRoomName: () => void;
  onStartEditingRoomName: () => void;
  onLeaveRoom: () => void;
};

export function MessengerDrawer({
  isOpen,
  roomNotifyOn,
  currentNoticeMessage,
  sharedMediaPreviewMessages,
  sharedFilePreviewMessages,
  sharedLinkPreviewMessages,
  roomMembers,
  selectedRoom,
  currentUserId,
  editingRoomName,
  roomNameDraft,
  resolveRoomMemberProfile,
  onClose,
  onToggleRoomNotify,
  onOpenPollModal,
  onOpenMediaArchive,
  onPreviewMessage,
  onReplyMessage,
  onOpenAddMemberModal,
  onRemoveRoomMember,
  onRoomNameDraftChange,
  onSaveRoomName,
  onCancelEditingRoomName,
  onStartEditingRoomName,
  onLeaveRoom,
}: MessengerDrawerProps) {
  if (!isOpen) return null;

  const ownerId = String(currentUserId || '');
  const isOwner = selectedRoom?.id !== NOTICE_ROOM_ID && String(selectedRoom?.created_by || '') === ownerId;
  const canLeaveRoom =
    Boolean(selectedRoom) &&
    selectedRoom?.id !== NOTICE_ROOM_ID &&
    !isSelfChatRoom(selectedRoom, ownerId);
  const canEditRoomName =
    Boolean(selectedRoom) &&
    selectedRoom?.id !== NOTICE_ROOM_ID &&
    (selectedRoom?.type !== 'direct' || (Array.isArray(selectedRoom?.members) && selectedRoom.members.length > 2));

  return (
    <>
      <div className="absolute inset-0 bg-black/10 z-50 animate-in fade-in duration-200" onClick={onClose} aria-hidden="true" />
      <div data-testid="chat-room-drawer" className="absolute top-0 right-0 bottom-0 w-full md:w-80 bg-[var(--card)] dark:bg-zinc-900 shadow-sm z-[60] flex flex-col animate-in slide-in-from-right duration-300 border-l border-[var(--border)]">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--card)]">
          <span className="text-sm font-bold">채팅방 정보</span>
          <button onClick={onClose} className="p-2 text-[var(--toss-gray-3)] hover:text-black dark:hover:text-white rounded-[var(--radius-md)]">
            닫기
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="flex items-center justify-between p-3 bg-[var(--tab-bg)] dark:bg-zinc-800/50 rounded-2xl">
            <span className="text-sm font-semibold">알림 설정</span>
            <button onClick={() => void onToggleRoomNotify()} className={`w-12 h-6 rounded-full transition-colors relative ${roomNotifyOn ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-[var(--card)] rounded-full transition-all ${roomNotifyOn ? 'right-1' : 'left-1'}`} />
            </button>
          </div>

          <button data-testid="chat-open-poll-modal" onClick={onOpenPollModal} className="w-full flex items-center justify-between p-3.5 bg-blue-500/10 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 hover:bg-blue-500/20 dark:hover:bg-blue-900/40 transition-colors group">
            <div className="flex items-center gap-3">
              <span className="text-lg">🗳️</span>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">새 투표 만들기</span>
            </div>
            <span className="text-[10px] text-blue-400 font-bold group-hover:translate-x-1 transition-transform">열기</span>
          </button>

          <div className="space-y-3">
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider px-1">상단 공지</p>
            <div data-testid="chat-drawer-notice" className="p-4 bg-orange-500/10 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900/30">
              <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">공지</p>
              <p className="text-xs text-orange-900/70 dark:text-orange-200/50 leading-relaxed whitespace-pre-wrap">
                {currentNoticeMessage?.content || '등록된 공지가 없습니다.'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">사진 및 동영상</p>
              <button
                type="button"
                data-testid="chat-open-media-archive-media"
                onClick={() => onOpenMediaArchive('media')}
                className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
              >
                전체보기
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
              {sharedMediaPreviewMessages.map((message) => (
                <div
                  key={message.id}
                  className="aspect-square bg-[var(--tab-bg)] dark:bg-zinc-800 relative group cursor-pointer"
                  onClick={() => onPreviewMessage(message)}
                >
                  {resolveAttachmentKind(message.file_url, message.file_kind) === 'image' ? (
                    <img
                      src={message.file_url || ''}
                      alt={buildMessengerImageAlt(message.file_name, '공유된 이미지')}
                      className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>
                  )}
                  {message.file_url && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity bg-black/40 flex items-center justify-center rounded-[inherit] pointer-events-none px-2">
                      <AttachmentQuickActions
                        url={message.file_url}
                        name={getAttachmentDisplayName(message.file_name, message.file_url)}
                        onPreview={() => onPreviewMessage(message)}
                        onReply={() => onReplyMessage(message)}
                        variant="overlay"
                      />
                    </div>
                  )}
                </div>
              ))}
              {sharedMediaPreviewMessages.length === 0 && (
                <div className="col-span-3 py-5 text-center bg-[var(--tab-bg)] dark:bg-zinc-800/30 rounded-2xl border border-dashed border-[var(--border)] dark:border-zinc-700">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">주고받은 미디어가 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">파일</p>
              <button
                type="button"
                data-testid="chat-open-media-archive-file"
                onClick={() => onOpenMediaArchive('file')}
                className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
              >
                전체보기
              </button>
            </div>
            <div className="space-y-2">
              {sharedFilePreviewMessages.map((message) => {
                const fileUrl = String(message.file_url || '');
                const attachmentName = getAttachmentDisplayName(message.file_name, fileUrl);
                return (
                  <AttachmentListCard
                    key={message.id}
                    url={fileUrl}
                    name={attachmentName}
                    kind="file"
                    meta={`${(message.staff as { name?: string } | null | undefined)?.name || '알 수 없음'} · ${new Date(message.created_at || 0).toLocaleDateString()}`}
                    onPreview={() => onPreviewMessage(message)}
                    onReply={() => onReplyMessage(message)}
                    replyTestId={`chat-file-reply-${message.id}`}
                    actionVariant="subtle"
                  />
                );
              })}
              {sharedFilePreviewMessages.length === 0 && (
                <div className="py-4 text-center bg-[var(--tab-bg)] dark:bg-zinc-800/30 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 파일이 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider px-1">링크</p>
            <div className="space-y-2">
              {sharedLinkPreviewMessages.map((message) => {
                const url = extractFirstLinkUrl(message.content);
                return (
                  <div
                    key={message.id}
                    data-testid={`chat-shared-link-${message.id}`}
                    className="p-3 bg-[var(--tab-bg)] dark:bg-zinc-800/50 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800"
                  >
                    <a href={url} target="_blank" rel="noreferrer" className="block hover:opacity-90 transition-opacity">
                      <p className="text-[11px] font-bold truncate text-emerald-600 mb-0.5">{url}</p>
                      <p className="text-[10px] text-[var(--toss-gray-4)] truncate">
                        {(message.staff as { name?: string } | null | undefined)?.name} · {new Date(message.created_at || 0).toLocaleDateString()}
                      </p>
                    </a>
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] font-bold">
                      <a href={url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700">
                        열기
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            if (!navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');
                            await navigator.clipboard.writeText(url);
                            toast('링크를 복사했습니다.');
                          } catch {
                            toast('링크 복사에 실패했습니다.', 'error');
                          }
                        }}
                        className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)]"
                      >
                        복사
                      </button>
                      <button
                        type="button"
                        data-testid={`chat-shared-link-reply-${message.id}`}
                        onClick={() => onReplyMessage(message)}
                        className="text-amber-700 hover:text-amber-800"
                      >
                        답글
                      </button>
                    </div>
                  </div>
                );
              })}
              {sharedLinkPreviewMessages.length === 0 && (
                <div className="py-4 text-center bg-[var(--tab-bg)] dark:bg-zinc-800/30 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 링크가 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">참여자 ({roomMembers.length || 0})</p>
              {selectedRoom?.id !== NOTICE_ROOM_ID && (
                <button data-testid="chat-open-add-member-modal" onClick={onOpenAddMemberModal} className="w-6 h-6 flex items-center justify-center bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-[var(--radius-md)] text-[var(--toss-gray-4)] hover:text-emerald-500 transition-colors">
                  +
                </button>
              )}
            </div>
            <div className="space-y-3">
              {roomMembers.map((member) => {
                const memberId = String(member.id);
                const resolvedMember =
                  selectedRoom?.id === NOTICE_ROOM_ID || !selectedRoom
                    ? member
                    : resolveRoomMemberProfile(selectedRoom, memberId) || member;
                return (
                  <div data-testid={`chat-room-member-${memberId}`} key={memberId} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <MessengerAvatar
                        name={resolvedMember?.name}
                        photoUrl={resolvedMember?.photo_url}
                        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30"
                        decorative
                      />
                      <div>
                        <p className="text-xs font-bold text-foreground">{resolvedMember?.name || '이름 없음'}</p>
                        <p className="text-[10px] text-[var(--toss-gray-4)] font-medium">{[resolvedMember?.department, resolvedMember?.position].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    {isOwner && memberId !== ownerId && (
                      <button data-testid={`chat-remove-member-${memberId}`} onClick={() => { void onRemoveRoomMember(memberId); }} className="touch-manipulation opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 min-h-[36px] px-2 py-1 text-red-500 text-[10px] font-bold hover:bg-red-500/10 active:bg-red-500/10 dark:hover:bg-red-900/20 rounded-md transition-all">
                        내보내기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 bg-[var(--tab-bg)] dark:bg-zinc-800/50 border-t border-[var(--border)] flex flex-col gap-2">
          {editingRoomName ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={roomNameDraft}
                onChange={(event) => onRoomNameDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void onSaveRoomName();
                  }
                  if (event.key === 'Escape') onCancelEditingRoomName();
                }}
                placeholder="새 채팅방 이름"
                className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold outline-none focus:border-[var(--accent)]"
              />
              <button onClick={() => void onSaveRoomName()} className="px-3 py-2 bg-[var(--accent)] text-white rounded-xl text-xs font-bold">
                저장
              </button>
              <button onClick={onCancelEditingRoomName} className="px-3 py-2 bg-[var(--muted)] rounded-xl text-xs font-bold">
                취소
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {canLeaveRoom && (
                <button onClick={onLeaveRoom} className="flex-1 py-2.5 bg-red-500/10 dark:bg-red-900/20 text-red-600 rounded-xl text-[11px] font-bold hover:bg-red-500/20 transition-colors">
                  방 나가기
                </button>
              )}
              {canEditRoomName && (
                <button onClick={onStartEditingRoomName} className="flex-1 py-2.5 bg-[var(--muted)] text-foreground rounded-xl text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-colors">
                  이름 수정
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

'use client';

import { AttachmentListCard, getAttachmentDisplayName, resolveAttachmentKind } from './메신저첨부';
import { MessengerAvatar } from './메신저공통';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import type { SavedChatSearch } from './메신저검색훅';
import { normalizeMemberIds } from './메신저유틸';

export type MessengerGlobalSearchTab = 'all' | 'member' | 'room' | 'message' | 'file';

export type GlobalSearchRoomResult = {
  room: ChatRoom;
  roomId: string;
  label: string;
  preview: string;
  memberCount: number;
  isHidden: boolean;
  isNoticeChannel: boolean;
};

type GlobalSearchCounts = {
  all: number;
  member: number;
  room: number;
  message: number;
  file: number;
};

type GlobalSearchModalProps = {
  open: boolean;
  query: string;
  activeTab: MessengerGlobalSearchTab;
  loading: boolean;
  counts: GlobalSearchCounts;
  memberResults: StaffMember[];
  roomResults: GlobalSearchRoomResult[];
  messageResults: ChatMessage[];
  fileResults: ChatMessage[];
  allResults: ChatMessage[];
  savedSearches: SavedChatSearch[];
  allKnownStaffs: StaffMember[];
  effectiveChatUserId: string | null | undefined;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onTabChange: (tab: MessengerGlobalSearchTab) => void;
  onSearchSubmit: (query: string) => void | Promise<void>;
  onSaveCurrentSearch: (query?: string) => void;
  onApplySavedSearch: (query: string) => void;
  onRemoveSavedSearch: (searchId: string) => void;
  onOpenGroup: () => void;
  onOpenMember: (staff: StaffMember) => void | Promise<void>;
  onOpenRoom: (roomId: string, messageId?: string) => void;
  onPreviewAttachment: (
    url: string | null | undefined,
    fileName?: string | null,
    forcedKind?: 'image' | 'video' | 'file',
  ) => void;
};

export function GlobalSearchModal({
  open,
  query,
  activeTab,
  loading,
  counts,
  memberResults,
  roomResults,
  messageResults,
  fileResults,
  allResults,
  savedSearches,
  allKnownStaffs,
  effectiveChatUserId,
  onClose,
  onQueryChange,
  onTabChange,
  onSearchSubmit,
  onSaveCurrentSearch,
  onApplySavedSearch,
  onRemoveSavedSearch,
  onOpenGroup,
  onOpenMember,
  onOpenRoom,
  onPreviewAttachment }: GlobalSearchModalProps) {
  if (!open) return null;

  const targetResults =
    activeTab === 'file'
      ? fileResults
      : activeTab === 'message'
        ? messageResults
        : allResults;

  return (
    <div
      data-testid="chat-global-search-modal"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-start md:items-center justify-center p-4 pt-12 md:p-4 animate-in fade-in"
    >
      <div
        className="bg-[var(--card)] dark:bg-zinc-900 w-full max-w-3xl rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[80vh] md:max-h-[85vh] border border-[var(--border)] dark:border-zinc-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-3 border-b border-[var(--border)] dark:border-zinc-800 space-y-3">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--toss-gray-3)]">
              <circle cx="8" cy="8" r="5.5" />
              <line x1="12.5" y1="12.5" x2="18" y2="18" />
              <path d="M15 3v4" />
              <path d="M13 5h4" />
            </svg>
            <input
              data-testid="chat-global-search-input"
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void onSearchSubmit(query)}
              placeholder="멤버, 채팅방, 메시지, 파일을 통합 검색"
              className="flex-1 bg-transparent text-foreground text-sm font-bold outline-none placeholder:text-[var(--toss-gray-3)] placeholder:font-normal"
            />
            <button data-testid="chat-open-group-modal" type="button" onClick={onOpenGroup} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap">새 그룹</button>
            <button data-testid="chat-global-search-submit" onClick={() => void onSearchSubmit(query)} className="px-3 py-1.5 bg-[var(--accent)] text-white font-bold text-xs rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">검색</button>
            <button data-testid="chat-global-search-save" type="button" disabled={!query.trim()} onClick={() => onSaveCurrentSearch(query)} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">저장</button>
            <button onClick={onClose} className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-lg font-bold leading-none px-1">×</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['all', '전체', counts.all],
              ['member', '멤버', counts.member],
              ['room', '채팅방', counts.room],
              ['message', '메시지', counts.message],
              ['file', '파일', counts.file],
            ] as const).map(([tab, label, count]) => (
              <button
                key={tab}
                data-testid={`chat-global-search-tab-${tab}`}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  activeTab === tab
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)]'
                }`}
              >
                {label}{count > 0 ? ` ${count}` : ''}
              </button>
            ))}
          </div>
          <p className="px-1 text-[10px] text-[var(--toss-gray-3)]">
            예: `from:영희 has:file after:2026-03-01`, `in:공지 before:2026-03-31`
          </p>
          {savedSearches.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {savedSearches.map((search) => (
                <div key={search.id} data-testid={`chat-saved-search-${search.id}`} className="inline-flex items-center gap-1 rounded-full bg-[var(--tab-bg)] px-2 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                  <button type="button" onClick={() => onApplySavedSearch(search.query)} className="max-w-[180px] truncate hover:text-[var(--accent)]" title={search.query}>{search.label}</button>
                  <button type="button" data-testid={`chat-saved-search-remove-${search.id}`} onClick={() => onRemoveSavedSearch(search.id)} className="rounded-full px-1 text-[var(--toss-gray-3)] hover:bg-[var(--card)] hover:text-red-500" aria-label="저장 검색 삭제">×</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--tab-bg)] dark:bg-zinc-950 p-3">
          {!query.trim() ? (
            <div className="h-40 flex flex-col items-center justify-center text-[var(--toss-gray-3)] gap-2">
              <p className="text-sm font-bold">통합 검색으로 멤버, 채팅방, 메시지, 파일을 한 번에 찾을 수 있습니다.</p>
              {savedSearches.length > 0 ? (
                <div className="flex max-w-xl flex-wrap items-center justify-center gap-2">
                  {savedSearches.map((search) => (
                    <button key={`empty-${search.id}`} type="button" data-testid={`chat-saved-search-empty-${search.id}`} onClick={() => onApplySavedSearch(search.query)} className="rounded-full bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent)] shadow-sm">{search.label}</button>
                  ))}
                </div>
              ) : null}
              <button type="button" onClick={onOpenGroup} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors">새 그룹 채팅 만들기</button>
            </div>
          ) : (
            <div className="space-y-3">
              {loading ? (
                <div className="px-1 text-[11px] font-bold text-[var(--toss-gray-3)]">메시지와 파일을 검색하고 있습니다…</div>
              ) : null}

              {(activeTab === 'all' || activeTab === 'member') && (
                memberResults.length > 0 ? (
                  <div className="space-y-2">
                    {activeTab === 'all' ? <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">멤버</p> : null}
                    {memberResults.slice(0, activeTab === 'all' ? 4 : memberResults.length).map((staff: StaffMember) => (
                      <button key={`member-${staff.id}`} type="button" onClick={() => void onOpenMember(staff)} className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all">
                        <div className="flex items-center gap-3">
                          <MessengerAvatar name={staff.name} photoUrl={getProfilePhotoUrl(staff)} className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-3)] dark:bg-zinc-800" decorative />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-bold text-foreground truncate">{staff.name}</p>
                            <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{[staff.company, staff.department, staff.position].filter(Boolean).join(' · ')}</p>
                          </div>
                          <span className="text-[10px] font-bold text-blue-600 shrink-0">대화</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : activeTab === 'member' ? (
                  <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">멤버 검색 결과가 없습니다.</div>
                ) : null
              )}

              {(activeTab === 'all' || activeTab === 'room') && (
                roomResults.length > 0 ? (
                  <div className="space-y-2">
                    {activeTab === 'all' ? <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">채팅방</p> : null}
                    {roomResults.slice(0, activeTab === 'all' ? 4 : roomResults.length).map(({ room, roomId, label, preview, memberCount, isHidden, isNoticeChannel }) => (
                      <button key={`room-${roomId}`} type="button" onClick={() => onOpenRoom(String(room.id))} className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-[12px] font-bold text-foreground truncate">{label}</p>
                              {isNoticeChannel ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 font-bold shrink-0">공지</span> : null}
                              {isHidden ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-bold shrink-0">숨김</span> : null}
                            </div>
                            <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{preview || '대화가 없습니다.'}</p>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] shrink-0">{memberCount}명</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : activeTab === 'room' ? (
                  <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">채팅방 검색 결과가 없습니다.</div>
                ) : null
              )}

              {(activeTab === 'all' || activeTab === 'message' || activeTab === 'file') && (() => {
                if (!loading && targetResults.length === 0) {
                  return activeTab === 'message' || activeTab === 'file' ? (
                    <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">
                      {activeTab === 'file' ? '파일 검색 결과가 없습니다.' : '메시지 검색 결과가 없습니다.'}
                    </div>
                  ) : null;
                }
                return (
                  <div className="space-y-2">
                    {activeTab === 'all' ? <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">메시지 / 파일</p> : null}
                    {targetResults.slice(0, activeTab === 'all' ? 6 : targetResults.length).map((message: ChatMessage) => {
                      type SearchRoom = { name?: string; type?: string; members?: string[] };
                      const messageRoom = message.chat_rooms as SearchRoom | null | undefined;
                      let roomName = messageRoom?.name || '채팅방';
                      if (messageRoom?.type === 'direct') {
                        const roomMemberIds = normalizeMemberIds(messageRoom?.members);
                        const otherStaff = allKnownStaffs.find(
                          (staff: StaffMember) => roomMemberIds.includes(String(staff.id)) && String(staff.id) !== String(effectiveChatUserId || '')
                        );
                        if (otherStaff) roomName = otherStaff.name;
                      }
                      const fileUrl = String(message.file_url || '');
                      const attachmentKind = resolveAttachmentKind(fileUrl, message.file_kind);
                      const isImage = attachmentKind === 'image';
                      const isFile = Boolean(fileUrl) && attachmentKind === 'file';
                      const fileName = fileUrl ? getAttachmentDisplayName(message.file_name, fileUrl) : '';
                      return (
                        <div
                          data-testid={`chat-global-search-result-${message.id}`}
                          key={message.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onOpenRoom(String(message.room_id), String(message.id))}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenRoom(String(message.room_id), String(message.id)); } }}
                          className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all cursor-pointer"
                        >
                          {fileUrl ? (
                            <AttachmentListCard
                              url={fileUrl}
                              name={fileName}
                              kind={attachmentKind}
                              summary={message.content || null}
                              meta={`${roomName} · ${(message.staff as { name?: string } | null | undefined)?.name || '이름 없음'} · ${new Date(message.created_at || 0).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })} ${new Date(message.created_at || 0).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}`}
                              badgeLabel={isImage ? '이미지' : isFile ? '파일' : '동영상'}
                              onPreview={() => onPreviewAttachment(fileUrl, fileName, attachmentKind)}
                              onActivate={() => onOpenRoom(String(message.room_id), String(message.id))}
                              actionVariant="subtle"
                              className="border-0 bg-transparent p-0 shadow-none"
                            />
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1.5 gap-3">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="px-1.5 py-0.5 bg-[var(--muted)] dark:bg-zinc-800 text-[var(--toss-gray-4)] rounded text-[10px] font-bold truncate shrink-0 max-w-[110px]">{roomName}</span>
                                  <span className="text-[11px] font-bold text-foreground truncate">{(message.staff as { name?: string } | null | undefined)?.name || '이름 없음'}</span>
                                </div>
                                <span className="text-[10px] font-medium text-[var(--toss-gray-3)] shrink-0">
                                  {new Date(message.created_at || 0).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })}{' '}
                                  {new Date(message.created_at || 0).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {message.content ? <p className="text-[12px] font-semibold text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] line-clamp-2 leading-relaxed">{message.content}</p> : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {!loading && counts.all === 0 ? (
                <div className="h-24 flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
                  <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                  <p className="text-xs mt-1 text-[var(--toss-gray-3)]">멤버, 채팅방, 메시지, 파일을 함께 검색했습니다.</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

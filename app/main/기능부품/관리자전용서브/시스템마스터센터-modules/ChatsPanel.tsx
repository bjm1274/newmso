import type { RefObject } from 'react';
import { highlightBanned } from '@/lib/banned-words';
import { includesBannedWord } from '@/lib/system-master-chat-filter';
import type { SystemMasterChatMessage, SystemMasterChatRoom } from './types';
import { formatDateTime } from './utils';

type ChatsPanelProps = {
  chatRooms: SystemMasterChatRoom[];
  visibleChatRooms: SystemMasterChatRoom[];
  visibleChatMessages: SystemMasterChatMessage[];
  selectedRoomId: string;
  setSelectedRoomId: (id: string) => void;
  selectedChatRoom: SystemMasterChatRoom | null;
  selectedRoomIsEmpty: boolean;
  emptyChatRooms: SystemMasterChatRoom[];
  flaggedChatMessageCount: number;
  showFlaggedOnly: boolean;
  setShowFlaggedOnly: (updater: (v: boolean) => boolean) => void;
  showEmptyRoomsOnly: boolean;
  setShowEmptyRoomsOnly: (updater: (v: boolean) => boolean) => void;
  chatKeyword: string;
  setChatKeyword: (value: string) => void;
  bannedWords: string[];
  deletingRoomId: string | null;
  deletingMsgId: string | null;
  chatJumpTarget: { messageId: string; roomId: string } | null;
  chatMessageRowRefs: RefObject<Record<string, HTMLTableRowElement | null>>;
  onLoadChats: () => void;
  onOpenBannedModal: () => void;
  onFocusFlaggedChats: () => void;
  onDeleteRoom: (room: SystemMasterChatRoom) => void;
  onDeleteEmptyRooms: () => void;
  onDeleteMessage: (message: SystemMasterChatMessage) => void;
};

export function ChatsPanel({
  chatRooms,
  visibleChatRooms,
  visibleChatMessages,
  selectedRoomId,
  setSelectedRoomId,
  selectedChatRoom,
  selectedRoomIsEmpty,
  emptyChatRooms,
  flaggedChatMessageCount,
  showFlaggedOnly,
  setShowFlaggedOnly,
  showEmptyRoomsOnly,
  setShowEmptyRoomsOnly,
  chatKeyword,
  setChatKeyword,
  bannedWords,
  deletingRoomId,
  deletingMsgId,
  chatJumpTarget,
  chatMessageRowRefs,
  onLoadChats,
  onOpenBannedModal,
  onFocusFlaggedChats,
  onDeleteRoom,
  onDeleteEmptyRooms,
  onDeleteMessage }: ChatsPanelProps) {
  return (
    <section className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
      <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--foreground)]">채팅방 목록</h3>
          <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            {showFlaggedOnly || showEmptyRoomsOnly
              ? `${visibleChatRooms.length}/${chatRooms.length}개`
              : `${chatRooms.length}개`}
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {visibleChatRooms.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)]">
              {showEmptyRoomsOnly
                ? '대화 내역이 없는 채팅방이 없습니다.'
                : showFlaggedOnly
                  ? '필터 단어가 포함된 채팅방이 없습니다.'
                  : '표시할 채팅방이 없습니다.'}
            </div>
          ) : (
            visibleChatRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={`w-full rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all ${
                  selectedRoomId === room.id
                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                    : 'border-[var(--border)] bg-[var(--page-bg)] hover:border-[var(--accent)]/40'
                }`}
              >
                <p className="text-sm font-bold text-[var(--foreground)]">{room.room_label}</p>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{room.member_labels?.join(', ') || '참여자 없음'}</p>
              </button>
            ))
          )}
        </div>
      </article>

      <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">전 직원 채팅 대화 열람</h3>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              {selectedRoomId
                ? `${selectedChatRoom?.room_label || '선택 채팅방'} 대화`
                : '전체 최근 대화'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {selectedRoomId && (
              <button
                type="button"
                disabled={deletingRoomId === selectedRoomId}
                onClick={() => {
                  const room = chatRooms.find((item) => item.id === selectedRoomId);
                  if (room) onDeleteRoom(room);
                }}
                className="h-9 rounded-[var(--radius-md)] border border-danger/20 px-3 text-xs font-bold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingRoomId === selectedRoomId
                  ? '삭제 중...'
                  : selectedRoomIsEmpty
                    ? '대화 없는 방 삭제'
                    : '선택 방 삭제'}
              </button>
            )}
            {(() => {
              return flaggedChatMessageCount > 0 ? (
                <button
                  type="button"
                  onClick={onFocusFlaggedChats}
                  className="text-[11px] font-bold text-danger bg-danger/10 border border-danger/20 px-2.5 py-1 rounded-full transition hover:bg-danger/15"
                >
                  🔍 필터 단어 {flaggedChatMessageCount}건
                </button>
              ) : null;
            })()}
            <button
              type="button"
              onClick={() => {
                setShowEmptyRoomsOnly(() => false);
                setShowFlaggedOnly((v) => !v);
              }}
              className={`h-9 px-3 text-xs font-bold rounded-[var(--radius-md)] border transition ${showFlaggedOnly ? 'bg-danger text-white border-danger' : 'border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'}`}
            >
              선택검색
            </button>
            <button
              type="button"
              data-testid="system-master-empty-room-filter"
              onClick={() => {
                setShowFlaggedOnly(() => false);
                setShowEmptyRoomsOnly((v) => !v);
              }}
              className={`h-9 px-3 text-xs font-bold rounded-[var(--radius-md)] border transition ${showEmptyRoomsOnly ? 'bg-[var(--foreground)] text-white border-[var(--foreground)]' : 'border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'}`}
            >
              대화 없는 방 ({emptyChatRooms.length})
            </button>
            {emptyChatRooms.length > 0 && (
              <button
                type="button"
                data-testid="system-master-bulk-delete-empty-rooms"
                disabled={deletingRoomId === '__bulk__'}
                onClick={() => onDeleteEmptyRooms()}
                className="h-9 rounded-[var(--radius-md)] border border-danger/30 px-3 text-xs font-bold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingRoomId === '__bulk__'
                  ? '삭제 중...'
                  : `빈 방 ${emptyChatRooms.length}개 일괄 삭제`}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenBannedModal}
              className="h-9 px-3 text-xs font-bold rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition"
            >
              단어 필터
            </button>
            <input
              value={chatKeyword}
              onChange={(event) => setChatKeyword(event.target.value)}
              placeholder="대화 내용 검색"
              className="h-9 min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={onLoadChats}
              className="h-9 rounded-[var(--radius-lg)] bg-[var(--foreground)] px-4 text-sm font-bold text-white"
            >
              조회
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1320px] w-full table-fixed text-left text-xs">
            <thead className="bg-[var(--page-bg)] text-[11px] uppercase tracking-[0.14em] text-[var(--toss-gray-3)] [&_th]:whitespace-nowrap">
              <tr>
                <th className="w-[230px] px-4 py-3 text-left">시간</th>
                <th className="w-[180px] px-4 py-3 text-left">채팅방</th>
                <th className="w-[180px] px-4 py-3 text-left">발신자</th>
                <th className="px-4 py-3 text-left">내용</th>
                <th className="w-[120px] px-4 py-3 text-left">첨부</th>
                <th className="w-[96px] px-4 py-3 text-left">삭제</th>
              </tr>
            </thead>
            <tbody>
              {visibleChatMessages
                .map((message) => {
                  const flagged = includesBannedWord(message.content, bannedWords);
                  const isJumpTarget = chatJumpTarget?.messageId === message.id;
                  return (
                    <tr
                      key={message.id}
                      ref={(element) => {
                        chatMessageRowRefs.current[message.id] = element;
                      }}
                      className={`border-t border-[var(--border)] align-top ${flagged ? 'bg-red-500/10' : ''} ${isJumpTarget ? 'bg-red-500/20' : ''}`}
                    >
                      <td className="w-[230px] px-4 py-4 align-top text-[var(--toss-gray-4)] whitespace-nowrap">{formatDateTime(message.created_at)}</td>
                      <td className="w-[180px] px-4 py-4 align-top">
                        <p className="truncate whitespace-nowrap break-keep font-semibold text-[var(--foreground)]" title={message.room_label || undefined}>{message.room_label}</p>
                        {message.edited_at && <p className="mt-1 text-[11px] text-warning">수정됨</p>}
                        {message.is_deleted && <p className="mt-1 text-[11px] text-danger">삭제 처리</p>}
                      </td>
                      <td className="w-[180px] px-4 py-4 align-top">
                        <p className="truncate whitespace-nowrap break-keep font-semibold text-[var(--foreground)]" title={message.sender_name || undefined}>{message.sender_name}</p>
                        <p className="mt-1 truncate whitespace-nowrap break-keep text-[11px] text-[var(--toss-gray-3)]" title={message.sender_company || '-'}>{message.sender_company || '-'}</p>
                      </td>
                      <td className="break-words px-4 py-4 align-top leading-6 text-[var(--foreground)]">
                        {message.content
                          ? (flagged ? <span>{highlightBanned(message.content, bannedWords)}</span> : message.content)
                          : <span className="text-[var(--toss-gray-3)]">(내용 없음)</span>}
                        {flagged && <span className="ml-1 text-danger font-bold text-[11px]">●</span>}
                      </td>
                      <td className="w-[120px] px-4 py-4 align-top whitespace-nowrap">
                        {message.file_url ? (
                          <a href={message.file_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">첨부 보기</a>
                        ) : (
                          <span className="text-[var(--toss-gray-3)]">-</span>
                        )}
                      </td>
                      <td className="w-[96px] px-4 py-4 align-top whitespace-nowrap">
                        <button
                          type="button"
                          disabled={deletingMsgId === message.id}
                          onClick={() => onDeleteMessage(message)}
                          className={`px-2 py-1 text-[11px] font-bold rounded-[var(--radius-md)] transition ${
                            flagged
                              ? 'bg-danger text-white hover:bg-[var(--danger-hover)]'
                              : 'border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-danger hover:text-white hover:border-danger'
                          }`}
                        >
                          {deletingMsgId === message.id ? '…' : '삭제'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {visibleChatMessages.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                    {showFlaggedOnly ? '필터 단어가 포함된 메시지가 없습니다.' : '조회된 메시지가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

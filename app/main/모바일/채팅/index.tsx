'use client';

/**
 * 채팅 — 모바일 채팅 라우터.
 * 내부 상태(view=list|room|new + selectedRoomId)로 3 화면을 전환한다.
 * MobileShell이 tab === 'chat' 일 때 마운트.
 *
 * rooms는 여기서 1회 fetch — SChatList와 SChatRoom(QuickSwitchBar) 공유 (JM2 중복 fetch 금지).
 *
 * JM(단일 책임 — 분기만), JM2(rooms 1회 fetch), JM4(any 금지).
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { ChatRoom, ErpUser } from '@/types';
import SChatList from './채팅목록';
import SChatRoom from './채팅방';
import SFormChat from './새대화';
import { useChatRoomsForMobile, type MobileChatRoom } from './data-hooks';
import { useSheetHistory } from '@/app/hooks/useSheetHistory';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

type ChatView = 'list' | 'room' | 'new';

export type 채팅Props = {
  user: ErpUser;
  onBack?: () => void;
  rooms?: MobileChatRoom[];
  roomsLoading?: boolean;
  refreshRooms?: () => Promise<void>;
  onActiveRoomChange?: (roomId: string | null) => void;
  resetToken?: number;
  onOpenBoardPost?: (boardId: string, postId: string) => void;
  /** 딥링크: 방 자동 오픈 */
  initialRoomId?: string | null;
  /** 딥링크: 특정 메시지 스크롤 */
  initialMessageId?: string | null;
};

function MobileChat({
  user,
  rooms: propsRooms,
  roomsLoading: propsRoomsLoading,
  refreshRooms: propsRefreshRooms,
  onActiveRoomChange,
  resetToken,
  onOpenBoardPost,
  initialRoomId,
  initialMessageId,
}: 채팅Props) {
  const [view, setView] = useState<ChatView>('list');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [searchMessageId, setSearchMessageId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);

  const userId =
    useResolvedStaffId(user as Record<string, unknown>) ||
    (typeof user.id === 'string' ? user.id : null);

  // 부모(MobileShell)와 상태 공유 — 부모가 준 값이 있으면 그것을 쓰고 없으면 로컬에서 조회
  const localHook = useChatRoomsForMobile(propsRooms ? null : userId, propsRooms ? null : selectedRoomId);
  const rooms = propsRooms ?? localHook.rooms;
  const roomsLoading = propsRoomsLoading ?? localHook.loading;
  const refreshRooms = propsRefreshRooms ?? localHook.refresh;

  // 활성 방 변경 시 부모 컴포넌트에 통지
  useEffect(() => {
    if (onActiveRoomChange) {
      onActiveRoomChange(selectedRoomId);
    }
  }, [selectedRoomId, onActiveRoomChange]);

  // 방 진입 시 rooms 배열에서 room row 찾기 (별도 fetch 불필요)
  useEffect(() => {
    if (view !== 'room' || !selectedRoomId) {
      setSelectedRoom(null);
      return;
    }
    const found = rooms.find((r) => String(r.id) === selectedRoomId) ?? null;
    setSelectedRoom((prev) => {
      if (found) {
        // 동일 방이면 참조만 갱신 (미리보기/멤버 등 폴링 반영)
        if (prev && String(prev.id) === String(found.id) && prev === found) return prev;
        return found;
      }
      // 목록에 아직 없으면, 다른 방 잔여만 제거
      if (prev && String(prev.id) !== selectedRoomId) return null;
      return prev;
    });
  }, [view, selectedRoomId, rooms]);

  // rooms가 없을 때 방 진입 시 폴백 — rooms 로드 전 최소 객체로 렌더
  useEffect(() => {
    if (view !== 'room' || !selectedRoomId) return;
    if (rooms.some((r) => String(r.id) === selectedRoomId)) return;
    // rooms 아직 빈 상태면 refresh 트리거
    if (rooms.length === 0) {
      void refreshRooms();
    }
  }, [view, selectedRoomId, rooms, refreshRooms]);

  const openRoom = useCallback((roomId: string, messageId?: string) => {
    const found = rooms.find((r) => String(r.id) === roomId) ?? null;
    setSelectedRoomId(roomId);
    setSearchMessageId(messageId || null);
    // 즉시 동기화 — 이전 방 selectedRoom이 한 프레임 남는 것 방지
    setSelectedRoom(found);
    setView('room');
  }, [rooms]);

  const backToList = useCallback(() => {
    setView('list');
    setSelectedRoomId(null);
    setSearchMessageId(null);
    setSelectedRoom(null);
  }, []);

  useSheetHistory(view === 'room' || view === 'new', backToList);

  // 딥링크: initialRoomId 변경 시 방 오픈
  useEffect(() => {
    if (initialRoomId) {
      openRoom(initialRoomId, initialMessageId || undefined);
    }
  }, [initialRoomId, initialMessageId, openRoom]);

  useEffect(() => {
    if (resetToken !== undefined && resetToken > 0) {
      if (initialRoomId) return; // deep link wins
      backToList();
    }
  }, [resetToken, backToList, initialRoomId]);

  const openNew = useCallback(() => {
    setView('new');
  }, []);

  const handleCreated = useCallback((roomId: string, room?: ChatRoom) => {
    setSelectedRoom(room ?? null);
    setSelectedRoomId(roomId);
    setView('room');
    void refreshRooms();
  }, [refreshRooms]);

  let contentElement: React.ReactNode;

  if (view === 'new') {
    contentElement = <SFormChat user={user} onBack={backToList} onCreated={handleCreated} />;
  } else if (view === 'room' && selectedRoomId) {
    // selectedRoomId와 id가 일치하는 방만 사용 — 전환 중 이전 방 객체 재사용 금지
    const matchedRoom =
      (selectedRoom && String(selectedRoom.id) === selectedRoomId ? selectedRoom : null) ??
      rooms.find((r) => String(r.id) === selectedRoomId) ??
      null;
    const roomForRender: ChatRoom = matchedRoom ??
      ({ id: selectedRoomId, name: '대화방', type: null, members: [] } as ChatRoom);
    const membersReady = Array.isArray(roomForRender.members) && roomForRender.members.length > 0;
    contentElement = (
      <SChatRoom
        key={selectedRoomId}
        user={user}
        room={roomForRender}
        membersReady={membersReady || Boolean(matchedRoom)}
        onBack={backToList}
        recentRooms={rooms}
        onSwitchRoom={openRoom}
        onOpenBoardPost={onOpenBoardPost}
        searchMessageId={searchMessageId}
      />
    );
  } else {
    contentElement = (
      <SChatList
        user={user}
        rooms={rooms}
        roomsLoading={roomsLoading}
        onOpen={openRoom}
        onNew={openNew}
        onRefresh={refreshRooms}
      />
    );
  }

  return (
    <div data-testid="chat-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {contentElement}
    </div>
  );
}

export default MobileChat;

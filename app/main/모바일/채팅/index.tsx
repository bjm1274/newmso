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

import { useCallback, useEffect, useState } from 'react';
import type { ChatRoom, ErpUser } from '@/types';
import SChatList from './채팅목록';
import SChatRoom from './채팅방';
import SFormChat from './새대화';
import { useChatRoomsForMobile } from './data-hooks';

type ChatView = 'list' | 'room' | 'new';

export type 채팅Props = {
  user: ErpUser;
  onBack?: () => void;
};

export default function 채팅({ user }: 채팅Props) {
  const [view, setView] = useState<ChatView>('list');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);

  const userId = typeof user.id === 'string' ? user.id : null;

  // JM2: 채팅 라우터 최상위에서 1회 fetch — SChatList·QuickSwitchBar 공유
  const { rooms, refresh: refreshRooms } = useChatRoomsForMobile(userId);

  // 방 진입 시 rooms 배열에서 room row 찾기 (별도 fetch 불필요)
  useEffect(() => {
    if (view !== 'room' || !selectedRoomId) {
      setSelectedRoom(null);
      return;
    }
    const found = rooms.find((r) => String(r.id) === selectedRoomId) ?? null;
    if (found) {
      setSelectedRoom(found);
    }
  }, [view, selectedRoomId, rooms]);

  // rooms가 없을 때 방 진입 시 폴백 — rooms 로드 전 최소 객체로 렌더
  useEffect(() => {
    if (view !== 'room' || !selectedRoomId) return;
    if (selectedRoom) return;
    // rooms 아직 빈 상태면 refresh 트리거
    if (rooms.length === 0) {
      void refreshRooms();
    }
  }, [view, selectedRoomId, selectedRoom, rooms.length, refreshRooms]);

  const openRoom = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
    setView('room');
  }, []);

  const backToList = useCallback(() => {
    setView('list');
    setSelectedRoomId(null);
    setSelectedRoom(null);
  }, []);

  const openNew = useCallback(() => {
    setView('new');
  }, []);

  const handleCreated = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
    setView('room');
  }, []);

  if (view === 'new') {
    return <SFormChat user={user} onBack={backToList} onCreated={handleCreated} />;
  }

  if (view === 'room' && selectedRoomId) {
    const roomForRender: ChatRoom = selectedRoom ??
      ({ id: selectedRoomId, name: '대화방', type: null, members: [] } as ChatRoom);
    return (
      <SChatRoom
        user={user}
        room={roomForRender}
        onBack={backToList}
        recentRooms={rooms}
        onSwitchRoom={openRoom}
      />
    );
  }

  return (
    <SChatList
      user={user}
      rooms={rooms}
      onOpen={openRoom}
      onNew={openNew}
      onRefresh={refreshRooms}
    />
  );
}

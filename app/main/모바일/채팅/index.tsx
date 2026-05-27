'use client';

/**
 * 채팅 — 모바일 채팅 라우터.
 * 내부 상태(view=list|room|new + selectedRoomId)로 3 화면을 전환한다.
 * MobileShell이 tab === 'chat' 일 때 마운트.
 * onBack은 시스템 뒤로가기 핸들러 (예약 — 현재 뷰는 모두 자체 뒤로 액션 보유).
 * JM(단일 책임 — 분기만), JM4(any 금지).
 */

import { useCallback, useEffect, useState } from 'react';
import type { ChatRoom, ErpUser } from '@/types';
import SChatList from './채팅목록';
import SChatRoom from './채팅방';
import SFormChat from './새대화';
import { fetchAllChatRooms } from '@/app/main/기능부품/chatQueryService';

type ChatView = 'list' | 'room' | 'new';

export type 채팅Props = {
  user: ErpUser;
  onBack?: () => void;
};

export default function 채팅({ user }: 채팅Props) {
  const [view, setView] = useState<ChatView>('list');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);

  // 방 진입 시 ChatRoom row 조회 (room props 전달용)
  useEffect(() => {
    if (view !== 'room' || !selectedRoomId) {
      setSelectedRoom(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data } = await fetchAllChatRooms();
        if (!active) return;
        const found =
          (Array.isArray(data) ? data : []).find(
            (room) => String(room.id) === String(selectedRoomId),
          ) || null;
        setSelectedRoom(found);
      } catch {
        if (active) setSelectedRoom(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [view, selectedRoomId]);

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
  if (view === 'room' && selectedRoomId && selectedRoom) {
    return <SChatRoom user={user} room={selectedRoom} onBack={backToList} />;
  }
  if (view === 'room' && selectedRoomId && !selectedRoom) {
    // 방 조회 중 — 임시로 최소 룸 객체로 렌더 (헤더는 일반 표기)
    return (
      <SChatRoom
        user={user}
        room={{ id: selectedRoomId, name: '대화방', type: null, members: [] } as ChatRoom}
        onBack={backToList}
      />
    );
  }
  return <SChatList user={user} onOpen={openRoom} onNew={openNew} />;
}

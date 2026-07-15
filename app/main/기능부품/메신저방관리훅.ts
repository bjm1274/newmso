'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { CHAT_ROOM_SELECT } from '@/lib/chat-query-columns';
import { createOrUpsertChatRoom, patchChatRoom } from '@/lib/chat-rooms-client';
import type { ChatRoom, StaffMember } from '@/types';
import {
  NOTICE_ROOM_ID,
  SELF_ROOM_NAME,
  isSelfChatRoom,
  sortChatRoomsWithNoticeFirst } from './메신저유틸';

type ChatViewMode = 'chat' | 'org';

type UseChatRoomManagementParams = {
  addMemberSelectingIds: string[];
  closeAddMemberModal: () => void;
  closeGroupModal: () => void;
  effectiveChatUserId: string | null | undefined;
  fetchData: () => Promise<void>;
  groupName: string;
  repairDirectRooms: (rooms: ChatRoom[]) => Promise<ChatRoom[]>;
  resolveRoomMemberProfile: (room: ChatRoom, memberId: string) => StaffMember | null;
  resolveStaffProfile: (staffId: string | null | undefined) => StaffMember | null;
  roomNameDraft: string;
  selectedMembers: string[];
  selectedRoom: ChatRoom | null;
  setAddMemberSelectingIds: Dispatch<SetStateAction<string[]>>;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setEditingRoomName: Dispatch<SetStateAction<boolean>>;
  setGroupName: Dispatch<SetStateAction<string>>;
  setRoom: (roomId: string | null) => void;
  setRoomNameDraft: Dispatch<SetStateAction<string>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setSelectedMembers: Dispatch<SetStateAction<string[]>>;
  setShowDrawer: Dispatch<SetStateAction<boolean>>;
  setViewMode: Dispatch<SetStateAction<ChatViewMode>>;
  triggerChatPush: (roomId: string, messageId: string) => Promise<void>;
  user: StaffMember | null;
};

export function useChatRoomManagement({
  addMemberSelectingIds,
  closeAddMemberModal,
  closeGroupModal,
  effectiveChatUserId,
  fetchData,
  groupName,
  repairDirectRooms,
  resolveRoomMemberProfile,
  resolveStaffProfile,
  roomNameDraft,
  selectedMembers,
  selectedRoom,
  setAddMemberSelectingIds,
  setChatRooms,
  setEditingRoomName,
  setGroupName,
  setRoom,
  setRoomNameDraft,
  setRoomUnreadCounts,
  setSelectedMembers,
  setShowDrawer,
  setViewMode,
  triggerChatPush,
  user }: UseChatRoomManagementParams) {
  const { dialog, openConfirm } = useActionDialog();
  const persistRoomMembers = useCallback(async (roomId: string, members: string[]) => {
    const result = await patchChatRoom(roomId, { members });
    if (!result.ok) throw new Error(result.error);
  }, []);

  const updateRoomMembersLocally = useCallback(
    (roomId: string, members: string[]) => {
      setChatRooms((prev) =>
        prev.map((room) => (String(room.id) === String(roomId) ? { ...room, members } : room)),
      );
    },
    [setChatRooms],
  );

  const insertRoomSystemMessage = useCallback(
    async (roomId: string, content: string) => {
      const { data, error } = await db
        .from('messages')
        .insert([
          {
            room_id: roomId,
            sender_id: effectiveChatUserId || user?.id || null,
            content },
        ])
        .select('id, room_id')
        .single();

      if (error) throw error;
      if (data?.id && data?.room_id) {
        void triggerChatPush(String(data.room_id), String(data.id));
      }
      return data;
    },
    [effectiveChatUserId, triggerChatPush, user?.id],
  );

  const applyRoomMemberChange = useCallback(
    async ({
      roomId,
      members,
      systemContent }: {
      roomId: string;
      members: string[];
      systemContent: string;
    }) => {
      // 시스템 메시지 먼저(내보내기/초대 모두 현재 멤버 자격으로 insert)
      await insertRoomSystemMessage(roomId, systemContent);
      await persistRoomMembers(roomId, members);
      updateRoomMembersLocally(roomId, members);
      await fetchData();
    },
    [fetchData, insertRoomSystemMessage, persistRoomMembers, updateRoomMembersLocally],
  );

  const handleLeaveRoom = useCallback(async () => {
    if (!selectedRoom) return;
    if (selectedRoom.id === NOTICE_ROOM_ID) {
      toast('공지 채널은 나갈 수 없습니다.', 'warning');
      return;
    }
    if (isSelfChatRoom(selectedRoom, effectiveChatUserId)) {
      toast('나와의 채팅은 나갈 수 없습니다.', 'warning');
      return;
    }
    const confirmed = await openConfirm({
      title: '채팅방 나가기',
      description: '이 채팅방에서 나갑니다.\n대화방 목록에서 사라지고 새 메시지 알림도 받지 않습니다.',
      confirmText: '나가기',
      tone: 'danger' });
    if (!confirmed) {
      return;
    }

    try {
      const currentMembers = Array.isArray(selectedRoom.members) ? selectedRoom.members : [];
      const newMembers = currentMembers.filter(
        (id: unknown) => String(id) !== String(effectiveChatUserId || user?.id || ''),
      );

      // 퇴장 안내는 멤버십 해제 전에 기록(서버 messages insert 멤버 검증 통과 필요)
      const leaverName = user?.name || '알 수 없음';
      let leaveNoticeFailed = false;
      try {
        await insertRoomSystemMessage(
          String(selectedRoom.id),
          `[퇴장] ${leaverName}님이 채팅방을 나갔습니다.`,
        );
      } catch (leaveNoticeError) {
        leaveNoticeFailed = true;
        console.error('leave room system message error', leaveNoticeError);
      }

      await persistRoomMembers(String(selectedRoom.id), newMembers);

      const leftRoomId = String(selectedRoom.id);
      setChatRooms((prev) => prev.filter((room) => String(room.id) !== leftRoomId));
      setRoomUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[leftRoomId];
        return next;
      });
      setRoom(null);

      toast(
        leaveNoticeFailed
          ? '채팅방에서는 나갔지만 퇴장 안내 메시지는 남기지 못했습니다.'
          : '채팅방을 나갔습니다.',
      );
    } catch (error) {
      console.error('leave room error', error);
      toast('채팅방 나가기에 실패했습니다.', 'error');
    }
  }, [
    effectiveChatUserId,
    insertRoomSystemMessage,
    openConfirm,
    persistRoomMembers,
    selectedRoom,
    setChatRooms,
    setRoom,
    setRoomUnreadCounts,
    user?.id,
    user?.name,
  ]);

  const removeRoomMember = useCallback(
    async (memberId: string) => {
      if (!selectedRoom) return;
      if (selectedRoom.created_by !== (effectiveChatUserId || user?.id)) return;
      if (String(memberId) === String(effectiveChatUserId || user?.id || '')) return;
      const removedName =
        resolveRoomMemberProfile(selectedRoom, String(memberId))?.name ||
        resolveStaffProfile(memberId)?.name ||
        '선택한 참여자';
      const confirmed = await openConfirm({
        title: '참여자 제외',
        description: `${removedName}님을 채팅방에서 제외합니다.`,
        confirmText: '제외',
        tone: 'danger' });
      if (!confirmed) return;

      try {
        const currentMembers = Array.isArray(selectedRoom.members) ? selectedRoom.members : [];
        const newMembers = currentMembers.filter((id: unknown) => String(id) !== String(memberId));

        const removerName = user?.name || '알 수 없음';

        await applyRoomMemberChange({
          roomId: String(selectedRoom.id),
          members: newMembers,
          systemContent: `[내보내기] ${removerName}님이 ${removedName}님을 채팅방에서 제외했습니다.` });
        toast('참여자를 제외했습니다.');
      } catch (error) {
        console.error('remove member error', error);
        toast('참여자 제외에 실패했습니다.', 'error');
      }
    },
    [
      applyRoomMemberChange,
      effectiveChatUserId,
      openConfirm,
      resolveRoomMemberProfile,
      resolveStaffProfile,
      selectedRoom,
      user?.id,
      user?.name,
    ],
  );

  const handleLeaveRoomFromDrawer = useCallback(() => {
    setShowDrawer(false);
    void handleLeaveRoom();
  }, [handleLeaveRoom, setShowDrawer]);

  const handleSaveRoomName = useCallback(async () => {
    const name = roomNameDraft.trim();
    if (!name || !selectedRoom) return;

    try {
      const result = await patchChatRoom(String(selectedRoom.id), { name });
      if (!result.ok) throw new Error(result.error);

      setChatRooms((prev) =>
        prev.map((room) => (room.id === selectedRoom.id ? { ...room, name } : room)),
      );
      setEditingRoomName(false);
      toast('채팅방 이름을 저장했습니다.');
    } catch (error) {
      console.error('save room name error', error);
      toast('채팅방 이름 저장에 실패했습니다.', 'error');
    }
  }, [roomNameDraft, selectedRoom, setChatRooms, setEditingRoomName]);

  const handleStartEditingRoomName = useCallback(() => {
    setEditingRoomName(true);
    setRoomNameDraft(selectedRoom?.name || '');
  }, [selectedRoom, setEditingRoomName, setRoomNameDraft]);

  const handleCancelEditingRoomName = useCallback(() => {
    setEditingRoomName(false);
  }, [setEditingRoomName]);

  const createGroupChat = useCallback(async () => {
    if (!groupName.trim() || selectedMembers.length === 0) {
      toast('채팅방 이름과 참여자를 확인해 주세요.', 'warning');
      return;
    }
    if (!effectiveChatUserId) {
      toast('채팅 사용자 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    try {
      const result = await createOrUpsertChatRoom({
        name: groupName,
        type: 'group',
        created_by: effectiveChatUserId,
        members: [effectiveChatUserId, ...selectedMembers] });
      if (!result.ok || !result.room) throw new Error(result.error || 'Create failed');
      const room = result.room as unknown as ChatRoom;

      setChatRooms((prev) =>
        sortChatRoomsWithNoticeFirst([
          ...prev.filter((candidate) => String(candidate.id) !== String(room.id)),
          room,
        ]),
      );
      setGroupName('');
      setSelectedMembers([]);
      closeGroupModal();
      setRoom(String(room.id));
      setViewMode('chat');
    } catch (error) {
      console.error('createGroupChat failed', error);
      toast('그룹 채팅방 생성에 실패했습니다.', 'error');
    }
  }, [
    closeGroupModal,
    effectiveChatUserId,
    groupName,
    selectedMembers,
    setChatRooms,
    setGroupName,
    setRoom,
    setSelectedMembers,
    setViewMode,
  ]);

  const openDirectChat = useCallback(
    async (staff: StaffMember) => {
      const otherId = String(staff?.id || '').trim();
      if (!effectiveChatUserId || !otherId) {
        toast('채팅 사용자 정보를 찾을 수 없습니다.', 'error');
        return;
      }

      try {
        const { data: rooms, error } = (await db
          .from('chat_rooms')
          .select(CHAT_ROOM_SELECT)
          .eq('type', 'direct')) as { data: ChatRoom[] | null; error: unknown };
        if (error) throw error;

        const repairedRooms = await repairDirectRooms(rooms || []);
        const isSelfTarget = otherId === effectiveChatUserId;
        const targetMembers = new Set(
          isSelfTarget ? [effectiveChatUserId] : [effectiveChatUserId, otherId],
        );

        const foundRoom = repairedRooms
          .filter((room) => {
            const members = Array.isArray(room?.members)
              ? room.members.map((memberId: unknown) => String(memberId))
              : [];
            return (
              members.length === targetMembers.size &&
              [...targetMembers].every((memberId) => members.includes(memberId))
            );
          })
          .sort(
            (a, b) =>
              new Date(b.last_message_at || b.created_at || 0).getTime() -
              new Date(a.last_message_at || a.created_at || 0).getTime(),
          )[0];

        if (foundRoom) {
          setChatRooms((prev) =>
            sortChatRoomsWithNoticeFirst([
              ...prev.filter((room) => String(room.id) !== String(foundRoom.id)),
              isSelfTarget
                ? {
                    ...foundRoom,
                    name: SELF_ROOM_NAME,
                    type: 'direct' as const,
                    members: [effectiveChatUserId] }
                : foundRoom,
            ]),
          );
          setRoom(String(foundRoom.id));
          setViewMode('chat');
          return;
        }

        const directResult = await createOrUpsertChatRoom({
          name: isSelfTarget ? SELF_ROOM_NAME : `${staff.name}`,
          type: 'direct',
          members: isSelfTarget ? [effectiveChatUserId] : [effectiveChatUserId, otherId] });
        if (!directResult.ok || !directResult.room) {
          throw new Error(directResult.error || 'Direct chat create failed');
        }
        const room = directResult.room as unknown as ChatRoom;

        if (room) {
          setChatRooms((prev) =>
            sortChatRoomsWithNoticeFirst([
              ...prev.filter((candidate) => String(candidate.id) !== String(room.id)),
              isSelfTarget
                ? {
                    ...room,
                    name: SELF_ROOM_NAME,
                    type: 'direct' as const,
                    members: [effectiveChatUserId] }
                : room,
            ]),
          );
          setRoom(String(room.id));
        }

        setViewMode('chat');
      } catch (error) {
        console.error('openDirectChat failed', error);
        toast('대화를 여는 중 오류가 발생했습니다.', 'error');
      }
    },
    [effectiveChatUserId, repairDirectRooms, setChatRooms, setRoom, setViewMode],
  );

  const handleSubmitAddMembers = useCallback(async () => {
    if (!selectedRoom) return;

    try {
      const currentMembers = Array.isArray(selectedRoom.members) ? selectedRoom.members : [];
      const setIds = new Set(currentMembers.map((id: unknown) => String(id)));
      addMemberSelectingIds.forEach((id) => setIds.add(String(id)));
      const newMembers = Array.from(setIds);

      const invitedNames = addMemberSelectingIds
        .map((id) => resolveStaffProfile(id)?.name || '알 수 없음')
        .join(', ');
      const inviterName = user?.name || '알 수 없음';

      await applyRoomMemberChange({
        roomId: String(selectedRoom.id),
        members: newMembers,
        systemContent: `[초대] ${inviterName}님이 ${invitedNames}님을 초대했습니다.` });

      closeAddMemberModal();
      setAddMemberSelectingIds([]);
      toast('참여자를 추가했습니다.');
    } catch (error) {
      console.error('add members error', error);
      toast('참여자 추가에 실패했습니다.', 'error');
    }
  }, [
    addMemberSelectingIds,
    applyRoomMemberChange,
    closeAddMemberModal,
    resolveStaffProfile,
    selectedRoom,
    setAddMemberSelectingIds,
    user?.name,
  ]);

  return {
    dialog,
    handleLeaveRoom,
    removeRoomMember,
    handleLeaveRoomFromDrawer,
    handleSaveRoomName,
    handleStartEditingRoomName,
    handleCancelEditingRoomName,
    createGroupChat,
    openDirectChat,
    handleSubmitAddMembers };
}

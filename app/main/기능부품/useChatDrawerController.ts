'use client';

import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { ChatRoom, StaffMember } from '@/types';
import { NOTICE_ROOM_ID, isActiveChatMember, normalizeRoomNotificationKeyword } from './메신저유틸';

type UseChatDrawerControllerParams = {
  selectedRoomId: string | null;
  selectedRoom: ChatRoom | null;
  chatRooms: ChatRoom[];
  noticeRoomMembers: StaffMember[];
  allKnownStaffs: StaffMember[];
  effectiveChatUserId: string | null | undefined;
  fallbackUserId: string | null | undefined;
  roomPrefs: Record<string, { notifyMode?: string; notifyKeyword?: string }>;
  getEffectiveRoomMemberIds: (room: ChatRoom | null | undefined) => string[];
  resolveRoomMemberProfile: (room: ChatRoom, memberId: string) => StaffMember | null;
  roomNotifyOn: boolean;
  toggleRoomNotify: () => Promise<void>;
  updateRoomPreference: (roomId: string, patch: Record<string, unknown>) => void;
  selectedRoomNotificationMode: 'all' | 'mention_only' | 'keyword' | 'mute';
  selectedRoomNotificationKeyword: string;
  openPollModal: () => void;
};

export function useChatDrawerController({
  selectedRoomId,
  selectedRoom,
  chatRooms,
  noticeRoomMembers,
  allKnownStaffs,
  effectiveChatUserId,
  fallbackUserId,
  roomPrefs,
  getEffectiveRoomMemberIds,
  resolveRoomMemberProfile,
  roomNotifyOn,
  toggleRoomNotify,
  updateRoomPreference,
  selectedRoomNotificationMode,
  selectedRoomNotificationKeyword,
  openPollModal,
}: UseChatDrawerControllerParams) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberSelectingIds, setAddMemberSelectingIds] = useState<string[]>([]);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const deferredAddMemberSearch = useDeferredValue(addMemberSearch);

  const roomMembers = useMemo(() => {
    if (!selectedRoomId) return [];
    if (selectedRoomId === NOTICE_ROOM_ID) return noticeRoomMembers;
    const room = chatRooms.find((candidate: ChatRoom) => candidate.id === selectedRoomId) || null;
    const memberIds = getEffectiveRoomMemberIds(room);
    if (!room || memberIds.length === 0) return [];
    return memberIds.map((memberId: string) => resolveRoomMemberProfile(room, memberId));
  }, [chatRooms, getEffectiveRoomMemberIds, noticeRoomMembers, resolveRoomMemberProfile, selectedRoomId]);

  const addableMembers = useMemo(() => {
    if (!selectedRoom) return [];
    const currentMemberIds = new Set(
      Array.isArray(selectedRoom.members)
        ? selectedRoom.members.map((memberId: unknown) => String(memberId))
        : [],
    );
    return allKnownStaffs
      .filter((staff: StaffMember) => isActiveChatMember(staff))
      .filter((staff: StaffMember) => !currentMemberIds.has(String(staff.id)))
      .filter((staff: StaffMember) => {
        if (!deferredAddMemberSearch.trim()) return true;
        const key = deferredAddMemberSearch.trim();
        return (
          staff.name?.includes(key) ||
          staff.department?.includes(key) ||
          staff.position?.includes(key)
        );
      });
  }, [allKnownStaffs, deferredAddMemberSearch, selectedRoom]);

  const groupSelectableStaffs = useMemo(
    () =>
      allKnownStaffs.filter((staff: StaffMember) => {
        return (
          String(staff.id) !== String(effectiveChatUserId || fallbackUserId || '') &&
          isActiveChatMember(staff)
        );
      }),
    [allKnownStaffs, effectiveChatUserId, fallbackUserId],
  );

  const toggleDept = useCallback((key: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const closeGroupModal = useCallback(() => {
    setShowGroupModal(false);
  }, []);

  const closeAddMemberModal = useCallback(() => {
    setShowAddMemberModal(false);
    setAddMemberSelectingIds([]);
  }, []);

  const handleGroupNameChange = useCallback((value: string) => {
    setGroupName(value);
  }, []);

  const handleToggleGroupMember = useCallback((memberId: string, checked: boolean) => {
    setSelectedMembers((prev) => {
      if (checked) {
        return prev.includes(memberId) ? prev : [...prev, memberId];
      }
      return prev.filter((id) => id !== memberId);
    });
  }, []);

  const handleAddMemberSearchChange = useCallback((value: string) => {
    setAddMemberSearch(value);
  }, []);

  const handleToggleAddMemberSelection = useCallback((memberId: string, checked: boolean) => {
    setAddMemberSelectingIds((prev) => {
      if (checked) {
        return prev.includes(memberId) ? prev : [...prev, memberId];
      }
      return prev.filter((id) => id !== memberId);
    });
  }, []);

  const handleOpenPollModalFromDrawer = useCallback(() => {
    openPollModal();
    setShowDrawer(false);
  }, [openPollModal]);

  const handleToggleRoomNotifyFromDrawer = useCallback(async () => {
    if (!selectedRoomId) return;
    const willEnable = !roomNotifyOn;
    await toggleRoomNotify();
    updateRoomPreference(selectedRoomId, {
      notifyMode: willEnable
        ? (selectedRoomNotificationMode === 'mute' ? 'all' : selectedRoomNotificationMode)
        : 'mute',
    });
  }, [
    roomNotifyOn,
    selectedRoomId,
    selectedRoomNotificationMode,
    toggleRoomNotify,
    updateRoomPreference,
  ]);

  const handleSelectRoomNotificationMode = useCallback((mode: 'all' | 'mention_only' | 'keyword' | 'mute') => {
    if (!selectedRoomId) return;
    updateRoomPreference(selectedRoomId, {
      notifyMode: mode,
      notifyKeyword:
        mode === 'keyword'
          ? normalizeRoomNotificationKeyword(selectedRoomNotificationKeyword)
          : selectedRoomNotificationKeyword,
    });
  }, [selectedRoomId, selectedRoomNotificationKeyword, updateRoomPreference]);

  const handleRoomNotificationKeywordChange = useCallback((value: string) => {
    if (!selectedRoomId) return;
    updateRoomPreference(selectedRoomId, {
      notifyMode: 'keyword',
      notifyKeyword: normalizeRoomNotificationKeyword(value),
    });
  }, [selectedRoomId, updateRoomPreference]);

  return {
    showDrawer,
    setShowDrawer,
    showGroupModal,
    setShowGroupModal,
    groupName,
    setGroupName,
    selectedMembers,
    setSelectedMembers,
    editingRoomName,
    setEditingRoomName,
    roomNameDraft,
    setRoomNameDraft,
    showAddMemberModal,
    setShowAddMemberModal,
    addMemberSearch,
    addMemberSelectingIds,
    setAddMemberSelectingIds,
    expandedDepts,
    roomMembers,
    addableMembers,
    groupSelectableStaffs,
    toggleDept,
    closeGroupModal,
    closeAddMemberModal,
    handleGroupNameChange,
    handleToggleGroupMember,
    handleAddMemberSearchChange,
    handleToggleAddMemberSelection,
    handleOpenPollModalFromDrawer,
    handleToggleRoomNotifyFromDrawer,
    handleSelectRoomNotificationMode,
    handleRoomNotificationKeywordChange,
    selectedRoomPreference: selectedRoomId ? roomPrefs[selectedRoomId] || {} : {},
  };
}

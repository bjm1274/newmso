'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';
import { getProfilePhotoUrl, normalizeProfileUser } from '@/lib/profile-photo';
import type { ChatRoom, StaffMember } from '@/types';
import {
  CAN_WRITE_NOTICE_POSITIONS,
  NOTICE_ROOM_ID,
  SELF_ROOM_NAME,
  isActiveChatMember,
  isActiveNoticeMember,
  isRecentPresenceTimestamp,
  isSelfChatRoom,
  isUuidLike,
  normalizeMemberIds,
} from './메신저유틸';

type UseChatIdentityDirectoryParams = {
  user: StaffMember | null;
  staffs?: StaffMember[];
  presenceMap: Record<string, unknown>;
};

export function useChatIdentityDirectory({
  user,
  staffs = [],
  presenceMap,
}: UseChatIdentityDirectoryParams) {
  const [chatDirectoryStaffs, setChatDirectoryStaffs] = useState<StaffMember[]>([]);

  const permissions = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || permissions.mso === true || user?.role === 'admin';
  const canWriteNotice = isMso || Boolean(user?.position && CAN_WRITE_NOTICE_POSITIONS.includes(user.position));
  const canManageNoticeOps =
    canWriteNotice ||
    user?.role === 'manager' ||
    permissions['board_공지사항_write'] === true;

  const allKnownStaffs = useMemo(() => {
    const merged = new Map<string, StaffMember>();
    [...chatDirectoryStaffs, ...(Array.isArray(staffs) ? staffs : [])].forEach((staff: StaffMember) => {
      if (!staff?.id) return;
      const staffId = String(staff.id);
      const previous = merged.get(staffId);
      const normalized = normalizeProfileUser({ ...(previous ?? {}), ...staff }) as Partial<StaffMember> | null;
      merged.set(staffId, {
        ...staff,
        ...(normalized ?? {}),
        id: staffId,
        name: String(normalized?.name ?? staff.name ?? ''),
        company: String(normalized?.company ?? staff.company ?? ''),
        photo_url: normalized?.photo_url ?? staff.photo_url ?? null,
      });
    });
    return Array.from(merged.values());
  }, [chatDirectoryStaffs, staffs]);

  const allKnownStaffMap = useMemo(() => {
    const next = new Map<string, StaffMember>();
    allKnownStaffs.forEach((staff: StaffMember) => {
      if (!staff?.id) return;
      next.set(String(staff.id), staff);
    });
    return next;
  }, [allKnownStaffs]);

  const noticeRoomMembers = useMemo(
    () => allKnownStaffs.filter((staff: StaffMember) => isActiveNoticeMember(staff)),
    [allKnownStaffs],
  );

  const noticeRoomMemberIds = useMemo(
    () => noticeRoomMembers.map((staff: StaffMember) => String(staff.id)),
    [noticeRoomMembers],
  );

  const currentStaffProfile = useMemo(() => {
    if (!Array.isArray(allKnownStaffs) || allKnownStaffs.length === 0) return null;
    const sessionUserId = String(user?.id || '').trim();
    if (sessionUserId) {
      const exactMatch = allKnownStaffs.find((staff: StaffMember) => String(staff.id) === sessionUserId);
      if (exactMatch) return exactMatch;
    }
    const sessionUserName = String(user?.name || '').trim();
    if (sessionUserName) {
      return allKnownStaffs.find((staff: StaffMember) => String(staff.name || '').trim() === sessionUserName) || null;
    }
    return null;
  }, [allKnownStaffs, user?.id, user?.name]);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;
    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleId: number | null = null;

    const loadChatDirectory = async () => {
      try {
        const { data, error } = await withMissingColumnsFallback<StaffMember[]>(
          (omittedColumns) => {
            const selectColumns = [
              'id',
              'name',
              'company',
              'department',
              'position',
              'status',
              ...(omittedColumns.has('resigned_at') ? [] : ['resigned_at']),
              ...(omittedColumns.has('resign_date') ? [] : ['resign_date']),
              ...(omittedColumns.has('presence_status') ? [] : ['presence_status']),
              ...(omittedColumns.has('last_seen_at') ? [] : ['last_seen_at']),
              ...(omittedColumns.has('permissions') ? [] : ['permissions']),
            ];
            return supabase
              .from('staff_members')
              .select(selectColumns.join(', ')) as PromiseLike<{
                data: StaffMember[] | null;
                error: unknown;
              }>;
          },
          ['resigned_at', 'resign_date', 'presence_status', 'last_seen_at', 'permissions'],
          { cacheKey: 'chat:staff-directory' },
        );
        if (error) throw error;
        if (active) {
          setChatDirectoryStaffs(Array.isArray(data) ? data.map((staff: StaffMember) => normalizeProfileUser(staff)) : []);
        }
      } catch (error) {
        console.error('채팅 직원 디렉터리 로드 실패:', error);
        if (active) {
          setChatDirectoryStaffs([]);
        }
      }
    };

    const scheduleLoad = () => {
      if (!active) return;
      void loadChatDirectory();
    };

    if (typeof window !== 'undefined' && typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(scheduleLoad);
    } else if (typeof window !== 'undefined') {
      timeoutId = window.setTimeout(scheduleLoad, 250);
    } else {
      void loadChatDirectory();
    }

    return () => {
      active = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleId);
      }
    };
  }, []);

  const effectiveTodoUserId = useMemo(() => {
    if (isUuidLike(user?.id)) {
      return String(user!.id);
    }
    if (currentStaffProfile?.id) {
      return String(currentStaffProfile.id);
    }
    return String(user?.id || '').trim();
  }, [currentStaffProfile?.id, user?.id]);

  const effectiveChatUserId = useMemo(() => {
    const currentStaffId = String(currentStaffProfile?.id || '').trim();
    if (currentStaffId) {
      return currentStaffId;
    }
    return String(user?.id || '').trim();
  }, [currentStaffProfile?.id, user?.id]);

  const findKnownStaffById = useCallback(
    (staffId: string | null | undefined) => allKnownStaffMap.get(String(staffId)) || null,
    [allKnownStaffMap],
  );

  const isStaffCurrentlyOnline = useCallback(
    (staff: StaffMember | null | undefined) => {
      if (!staff?.id) return false;
      if (presenceMap[String(staff.id)]) return true;
      const presenceStatus = String(staff.presence_status || '').trim().toLowerCase();
      if (presenceStatus !== 'online') return false;
      const dynamicStaff = staff as Record<string, unknown>;
      const lastSeenAt =
        String(dynamicStaff.last_seen_at || dynamicStaff.online_at || dynamicStaff.updated_at || '').trim();
      return isRecentPresenceTimestamp(lastSeenAt);
    },
    [presenceMap],
  );

  const resolveStaffProfile = useCallback(
    (staffId: string | null | undefined, fallbackName?: string | null): StaffMember | null => {
      const knownStaff = findKnownStaffById(staffId);
      if (knownStaff) {
        return {
          ...knownStaff,
          photo_url: getProfilePhotoUrl(knownStaff),
        };
      }
      if (String(staffId) === String(user?.id) && user?.name) {
        return {
          id: String(user.id),
          name: String(user.name),
          company: user.company || '',
          department: user.department || '',
          position: user.position || '',
          photo_url: getProfilePhotoUrl(user),
        };
      }
      const safeName = String(fallbackName || '').trim();
      if (!safeName) return null;
      return {
        id: String(staffId || ''),
        name: safeName,
        company: '',
        department: '',
        position: '',
        photo_url: null,
      };
    },
    [findKnownStaffById, user],
  );

  const resolveRoomMemberProfile = useCallback(
    (room: ChatRoom, memberId: string) => {
      const knownStaff = resolveStaffProfile(memberId);
      if (knownStaff) return knownStaff;
      if (room?.type === 'direct' && String(memberId) !== String(effectiveChatUserId || user?.id || '')) {
        return {
          id: memberId,
          name: room?.name || '이름 없음',
          company: '',
          department: '',
          position: '',
          photo_url: null,
        };
      }
      return {
        id: memberId,
        name: '이름 없음',
        company: '',
        department: '',
        position: '',
        photo_url: null,
      };
    },
    [effectiveChatUserId, resolveStaffProfile, user?.id],
  );

  const getEffectiveRoomMemberIds = useCallback(
    (room: ChatRoom | null | undefined) => {
      if (!room) return [];
      if (String(room.id) === NOTICE_ROOM_ID) return noticeRoomMemberIds;

      const seenIds = new Set<string>();
      const memberIds: string[] = [];
      normalizeMemberIds(room.members).forEach((memberId: string) => {
        if (!memberId || seenIds.has(memberId)) return;
        seenIds.add(memberId);

        if (memberId === effectiveChatUserId) {
          memberIds.push(memberId);
          return;
        }

        const knownStaff = allKnownStaffMap.get(memberId);
        if (!knownStaff || isActiveChatMember(knownStaff)) {
          memberIds.push(memberId);
        }
      });
      return memberIds;
    },
    [allKnownStaffMap, effectiveChatUserId, noticeRoomMemberIds],
  );

  const isRoomAccessibleToCurrentUser = useCallback(
    (room: ChatRoom | null | undefined) => {
      if (!room) return false;
      if (String(room.id) === NOTICE_ROOM_ID) return true;
      return getEffectiveRoomMemberIds(room).includes(effectiveChatUserId);
    },
    [effectiveChatUserId, getEffectiveRoomMemberIds],
  );

  const isCurrentUserSelfRoom = useCallback(
    (room: ChatRoom) => isSelfChatRoom(room, String(effectiveChatUserId || '').trim()),
    [effectiveChatUserId],
  );

  return {
    allKnownStaffs,
    allKnownStaffMap,
    noticeRoomMembers,
    noticeRoomMemberIds,
    currentStaffProfile,
    effectiveTodoUserId,
    effectiveChatUserId,
    isMso,
    canWriteNotice,
    canManageNoticeOps,
    findKnownStaffById,
    isStaffCurrentlyOnline,
    resolveStaffProfile,
    resolveRoomMemberProfile,
    getEffectiveRoomMemberIds,
    isRoomAccessibleToCurrentUser,
    isCurrentUserSelfRoom,
    selfRoomName: SELF_ROOM_NAME,
  };
}

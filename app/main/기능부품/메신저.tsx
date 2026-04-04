'use client';
import { toast } from '@/lib/toast';
import { useDeferredValue, useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  buildInternalStorageDownloadUrl,
  extractStorageUrlExtension,
  isInternalStorageObjectUrl,
} from '@/lib/object-storage-url';
import { getProfilePhotoUrl, normalizeProfileUser } from '@/lib/profile-photo';
import { bindPageRefresh } from '@/lib/realtime-maintenance';
import {
  buildChatMessageSelect,
  CHAT_MESSAGE_OPTIONAL_COLUMNS,
  CHAT_MESSAGE_SELECT,
  CHAT_ROOM_SELECT,
  POLL_SELECT,
} from '@/lib/chat-query-columns';
import { CHAT_ACTIVE_ROOM_KEY, CHAT_FOCUS_KEY, CHAT_ROOM_KEY } from '@/app/main/navigation-state';
import SmartDatePicker from './공통/SmartDatePicker';
import { buildMessengerImageAlt, MessengerAvatar, MessengerStatusUserRow } from './메신저공통';
import type { StaffMember, ChatRoom, ChatMessage } from '@/types';

type PollItem = {
  id: string;
  room_id?: string | null;
  creator_id?: string | null;
  question: string;
  options: string[];
  created_at?: string | null;
  [key: string]: unknown;
};

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const NOTICE_ROOM_NAME = '공지메시지';
const SELF_ROOM_NAME = '나와의 채팅';
const CAN_WRITE_NOTICE_POSITIONS = ['대표', '부장', '팀장', '실장', '병원장', '이사', '본부장', '총무부장', '진료부장', '간호부장'];
const MOBILE_CHAT_MEDIA_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)';
const WARD_MESSAGE_META_PREFIX = '[[WARD_MESSAGE_META]]';
const WARD_MESSAGE_META_SUFFIX = '[[/WARD_MESSAGE_META]]';
const WARD_QUICK_REPLY_OPTIONS = [
  { id: 'confirm', label: '확인 후 올리겠습니다', text: '확인했습니다. 환자 확인 후 올리겠습니다.' },
  { id: 'delay', label: '준비중으로 지연', text: '현재 환자 준비 중으로 조금 지연되고 있습니다.' },
  { id: 'moving', label: '이동 시작했습니다', text: '환자 이동 시작했습니다. 곧 올리겠습니다.' },
  { id: 'after-care', label: '처치 후 올리겠습니다', text: '처치 마무리 후 바로 올리겠습니다.' },
] as const;

function isMobileChatViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_CHAT_MEDIA_QUERY).matches;
}

type WardMessageMeta = {
  type?: string;
  patient_name?: string;
  chart_no?: string;
  surgery_name?: string;
  schedule_room?: string;
  schedule_time?: string;
};

type ReactionUsersByMessage = Record<string, Record<string, StaffMember[]>>;

function compareStaffMembers(a: StaffMember, b: StaffMember) {
  return (a.department || '').localeCompare(b.department || '') || (a.name || '').localeCompare(b.name || '');
}

function stripHiddenMessageMetaBlocks(value: unknown): string {
  return String(value || '')
    .replace(/\[\[SCHEDULE_META\]\][\s\S]*?\[\[\/SCHEDULE_META\]\]/g, '')
    .replace(/\[\[BOARD_META\]\][\s\S]*?\[\[\/BOARD_META\]\]/g, '')
    .replace(/\[\[WARD_MESSAGE_META\]\][\s\S]*?\[\[\/WARD_MESSAGE_META\]\]/g, '')
    .trim();
}

function extractWardMessageMeta(value: unknown): {
  displayContent: string;
  meta: WardMessageMeta | null;
} {
  const raw = String(value || '');
  const start = raw.indexOf(WARD_MESSAGE_META_PREFIX);
  const end = raw.indexOf(WARD_MESSAGE_META_SUFFIX);

  if (start < 0 || end < 0 || end <= start) {
    return {
      displayContent: stripHiddenMessageMetaBlocks(raw),
      meta: null,
    };
  }

  const displayContent = stripHiddenMessageMetaBlocks(
    `${raw.slice(0, start)}${raw.slice(end + WARD_MESSAGE_META_SUFFIX.length)}`,
  );
  const metaText = raw.slice(start + WARD_MESSAGE_META_PREFIX.length, end).trim();

  try {
    return {
      displayContent,
      meta: JSON.parse(metaText) as WardMessageMeta,
    };
  } catch {
    return {
      displayContent,
      meta: null,
    };
  }
}

/** 원본 파일명으로 다운로드되도록 프록시 URL 생성 */
function buildDownloadUrl(fileUrl: string, fileName: string): string {
  if (isInternalStorageObjectUrl(fileUrl)) {
    return buildInternalStorageDownloadUrl(fileUrl, fileName);
  }
  return `/api/download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(fileName)}`;
}
const CHAT_ROOM_PREFS_KEY = 'erp_chat_room_prefs';
const CHAT_PINNED_KEY = 'erp_chat_pinned_messages';
const CHAT_BOOKMARK_KEY = 'erp_chat_bookmarks';
const CHAT_PINNED_ROOM_ORDER_KEY = 'erp_chat_pinned_room_order';
// 운영 DB의 legacy `message_reads`는 아직 `chat_messages`를 참조하고 있어
// 현재 `messages` 기반 채팅과 직접 호환되지 않는다. 읽음 계산은
// `room_read_cursors`로 이미 처리하므로, 충돌만 일으키는 legacy 쓰기는 비활성화한다.
const MESSAGE_READ_WRITES_ENABLED = false;

async function selectChatMessagesWithFallback<TData>(
  execute: (selectClause: string) => PromiseLike<{ data: TData | null; error: unknown }>,
) {
  return withMissingColumnsFallback<TData>(
    (omittedColumns) => execute(buildChatMessageSelect(omittedColumns)),
    [...CHAT_MESSAGE_OPTIONAL_COLUMNS],
  );
}

function sortChatRoomsWithNoticeFirst(rooms: ChatRoom[]): ChatRoom[] {
  const notice = rooms.find(( r: ChatRoom) => r.id === NOTICE_ROOM_ID);
  const others = rooms.filter(( r: ChatRoom) => r.id !== NOTICE_ROOM_ID).sort((a: ChatRoom, b: ChatRoom) => {
    const at = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bt - at;
  });
  return notice ? [notice, ...others] : others;
}

function isImageUrl(url: string): boolean {
  const ext = extractStorageUrlExtension(url);
  return /^(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif|avif)$/.test(ext || '');
}

function isVideoUrl(url: string): boolean {
  const ext = extractStorageUrlExtension(url);
  return /^(mp4|webm|mov|m4v|avi|mkv)$/.test(ext || '');
}

function resolveAttachmentKind(
  fileUrl: unknown,
  fileKind: unknown,
): AttachmentPreviewKind {
  const normalizedKind = String(fileKind || '').trim().toLowerCase();
  if (normalizedKind === 'image') return 'image';
  if (normalizedKind === 'video') return 'video';
  const resolvedUrl = String(fileUrl || '');
  return isImageUrl(resolvedUrl) ? 'image' : isVideoUrl(resolvedUrl) ? 'video' : 'file';
}

function sortAlbumMessages<T extends Pick<ChatMessage, 'album_index' | 'created_at'>>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    const aIndex = Number.isFinite(Number(a.album_index)) ? Number(a.album_index) : Number.MAX_SAFE_INTEGER;
    const bIndex = Number.isFinite(Number(b.album_index)) ? Number(b.album_index) : Number.MAX_SAFE_INTEGER;

    if (aIndex !== bIndex) return aIndex - bIndex;

    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

function extractFirstLinkUrl(value: string | null | undefined): string {
  const urlMatch = String(value || '').match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : '';
}

function extractFileNameFromUrl(url: string | null | undefined): string {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return '첨부파일';
  try {
    const parsed = new URL(rawUrl, 'https://local-storage-proxy.test');
    const keyFromQuery = parsed.searchParams.get('key');
    const source = decodeURIComponent(keyFromQuery || parsed.pathname || '');
    const lastSegment = decodeURIComponent(source.split('/').pop() || '') || '첨부파일';
    // {타임스탬프}_{UUID}__{원본파일명} 패턴: 원본 파일명 추출
    const withOriginal = lastSegment.match(/^\d+_[0-9a-f-]{36}__(.+)$/i);
    if (withOriginal) return withOriginal[1];
    // {타임스탬프}_{UUID}.ext 패턴: "첨부파일.ext" 로 표시
    const uuidOnly = lastSegment.match(/^\d+_[0-9a-f-]{36}(\.[a-z0-9]+)?$/i);
    if (uuidOnly) return `첨부파일${uuidOnly[1] || ''}`;
    return lastSegment;
  } catch {
    const withoutQuery = rawUrl.split('?')[0] || '';
    const lastSegment = decodeURIComponent(withoutQuery.split('/').pop() || '') || '첨부파일';
    const withOriginal = lastSegment.match(/^\d+_[0-9a-f-]{36}__(.+)$/i);
    if (withOriginal) return withOriginal[1];
    const uuidOnly = lastSegment.match(/^\d+_[0-9a-f-]{36}(\.[a-z0-9]+)?$/i);
    if (uuidOnly) return `첨부파일${uuidOnly[1] || ''}`;
    return lastSegment;
  }
}

function guessFileExtension(file: File): string {
  const rawName = String(file.name || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }

  const mime = String(file.type || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/avif': 'avif',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/zip': 'zip',
  };
  return mimeMap[mime] || 'bin';
}

function buildUploadRequestFileName(file: File): string {
  const rawName = String(file.name || '').trim();
  if (rawName) return rawName;
  return getPendingAttachmentDisplayName(file);
}

function getAttachmentDisplayName(fileName: string | null | undefined, fileUrl?: string | null): string {
  const rawName = String(fileName || '').trim();
  if (rawName) return rawName;
  return extractFileNameFromUrl(fileUrl);
}

function getMessageDisplayText(
  content: string | null | undefined,
  fileName?: string | null,
  fileUrl?: string | null,
  fallback: unknown = ''
): string {
  const rawContent = stripHiddenMessageMetaBlocks(content);
  if (rawContent) return rawContent;
  if (String(fileName || '').trim() || String(fileUrl || '').trim()) {
    return getAttachmentDisplayName(fileName, fileUrl);
  }
  return String(fallback ?? '');
}

function getDeletedMessagePreviewText() {
  return '삭제된 메시지입니다.';
}

function getPendingAttachmentDisplayName(file: File): string {
  const rawName = String(file.name || '').trim();
  if (rawName) return rawName;
  const extension = guessFileExtension(file);
  if (String(file.type || '').startsWith('image/')) return `붙여넣은 이미지.${extension}`;
  if (String(file.type || '').startsWith('video/')) return `붙여넣은 동영상.${extension}`;
  return `첨부파일.${extension}`;
}

function normalizeMemberIds(members: unknown): string[] {
  return Array.isArray(members) ? members.map((id: unknown) => String(id)) : [];
}

function isSelfChatRoom(room: ChatRoom | null | undefined, currentUserId: string | null | undefined): boolean {
  if (room?.type !== 'direct') return false;
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  if (!normalizedCurrentUserId) return false;
  const members = normalizeMemberIds(room?.members);
  return members.length === 1 && members[0] === normalizedCurrentUserId;
}

function isActiveChatMember(staff: StaffMember | null | undefined): boolean {
  if (!staff?.id) return false;

  const status = String(staff.status || '').trim();
  const dynamicStaff = staff as Record<string, unknown>;
  const resignedAt = typeof dynamicStaff.resigned_at === 'string' ? dynamicStaff.resigned_at.trim() : '';
  const resignDate = typeof dynamicStaff.resign_date === 'string' ? dynamicStaff.resign_date.trim() : '';
  const isActiveFlag = dynamicStaff.is_active;

  if (isActiveFlag === false) return false;
  if (status === '퇴사' || status === '퇴직') return false;
  if (resignedAt) return false;
  if (resignDate) return false;
  return true;
}

function isMessageReadByCursor(messageCreatedAt: string | null | undefined, lastReadAt: string | null | undefined): boolean {
  if (!messageCreatedAt || !lastReadAt) return false;
  const messageTime = new Date(messageCreatedAt).getTime();
  const cursorTime = new Date(lastReadAt).getTime();
  if (!Number.isFinite(messageTime) || !Number.isFinite(cursorTime)) return false;
  return cursorTime >= messageTime;
}

function getLatestReadCursor(
  currentValue: string | null | undefined,
  nextValue: string | null | undefined
): string | null {
  if (!nextValue) return currentValue || null;
  if (!currentValue) return nextValue;

  const currentTime = new Date(currentValue).getTime();
  const nextTime = new Date(nextValue).getTime();
  if (!Number.isFinite(currentTime)) return Number.isFinite(nextTime) ? nextValue : currentValue;
  if (!Number.isFinite(nextTime)) return currentValue;
  return nextTime >= currentTime ? nextValue : currentValue;
}

function isActiveNoticeMember(staff: StaffMember | null | undefined): boolean {
  if (!staff?.id) return false;

  const status = String(staff.status || '').trim();
  const dynamicStaff = staff as Record<string, unknown>;
  const resignedAt = typeof dynamicStaff.resigned_at === 'string' ? dynamicStaff.resigned_at.trim() : '';
  const resignDate = typeof dynamicStaff.resign_date === 'string' ? dynamicStaff.resign_date.trim() : '';
  const isActiveFlag = dynamicStaff.is_active;

  if (isActiveFlag === false) return false;
  if (status === '퇴사') return false;
  if (resignedAt) return false;
  if (resignDate) return false;
  return true;
}

function isRecentPresenceTimestamp(value: string | null | undefined, freshnessMs = 5 * 60 * 1000): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= freshnessMs;
}

function haveSameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function getDirectRoomMembersKey(room: ChatRoom | null | undefined): string | null {
  if (room?.type !== 'direct') return null;
  const members = normalizeMemberIds(room?.members);
  if (members.length === 0 || members.length > 2) return null;
  return [...members].sort().join('::');
}

function getConversationRoomIdsByRoomId(
  roomId: string | null | undefined,
  rooms: ChatRoom[]
): string[] {
  const targetRoomId = String(roomId || '').trim();
  if (!targetRoomId) return [];

  const targetRoom = rooms.find((room: ChatRoom) => String(room.id) === targetRoomId) || null;
  const directRoomKey = getDirectRoomMembersKey(targetRoom);
  if (!directRoomKey) return [targetRoomId];

  const relatedRoomIds = rooms
    .filter((room: ChatRoom) => getDirectRoomMembersKey(room) === directRoomKey)
    .map((room: ChatRoom) => String(room.id))
    .filter(Boolean);

  return relatedRoomIds.length > 0 ? Array.from(new Set(relatedRoomIds)) : [targetRoomId];
}

function getConversationUnreadCountForRoom(
  room: ChatRoom | null | undefined,
  unreadCounts: Record<string, number>,
  rooms: ChatRoom[]
): number {
  const roomId = String(room?.id || '').trim();
  if (!roomId) return 0;

  const directRoomKey = getDirectRoomMembersKey(room);
  if (!directRoomKey) {
    return unreadCounts[roomId] || 0;
  }

  return rooms
    .filter((candidate: ChatRoom) => getDirectRoomMembersKey(candidate) === directRoomKey)
    .reduce((sum, candidate: ChatRoom) => sum + (unreadCounts[String(candidate.id)] || 0), 0);
}

function getConversationRoomIdSet(
  roomId: string | null | undefined,
  rooms: ChatRoom[]
): Set<string> {
  return new Set(getConversationRoomIdsByRoomId(roomId, rooms));
}

type RoomPreference = {
  pinned?: boolean;
  hidden?: boolean;
};

type PresenceInfo = {
  userId: string;
  name: string;
  roomId: string | null;
  onlineAt: string;
};

type AttachmentPreviewKind = 'image' | 'video' | 'file';

type AttachmentPreviewItem = {
  url: string;
  name: string;
  kind: AttachmentPreviewKind;
};

type AttachmentPreview = {
  items: AttachmentPreviewItem[];
  activeIndex: number;
};

type MessageRetryPayload = {
  roomId: string;
  content: string;
  fileUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileKind: 'image' | 'video' | 'file' | null;
  replyToId: string | null;
  albumId?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
};

type ChatMessageInsertPayload = {
  room_id: string;
  sender_id: string | null;
  content: string;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  file_kind: 'image' | 'video' | 'file' | null;
  reply_to_id: string | null;
  album_id: string | null;
  album_index: number | null;
  album_total: number | null;
};

function buildChatMessageInsertPayload(
  senderId: string | null | undefined,
  payload: MessageRetryPayload,
): ChatMessageInsertPayload {
  return {
    room_id: payload.roomId,
    sender_id: senderId ? String(senderId) : null,
    content: payload.content,
    file_url: payload.fileUrl,
    file_name: payload.fileName,
    file_size_bytes: payload.fileSizeBytes,
    file_kind: payload.fileKind,
    reply_to_id: payload.replyToId,
    album_id: payload.albumId ?? null,
    album_index: payload.albumIndex ?? null,
    album_total: payload.albumTotal ?? null,
  };
}

function shouldTriggerImmediateChatPush(payload: {
  albumId?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
}) {
  const albumId = String(payload.albumId || '').trim();
  const albumTotal = Number(payload.albumTotal ?? 0);
  const albumIndex = Number(payload.albumIndex ?? Number.NaN);

  if (!albumId || !Number.isFinite(albumTotal) || albumTotal <= 1) {
    return true;
  }

  if (!Number.isFinite(albumIndex)) {
    return true;
  }

  return albumIndex >= albumTotal - 1;
}

type SendMessageOptions = {
  fileUrl?: string;
  fileSizeBytes?: number;
  fileKind?: 'image' | 'video' | 'file';
  retryMessageId?: string;
  fileName?: string;
  contentOverride?: string;
  clearComposerIfUnchangedFrom?: string;
  replyToIdOverride?: string | null;
  albumId?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
};

type DeliveryState = {
  status: 'sending' | 'failed' | 'sent';
  retryPayload?: MessageRetryPayload;
  error?: string | null;
};

type ChatRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

type GlobalSearchTab = 'all' | 'member' | 'room' | 'message' | 'file';
type MediaFilter = 'all' | 'media' | 'image' | 'video' | 'file';

type AttachmentQuickActionsVariant = 'pill' | 'subtle' | 'overlay';

type AttachmentQuickActionsProps = {
  url: string;
  name: string;
  onPreview: () => void;
  onReply?: (() => void) | null;
  replyTestId?: string;
  variant?: AttachmentQuickActionsVariant;
  className?: string;
};

function AttachmentQuickActions({
  url,
  name,
  onPreview,
  onReply,
  replyTestId,
  variant = 'pill',
  className = '',
}: AttachmentQuickActionsProps) {
  const handleShare = async (event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      toast('공유 링크를 복사했습니다.');
    } catch {
      toast('공유 링크 복사에 실패했습니다.', 'error');
    }
  };

  const actionClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: 'px-2 py-1 rounded-md text-[10px] font-bold',
    subtle: 'text-[10px] font-bold hover:underline underline-offset-2',
    overlay: 'pointer-events-auto px-2 py-1 rounded-[var(--radius-md)] bg-black/40 hover:bg-black/60 text-white text-[10px] font-bold',
  };

  const previewClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-blue-500/10 dark:bg-blue-900/30 text-[var(--accent)] hover:text-blue-600`,
    subtle: `${actionClassByVariant.subtle} text-[var(--accent)] hover:text-blue-600`,
    overlay: actionClassByVariant.overlay,
  };

  const replyClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-amber-50 dark:bg-amber-900/30 text-amber-700 hover:text-amber-800`,
    subtle: `${actionClassByVariant.subtle} text-amber-700 hover:text-amber-800`,
    overlay: actionClassByVariant.overlay,
  };

  const shareClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    subtle: `${actionClassByVariant.subtle} text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-4)]`,
    overlay: actionClassByVariant.overlay,
  };

  const downloadClassByVariant: Record<AttachmentQuickActionsVariant, string> = {
    pill: `${actionClassByVariant.pill} bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 hover:text-emerald-700`,
    subtle: `${actionClassByVariant.subtle} text-emerald-600 hover:text-emerald-700`,
    overlay: actionClassByVariant.overlay,
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPreview();
        }}
        className={previewClassByVariant[variant]}
      >
        미리보기
      </button>
      {onReply ? (
        <button
          type="button"
          data-testid={replyTestId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReply();
          }}
          className={replyClassByVariant[variant]}
        >
          답글
        </button>
      ) : null}
      <button type="button" onClick={handleShare} className={shareClassByVariant[variant]}>
        공유
      </button>
      <a
        href={buildDownloadUrl(url, name)}
        onClick={(event) => event.stopPropagation()}
        className={downloadClassByVariant[variant]}
      >
        다운로드
      </a>
    </div>
  );
}

type AttachmentListCardProps = {
  url: string;
  name: string;
  kind: AttachmentPreviewKind;
  summary?: string | null;
  meta?: string | null;
  badgeLabel?: string | null;
  onPreview: () => void;
  onReply?: (() => void) | null;
  replyTestId?: string;
  onActivate?: (() => void) | null;
  actionVariant?: AttachmentQuickActionsVariant;
  layout?: 'list' | 'bubble';
  tone?: 'default' | 'accent';
  className?: string;
};

function AttachmentListCard({
  url,
  name,
  kind,
  summary,
  meta,
  badgeLabel,
  onPreview,
  onReply,
  replyTestId,
  onActivate,
  actionVariant = 'subtle',
  layout = 'list',
  tone = 'default',
  className = '',
}: AttachmentListCardProps) {
  const isClickable = typeof onActivate === 'function';
  const bubbleAlignmentClass = tone === 'accent' ? 'items-end text-right' : 'items-start text-left';

  if (layout === 'bubble') {
    if (kind === 'image') {
      return (
        <div className={`inline-flex max-w-full flex-col gap-1 ${bubbleAlignmentClass} ${className}`}>
          <div className="relative group inline-block">
            <button
              type="button"
              className="block"
              onClick={onPreview}
              aria-label={`${name || '첨부 이미지'} 미리보기`}
            >
              <img
                src={url}
                alt={name}
                className="max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[var(--radius-md)] object-cover cursor-zoom-in border border-[var(--border)]"
              />
            </button>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity bg-black/40 flex items-center justify-center rounded-[var(--radius-md)] pointer-events-none px-2">
              <AttachmentQuickActions
                url={url}
                name={name}
                onPreview={onPreview}
                onReply={onReply}
                replyTestId={replyTestId}
                variant="overlay"
              />
            </div>
          </div>
        </div>
      );
    }

    if (kind === 'video') {
      return (
        <div className={`inline-flex max-w-full flex-col gap-1 ${bubbleAlignmentClass} ${className}`}>
          <video controls className="max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[var(--radius-md)] bg-black border border-[var(--border)]">
            <source src={url} />
          </video>
          <AttachmentQuickActions
            url={url}
            name={name}
            onPreview={onPreview}
            onReply={onReply}
            replyTestId={replyTestId}
            variant={tone === 'accent' ? 'overlay' : 'subtle'}
            className="mt-2"
          />
          <p className={`max-w-[200px] md:max-w-[240px] truncate text-[10px] font-semibold ${tone === 'accent' ? 'text-white/85' : 'text-[var(--toss-gray-4)]'}`}>
            {name}
          </p>
        </div>
      );
    }

    return (
      <div
        className={`inline-flex max-w-full min-w-0 flex-col p-3 rounded-[var(--radius-md)] border shadow-sm sm:min-w-[200px] ${
          tone === 'accent'
            ? 'bg-white/95 border-white/40 text-slate-900'
            : 'bg-[var(--toss-gray-0)] border-[var(--border)] text-[var(--foreground)]'
        } ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl">📎</div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-bold text-[12px] truncate mb-1 text-[var(--foreground)]">{name}</p>
            {summary ? (
              <p className="text-[10px] text-[var(--toss-gray-4)] leading-relaxed mb-1 line-clamp-2 break-words">
                {summary}
              </p>
            ) : null}
            <AttachmentQuickActions
              url={url}
              name={name}
              onPreview={onPreview}
              onReply={onReply}
              replyTestId={replyTestId}
              variant="pill"
              className="mt-2"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
      aria-label={isClickable ? `${name || '첨부 파일'} 열기` : undefined}
      onClick={() => onActivate?.()}
      onKeyDown={(event) => {
        if (!isClickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      className={`p-3 bg-[var(--tab-bg)] dark:bg-zinc-900/50 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800 ${
        isClickable ? 'cursor-pointer hover:border-[var(--accent)] hover:shadow-sm transition-all' : ''
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
          aria-label={`${name || '첨부 파일'} 미리보기`}
          className={`shrink-0 overflow-hidden rounded-xl border border-[var(--border)] ${
            kind === 'image' || kind === 'video'
              ? 'w-14 h-14 bg-black/80'
              : 'w-12 h-12 bg-[var(--card)] dark:bg-zinc-900 flex items-center justify-center text-lg'
          }`}
        >
          {kind === 'image' ? (
            <img src={url} alt={name} className="w-full h-full object-cover" />
          ) : kind === 'video' ? (
            <div className="w-full h-full flex items-center justify-center text-white text-lg">🎬</div>
          ) : (
            <span>📎</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[11px] font-bold text-foreground truncate">{name}</p>
            {badgeLabel ? (
              <span className="px-1.5 py-0.5 rounded bg-[var(--card)] dark:bg-zinc-800 text-[9px] font-bold text-[var(--toss-gray-4)] shrink-0">
                {badgeLabel}
              </span>
            ) : null}
          </div>
          {summary ? (
            <p className="text-[10px] text-[var(--toss-gray-4)] leading-relaxed mt-1 line-clamp-2 break-words">
              {summary}
            </p>
          ) : null}
          {meta ? (
            <p className="text-[10px] text-[var(--toss-gray-3)] mt-1 truncate">{meta}</p>
          ) : null}
          <AttachmentQuickActions
            url={url}
            name={name}
            onPreview={onPreview}
            onReply={onReply}
            replyTestId={replyTestId}
            variant={actionVariant}
            className="mt-2"
          />
        </div>
      </div>
    </div>
  );
}

function getRoomPrefsStorageKey(userId: string | null | undefined): string {
  return `${CHAT_ROOM_PREFS_KEY}:${userId || 'guest'}`;
}

function isUuidLike(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getPinnedStorageKey(roomId: string | null | undefined): string {
  return `${CHAT_PINNED_KEY}:${roomId || 'none'}`;
}

function getBookmarkStorageKey(userId: string | null | undefined): string {
  return `${CHAT_BOOKMARK_KEY}:${userId || 'guest'}`;
}

function getPinnedRoomOrderStorageKey(userId: string | null | undefined): string {
  return `${CHAT_PINNED_ROOM_ORDER_KEY}:${userId || 'guest'}`;
}

function readStoredStringArray(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function writeStoredStringArray(storageKey: string, values: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(new Set(values.map((value) => String(value))))));
  } catch {
    // ignore
  }
}

function writeStoredPinnedIds(roomId: string | null | undefined, messageIds: string[]) {
  writeStoredStringArray(getPinnedStorageKey(roomId), messageIds.slice(0, 1));
}

function readStoredBookmarks(userId: string | null | undefined): string[] {
  return readStoredStringArray(getBookmarkStorageKey(userId));
}

function writeStoredBookmarks(userId: string | null | undefined, messageIds: string[]) {
  writeStoredStringArray(getBookmarkStorageKey(userId), messageIds);
}

function arraysMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getKoreanTodayString() {
  const now = new Date();
  const koreaNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return koreaNow.toISOString().split('T')[0];
}

function getRoomDisplayName(room: ChatRoom | null | undefined, staffs: StaffMember[], currentUserId: string | null | undefined): string {
  if (!room) return '채팅방';
  if (room.id === NOTICE_ROOM_ID) return NOTICE_ROOM_NAME;
  if (isSelfChatRoom(room, currentUserId)) return SELF_ROOM_NAME;
  // 2명 초과(그룹화된 방)면 room.name 우선 사용
  const members = normalizeMemberIds(room.members);
  if (room.type === 'direct' && members.length <= 2) {
    const otherStaff = staffs.find(
      ( staff: StaffMember) =>
        members.includes(String(staff.id)) &&
        String(staff.id) !== String(currentUserId)
    );
    if (otherStaff?.name) return otherStaff.name;
  }
  return room.name || '채팅방';
}

function getRoomPreviewText(room: ChatRoom): string {
  return (room?.last_message_preview as string | null | undefined) || (room?.last_message as string | null | undefined) || '대화가 없습니다.';
}

function sortRoomsForSidebar(
  rooms: ChatRoom[],
  prefs: Record<string, RoomPreference>,
  pinnedRoomOrder: string[]
): ChatRoom[] {
  const notice = rooms.find(( room: ChatRoom) => room.id === NOTICE_ROOM_ID);
  const rest = rooms
    .filter(( room: ChatRoom) => room.id !== NOTICE_ROOM_ID)
    .sort((a: ChatRoom, b: ChatRoom) => {
      const at = new Date(a.last_message_at || a.created_at || 0).getTime();
      const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
      return bt - at;
    });
  const pinnedOrderIndex = new Map(
    pinnedRoomOrder.map((roomId, index) => [String(roomId), index])
  );
  const pinned = rest
    .filter(( room: ChatRoom) => prefs[room.id]?.pinned)
    .sort((a: ChatRoom, b: ChatRoom) => {
      const aIndex = pinnedOrderIndex.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = pinnedOrderIndex.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      const at = new Date(a.last_message_at || a.created_at || 0).getTime();
      const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
      return bt - at;
    });
  const regular = rest.filter(( room: ChatRoom) => !prefs[room.id]?.pinned);
  return notice ? [notice, ...pinned, ...regular] : [...pinned, ...regular];
}

interface ChatViewProps {
  user: StaffMember | null;
  onRefresh?: () => void;
  staffs?: StaffMember[];
  chatListResetToken?: number;
  initialOpenChatRoomId?: string | null;
  initialOpenMessageId?: string | null;
  onConsumeOpenChatRoomId?: () => void;
  shareTarget?: { id: string; fileCount: number; text: string | null; url: string | null; title: string | null } | null;
  onConsumeShareTarget?: () => void;
}
export default function ChatView({
  user,
  onRefresh,
  staffs = [],
  chatListResetToken,
  initialOpenChatRoomId,
  initialOpenMessageId,
  onConsumeOpenChatRoomId,
  shareTarget,
  onConsumeShareTarget,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const pendingScrollMsgIdRef = useRef<string | null>(null);
  const pendingBottomAlignRoomIdRef = useRef<string | null>(null);
  const fetchDataRequestSeqRef = useRef(0);
  const timelineItemCountRef = useRef(0);
  const selfChatCreationInFlightRef = useRef(false);
  const [omniSearch, setOmniSearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const deferredOmniSearch = useDeferredValue(omniSearch);
  const deferredChatSearch = useDeferredValue(chatSearch);
  const [transientHighlightQuery, setTransientHighlightQuery] = useState('');
  const [inputMsg, setInputMsg] = useState('');
  const [activeActionMsg, setActiveActionMsg] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [wardQuickReplySendingMessageId, setWardQuickReplySendingMessageId] = useState<string | null>(null);
  const [deliveryStates, setDeliveryStates] = useState<Record<string, DeliveryState>>({});
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToMessage = (messageId: string) => {
    const el = msgRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origClass = el.className;
      el.classList.add('bg-[var(--toss-blue-light)]', 'rounded-xl', 'transition-colors', 'duration-500');
      setTimeout(() => {
        el.className = origClass;
      }, 2000);
    }
  };

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const renderHighlightedText = (text: string, highlightQuery: string, isMine = false) => {
    const normalizedQuery = highlightQuery.trim();
    if (!normalizedQuery) {
      return <span className="break-words whitespace-pre-wrap">{text}</span>;
    }

    const matcher = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'ig');
    return text.split(matcher).map((part, index) => {
      if (part.toLowerCase() !== normalizedQuery.toLowerCase()) {
        return <span key={index} className="break-words whitespace-pre-wrap">{part}</span>;
      }

      return (
        <mark
          key={index}
          className={`rounded px-0.5 py-0 ${isMine ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-900'}`}
        >
          {part}
        </mark>
      );
    });
  };

  const renderMessageContent = (content: string, isMine = false, highlightQuery = '') => {
    const visibleContent = stripHiddenMessageMetaBlocks(content);
    if (!visibleContent) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = visibleContent.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-words transition-colors ${
              isMine
                ? 'text-white decoration-white/70 hover:text-white/85'
                : 'text-blue-500 decoration-blue-400/70 hover:text-blue-600'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={i}>{renderHighlightedText(part, highlightQuery, isMine)}</span>;
    });
  };

  const lastReadAtRef = useRef<string | null>(null);
  const isFocusedRef = useRef(true);

  const [viewMode, setViewMode] = useState<'chat' | 'org'>('chat');
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [roomReadCursorMap, setRoomReadCursorMap] = useState<Record<string, string>>({});
  const [roomUnreadCounts, setRoomUnreadCounts] = useState<Record<string, number>>({});
  // 앨범: 이미지 여러 장 묶어서 보내기
  const [pendingAlbumFiles, setPendingAlbumFiles] = useState<File[]>([]);
  const albumFileInputRef = useRef<HTMLInputElement>(null);
  const [albumPreviewUrls, setAlbumPreviewUrls] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const [roomNotifyOn, setRoomNotifyOn] = useState(true);
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [roomPrefs, setRoomPrefs] = useState<Record<string, RoomPreference>>({});
  const [pinnedRoomOrder, setPinnedRoomOrder] = useState<string[]>([]);
  const [showHiddenRooms, setShowHiddenRooms] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchTab, setGlobalSearchTab] = useState<GlobalSearchTab>('all');
  const [globalSearchResults, setGlobalSearchResults] = useState<ChatMessage[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const deferredGlobalSearchQuery = useDeferredValue(globalSearchQuery);


  const chatRoomsRef = useRef<ChatRoom[]>([]);
  const deliveryStatesRef = useRef<Record<string, DeliveryState>>({});
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingPeersTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const readWriteInFlightRef = useRef<Set<string>>(new Set());
  const incomingRealtimeMessageIdsRef = useRef<Map<string, number>>(new Map());
  const isNearBottomRef = useRef(true);
  const lastTimelineTailRef = useRef('');
  const lastHandledChatListResetTokenRef = useRef(0);
  const selectedRoomIdRef = useRef<string | null>(null);
  const initialRoomRestoreSyncedRef = useRef(false);
  const fetchDataRef = useRef<(() => Promise<void>) | null>(null);
  const globalRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 방별 입력 draft 저장소 */
  const draftMapRef = useRef<Map<string, string>>(new Map());
  /** 현재 inputMsg 최신값을 ref로 유지 (setRoom 클로저에서 사용) */
  const inputMsgRef = useRef('');

  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);

  const [unreadModalMsg, setUnreadModalMsg] = useState<ChatMessage | null>(null);
  const [unreadUsers, setUnreadUsers] = useState<StaffMember[]>([]);
  const [unreadLoading, setUnreadLoading] = useState(false);
  const [reactionDetailTarget, setReactionDetailTarget] = useState<{ message: ChatMessage; emoji: string } | null>(null);
  const [globalRealtimeState, setGlobalRealtimeState] = useState<ChatRealtimeState>('connecting');
  const [roomRealtimeState, setRoomRealtimeState] = useState<ChatRealtimeState>('idle');
  const [globalRealtimeRetryToken, setGlobalRealtimeRetryToken] = useState(0);
  const [roomRealtimeRetryToken, setRoomRealtimeRetryToken] = useState(0);
  const [chatDirectoryStaffs, setChatDirectoryStaffs] = useState<StaffMember[]>([]);
  const [persistedPinnedMessages, setPersistedPinnedMessages] = useState<ChatMessage[]>([]);

  const permissions = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || permissions.mso === true || user?.role === 'admin';
  const canWriteNotice = isMso || Boolean(user?.position && CAN_WRITE_NOTICE_POSITIONS.includes(user.position));
  const allKnownStaffs = useMemo(() => {
    const merged = new Map<string, StaffMember>();
    [...chatDirectoryStaffs, ...(Array.isArray(staffs) ? staffs : [])].forEach(( staff: StaffMember) => {
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
    [allKnownStaffs]
  );
  const noticeRoomMemberIds = useMemo(
    () => noticeRoomMembers.map((staff: StaffMember) => String(staff.id)),
    [noticeRoomMembers]
  );
  const findKnownStaffById = useCallback(
    (staffId: string | null | undefined) =>
      allKnownStaffMap.get(String(staffId)) || null,
    [allKnownStaffMap]
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
    [presenceMap]
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
    [findKnownStaffById, user?.avatar_url, user?.company, user?.department, user?.id, user?.name, user?.position]
  );
  const resolveRoomMemberProfile = useCallback(
    ( room: ChatRoom, memberId: string) => {
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
    [resolveStaffProfile, user?.id]
  );
  const currentStaffProfile = useMemo(() => {
    if (!Array.isArray(allKnownStaffs) || allKnownStaffs.length === 0) return null;
    const sessionUserId = String(user?.id || '').trim();
    if (sessionUserId) {
      const exactMatch = allKnownStaffs.find(( staff: StaffMember) => String(staff.id) === sessionUserId);
      if (exactMatch) return exactMatch;
    }
    const sessionUserName = String(user?.name || '').trim();
    if (sessionUserName) {
      return allKnownStaffs.find(( staff: StaffMember) => String(staff.name || '').trim() === sessionUserName) || null;
    }
    return null;
  }, [allKnownStaffs, user?.id, user?.name]);

  useEffect(() => {
    let active = true;
    const loadChatDirectory = async () => {
      try {
        const { data, error } = await supabase
          .from('staff_members')
          .select('id, name, company, department, position, presence_status, last_seen_at, status, permissions');
        if (error) throw error;
        if (active) {
          setChatDirectoryStaffs(Array.isArray(data) ? data.map(( staff: StaffMember) => normalizeProfileUser(staff)) : []);
        }
      } catch (error) {
        console.error('채팅 직원 디렉터리 로드 실패:', error);
        if (active) {
          setChatDirectoryStaffs([]);
        }
      }
    };
    void loadChatDirectory();
    return () => {
      active = false;
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
  const getEffectiveRoomMemberIds = useCallback((room: ChatRoom | null | undefined) => {
    if (!room) return [];
    if (String(room.id) === NOTICE_ROOM_ID) return noticeRoomMemberIds;

    const seenIds = new Set<string>();
    const memberIds: string[] = [];
    normalizeMemberIds(room.members).forEach((memberId) => {
      if (!memberId || seenIds.has(memberId)) return;
      seenIds.add(memberId);

      if (memberId === effectiveChatUserId) {
        memberIds.push(memberId);
        return;
      }

      const knownStaff = allKnownStaffMap.get(memberId);
      // staff 정보가 없는 경우(다른 회사 등)도 방 접근 허용 — 정보가 있으면 활성 여부 체크
      if (!knownStaff || isActiveChatMember(knownStaff)) {
        memberIds.push(memberId);
      }
    });
    return memberIds;
  }, [allKnownStaffMap, effectiveChatUserId, noticeRoomMemberIds]);

  const isRoomAccessibleToCurrentUser = useCallback((room: ChatRoom | null | undefined) => {
    if (!room) return false;
    if (String(room.id) === NOTICE_ROOM_ID) return true;
    return getEffectiveRoomMemberIds(room).includes(effectiveChatUserId);
  }, [effectiveChatUserId, getEffectiveRoomMemberIds]);

  const repairDirectRooms = useCallback(async (rooms: ChatRoom[]) => {
    const sourceRooms = Array.isArray(rooms) ? rooms : [];
    const orphanRooms = sourceRooms.filter(( room: ChatRoom) =>
      room?.type === 'direct' && (!Array.isArray(room.members) || room.members.length === 0)
    );
    if (orphanRooms.length === 0) {
      return sourceRooms;
    }

    try {
      const orphanRoomIds = orphanRooms
        .map(( room: ChatRoom) => String(room?.id || '').trim())
        .filter(Boolean);
      if (orphanRoomIds.length === 0) {
        return sourceRooms;
      }

      const { data: roomMessages, error } = await supabase
        .from('messages')
        .select('room_id, sender_id, created_at')
        .in('room_id', orphanRoomIds)
        .not('sender_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const senderIdsByRoom = new Map<string, Set<string>>();
      (roomMessages || []).forEach(( message: Record<string, unknown>) => {
        const roomId = String(message?.room_id || '').trim();
        const senderId = String(message?.sender_id || '').trim();
        if (!roomId || !senderId || senderId === 'null' || senderId === 'undefined') return;
        const senders = senderIdsByRoom.get(roomId) || new Set<string>();
        senders.add(senderId);
        senderIdsByRoom.set(roomId, senders);
      });

      const repairedRooms = [...sourceRooms];
      for (const room of orphanRooms) {
        const roomId = String(room?.id || '').trim();
        const inferredMembers = Array.from(senderIdsByRoom.get(roomId) || []);
        if (inferredMembers.length !== 2) continue;

        const { error: updateError } = await supabase
          .from('chat_rooms')
          .update({ members: inferredMembers })
          .eq('id', roomId);
        if (updateError) throw updateError;

        const roomIndex = repairedRooms.findIndex((candidate: ChatRoom) => String(candidate?.id) === roomId);
        if (roomIndex >= 0) {
          repairedRooms[roomIndex] = {
            ...repairedRooms[roomIndex],
            members: inferredMembers,
          };
        }
      }

      return repairedRooms;
    } catch (error) {
      console.error('repairDirectRooms failed', error);
      return sourceRooms;
    }
  }, []);

  const setRoom = (roomId: string | null) => {
    const previousSelectedRoomId = selectedRoomIdRef.current;
    const conversationRoomIds = roomId
      ? getConversationRoomIdsByRoomId(roomId, chatRoomsRef.current as ChatRoom[])
      : [];
    // 현재 방의 입력 draft 저장
    if (previousSelectedRoomId && previousSelectedRoomId !== roomId) {
      draftMapRef.current.set(previousSelectedRoomId, inputMsgRef.current);
    }
    pendingBottomAlignRoomIdRef.current = roomId;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    if (previousSelectedRoomId !== roomId) {
      lastTimelineTailRef.current = '';
      setMessages([]);
      setReadCounts({});
      setRoomReadCursorMap({});
      setActiveActionMsg(null);
      setEditingMessage(null);
      setEditingMessageDraft('');
      setReplyTo(null);
      setReactions({});
      setReactionUsersByMessage({});
      setPolls([]);
      setPollVotes({});
      setPinnedIds([]);
      setPersistedPinnedMessages([]);
      setBookmarkedIds(new Set());
      setUnreadModalMsg(null);
      setReactionDetailTarget(null);
      // sent 상태 메시지의 deliveryState 정리 (메모리 누적 방지)
      setDeliveryStates((prev) => {
        const next: Record<string, DeliveryState> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.status !== 'sent') next[k] = v;
        }
        return next;
      });
    }
    selectedRoomIdRef.current = roomId;
    setSelectedRoomId(roomId);
    // 새 방의 저장된 draft 복원
    const savedDraft = (roomId ? draftMapRef.current.get(roomId) : '') || '';
    inputMsgRef.current = savedDraft;
    setInputMsg(savedDraft);
    // 채팅방 열 때 해당 방 관련 미읽 알림/안읽음 개수 즉시 정리
    if (roomId && effectiveChatUserId) {
      const readAt = new Date().toISOString();
      const targetRoomIds = conversationRoomIds.length > 0 ? conversationRoomIds : [String(roomId)];
      setRoomUnreadCounts((prev) => {
        let changed = false;
        const next = { ...prev };
        targetRoomIds.forEach((targetRoomId) => {
          if (!next[targetRoomId]) return;
          next[targetRoomId] = 0;
          changed = true;
        });
        return changed ? next : prev;
      });
      void (async () => {
        try {
          await Promise.allSettled([
            markConversationNotificationsAsRead(targetRoomIds, readAt),
            supabase.from('room_read_cursors').upsert(
              targetRoomIds.map((targetRoomId) => ({
                user_id: effectiveChatUserId,
                room_id: targetRoomId,
                last_read_at: readAt,
              })),
              { onConflict: 'user_id,room_id' }
            ),
          ]);
          broadcastChatSync('message-read', roomId);
        } catch { /* ignore */ }
      })();
    }
    if (typeof window === 'undefined') return;
    try {
      if (roomId) {
        window.localStorage.setItem(CHAT_ROOM_KEY, roomId);
        window.sessionStorage.setItem(CHAT_ACTIVE_ROOM_KEY, roomId);
      } else {
        window.localStorage.removeItem(CHAT_ROOM_KEY);
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      }
    } catch {
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedRoomId) {
        window.sessionStorage.setItem(CHAT_ACTIVE_ROOM_KEY, selectedRoomId);
      } else {
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      }
    } catch {
    }
    return () => {
      try {
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      } catch {
      }
    };
  }, [selectedRoomId]);

  const roomPrefsUserId = effectiveChatUserId || user?.id || null;

  const updateRoomPreference = useCallback((roomId: string, patch: RoomPreference) => {
    setRoomPrefs((prev) => {
      const next = {
        ...prev,
        [roomId]: {
          ...(prev[roomId] || {}),
          ...patch,
        },
      };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(getRoomPrefsStorageKey(roomPrefsUserId), JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      // DB 동기화 (비동기, 실패 시 localStorage만 유지)
      if (roomPrefsUserId) {
        const merged = next[roomId] || {};
        void supabase.from('chat_room_prefs').upsert({
          user_id: roomPrefsUserId,
          room_id: roomId,
          pinned: merged.pinned ?? false,
          hidden: merged.hidden ?? false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,room_id' }).then(({ error }) => {
          if (error) console.debug('chat_room_prefs DB sync skip:', error.message);
        });
      }
      return next;
    });
  }, [roomPrefsUserId]);

  const persistPinnedRoomOrder = useCallback((nextOrder: string[]) => {
    const normalized = Array.from(new Set(nextOrder.map((roomId) => String(roomId))));
    setPinnedRoomOrder(normalized);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          getPinnedRoomOrderStorageKey(roomPrefsUserId),
          JSON.stringify(normalized)
        );
      } catch {
        // ignore
      }
    }
  }, [roomPrefsUserId]);

  const toggleRoomPinned = useCallback((roomId: string, shouldPin: boolean) => {
    updateRoomPreference(roomId, { pinned: shouldPin });
    persistPinnedRoomOrder(
      shouldPin
        ? [...pinnedRoomOrder.filter((id) => String(id) !== String(roomId)), String(roomId)]
        : pinnedRoomOrder.filter((id) => String(id) !== String(roomId))
    );
  }, [persistPinnedRoomOrder, pinnedRoomOrder, updateRoomPreference]);

  const movePinnedRoom = useCallback((roomId: string, direction: 'up' | 'down') => {
    const currentOrder = [...pinnedRoomOrder];
    const currentIndex = currentOrder.findIndex((id) => String(id) === String(roomId));
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
    const [moved] = currentOrder.splice(currentIndex, 1);
    currentOrder.splice(targetIndex, 0, moved);
    persistPinnedRoomOrder(currentOrder);
  }, [persistPinnedRoomOrder, pinnedRoomOrder]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const listEl = messageListRef.current;
    if (listEl) {
      if (behavior === 'auto') {
        listEl.scrollTop = listEl.scrollHeight;
      } else {
        listEl.scrollTo({ top: listEl.scrollHeight, behavior });
      }
    } else {
      scrollRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
    if (!isMobileChatViewport()) {
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({
          behavior,
          block: 'end',
          inline: 'nearest',
        });
      });
    }
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, []);

  const alignRoomToLatest = useCallback((roomId: string | null | undefined, behavior: ScrollBehavior = 'auto') => {
    if (!roomId) return;

    let attempts = 0;
    const maxAttempts = 4;

    const tryAlign = () => {
      if (selectedRoomIdRef.current !== roomId) return;

      const hasTimelineItems = timelineItemCountRef.current > 0;
      if (!hasTimelineItems) {
        return;
      }

      scrollToBottom(attempts === 0 ? behavior : 'auto');

      const listEl = messageListRef.current;
      if (!listEl) {
        if (pendingBottomAlignRoomIdRef.current === roomId) {
          pendingBottomAlignRoomIdRef.current = null;
        }
        return;
      }

      const distanceFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
      if (distanceFromBottom > 24 && attempts < maxAttempts) {
        attempts += 1;
        requestAnimationFrame(() => {
          requestAnimationFrame(tryAlign);
        });
        return;
      }

      if (pendingBottomAlignRoomIdRef.current === roomId) {
        pendingBottomAlignRoomIdRef.current = null;
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryAlign);
    });

    window.setTimeout(tryAlign, 120);
    window.setTimeout(tryAlign, 260);
  }, [scrollToBottom]);

  const alignRoomToLatestImmediately = useCallback((roomId: string | null | undefined) => {
    if (!roomId) return;
    if (selectedRoomIdRef.current !== roomId) return;

    const listEl = messageListRef.current;
    const hasRenderedTimelineItems = Boolean(
      listEl?.querySelector('[data-testid^="chat-message-row-"], [data-testid^="chat-poll-"]')
    );
    if (!hasRenderedTimelineItems) return;

    if (listEl) {
      listEl.scrollTop = listEl.scrollHeight;
    } else {
      scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }

    if (!isMobileChatViewport()) {
      composerRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'end',
        inline: 'nearest',
      });
    }

    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, []);

  const handleRoomListClick = useCallback((roomId: string) => {
    const normalizedRoomId = String(roomId || '').trim();
    if (!normalizedRoomId) {
      setRoom(null);
      return;
    }

    const isSameRoom = String(selectedRoomIdRef.current || '') === normalizedRoomId;
    if (isSameRoom) {
      pendingBottomAlignRoomIdRef.current = normalizedRoomId;
      alignRoomToLatest(normalizedRoomId, 'auto');
      return;
    }

    setRoom(normalizedRoomId);
  }, [alignRoomToLatest]);

  const persistMessageReads = useCallback(async (messageIds: string[]) => {
    if (!effectiveChatUserId || messageIds.length === 0) return;
    if (!MESSAGE_READ_WRITES_ENABLED) return;

    const uniqueMessageIds = Array.from(new Set(messageIds.map((id) => String(id))));
    const candidateIds = uniqueMessageIds.filter((id) => !readWriteInFlightRef.current.has(id));
    if (candidateIds.length === 0) return;
    candidateIds.forEach((id) => readWriteInFlightRef.current.add(id));

    try {
      const readAt = new Date().toISOString();
      const { error } = await supabase.from('message_reads').upsert(
        candidateIds.map((id) => ({
          reader_id: effectiveChatUserId,
          user_id: effectiveChatUserId,
          message_id: id,
          read_at: readAt,
        })),
        { onConflict: 'user_id,message_id' }
      );
      if (error && error.code !== '23503' && error.code !== '42P10') {
        console.warn('message_reads upsert skipped', error);
      }
    } finally {
      candidateIds.forEach((id) => readWriteInFlightRef.current.delete(id));
    }
  }, [effectiveChatUserId]);

  const persistRoomReadCursor = useCallback(async (roomId: string | null | undefined, readAt?: string | null) => {
    if (!effectiveChatUserId || !roomId) return;
    try {
      await supabase.from('room_read_cursors').upsert({
        user_id: effectiveChatUserId,
        room_id: roomId,
        last_read_at: readAt || new Date().toISOString(),
      }, { onConflict: 'user_id,room_id' });
    } catch (error) {
      console.warn('room_read_cursors upsert skip', error);
    }
  }, [effectiveChatUserId]);

  const markConversationNotificationsAsRead = useCallback(async (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null
  ) => {
    if (!effectiveChatUserId) return;

    const targetRoomIds = Array.from(
      new Set(roomIds.map((roomId) => String(roomId || '').trim()).filter(Boolean))
    );
    if (targetRoomIds.length === 0) return;

    const resolvedReadAt = readAt || new Date().toISOString();
    await Promise.allSettled(
      targetRoomIds.map((targetRoomId) =>
        supabase
          .from('notifications')
          .update({ read_at: resolvedReadAt })
          .eq('user_id', effectiveChatUserId)
          .in('type', ['message', 'mention'])
          .is('read_at', null)
          .filter('metadata->>room_id', 'eq', targetRoomId)
      )
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-notification-read'));
    }
  }, [effectiveChatUserId]);

  // 채팅 전체 unread 합계가 0이 되면 message/mention 알림 레코드 일괄 read 처리 → 앱 아이콘 뱃지 클리어
  const prevTotalUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    if (!effectiveChatUserId) return;
    const total = Object.values(roomUnreadCounts).reduce((sum, n) => sum + (n || 0), 0);
    const roomCount = Object.keys(roomUnreadCounts).length;
    if (roomCount === 0) return; // 아직 방 목록 로드 전
    if (total === 0 && prevTotalUnreadRef.current !== 0) {
      prevTotalUnreadRef.current = 0;
      // 모든 message/mention 알림을 read 처리
      void supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', effectiveChatUserId)
        .in('type', ['message', 'mention'])
        .is('read_at', null)
        .then(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp-notification-read'));
          }
        });
    } else {
      prevTotalUnreadRef.current = total;
    }
  }, [roomUnreadCounts, effectiveChatUserId]);

  const updateScrollPositionState = useCallback(() => {
    const listEl = messageListRef.current;
    if (!listEl) return;
    if (selectedRoomId && pendingBottomAlignRoomIdRef.current === selectedRoomId) {
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      return;
    }
    const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 96;
    isNearBottomRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom && Boolean(selectedRoomId));
  }, [selectedRoomId]);

  const broadcastChatSync = useCallback((action: string, roomId?: string | null) => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-chat-sync', {
          detail: {
            action,
            roomId: roomId || selectedRoomId || null,
            at: Date.now(),
          },
        }));
      }
      if (!syncChannelRef.current) return;
      syncChannelRef.current.postMessage({
        action,
        roomId: roomId || selectedRoomId || null,
        at: Date.now(),
      });
    } catch {
      // ignore
    }
  }, [selectedRoomId]);

  const triggerChatPush = useCallback(async (roomId: string, messageId: string) => {
    try {
      const response = await fetch('/api/notifications/chat-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, messageId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `push trigger failed (${response.status})`);
      }
    } catch (error) {
      console.error('chat push trigger failed', error);
    }
  }, []);

  const persistRoomMembers = useCallback(async (roomId: string, members: string[]) => {
    const { error } = await supabase
      .from('chat_rooms')
      .update({ members })
      .eq('id', roomId);

    if (error) {
      throw error;
    }
  }, []);

  const updateRoomMembersLocally = useCallback((roomId: string, members: string[]) => {
    setChatRooms((prev) =>
      prev.map((room: ChatRoom) =>
        String(room.id) === String(roomId)
          ? { ...room, members }
          : room
      )
    );
  }, []);

  const insertRoomSystemMessage = useCallback(async (roomId: string, content: string) => {
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          room_id: roomId,
          sender_id: effectiveChatUserId || user?.id || null,
          content,
        },
      ])
      .select('id, room_id')
      .single();

    if (error) {
      throw error;
    }

    if (data?.id && data?.room_id) {
      void triggerChatPush(String(data.room_id), String(data.id));
    }

    return data;
  }, [effectiveChatUserId, triggerChatPush, user?.id]);

  const emitTypingState = useCallback((isTyping: boolean) => {
    if (!typingChannelRef.current || !selectedRoomId || !effectiveChatUserId) return;
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        roomId: selectedRoomId,
        userId: String(effectiveChatUserId),
        name: user?.name || 'Unknown',
        isTyping,
      },
    });
  }, [selectedRoomId, effectiveChatUserId, user?.name]);

  const handleComposerChange = useCallback((value: string, caret: number) => {
    inputMsgRef.current = value;
    setInputMsg(value);
    const upToCaret = value.slice(0, caret);
    const match = upToCaret.match(/@([^\s@]{0,20})$/);
    if (match) {
      setMentionQuery(match[1] || '');
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
      setMentionQuery('');
    }

    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }

    if (value.trim()) {
      emitTypingState(true);
      typingClearRef.current = setTimeout(() => {
        emitTypingState(false);
        typingClearRef.current = null;
      }, 1800);
    } else {
      emitTypingState(false);
    }
  }, [emitTypingState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 1) localStorage에서 즉시 로드 (빠른 초기화)
    try {
      const raw = window.localStorage.getItem(getRoomPrefsStorageKey(roomPrefsUserId));
      setRoomPrefs(raw ? JSON.parse(raw) : {});
    } catch {
      setRoomPrefs({});
    }
    try {
      const rawPinnedOrder = window.localStorage.getItem(getPinnedRoomOrderStorageKey(roomPrefsUserId));
      const parsedPinnedOrder = rawPinnedOrder ? JSON.parse(rawPinnedOrder) : [];
      setPinnedRoomOrder(Array.isArray(parsedPinnedOrder) ? parsedPinnedOrder.map((value) => String(value)) : []);
    } catch {
      setPinnedRoomOrder([]);
    }
    // 2) DB에서 최신 설정 로드 (chat_room_prefs 테이블이 없으면 graceful skip)
    if (roomPrefsUserId) {
      void supabase
        .from('chat_room_prefs')
        .select('room_id, pinned, hidden')
        .eq('user_id', roomPrefsUserId)
        .then(({ data, error }) => {
          if (error || !Array.isArray(data) || data.length === 0) return;
          const dbPrefs: Record<string, RoomPreference> = {};
          data.forEach((row: Record<string, unknown>) => {
            const rid = String(row.room_id || '');
            if (rid) dbPrefs[rid] = { pinned: Boolean(row.pinned), hidden: Boolean(row.hidden) };
          });
          if (Object.keys(dbPrefs).length > 0) {
            setRoomPrefs(dbPrefs);
            try {
              window.localStorage.setItem(getRoomPrefsStorageKey(roomPrefsUserId), JSON.stringify(dbPrefs));
            } catch { /* ignore */ }
          }
        });
    }
  }, [roomPrefsUserId]);

  useEffect(() => {
    deliveryStatesRef.current = deliveryStates;
  }, [deliveryStates]);

  useEffect(() => {
    const composerEl = composerRef.current;
    if (!composerEl) return;
    composerEl.style.height = '0px';
    composerEl.style.height = `${Math.min(120, composerEl.scrollHeight)}px`;
  }, [inputMsg]);

  const [polls, setPolls] = useState<PollItem[]>([]);
  const [pollVotes, setPollVotes] = useState<Record<string, Record<number, number>>>({});
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [reactionUsersByMessage, setReactionUsersByMessage] = useState<ReactionUsersByMessage>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
const [pollOptions, setPollOptions] = useState<string[]>(['찬성', '반대']);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');

  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardSourceMsg, setForwardSourceMsg] = useState<ChatMessage | null>(null);

  useEffect(() => {
    timelineItemCountRef.current = messages.length + polls.length + persistedPinnedMessages.length;
  }, [messages.length, persistedPinnedMessages.length, polls.length]);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const activeAttachmentPreview = attachmentPreview
    ? attachmentPreview.items[attachmentPreview.activeIndex] ?? null
    : null;
  const attachmentPreviewCount = attachmentPreview?.items.length ?? 0;
  const canNavigateAttachmentPreview = attachmentPreviewCount > 1;
  const [attachmentZoom, setAttachmentZoom] = useState(1);
  const [attachmentOffset, setAttachmentOffset] = useState({ x: 0, y: 0 });
  const attachmentZoomRef = useRef(1);
  const attachmentOffsetRef = useRef({ x: 0, y: 0 });
  const attachmentDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const deferredAddMemberSearch = useDeferredValue(addMemberSearch);
  const [addMemberSelectingIds, setAddMemberSelectingIds] = useState<string[]>([]);
  // 기본 접힌 상태 — 펼쳐진 팀만 별도 추적
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const toggleDept = (key: string) =>
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreview(null);
  }, []);

  useEffect(() => {
    attachmentZoomRef.current = attachmentZoom;
  }, [attachmentZoom]);

  useEffect(() => {
    attachmentOffsetRef.current = attachmentOffset;
  }, [attachmentOffset]);

  const resetAttachmentImageTransform = useCallback(() => {
    attachmentDragRef.current = null;
    setAttachmentZoom(1);
    setAttachmentOffset({ x: 0, y: 0 });
  }, []);

  const buildAttachmentPreviewItem = useCallback(
    (
      url: string | null | undefined,
      fileName?: string | null,
      forcedKind?: AttachmentPreviewKind,
    ): AttachmentPreviewItem | null => {
      const resolvedUrl = String(url || '').trim();
      if (!resolvedUrl) return null;

      return {
        url: resolvedUrl,
        name: getAttachmentDisplayName(fileName, resolvedUrl),
        kind: forcedKind || resolveAttachmentKind(resolvedUrl, null),
      };
    },
    []
  );

  const openAttachmentPreviewGallery = useCallback(
    (items: AttachmentPreviewItem[], startIndex = 0) => {
      const normalizedItems = items.filter((item) => String(item?.url || '').trim());
      if (!normalizedItems.length) return;

      const normalizedIndex = Math.max(0, Math.min(normalizedItems.length - 1, startIndex));
      setAttachmentPreview({
        items: normalizedItems,
        activeIndex: normalizedIndex,
      });
    },
    []
  );

  const openAttachmentPreview = useCallback(
    (url: string | null | undefined, fileName?: string | null, forcedKind?: AttachmentPreviewKind) => {
      const previewItem = buildAttachmentPreviewItem(url, fileName, forcedKind);
      if (!previewItem) return;

      openAttachmentPreviewGallery([previewItem], 0);
    },
    [buildAttachmentPreviewItem, openAttachmentPreviewGallery]
  );

  useEffect(() => {
    resetAttachmentImageTransform();
  }, [activeAttachmentPreview?.kind, activeAttachmentPreview?.url, resetAttachmentImageTransform]);

  const moveAttachmentPreview = useCallback((delta: number) => {
    setAttachmentPreview((prev) => {
      if (!prev || prev.items.length <= 1) return prev;

      const nextIndex = (prev.activeIndex + delta + prev.items.length) % prev.items.length;
      if (nextIndex === prev.activeIndex) return prev;

      return {
        ...prev,
        activeIndex: nextIndex,
      };
    });
  }, []);

  useEffect(() => {
    if (!attachmentPreview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAttachmentPreview();
        return;
      }

      if (!canNavigateAttachmentPreview) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveAttachmentPreview(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveAttachmentPreview(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [attachmentPreview, canNavigateAttachmentPreview, closeAttachmentPreview, moveAttachmentPreview]);

  const applyAttachmentZoom = useCallback(
    (nextZoom: number) => {
      const clamped = Math.max(1, Math.min(4, Number(nextZoom.toFixed(2))));
      setAttachmentZoom(clamped);
      if (clamped <= 1) {
        attachmentDragRef.current = null;
        setAttachmentOffset({ x: 0, y: 0 });
      }
    },
    []
  );

  const nudgeAttachmentZoom = useCallback(
    (delta: number) => {
      applyAttachmentZoom(attachmentZoomRef.current + delta);
    },
    [applyAttachmentZoom]
  );

  const handleAttachmentImageWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      nudgeAttachmentZoom(event.deltaY < 0 ? 0.25 : -0.25);
    },
    [nudgeAttachmentZoom]
  );

  const handleAttachmentImagePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (attachmentZoomRef.current <= 1) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: attachmentOffsetRef.current.x,
      originY: attachmentOffsetRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleAttachmentImagePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = attachmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setAttachmentOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }, []);

  const handleAttachmentImagePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = attachmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    attachmentDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleAttachmentImageDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      applyAttachmentZoom(attachmentZoomRef.current > 1 ? 1 : 2);
    },
    [applyAttachmentZoom]
  );

  useEffect(() => {
    if (!activeAttachmentPreview) return;
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (activeAttachmentPreview.kind !== 'image') return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        nudgeAttachmentZoom(0.25);
      } else if (event.key === '-') {
        event.preventDefault();
        nudgeAttachmentZoom(-0.25);
      } else if (event.key === '0') {
        event.preventDefault();
        applyAttachmentZoom(1);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [activeAttachmentPreview, applyAttachmentZoom, nudgeAttachmentZoom]);

  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);

  const [slashCommand, setSlashCommand] = useState<'annual_leave' | 'purchase' | null>(null);
  const [showSlashModal, setShowSlashModal] = useState(false);
  const [slashForm, setSlashForm] = useState<{ startDate: string; endDate: string; reason: string; itemName: string; quantity: number }>({
    startDate: '',
    endDate: '',
    reason: '',
    itemName: '',
    quantity: 1,
  });

  const updateUnreadForRooms = useCallback(
    async (rooms: ChatRoom[]) => {
      if (!effectiveChatUserId || !rooms?.length) return;
      try {
        // 내가 멤버인 방만 카운트 (NOTICE_ROOM_ID 포함)
        const myRooms = rooms.filter(( r: ChatRoom) => {
          if (r.id === NOTICE_ROOM_ID) return true;
          if (Array.isArray(r.members)) {
            return r.members.some((id: unknown) => String(id) === effectiveChatUserId);
          }
          return false;
        });
        if (!myRooms.length) return;
        const roomIds = myRooms.map(( r: ChatRoom) => r.id);
        const { data: cursors } = await supabase
          .from('room_read_cursors')
          .select('room_id, last_read_at')
          .eq('user_id', effectiveChatUserId)
          .in('room_id', roomIds);

        const cursorMap: Record<string, string | null> = {};
        (cursors || []).forEach((c: Record<string, unknown>) => {
          cursorMap[c.room_id as string] = c.last_read_at as string | null;
        });

        // 현재 열린 대화방 ID 세트 사전 계산 — DB 조회 없이 즉시 0 처리 (race condition 방지)
        const activeRoomId = pendingBottomAlignRoomIdRef.current || selectedRoomIdRef.current;
        const openConversationRoomIds = getConversationRoomIdSet(
          activeRoomId,
          myRooms as ChatRoom[]
        );
        // 활성 방은 즉시 0 처리, 나머지만 실제 쿼리 대상으로 분류
        const queryRoomIds = roomIds.filter(
          (id) => !openConversationRoomIds.has(id) && id !== activeRoomId
        );

        // N+1 방지: 최대 5개씩 청크로 나눠 순차 처리 (병렬 폭풍 방지)
        const CHUNK_SIZE = 5;
        const queriedEntries: [string, number][] = [];
        for (let i = 0; i < queryRoomIds.length; i += CHUNK_SIZE) {
          const chunk = queryRoomIds.slice(i, i + CHUNK_SIZE);
          const chunkResults = await Promise.all(
            chunk.map(async (roomId): Promise<[string, number]> => {
              const last = cursorMap[roomId];
              let query = supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', roomId)
                .neq('sender_id', effectiveChatUserId)
                .eq('is_deleted', false);
              if (last) query = query.gt('created_at', last);
              const { count } = await query;
              return [roomId, count || 0];
            })
          );
          queriedEntries.push(...chunkResults);
        }

        // 활성 방 0 엔트리 합산
        const activeEntries: [string, number][] = roomIds
          .filter((id) => openConversationRoomIds.has(id) || id === activeRoomId)
          .map((id): [string, number] => [id, 0]);

        const countEntries: [string, number][] = [...activeEntries, ...queriedEntries];
        const counts = Object.fromEntries(countEntries);
        // myRooms에 없는 활성 방도 0 보장
        if (activeRoomId) counts[activeRoomId] = 0;
        openConversationRoomIds.forEach((id) => { counts[id] = 0; });
        setRoomUnreadCounts(counts);
      } catch (e) {
        console.error('채팅방별 안읽은 메시지 계산 실패:', e);
      }
    },
    [effectiveChatUserId]
  );

  const syncChatRoomsState = useCallback(async (rooms: ChatRoom[]) => {
    const repairedRooms = await repairDirectRooms(rooms);
    const list = sortChatRoomsWithNoticeFirst(repairedRooms || []);
    setChatRooms(list);
    await updateUnreadForRooms(list);
    return list;
  }, [repairDirectRooms, updateUnreadForRooms]);

  const buildRoomSummaryFromMessages = useCallback((roomId: string | null | undefined, sourceMessages: ChatMessage[]) => {
    const targetRoomId = String(roomId || '').trim();
    if (!targetRoomId) {
      return {
        last_message: null,
        last_message_preview: null,
        last_message_at: null,
      };
    }

    const roomScopedMessages = sourceMessages.filter(
      (message: ChatMessage) => String(message.room_id || '').trim() === targetRoomId
    );
    const summarySourceMessages = roomScopedMessages.length > 0 ? roomScopedMessages : sourceMessages;

    let latestMessage: ChatMessage | undefined;
    let latestMessageTime = Number.NEGATIVE_INFINITY;
    summarySourceMessages.forEach((message: ChatMessage) => {
      const createdAt = new Date(message.created_at || 0).getTime();
      if (!Number.isFinite(createdAt)) return;
      if (createdAt >= latestMessageTime) {
        latestMessageTime = createdAt;
        latestMessage = message;
      }
    });

    if (!latestMessage) {
      return {
        last_message: null,
        last_message_preview: null,
        last_message_at: null,
      };
    }

    const resolvedLatestMessage = latestMessage as ChatMessage;
    const previewText = resolvedLatestMessage.is_deleted
      ? getDeletedMessagePreviewText()
      : getMessageDisplayText(
          resolvedLatestMessage.content,
          resolvedLatestMessage.file_name,
          resolvedLatestMessage.file_url,
          ''
        ) || null;

    return {
      last_message: previewText,
      last_message_preview: previewText,
      last_message_at: resolvedLatestMessage.created_at || null,
    };
  }, []);

  const applyRoomSummaryToState = useCallback(
    (
      roomId: string | null | undefined,
      summary: { last_message: string | null; last_message_preview: string | null; last_message_at: string | null }
    ) => {
      const targetRoomId = String(roomId || '').trim();
      if (!targetRoomId) return;
      setChatRooms((prev) => {
        if (!prev.some((room: ChatRoom) => String(room.id) === targetRoomId)) return prev;
        return sortChatRoomsWithNoticeFirst(
          prev.map((room: ChatRoom) =>
            String(room.id) === targetRoomId
              ? {
                  ...room,
                  last_message: summary.last_message,
                  last_message_preview: summary.last_message_preview,
                  last_message_at: summary.last_message_at,
                }
              : room
          )
        );
      });
    },
    []
  );

  const persistRoomSummary = useCallback(
    async (
      roomId: string | null | undefined,
      summary: { last_message_preview: string | null; last_message_at: string | null }
    ) => {
      const targetRoomId = String(roomId || '').trim();
      if (!targetRoomId) return;
      const { error } = await supabase
        .from('chat_rooms')
        .update({
          last_message_preview: summary.last_message_preview,
          last_message_at: summary.last_message_at,
        })
        .eq('id', targetRoomId);
      if (error) {
        console.error('채팅방 미리보기 갱신 실패:', error);
      }
    },
    []
  );

  const syncRoomSummaryFromMessages = useCallback(
    (roomId: string | null | undefined, sourceMessages: ChatMessage[]) => {
      const summary = buildRoomSummaryFromMessages(roomId, sourceMessages);
      applyRoomSummaryToState(roomId, summary);
      void persistRoomSummary(roomId, summary);
      return summary;
    },
    [applyRoomSummaryToState, buildRoomSummaryFromMessages, persistRoomSummary]
  );

  const claimIncomingRealtimeMessage = useCallback((messageId: string | null | undefined) => {
    const nextId = String(messageId || '').trim();
    if (!nextId) return false;

    const now = Date.now();
    const seen = incomingRealtimeMessageIdsRef.current;
    seen.forEach((timestamp, key) => {
      if (now - timestamp > 15000) {
        seen.delete(key);
      }
    });

    const previous = seen.get(nextId);
    if (previous && now - previous < 5000) {
      return false;
    }

    seen.set(nextId, now);
    return true;
  }, []);

  const isRoomInSelectedConversation = useCallback((roomId: string | null | undefined, rooms?: ChatRoom[]) => {
    const nextRoomId = String(roomId || '').trim();
    const selectedId = String(selectedRoomIdRef.current || '').trim();
    if (!nextRoomId || !selectedId) return false;
    if (nextRoomId === selectedId) return true;

    const sourceRooms = Array.isArray(rooms) ? rooms : chatRoomsRef.current;
    const selectedRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === selectedId) || null;
    const incomingRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === nextRoomId) || null;
    if (!selectedRoom || !incomingRoom) return false;

    const selectedRoomKey = getDirectRoomMembersKey(selectedRoom);
    if (!selectedRoomKey) return false;
    return selectedRoomKey === getDirectRoomMembersKey(incomingRoom);
  }, []);

  const scheduleRealtimeReconnect = useCallback((scope: 'global' | 'room') => {
    const retryRef = scope === 'global' ? globalRealtimeRetryTimerRef : roomRealtimeRetryTimerRef;
    if (retryRef.current) return;

    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      if (scope === 'global') {
        setGlobalRealtimeRetryToken((prev) => prev + 1);
      } else {
        setRoomRealtimeRetryToken((prev) => prev + 1);
      }
    }, 1200);
  }, []);

  const handleIncomingRealtimeMessage = useCallback(async (row: ChatMessage) => {
    if (!row?.id || !row.room_id) return;
    if (!claimIncomingRealtimeMessage(row.id)) return;

    const roomId = String(row.room_id);
    const currentRooms = chatRoomsRef.current;
    const currentRoom = currentRooms.find((room: ChatRoom) => String(room.id) === roomId) || null;
    const conversationRoomIds = getConversationRoomIdsByRoomId(roomId, currentRooms as ChatRoom[]);
    if (currentRoom && !isRoomAccessibleToCurrentUser(currentRoom)) return;

    const currentConversationRoomId = String(selectedRoomIdRef.current || roomId);
    const isCurrentRoom = isRoomInSelectedConversation(roomId, currentRooms);
    const isOwnMessage = String(row.sender_id || '') === String(effectiveChatUserId || '');
    const previewText = getMessageDisplayText(
      row.content,
      row.file_name,
      row.file_url,
      currentRoom?.last_message_preview || currentRoom?.last_message || ''
    );

    setChatRooms((prev) => {
      if (!prev.some((room: ChatRoom) => String(room.id) === roomId)) return prev;
      return sortChatRoomsWithNoticeFirst(
        prev.map((room: ChatRoom) =>
          String(room.id) === roomId
            ? {
                ...room,
                last_message: previewText || room.last_message,
                last_message_preview: previewText || room.last_message_preview,
                last_message_at: row.created_at || new Date().toISOString(),
              }
            : room
        )
      );
    });

    if (isCurrentRoom) {
      pendingBottomAlignRoomIdRef.current = currentConversationRoomId;
      setMessages((prev) => {
        if (prev.some((message: ChatMessage) => String(message.id) === String(row.id))) return prev;
        const newMsg = {
          ...row,
          staff: resolveStaffProfile(row.sender_id, row.sender_name) || { name: '이름 없음', photo_url: null },
        };
        const optimisticIndex = prev.findIndex((message: ChatMessage) => {
          if (!String(message.id || '').startsWith('temp-')) return false;
          if (String(message.room_id || '') !== String(row.room_id || '')) return false;
          if (String(message.sender_id || '') !== String(row.sender_id || '')) return false;
          return (
            (message.content || '') === (row.content || '') &&
            (message.file_url || null) === (row.file_url || null)
          );
        });
        if (optimisticIndex >= 0) {
          return prev.map((message: ChatMessage, index: number) =>
            index === optimisticIndex ? newMsg : message
          );
        }
        return [...prev, newMsg];
      });

      if (!isOwnMessage && user?.id) {
        const readAt = new Date().toISOString();
        void persistMessageReads([String(row.id)])
          .then(async () => {
            await Promise.allSettled(
              (conversationRoomIds.length > 0 ? conversationRoomIds : [roomId]).map((targetRoomId) =>
                persistRoomReadCursor(targetRoomId, readAt)
              )
            );
            await markConversationNotificationsAsRead(
              [...(conversationRoomIds.length > 0 ? conversationRoomIds : [roomId]), currentConversationRoomId],
              readAt
            );
            broadcastChatSync('message-read', roomId);
          })
          .catch(() => {});
        setRoomUnreadCounts((prev) => {
          let changed = false;
          const next = { ...prev };
          const targetRoomIds = Array.from(
            new Set(
              [
                ...(conversationRoomIds.length > 0 ? conversationRoomIds : [roomId]),
                currentConversationRoomId,
              ].filter(Boolean)
            )
          );
          targetRoomIds.forEach((targetRoomId) => {
            if (!next[targetRoomId]) return;
            next[targetRoomId] = 0;
            changed = true;
          });
          return changed ? next : prev;
          });
      }
      return;
    }

    // 인앱 토스트 알림: 다른 방 메시지 or 앱이 백그라운드 상태일 때
    if (!isOwnMessage) {
      setRoomUnreadCounts((prev) => ({
        ...prev,
        [roomId]: Math.max(1, (prev[roomId] || 0) + 1),
      }));
    }
  }, [
    broadcastChatSync,
    claimIncomingRealtimeMessage,
    effectiveChatUserId,
    isRoomAccessibleToCurrentUser,
    markConversationNotificationsAsRead,
    persistMessageReads,
    persistRoomReadCursor,
    updateUnreadForRooms,
    user?.id,
    isRoomInSelectedConversation,
  ]);

  const fetchMessageByIdWithRetry = useCallback(async (messageId: string, attempts = 3) => {
    const targetMessageId = String(messageId || '').trim();
    if (!targetMessageId) return null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const { data } = await selectChatMessagesWithFallback<ChatMessage>((selectClause) =>
          supabase
            .from('messages')
            .select(selectClause)
            .eq('id', targetMessageId)
            .maybeSingle() as PromiseLike<{ data: ChatMessage | null; error: unknown }>
        );
        if (data) return data;
      } catch {
        // ignore and retry below
      }

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }

    return null;
  }, []);

  const syncNoticeRoomMembers = useCallback(async (rooms?: ChatRoom[]) => {
    const sourceRooms = Array.isArray(rooms) ? rooms : chatRoomsRef.current;
    const noticeRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID);
    if (!noticeRoom) return;

    const currentMemberIds = normalizeMemberIds(noticeRoom.members);
    if (haveSameMembers(currentMemberIds, noticeRoomMemberIds)) return;

    try {
      const { error } = await supabase
        .from('chat_rooms')
        .update({ name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds })
        .eq('id', NOTICE_ROOM_ID);
      if (error) throw error;
    } catch (error) {
      console.error('공지방 참여자 동기화 실패:', error);
    }
  }, [noticeRoomMemberIds]);

  const ensureSelfChatRoom = useCallback(
    async (rooms: ChatRoom[]) => {
      const currentUserId = String(effectiveChatUserId || '').trim();
      const sourceRooms = Array.isArray(rooms) ? rooms : [];
      if (!currentUserId) return sourceRooms;

      const existingSelfRooms = sourceRooms
        .filter((room: ChatRoom) => isSelfChatRoom(room, currentUserId))
        .sort(
          (a: ChatRoom, b: ChatRoom) =>
            new Date(b.last_message_at || b.created_at || 0).getTime() -
            new Date(a.last_message_at || a.created_at || 0).getTime()
        );
      const existingSelfRoom = existingSelfRooms[0];

      if (existingSelfRoom) {
        const nextMembers = [currentUserId];
        const currentMembers = normalizeMemberIds(existingSelfRoom.members);
        const needsUpdate =
          existingSelfRoom.name !== SELF_ROOM_NAME ||
          existingSelfRoom.type !== 'direct' ||
          currentMembers.length !== 1 ||
          currentMembers[0] !== currentUserId;

        if (!needsUpdate) return sourceRooms;

        try {
          const { error } = await supabase
            .from('chat_rooms')
            .update({ name: SELF_ROOM_NAME, type: 'direct', members: nextMembers })
            .eq('id', existingSelfRoom.id);
          if (error) throw error;
        } catch (error) {
          console.error('나와의 채팅 동기화 실패:', error);
        }

        return sourceRooms
          .filter(
            (room: ChatRoom) =>
              !isSelfChatRoom(room, currentUserId) || String(room.id) === String(existingSelfRoom.id)
          )
          .map((room: ChatRoom) =>
            String(room.id) === String(existingSelfRoom.id)
              ? { ...room, name: SELF_ROOM_NAME, type: 'direct' as const, members: nextMembers }
              : room
          );
      }

      if (selfChatCreationInFlightRef.current) {
        return sourceRooms;
      }

      selfChatCreationInFlightRef.current = true;
      try {
        const { data: insertedRoom, error } = (await supabase
          .from('chat_rooms')
          .insert([{ name: SELF_ROOM_NAME, type: 'direct', members: [currentUserId] }])
          .select(CHAT_ROOM_SELECT)
          .single()) as { data: ChatRoom | null; error: unknown };
        if (error) throw error;
        if (!insertedRoom) return sourceRooms;
        return [...sourceRooms, insertedRoom];
      } catch (error) {
        console.error('나와의 채팅 생성 실패:', error);
        return sourceRooms;
      } finally {
        selfChatCreationInFlightRef.current = false;
      }
    },
    [effectiveChatUserId]
  );

  useEffect(() => {
    chatRoomsRef.current = chatRooms;
  }, [chatRooms]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldRestoreSavedRoomOnMount = !isMobileChatViewport();
    try {
      const saved = window.localStorage.getItem(CHAT_ROOM_KEY);
      if (shouldRestoreSavedRoomOnMount && saved && saved !== 'null' && saved !== 'undefined') {
        pendingBottomAlignRoomIdRef.current = saved;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        setSelectedRoomId(saved);
      } else {
        pendingBottomAlignRoomIdRef.current = shouldRestoreSavedRoomOnMount ? NOTICE_ROOM_ID : null;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        setSelectedRoomId(shouldRestoreSavedRoomOnMount ? NOTICE_ROOM_ID : null);
      }
    } catch {
      pendingBottomAlignRoomIdRef.current = shouldRestoreSavedRoomOnMount ? NOTICE_ROOM_ID : null;
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      setSelectedRoomId(shouldRestoreSavedRoomOnMount ? NOTICE_ROOM_ID : null);
    }
  }, []);

  useEffect(() => {
    if (initialRoomRestoreSyncedRef.current) return;
    if (selectedRoomId === null) {
      initialRoomRestoreSyncedRef.current = true;
      return;
    }
    if (chatRooms.length === 0) return;

    initialRoomRestoreSyncedRef.current = true;
    setRoom(String(selectedRoomId));
  }, [chatRooms.length, selectedRoomId]);

  useEffect(() => {
    if (initialOpenChatRoomId) {
      setRoom(initialOpenChatRoomId);
      if (initialOpenMessageId) {
        pendingScrollMsgIdRef.current = initialOpenMessageId;
      }
      onConsumeOpenChatRoomId?.();
    }
  }, [initialOpenChatRoomId, initialOpenMessageId]);

  useEffect(() => {
    if (!chatListResetToken) return;
    if (chatListResetToken === lastHandledChatListResetTokenRef.current) return;

    lastHandledChatListResetTokenRef.current = chatListResetToken;
    pendingScrollMsgIdRef.current = null;
    pendingBottomAlignRoomIdRef.current = null;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    setViewMode('chat');
    setShowDrawer(false);
    setRoom(null);
    onConsumeOpenChatRoomId?.();
  }, [chatListResetToken, onConsumeOpenChatRoomId]);

  useEffect(() => {
    const targetMsgId = pendingScrollMsgIdRef.current;
    if (targetMsgId && messages.length > 0) {
      if (messages.some(m => m.id === targetMsgId)) {
        setTimeout(() => {
          scrollToMessage(targetMsgId);
          pendingScrollMsgIdRef.current = null;
        }, 500);
      }
    }
  }, [messages]);

  const fetchData = useCallback(async () => {
    if (!selectedRoomId) return;
    const roomIdForFetch = String(selectedRoomId);
    const requestSeq = fetchDataRequestSeqRef.current + 1;
    fetchDataRequestSeqRef.current = requestSeq;
    const isCurrentRequest = () =>
      fetchDataRequestSeqRef.current === requestSeq &&
      String(selectedRoomIdRef.current || '') === roomIdForFetch;

    const { data: roomRows } = (await supabase.from('chat_rooms').select(CHAT_ROOM_SELECT)) as {
      data: ChatRoom[] | null;
      error: unknown;
    };
    if (!isCurrentRequest()) return;
    const repairedRooms = await repairDirectRooms(roomRows || []);
    if (!isCurrentRequest()) return;
    const selectedRoomRecord =
      repairedRooms.find(( room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
    const list = await syncChatRoomsState(repairedRooms);
    if (!isCurrentRequest()) return;

    if (!selectedRoomRecord || !isRoomAccessibleToCurrentUser(selectedRoomRecord)) {
      const fallbackRoomId =
        list.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID && isRoomAccessibleToCurrentUser(room))?.id ||
        list.find((room: ChatRoom) => isRoomAccessibleToCurrentUser(room))?.id ||
        null;
      if (String(fallbackRoomId || '') !== roomIdForFetch) {
        setRoom(fallbackRoomId ? String(fallbackRoomId) : null);
      } else if (!fallbackRoomId) {
        setRoom(null);
      }
      return;
    }

    const selectedRoomKey = getDirectRoomMembersKey(selectedRoomRecord);
    const canonicalDirectRoom = selectedRoomKey
      ? repairedRooms
          .filter(( room: ChatRoom) => getDirectRoomMembersKey(room) === selectedRoomKey)
          .sort((a: ChatRoom, b: ChatRoom) =>
            new Date(b.last_message_at || b.created_at || 0).getTime() -
            new Date(a.last_message_at || a.created_at || 0).getTime()
          )[0]
      : null;
    if (canonicalDirectRoom?.id && String(canonicalDirectRoom.id) !== roomIdForFetch) {
      setRoom(String(canonicalDirectRoom.id));
    }
    if (!isCurrentRequest()) return;
    const roomIdsToLoad = Array.from(
      new Set(
        selectedRoomKey
          ? repairedRooms
              .filter(( room: ChatRoom) => getDirectRoomMembersKey(room) === selectedRoomKey)
              .map(( room: ChatRoom) => String(room.id))
          : [roomIdForFetch]
      )
    );

    const { data: msgs, error: messagesError } = await selectChatMessagesWithFallback<ChatMessage[]>(
      (selectClause) =>
        supabase
          .from('messages')
          .select(selectClause)
          .in('room_id', roomIdsToLoad)
          .order('created_at', { ascending: true }) as PromiseLike<{
            data: ChatMessage[] | null;
            error: unknown;
          }>
    );
    if (messagesError) {
      console.error('채팅 메시지 불러오기 실패:', messagesError);
      return;
    }
    if (!isCurrentRequest()) return;
    const loadedMessages = Array.isArray(msgs) ? msgs : [];
    if (msgs) {
      const enrichedMessages = loadedMessages.map((msg: ChatMessage) => {
        const matchedStaff = resolveStaffProfile(msg.sender_id);
        return {
          ...msg,
          staff: msg.staff || matchedStaff,
        };
      });
      setMessages((prev) => {
        const localOnly = prev.filter((msg: ChatMessage) => {
          const id = String(msg.id || '');
          return id.startsWith('temp-') && deliveryStatesRef.current[id]?.status !== 'sent';
        });
        return [...enrichedMessages, ...localOnly].sort(
          (a: ChatMessage, b: ChatMessage) =>
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      });
    }

    const messageIds = loadedMessages.map((msg: ChatMessage) => String(msg.id || '')).filter(Boolean);
    const roomMemberIds = getEffectiveRoomMemberIds(selectedRoomRecord);
    const fetchedRoomSummary = buildRoomSummaryFromMessages(roomIdForFetch, loadedMessages);
    applyRoomSummaryToState(roomIdForFetch, fetchedRoomSummary);
    const currentPreviewText =
      selectedRoomRecord?.last_message_preview ?? selectedRoomRecord?.last_message ?? null;
    const currentPreviewAt = selectedRoomRecord?.last_message_at ?? null;
    if (
      currentPreviewText !== fetchedRoomSummary.last_message_preview ||
      currentPreviewAt !== fetchedRoomSummary.last_message_at
    ) {
      await persistRoomSummary(roomIdForFetch, fetchedRoomSummary);
    }
    if (!isCurrentRequest()) return;

    const [
      roomReadCursorsResult,
      bookmarksResult,
      pinnedResult,
      reactionsResult,
      pollsResult,
    ] = await Promise.allSettled([
      messageIds.length > 0 && roomMemberIds.length > 0
        ? supabase
            .from('room_read_cursors')
            .select('user_id, last_read_at')
            .in('room_id', roomIdsToLoad)
            .in('user_id', roomMemberIds)
        : Promise.resolve({ data: [], error: null }),
      effectiveTodoUserId && messageIds.length > 0
        ? supabase
            .from('message_bookmarks')
            .select('message_id')
            .eq('user_id', effectiveTodoUserId)
            .in('message_id', messageIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('pinned_messages')
        .select('message_id')
        .eq('room_id', roomIdForFetch),
      messageIds.length > 0
        ? supabase
            .from('message_reactions')
            .select('message_id, emoji, user_id')
            .in('message_id', messageIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('polls')
        .select(POLL_SELECT)
        .eq('room_id', roomIdForFetch) as PromiseLike<{ data: PollItem[] | null; error: unknown }>,
    ]);
    if (!isCurrentRequest()) return;

    if (msgs?.length) {
      const nextRoomReadCursorMap: Record<string, string> = {};
      if (roomMemberIds.length > 0 && roomReadCursorsResult.status === 'fulfilled') {
        const { data: cursors, error: cursorsError } = roomReadCursorsResult.value;
        if (cursorsError) {
          console.error('읽음 커서 불러오기 실패:', cursorsError);
        }
        (cursors || []).forEach((cursor: Record<string, unknown>) => {
          const memberId = String(cursor.user_id || '');
          const lastReadAt = String(cursor.last_read_at || '');
          if (!memberId || !lastReadAt) return;
          const mergedReadAt = getLatestReadCursor(nextRoomReadCursorMap[memberId], lastReadAt);
          if (mergedReadAt) {
            nextRoomReadCursorMap[memberId] = mergedReadAt;
          }
        });
      } else if (roomReadCursorsResult.status === 'rejected') {
        console.error('읽음 커서 불러오기 실패:', roomReadCursorsResult.reason);
      }
      setRoomReadCursorMap(nextRoomReadCursorMap);

      const counts: Record<string, number> = {};
      (msgs || []).forEach((message: ChatMessage) => {
        const messageId = String(message.id || '');
        if (!messageId) return;
        const messageRecipientIds = roomMemberIds.filter((memberId) => memberId !== String(message.sender_id || ''));
        const readersCount = messageRecipientIds.filter((memberId) =>
          isMessageReadByCursor(message.created_at, nextRoomReadCursorMap[memberId])
        ).length;
        counts[messageId] = readersCount;
      });
      setReadCounts(counts);
      if (effectiveTodoUserId) {
        if (bookmarksResult.status === 'fulfilled' && !bookmarksResult.value.error) {
          const nextBookmarkIds = (bookmarksResult.value.data || []).map((bookmark: Record<string, unknown>) => String(bookmark.message_id));
          setBookmarkedIds(new Set(nextBookmarkIds));
          writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
        } else {
          setBookmarkedIds(new Set(readStoredBookmarks(effectiveTodoUserId).filter((bookmarkId) => messageIds.includes(bookmarkId))));
        }
      }
    } else {
      setReadCounts({});
      setRoomReadCursorMap({});
      setBookmarkedIds(new Set(readStoredBookmarks(effectiveTodoUserId)));
    }

    try {
      if (pinnedResult.status === 'rejected') throw pinnedResult.reason;
      const { data: pinned, error: pinnedError } = pinnedResult.value;
      if (pinnedError) throw pinnedError;
      const nextPinnedIds = (pinned || []).map((item: Record<string, unknown>) => String(item.message_id)).slice(-1);
      setPinnedIds(nextPinnedIds);
      writeStoredPinnedIds(roomIdForFetch, nextPinnedIds);
      if (nextPinnedIds.length > 0) {
        const pinnedLookup = new Map<string, ChatMessage>();
        (msgs || []).forEach((msg: ChatMessage) => {
          const messageId = String(msg.id);
          if (!nextPinnedIds.includes(messageId)) return;
          pinnedLookup.set(messageId, {
            ...msg,
            staff: msg.staff || resolveStaffProfile(msg.sender_id),
          });
        });
        const missingPinnedIds = nextPinnedIds.filter((messageId) => !pinnedLookup.has(messageId));
        if (missingPinnedIds.length > 0) {
          const { data: pinnedRows, error: pinnedRowsError } = await selectChatMessagesWithFallback<ChatMessage[]>(
            (selectClause) =>
              supabase
                .from('messages')
                .select(selectClause)
                .in('id', missingPinnedIds) as PromiseLike<{
                  data: ChatMessage[] | null;
                  error: unknown;
                }>
          );
          if (pinnedRowsError) throw pinnedRowsError;
          if (!isCurrentRequest()) return;
          (pinnedRows || []).forEach((msg: ChatMessage) => {
            pinnedLookup.set(String(msg.id), {
              ...msg,
              staff: resolveStaffProfile(msg.sender_id),
            });
          });
        }
        setPersistedPinnedMessages(
          nextPinnedIds
            .map((messageId) => pinnedLookup.get(messageId))
            .filter((message): message is ChatMessage => Boolean(message))
        );
      } else {
        setPersistedPinnedMessages([]);
      }
    } catch (error) {
      console.error('공지 메시지 불러오기 실패:', error);
      setPinnedIds([]);
      setPersistedPinnedMessages([]);
    }

    try {
      if (reactionsResult.status === 'rejected') throw reactionsResult.reason;
      const { data: reacts, error: reactionsError } = reactionsResult.value;
      if (reactionsError) throw reactionsError;
      const reactMap: Record<string, Record<string, number>> = {};
      const reactionUsersMap: ReactionUsersByMessage = {};
      reacts?.forEach(( r: Record<string, unknown>) => {
        const msgId = String(r.message_id || '').trim();
        const emoji = String(r.emoji || '').trim();
        const reactionUserId = String(r.user_id || '').trim();
        if (!msgId || !emoji) return;
        if (!reactMap[msgId]) reactMap[msgId] = {};
        reactMap[msgId][emoji] = (reactMap[msgId][emoji] || 0) + 1;
        if (!reactionUsersMap[msgId]) reactionUsersMap[msgId] = {};
        if (!reactionUsersMap[msgId][emoji]) reactionUsersMap[msgId][emoji] = [];
        if (!reactionUserId) return;
        const resolvedReactionUser = resolveStaffProfile(reactionUserId) || {
          id: reactionUserId,
          name: '이름 없음',
          company: '',
          department: '',
          position: '',
          photo_url: null,
        };
        if (!reactionUsersMap[msgId][emoji].some((staff) => String(staff.id) === reactionUserId)) {
          reactionUsersMap[msgId][emoji].push({
            ...resolvedReactionUser,
            id: String(resolvedReactionUser.id || reactionUserId),
            name: String(resolvedReactionUser.name || '이름 없음'),
            company: String(resolvedReactionUser.company || ''),
            department: String(resolvedReactionUser.department || ''),
            position: String(resolvedReactionUser.position || ''),
            photo_url: resolvedReactionUser.photo_url ?? null,
          });
        }
      });
      Object.values(reactionUsersMap).forEach((emojiMap) => {
        Object.keys(emojiMap).forEach((emoji) => {
          emojiMap[emoji] = [...emojiMap[emoji]].sort(compareStaffMembers);
        });
      });
      setReactions(reactMap);
      setReactionUsersByMessage(reactionUsersMap);
    } catch (error) {
      console.error('반응 데이터 불러오기 실패:', error);
      setReactions({});
      setReactionUsersByMessage({});
    }

    try {
      if (pollsResult.status === 'rejected') throw pollsResult.reason;
      const { data: dbPolls, error: pollsError } = pollsResult.value;
      if (pollsError) throw pollsError;
      if (dbPolls?.length) {
        setPolls(dbPolls);
      } else {
        setPolls([]);
      }
      const pollIds = (dbPolls || []).map((poll) => String(poll.id || '')).filter(Boolean);
      if (pollIds.length === 0) {
        setPollVotes({});
      } else {
        const { data: votes, error: pollVotesError } = await supabase
          .from('poll_votes')
          .select('poll_id, option_index')
          .in('poll_id', pollIds);
        if (pollVotesError) throw pollVotesError;
        if (!isCurrentRequest()) return;
        const vMap: Record<string, Record<number, number>> = {};
        votes?.forEach((v: Record<string, unknown>) => {
          const pollId = v.poll_id as string;
          const optIdx = v.option_index as number;
          if (!vMap[pollId]) vMap[pollId] = {};
          vMap[pollId][optIdx] = (vMap[pollId][optIdx] || 0) + 1;
        });
        setPollVotes(vMap);
      }
    } catch (error) {
      console.error('투표 데이터 불러오기 실패:', error);
      setPolls([]);
      setPollVotes({});
    }
    if (!isCurrentRequest()) return;

    // 읽음 커서/message_reads 쓰기는 방 선택 시(setRoom)와 실시간 새 메시지 수신 시에만 수행.
    // fetchData 내부에서 호출하면 realtime → fetchData 무한 루프 발생하므로 제거.
    if (roomIdForFetch) {
      const targetRoomIds = roomIdsToLoad.length > 0 ? roomIdsToLoad : [roomIdForFetch];
      setRoomUnreadCounts(prev => {
        let changed = false;
        const next = { ...prev };
        targetRoomIds.forEach((targetRoomId) => {
          if (!next[targetRoomId]) return;
          next[targetRoomId] = 0;
          changed = true;
        });
        return changed ? next : prev;
      });
    }

    if (pendingBottomAlignRoomIdRef.current === roomIdForFetch) {
      if ((msgs?.length || 0) > 0) {
        alignRoomToLatest(roomIdForFetch, 'auto');
      } else {
        pendingBottomAlignRoomIdRef.current = null;
      }
    }
  }, [selectedRoomId, user?.id, effectiveChatUserId, effectiveTodoUserId, repairDirectRooms, syncChatRoomsState, resolveStaffProfile, alignRoomToLatest, getEffectiveRoomMemberIds, isRoomAccessibleToCurrentUser, buildRoomSummaryFromMessages, applyRoomSummaryToState, persistRoomSummary]);

  const applyRoomMemberChange = useCallback(async ({
    roomId,
    members,
    systemContent,
  }: {
    roomId: string;
    members: string[];
    systemContent: string;
  }) => {
    await persistRoomMembers(roomId, members);
    await insertRoomSystemMessage(roomId, systemContent);
    updateRoomMembersLocally(roomId, members);
    await fetchData();
  }, [fetchData, insertRoomSystemMessage, persistRoomMembers, updateRoomMembersLocally]);

  const roomNotifyRef = useRef(true);
  useEffect(() => { roomNotifyRef.current = roomNotifyOn; }, [roomNotifyOn]);

  // fetchDataRef를 항상 최신 fetchData로 동기화
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    return () => {
      if (globalRealtimeRetryTimerRef.current) {
        clearTimeout(globalRealtimeRetryTimerRef.current);
        globalRealtimeRetryTimerRef.current = null;
      }
      if (roomRealtimeRetryTimerRef.current) {
        clearTimeout(roomRealtimeRetryTimerRef.current);
        roomRealtimeRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const loadRooms = async () => {
      const { data: noticeRoom } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('id', NOTICE_ROOM_ID)
        .maybeSingle();

      if (!noticeRoom) {
        await supabase.from('chat_rooms').insert([
          { id: NOTICE_ROOM_ID, name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds },
        ]);
      } else {
        await supabase
          .from('chat_rooms')
          .update({ name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds })
          .eq('id', NOTICE_ROOM_ID);
      }
      const { data: rooms } = (await supabase.from('chat_rooms').select(CHAT_ROOM_SELECT)) as {
        data: ChatRoom[] | null;
        error: unknown;
      };
      const roomsWithSelf = await ensureSelfChatRoom(rooms || []);
      await syncChatRoomsState(roomsWithSelf);
    };
    loadRooms();
    // selectedRoomId는 의도적으로 제외 — 채팅방 목록은 마운트 시 1회만 로드
  }, [ensureSelfChatRoom, noticeRoomMemberIds, syncChatRoomsState]);

  useEffect(() => {
    if (!chatRooms.some((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID)) return;
    void syncNoticeRoomMembers(chatRooms);
  }, [chatRooms, syncNoticeRoomMembers]);

  useEffect(() => {
    const channel = supabase.channel('chat-rooms-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => {
        supabase.from('chat_rooms').select(CHAT_ROOM_SELECT).then(async (result) => {
          const rooms = (result as { data: ChatRoom[] | null; error: unknown }).data;
          if (!rooms) return;
          const roomsWithSelf = await ensureSelfChatRoom(rooms);
          await syncChatRoomsState(roomsWithSelf);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ensureSelfChatRoom, syncChatRoomsState]);

  useEffect(() => {
    if (!(effectiveChatUserId || user?.id)) return;

    const channel = supabase.channel('chat-presence-hub', {
      config: { presence: { key: String(effectiveChatUserId || user?.id) } },
    });

    const syncPresence = () => {
      const next: Record<string, PresenceInfo> = {};
      const state = channel.presenceState();
      Object.values(state).forEach((entries: unknown[]) => {
        if (!Array.isArray(entries) || entries.length === 0) return;
        const latest = entries[entries.length - 1] as Partial<PresenceInfo>;
        if (!latest?.userId) return;
        next[String(latest.userId)] = {
          userId: String(latest.userId),
          name: latest.name || 'Unknown',
          roomId: latest.roomId || null,
          onlineAt: latest.onlineAt || new Date().toISOString(),
        };
      });
      setPresenceMap(next);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe(async (status: string) => {
        if (status !== 'SUBSCRIBED') return;
        presenceChannelRef.current = channel;
        await channel.track({
          userId: String(effectiveChatUserId || user?.id),
          name: user?.name || 'Unknown',
          roomId: selectedRoomId || null,
          onlineAt: new Date().toISOString(),
        });
      });

    return () => {
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [effectiveChatUserId, selectedRoomId, user?.id, user?.name]);

  useEffect(() => {
    if (!presenceChannelRef.current || !(effectiveChatUserId || user?.id)) return;
    presenceChannelRef.current.track({
      userId: String(effectiveChatUserId || user?.id),
      name: user?.name || 'Unknown',
      roomId: selectedRoomId || null,
      onlineAt: new Date().toISOString(),
    });
  }, [selectedRoomId, effectiveChatUserId, user?.id, user?.name]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = window.localStorage.getItem(CHAT_FOCUS_KEY);
      if (key) {
        setOmniSearch(key);
        window.localStorage.removeItem(CHAT_FOCUS_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let disposed = false;
    setGlobalRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    const channel = supabase
      .channel('chat-global-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: Record<string, unknown>) => {
          const msg = payload.new as ChatMessage;
          if (!msg) return;
          await handleIncomingRealtimeMessage(msg);
        }
      )
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          setGlobalRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setGlobalRealtimeState('reconnecting');
          scheduleRealtimeReconnect('global');
          return;
        }
        if (status === 'CLOSED') {
          setGlobalRealtimeState('reconnecting');
        }
      });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
    // selectedRoomId는 의도적으로 제외 — 전역 메시지 채널은 user 기준으로만 구독
  }, [globalRealtimeRetryToken, handleIncomingRealtimeMessage, scheduleRealtimeReconnect, user?.id]);

  useEffect(() => {
    if (!selectedRoomId) {
      setRoomRealtimeState('idle');
      return;
    }
    let disposed = false;
    setRoomRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    fetchData();
    const channel = supabase.channel(`chat-realtime-${selectedRoomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, (payload: Record<string, unknown>) => {
        const row = payload.new as ChatMessage;
        if (!row?.id) return;
        void handleIncomingRealtimeMessage(row);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_read_cursors' }, (payload: Record<string, unknown>) => {
        // 자신의 커서 업데이트는 낙관적으로 처리됨 — full refetch 생략하여 메시지 수신 지연 방지
        const updatedRow =
          (payload.new as Record<string, unknown> | null) ||
          (payload.old as Record<string, unknown> | null) ||
          null;
        const updatedRoomId = String(updatedRow?.room_id || '').trim();
        if (!updatedRoomId || !isRoomInSelectedConversation(updatedRoomId, chatRoomsRef.current)) return;
        const updatedUserId = updatedRow?.user_id;
        if (updatedUserId && String(updatedUserId) === String(effectiveChatUserId || '')) return;
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_bookmarks', filter: `user_id=eq.${effectiveTodoUserId || user?.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => fetchData())
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          setRoomRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRoomRealtimeState('reconnecting');
          scheduleRealtimeReconnect('room');
          return;
        }
        if (status === 'CLOSED') {
          setRoomRealtimeState('reconnecting');
        }
      });
    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [selectedRoomId, roomRealtimeRetryToken, fetchData, effectiveTodoUserId, user?.id, handleIncomingRealtimeMessage, scheduleRealtimeReconnect, isRoomInSelectedConversation, effectiveChatUserId]);

  useEffect(() => {
    if (!selectedRoomId) {
      setTypingUsers({});
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`chat-typing-${selectedRoomId}`);
    typingChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: Record<string, unknown> }) => {
          if (!payload || payload.roomId !== selectedRoomId || payload.userId === String(effectiveChatUserId || user?.id || '')) return;

        const peerId = String(payload.userId);
        if (typingPeersTimeoutRef.current[peerId]) {
          clearTimeout(typingPeersTimeoutRef.current[peerId]);
          delete typingPeersTimeoutRef.current[peerId];
        }

        if (!payload.isTyping) {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
          return;
        }

        setTypingUsers((prev) => ({
          ...prev,
          [peerId]: (payload.name as string) || 'Unknown',
        }));

        typingPeersTimeoutRef.current[peerId] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
          delete typingPeersTimeoutRef.current[peerId];
        }, 2500);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          emitTypingState(false);
        }
      });

    return () => {
      if (typingClearRef.current) {
        clearTimeout(typingClearRef.current);
        typingClearRef.current = null;
      }
      Object.values(typingPeersTimeoutRef.current).forEach((timer) => clearTimeout(timer));
      typingPeersTimeoutRef.current = {};
      setTypingUsers({});
      if (typingChannelRef.current === channel) {
        typingChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [selectedRoomId, effectiveChatUserId, user?.id, emitTypingState]);

  useEffect(() => {
    const onFocus = () => { isFocusedRef.current = true; };
    const onBlur = () => { isFocusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('erp-chat-sync');
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      const payload = event.data;
      if (!payload?.roomId) return;
      // ref를 통해 항상 최신 selectedRoomId와 fetchData를 참조 (채널 재생성 없이)
      if (
        payload.action !== 'message-sent' &&
        isRoomInSelectedConversation(String(payload.roomId), chatRoomsRef.current)
      ) {
        fetchDataRef.current?.();
      } else if (chatRoomsRef.current.length > 0) {
        updateUnreadForRooms(chatRoomsRef.current);
      }
    };
    return () => {
      if (syncChannelRef.current === channel) {
        syncChannelRef.current = null;
      }
      channel.close();
    };
    // 마운트 시 1회만 실행 — selectedRoomId·fetchData는 ref로 최신값 참조
  }, [isRoomInSelectedConversation, updateUnreadForRooms]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMockRealtimeInsert = (event: Event) => {
      const detail = (event as CustomEvent<{ rows?: ChatMessage[]; row?: ChatMessage }>).detail;
      const rows = Array.isArray(detail?.rows) ? detail.rows : detail?.row ? [detail.row] : [];
      rows.forEach((row) => {
        if (!row?.id) return;
        void handleIncomingRealtimeMessage(row);
      });
    };

    window.addEventListener('erp-mock-chat-message-insert', handleMockRealtimeInsert as EventListener);
    return () => {
      window.removeEventListener('erp-mock-chat-message-insert', handleMockRealtimeInsert as EventListener);
    };
  }, [handleIncomingRealtimeMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleChatNotification = (event: Event) => {
      const detail = (event as CustomEvent<{
        room_id?: string;
        message_id?: string;
        body?: string;
        data?: Record<string, unknown>;
      }>).detail;
      const roomId = String(detail?.room_id || detail?.data?.room_id || '').trim();
      if (!roomId) return;

      const knownRoom = chatRoomsRef.current.some((room: ChatRoom) => String(room.id) === roomId);
      const previewText = String(detail?.body || '').trim();
      if (knownRoom && previewText) {
        setChatRooms((prev) => {
          if (!prev.some((room: ChatRoom) => String(room.id) === roomId)) return prev;
          return sortChatRoomsWithNoticeFirst(
            prev.map((room: ChatRoom) =>
              String(room.id) === roomId
                ? {
                    ...room,
                    last_message: previewText || room.last_message,
                    last_message_preview: previewText || room.last_message_preview,
                    last_message_at: new Date().toISOString(),
                  }
                : room
            )
          );
        });
      }

      const messageId = String(detail?.message_id || detail?.data?.message_id || detail?.data?.id || '').trim();
      if (!messageId || !knownRoom) return;

      void (async () => {
        const data = await fetchMessageByIdWithRetry(messageId);
        if (!data) return;
        await handleIncomingRealtimeMessage(data);
      })();
    };

    window.addEventListener('erp-chat-notification', handleChatNotification as EventListener);
    return () => {
      window.removeEventListener('erp-chat-notification', handleChatNotification as EventListener);
    };
  }, [fetchMessageByIdWithRetry, handleIncomingRealtimeMessage]);

  useEffect(() => {
    if (!user?.id) return;
    const refreshRealtimeFallback = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (selectedRoomId) {
        fetchData();
      } else if (chatRoomsRef.current.length > 0) {
        updateUnreadForRooms(chatRoomsRef.current);
      }
    };

    const unbindRealtimeFallback = bindPageRefresh(refreshRealtimeFallback, { intervalMs: 15_000 });

    return () => {
      unbindRealtimeFallback();
    };
  }, [selectedRoomId, user?.id, fetchData, updateUnreadForRooms]);

  useEffect(() => {
    if (!selectedRoomId || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const tailSignature = `${messages.length}:${String(lastMessage?.id || '')}:${String(lastMessage?.created_at || '')}`;
    const tailChanged = lastTimelineTailRef.current !== tailSignature;
    lastTimelineTailRef.current = tailSignature;
    const isOwnNewestMessage = String(lastMessage?.sender_id) === String(effectiveChatUserId || user?.id || '');
    const shouldStick =
      isNearBottomRef.current ||
      String(lastMessage?.id || '').startsWith('temp-') ||
      (tailChanged && isOwnNewestMessage);
    if (shouldStick) {
      // 채팅방 전환 중(pendingBottomAlignRoomIdRef 활성)이면 즉시 이동, 아니면 부드럽게
      const isRoomSwitch = !!pendingBottomAlignRoomIdRef.current;
      requestAnimationFrame(() => scrollToBottom(
        (!pendingBottomAlignRoomIdRef.current && isOwnNewestMessage)
          ? 'smooth'
          : 'auto'
      ));
    } else {
      setShowScrollToLatest(true);
    }
  }, [messages, selectedRoomId, scrollToBottom, effectiveChatUserId, user?.id]);

  useEffect(() => {
    if (!selectedRoomId) return;
    alignRoomToLatest(selectedRoomId, 'auto');
  }, [alignRoomToLatest, selectedRoomId]);

  useLayoutEffect(() => {
    if (!selectedRoomId) {
      pendingBottomAlignRoomIdRef.current = null;
      return;
    }
    if (pendingBottomAlignRoomIdRef.current !== selectedRoomId) return;
    alignRoomToLatestImmediately(selectedRoomId);
  }, [alignRoomToLatestImmediately, selectedRoomId, messages.length, polls.length, pinnedIds.length, persistedPinnedMessages.length]);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => pinnedIds.includes(String(m.id))),
    [messages, pinnedIds]
  );

  const noticeMessages = useMemo(
    () => (persistedPinnedMessages.length > 0 ? persistedPinnedMessages : pinnedMessages),
    [persistedPinnedMessages, pinnedMessages]
  );

  const currentNoticeMessage = useMemo(
    () => noticeMessages[noticeMessages.length - 1] || null,
    [noticeMessages]
  );


  const roomMembers = useMemo(() => {
    if (!selectedRoomId) return [];
    if (selectedRoomId === NOTICE_ROOM_ID) return noticeRoomMembers;
    const room = chatRooms.find(( r: ChatRoom) => r.id === selectedRoomId);
    const memberIds = getEffectiveRoomMemberIds(room || null);
    if (!room || memberIds.length === 0) return [];
    return memberIds.map((id: string) => resolveRoomMemberProfile(room, id));
  }, [chatRooms, getEffectiveRoomMemberIds, noticeRoomMembers, resolveRoomMemberProfile, selectedRoomId]);

  const selectedRoom = useMemo(
    () => chatRooms.find(( r: ChatRoom) => r.id === selectedRoomId && isRoomAccessibleToCurrentUser(r)) || null,
    [chatRooms, isRoomAccessibleToCurrentUser, selectedRoomId]
  );

  const selectedRoomLabel = useMemo(
    () => getRoomDisplayName(selectedRoom, allKnownStaffs, effectiveChatUserId),
    [selectedRoom, allKnownStaffs, effectiveChatUserId]
  );

  const addableMembers = useMemo(() => {
    if (!selectedRoom) return [];
    const currentMemberIds = new Set(
      Array.isArray(selectedRoom.members)
        ? selectedRoom.members.map((id: unknown) => String(id))
        : []
    );
    return allKnownStaffs
      .filter(( s: StaffMember) => s.status !== '퇴사' && s.status !== '퇴직')
      .filter(( s: StaffMember) => !currentMemberIds.has(String(s.id)))
      .filter(( s: StaffMember) => {
        if (!deferredAddMemberSearch.trim()) return true;
        const key = deferredAddMemberSearch.trim();
        return (
          s.name?.includes(key) ||
          s.department?.includes(key) ||
          s.position?.includes(key)
        );
      });
  }, [selectedRoom, allKnownStaffs, deferredAddMemberSearch]);

  const visibleRooms = useMemo(
    () => {
      const dedupedRooms = new Map<string, ChatRoom>();
      chatRooms.forEach(( room: ChatRoom) => {
        if (!isRoomAccessibleToCurrentUser(room)) return;
        const roomKey = getDirectRoomMembersKey(room) || `room:${room.id}`;
        const previousRoom = dedupedRooms.get(roomKey);
        const previousTime = new Date(previousRoom?.last_message_at || previousRoom?.created_at || 0).getTime();
        const currentTime = new Date(room?.last_message_at || room?.created_at || 0).getTime();
        if (!previousRoom || currentTime >= previousTime) {
          dedupedRooms.set(roomKey, room);
        }
      });
      if (!dedupedRooms.has(`room:${NOTICE_ROOM_ID}`)) {
        const noticeRoom = chatRooms.find(( room: ChatRoom) => room.id === NOTICE_ROOM_ID);
        if (noticeRoom && isRoomAccessibleToCurrentUser(noticeRoom)) {
          dedupedRooms.set(`room:${NOTICE_ROOM_ID}`, noticeRoom);
        }
      }
      return Array.from(dedupedRooms.values());
    },
    [chatRooms, isRoomAccessibleToCurrentUser]
  );

  useEffect(() => {
    if (!selectedRoomId || chatRooms.length === 0) return;
    if (selectedRoom) return;

    const fallbackRoomId =
      visibleRooms.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID)?.id ||
      visibleRooms[0]?.id ||
      null;

    if (String(fallbackRoomId || '') !== String(selectedRoomId || '')) {
      setRoom(fallbackRoomId ? String(fallbackRoomId) : null);
    } else if (!fallbackRoomId) {
      setRoom(null);
    }
  }, [chatRooms.length, selectedRoom, selectedRoomId, visibleRooms]);

  const roomLabelMap = useMemo(() => {
    const next = new Map<string, string>();
    visibleRooms.forEach((room: ChatRoom) => {
      next.set(String(room.id), getRoomDisplayName(room, allKnownStaffs, effectiveChatUserId));
    });
    return next;
  }, [visibleRooms, allKnownStaffs, effectiveChatUserId]);

  const sidebarRooms = useMemo(() => {
    const keyword = deferredOmniSearch.trim().toLowerCase();
    const filtered = visibleRooms.filter(( room: ChatRoom) => {
      const label = (roomLabelMap.get(String(room.id)) || '').toLowerCase();
      const isHidden = roomPrefs[room.id]?.hidden === true;
      if (isHidden && !showHiddenRooms) return false;
      if (!keyword) return true;
      return label.includes(keyword);
    });
    return sortRoomsForSidebar(filtered, roomPrefs, pinnedRoomOrder);
  }, [visibleRooms, deferredOmniSearch, roomPrefs, showHiddenRooms, roomLabelMap, pinnedRoomOrder]);
  const effectivePinnedRoomOrder = useMemo(() => {
    const pinnedIds = visibleRooms
      .filter((room: ChatRoom) => roomPrefs[room.id]?.pinned)
      .map((room: ChatRoom) => String(room.id));
    const preserved = pinnedRoomOrder.filter((roomId) => pinnedIds.includes(String(roomId)));
    const missing = pinnedIds.filter((roomId) => !preserved.includes(roomId));
    return [...preserved, ...missing];
  }, [visibleRooms, roomPrefs, pinnedRoomOrder]);
  useEffect(() => {
    if (arraysMatch(effectivePinnedRoomOrder, pinnedRoomOrder)) return;
    setPinnedRoomOrder(effectivePinnedRoomOrder);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          getPinnedRoomOrderStorageKey(roomPrefsUserId),
          JSON.stringify(effectivePinnedRoomOrder)
        );
      } catch {
        // ignore
      }
    }
  }, [effectivePinnedRoomOrder, pinnedRoomOrder, roomPrefsUserId]);
  const forwardTargetRooms = useMemo(
    () =>
      visibleRooms.filter(( room: ChatRoom) => {
        if (String(room.id) === String(selectedRoomId || '')) return false;
        if (roomPrefs[room.id]?.hidden === true) return false;
        return true;
      }),
    [roomPrefs, selectedRoomId, visibleRooms]
  );
  const sidebarRoomItems = useMemo(() => {
    const pinnedOrderIndex = new Map(
      effectivePinnedRoomOrder.map((roomId, index) => [String(roomId), index])
    );
    const pinnedCount = effectivePinnedRoomOrder.length;
    return sidebarRooms.map((room: ChatRoom) => {
      const roomId = String(room.id);
      const members = normalizeMemberIds(room.members);
      const selfRoom = isSelfChatRoom(room, effectiveChatUserId);
      const peer =
        room.type === 'direct'
          ? selfRoom
            ? resolveStaffProfile(effectiveChatUserId)
            : members
                .map((memberId) => allKnownStaffMap.get(memberId))
                .find(
                  (staff: StaffMember | undefined) =>
                    Boolean(staff) && String(staff!.id) !== effectiveChatUserId
                ) || null
          : null;

      return {
        room,
        roomId,
        unread: getConversationUnreadCountForRoom(room, roomUnreadCounts, chatRooms),
        isSelected: selectedRoomId === room.id,
        isNoticeChannel: room.id === NOTICE_ROOM_ID,
        label: roomLabelMap.get(roomId) || '',
        preview: getRoomPreviewText(room),
        peerName: peer?.name || '',
        peerPhotoUrl: peer ? getProfilePhotoUrl(peer) : null,
        isPeerOnline: peer ? isStaffCurrentlyOnline(peer) : false,
        isPinned: roomPrefs[room.id]?.pinned === true,
        isHidden: roomPrefs[room.id]?.hidden === true,
        pinnedIndex: pinnedOrderIndex.get(roomId) ?? -1,
        pinnedCount,
      };
    });
  }, [
    allKnownStaffMap,
    effectivePinnedRoomOrder,
    effectiveChatUserId,
    isStaffCurrentlyOnline,
    resolveStaffProfile,
    roomLabelMap,
    roomPrefs,
    chatRooms,
    roomUnreadCounts,
    selectedRoomId,
    sidebarRooms,
  ]);
  const visibleRoomIds = useMemo(
    () => visibleRooms.map((room: ChatRoom) => room.id),
    [visibleRooms]
  );
  const normalizedGlobalSearchQuery = deferredGlobalSearchQuery.trim().toLowerCase();
  const closeGlobalSearch = useCallback(() => {
    setShowGlobalSearch(false);
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setGlobalSearchTab('all');
    setGlobalSearchLoading(false);
  }, []);
  const openGlobalSearch = useCallback(() => {
    setGlobalSearchTab('all');
    setShowGlobalSearch(true);
  }, []);
  const globalSearchMemberResults = useMemo(() => {
    if (!normalizedGlobalSearchQuery) return [];
    return allKnownStaffs
      .filter((staff: StaffMember) => String(staff.id) !== String(effectiveChatUserId || ''))
      .filter((staff: StaffMember) => {
        const haystack = [
          staff.name,
          staff.company,
          staff.department,
          staff.position,
          (staff as Record<string, unknown>).employee_no,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(normalizedGlobalSearchQuery);
      })
      .slice(0, 50);
  }, [allKnownStaffs, effectiveChatUserId, normalizedGlobalSearchQuery]);
  const globalSearchRoomResults = useMemo(() => {
    if (!normalizedGlobalSearchQuery) return [];
    return visibleRooms
      .map((room: ChatRoom) => {
        const roomId = String(room.id);
        return {
          room,
          roomId,
          label: roomLabelMap.get(roomId) || '',
          preview: getRoomPreviewText(room),
          memberCount: normalizeMemberIds(room.members).length,
          isHidden: roomPrefs[room.id]?.hidden === true,
          isNoticeChannel: room.id === NOTICE_ROOM_ID,
        };
      })
      .filter(({ label, preview }) => {
        const haystack = `${String(label || '').toLowerCase()} ${String(preview || '').toLowerCase()}`;
        return haystack.includes(normalizedGlobalSearchQuery);
      })
      .slice(0, 50);
  }, [normalizedGlobalSearchQuery, roomLabelMap, roomPrefs, visibleRooms]);
  const globalSearchMessageResults = useMemo(
    () => globalSearchResults.filter((message: ChatMessage) => !String(message.file_url || '').trim()),
    [globalSearchResults]
  );
  const globalSearchFileResults = useMemo(
    () => globalSearchResults.filter((message: ChatMessage) => Boolean(String(message.file_url || '').trim())),
    [globalSearchResults]
  );
  const globalSearchCounts = useMemo(
    () => ({
      all:
        globalSearchMemberResults.length +
        globalSearchRoomResults.length +
        globalSearchMessageResults.length +
        globalSearchFileResults.length,
      member: globalSearchMemberResults.length,
      room: globalSearchRoomResults.length,
      message: globalSearchMessageResults.length,
      file: globalSearchFileResults.length,
    }),
    [globalSearchFileResults.length, globalSearchMemberResults.length, globalSearchMessageResults.length, globalSearchRoomResults.length]
  );
  const openGroupFromGlobalSearch = useCallback(() => {
    closeGlobalSearch();
    setShowGroupModal(true);
  }, [closeGlobalSearch]);
  const openRoomFromGlobalSearch = useCallback((roomId: string, messageId?: string) => {
    if (messageId) pendingScrollMsgIdRef.current = messageId;
    setTransientHighlightQuery(globalSearchQuery.trim());
    if (
      messageId &&
      String(selectedRoomIdRef.current || '') === roomId &&
      messages.some((message: ChatMessage) => String(message.id) === messageId)
    ) {
      window.setTimeout(() => scrollToMessage(messageId), 120);
    }
    setRoom(roomId);
    closeGlobalSearch();
  }, [closeGlobalSearch, globalSearchQuery, messages, scrollToMessage]);

  useEffect(() => {
    if (!transientHighlightQuery.trim()) return;
    const timer = window.setTimeout(() => setTransientHighlightQuery(''), 12000);
    return () => window.clearTimeout(timer);
  }, [transientHighlightQuery]);

  const typingNoticeText = useMemo(() => {
    const names = Object.values(typingUsers).filter(Boolean);
    if (!names.length) return '';
    if (names.length === 1) return `${names[0]}님이 입력 중`;
    return `${names[0]} 외 ${names.length - 1}명이 입력 중`;
  }, [typingUsers]);

  const selectedPeer = useMemo(() => {
    if (!selectedRoom || selectedRoom.type !== 'direct') return null;
    if (isSelfChatRoom(selectedRoom, effectiveChatUserId)) {
      return resolveStaffProfile(effectiveChatUserId);
    }
    return roomMembers.find((member) => String(member?.id ?? '') !== effectiveChatUserId) || null;
  }, [selectedRoom, roomMembers, effectiveChatUserId, resolveStaffProfile]);

  const selectedPeerPhotoUrl = useMemo(
    () => (selectedPeer ? getProfilePhotoUrl(selectedPeer as StaffMember) : null),
    [selectedPeer]
  );

  const selectedPeerIsOnline = useMemo(
    () => (selectedPeer ? isStaffCurrentlyOnline(selectedPeer as StaffMember) : false),
    [selectedPeer, isStaffCurrentlyOnline]
  );
  const realtimeConnectionMeta = useMemo(() => {
    const state = selectedRoomId ? roomRealtimeState : globalRealtimeState;
    if (state === 'connected') {
      return {
        label: '실시간 연결됨',
        dotClassName: 'bg-emerald-500',
        textClassName: 'text-emerald-500',
      };
    }
    if (state === 'reconnecting') {
      return {
        label: '실시간 재연결 중',
        dotClassName: 'bg-amber-500',
        textClassName: 'text-amber-500',
      };
    }
    if (state === 'connecting') {
      return {
        label: '실시간 연결 중',
        dotClassName: 'bg-sky-500',
        textClassName: 'text-sky-500',
      };
    }
    return {
      label: '실시간 대기 중',
      dotClassName: 'bg-[var(--toss-gray-4)]',
      textClassName: 'text-[var(--toss-gray-4)]',
    };
  }, [globalRealtimeState, roomRealtimeState, selectedRoomId]);

  const threadMessages = useMemo(() => {
    if (!threadRoot) return [];
    const rootId = threadRoot.id;
    return messages
      .filter(
        ( m: ChatMessage) =>
          m.id === rootId ||
          m.reply_to_id === rootId
      )
      .sort(
        (a: ChatMessage, b: ChatMessage) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
  }, [threadRoot, messages]);

  const [readUsers, setReadUsers] = useState<StaffMember[]>([]);
  const loadReadStatusForMessage = useCallback(
    async (msg: ChatMessage) => {
      if (!msg?.id || !selectedRoom) return;
      setUnreadLoading(true);
      setUnreadUsers([]);
      setReadUsers([]);
      setUnreadModalMsg(msg);
      try {
        const roomMemberIds = getEffectiveRoomMemberIds(selectedRoom);
        const allRoomStaffs = allKnownStaffs.filter(( s: StaffMember) => roomMemberIds.includes(String(s.id)));

        const readers: StaffMember[] = [];
        const nonReaders: StaffMember[] = [];

        allRoomStaffs.forEach(( s: StaffMember) => {
          if (String(s.id) === String(msg.sender_id)) return;
          if (isMessageReadByCursor(msg.created_at, roomReadCursorMap[String(s.id)])) {
            readers.push(s);
          } else {
            nonReaders.push(s);
          }
        });

        setReadUsers(readers.sort(compareStaffMembers));
        setUnreadUsers(nonReaders.sort(compareStaffMembers));
      } catch (e) {
        console.error('loadReadStatusForMessage error', e);
        toast('읽음 현황을 불러오지 못했습니다.');
      } finally {
        setUnreadLoading(false);
      }
    },
    [selectedRoom, allKnownStaffs, getEffectiveRoomMemberIds, roomReadCursorMap]
  );
  const openReactionDetail = useCallback((message: ChatMessage, emoji: string) => {
    setReactionDetailTarget({ message, emoji });
  }, []);

  const handleLeaveRoom = async () => {
    if (!selectedRoom) return;
    if (selectedRoom.id === NOTICE_ROOM_ID) {
      toast('공지 메시지 방은 나갈 수 없습니다.', 'warning');
      return;
    }
    if (isSelfChatRoom(selectedRoom, effectiveChatUserId)) {
      toast('나와의 채팅은 나갈 수 없습니다.', 'warning');
      return;
    }
    if (!confirm('이 채팅방에서 나가시겠습니까? 나간 뒤에는 다시 초대를 받아야 입장할 수 있습니다.')) return;

    try {
      const currentMembers: string[] = Array.isArray(selectedRoom.members)
        ? selectedRoom.members
        : [];
      const newMembers = currentMembers.filter(
        (id: unknown) => String(id) !== String(effectiveChatUserId || user?.id || '')
      );

      await persistRoomMembers(String(selectedRoom.id), newMembers);

      const leaverName = user?.name || '이름 없음';
      const leaveContent = `[퇴장] ${leaverName}님이 채팅방을 나갔습니다.`;
      let leaveNoticeFailed = false;

      try {
        await insertRoomSystemMessage(String(selectedRoom.id), leaveContent);
      } catch (leaveNoticeError) {
        leaveNoticeFailed = true;
        console.error('leave room system message error', leaveNoticeError);
      }

      const leftRoomId = selectedRoom.id;
      // 방 목록에서 즉시 제거 (실시간 재로드로 덮어쓰이기 전에)
      setChatRooms((prev) => prev.filter(( room: ChatRoom) => room.id !== leftRoomId));
      setRoomUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[leftRoomId];
        return next;
      });
      setRoom(null);
      setMessages([]);
      toast(
        leaveNoticeFailed
          ? '채팅방에서 나갔지만 퇴장 안내 메시지 저장은 실패했습니다.'
          : '채팅방에서 나갔습니다.'
      );
    } catch {
      toast('채팅방 나가기 중 오류가 발생했습니다.', 'error');
    }
  };

  const removeRoomMember = async (memberId: string) => {
    if (!selectedRoom) return;
    if (selectedRoom?.created_by !== (effectiveChatUserId || user?.id)) return;
    if (String(memberId) === String(effectiveChatUserId || user?.id || '')) return;
    if (!confirm('이 참여자를 채팅방에서 제거하시겠습니까?')) return;

    try {
      const currentMembers: string[] = Array.isArray(selectedRoom.members)
        ? selectedRoom.members
        : [];
      const newMembers = currentMembers.filter(
        (id: unknown) => String(id) !== String(memberId)
      );

      const removedName =
        resolveRoomMemberProfile(selectedRoom, String(memberId))?.name ||
        resolveStaffProfile(memberId)?.name ||
        '이름 없음';
      const removerName = user?.name || '이름 없음';
      const systemContent = `[제거] ${removerName}님이 ${removedName}님을 채팅방에서 제거했습니다.`;
      await applyRoomMemberChange({
        roomId: String(selectedRoom.id),
        members: newMembers,
        systemContent,
      });
      toast('참여자를 제거했습니다.');
    } catch (error) {
      console.error('remove member error', error);
      toast('참여자 제거 중 오류가 발생했습니다.', 'error');
    }
  };

  const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;   // 일반 파일: 20MB
  const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 동영상: 200MB
  const insertChatMessage = useCallback(
    <TData extends Record<string, unknown> = Record<string, unknown>>(
      payload: Record<string, unknown>,
      selectClause = '*',
    ) =>
      withMissingColumnsFallback<TData>(
        (omittedColumns) => {
          const fallbackPayload = { ...payload };
          omittedColumns.forEach((column) => {
            delete fallbackPayload[column];
          });
          return supabase.from('messages').insert([fallbackPayload]).select(selectClause).single();
        },
        ['file_name', 'file_size_bytes', 'file_kind', 'reply_to_id', 'album_id', 'album_index', 'album_total'],
      ),
    [],
  );
  const handleSendMessage = useCallback(async ({
    fileUrl,
    fileSizeBytes,
    fileKind,
    retryMessageId,
    fileName,
    contentOverride,
    clearComposerIfUnchangedFrom,
    replyToIdOverride,
    albumId,
    albumIndex,
    albumTotal,
  }: SendMessageOptions = {}): Promise<boolean> => {
    const retryPayload = retryMessageId
      ? deliveryStatesRef.current[retryMessageId]?.retryPayload || null
      : null;
    const liveInput = inputMsgRef.current;
    const trimmed = liveInput.trim();
    const composerSnapshot = clearComposerIfUnchangedFrom ?? liveInput;
    const roomId = retryPayload?.roomId || selectedRoomId;
    const content = retryPayload
      ? retryPayload.content
      : typeof contentOverride === 'string'
        ? contentOverride
        : trimmed;
    const resolvedFileUrl = retryPayload?.fileUrl ?? fileUrl ?? null;
    const resolvedFileName = retryPayload?.fileName ?? fileName ?? null;
    const resolvedFileSizeBytes = retryPayload?.fileSizeBytes ?? fileSizeBytes ?? null;
    const resolvedFileKind = retryPayload?.fileKind ?? fileKind ?? null;
    const resolvedReplyToId =
      retryPayload?.replyToId ??
      (typeof replyToIdOverride === 'undefined' ? replyTo?.id ?? null : replyToIdOverride);
    const resolvedAlbumId = retryPayload?.albumId ?? albumId ?? null;
    const resolvedAlbumIndex = retryPayload?.albumIndex ?? albumIndex ?? null;
    const resolvedAlbumTotal = retryPayload?.albumTotal ?? albumTotal ?? null;
    if (!content && !resolvedFileUrl) return false;
    if (!roomId) return false;
    if (roomId !== NOTICE_ROOM_ID && !visibleRoomIds.includes(String(roomId))) {
      toast('참여 중인 채팅방에서만 메시지를 보낼 수 있습니다.', 'warning');
      setRoom(selectedRoom ? String(selectedRoom.id) : NOTICE_ROOM_ID);
      return false;
    }

    if (!resolvedFileUrl && content.startsWith('/')) {
      if (content.startsWith('/연차')) {
        setSlashCommand('annual_leave');
          setSlashForm({
            startDate: '',
            endDate: '',
            reason: content.replace('/연차', '').trim(),
            itemName: '',
            quantity: 1,
          });
          setShowSlashModal(true);
          return false;
        }
        if (content.startsWith('/발주')) {
        setSlashCommand('purchase');
          setSlashForm({
            startDate: '',
            endDate: '',
            reason: '',
            itemName: content.replace('/발주', '').trim(),
            quantity: 1,
          });
          setShowSlashModal(true);
          return false;
        }
      }
    if (roomId === NOTICE_ROOM_ID) {
      if (!canWriteNotice) {
        toast('공지 메시지 방에는 부서장 이상만 작성할 수 있습니다.');
        return false;
      }
    }

    const retrySnapshot: MessageRetryPayload = {
      roomId,
      content,
      fileUrl: resolvedFileUrl,
      fileName: resolvedFileName,
      fileSizeBytes: resolvedFileSizeBytes,
      fileKind: resolvedFileKind,
      replyToId: resolvedReplyToId,
      albumId: resolvedAlbumId,
      albumIndex: resolvedAlbumIndex,
      albumTotal: resolvedAlbumTotal,
    };
    const insertPayload = buildChatMessageInsertPayload(
      effectiveChatUserId || user?.id,
      retrySnapshot,
    );

    const optimisticId = retryMessageId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      id: optimisticId,
      ...insertPayload,
      created_at: new Date().toISOString(),
      is_deleted: false,
      staff: { name: user!.name, photo_url: getProfilePhotoUrl(user!) },
    };

    if (retryMessageId) {
      setMessages((prev) =>
        prev.map((message: ChatMessage) =>
          message.id === retryMessageId
            ? { ...message, created_at: optimisticMessage.created_at }
            : message
        )
      );
    } else {
      setMessages((prev) => [...prev, optimisticMessage]);
    }

    setDeliveryStates((prev) => ({
      ...prev,
      [optimisticId]: {
        status: 'sending',
        retryPayload: retrySnapshot,
        error: null,
      },
    }));

    if (!retryMessageId) {
      const activeRoomId = String(selectedRoomIdRef.current || '');
      const shouldClearComposer =
        activeRoomId === String(roomId) &&
        inputMsgRef.current === composerSnapshot;
      if (shouldClearComposer) {
        inputMsgRef.current = '';
        setInputMsg('');
        if (selectedRoomIdRef.current) {
          draftMapRef.current.delete(selectedRoomIdRef.current);
        }
      } else if (selectedRoomIdRef.current) {
        draftMapRef.current.set(selectedRoomIdRef.current, inputMsgRef.current);
      }
    }

    setReplyTo(null);
    requestAnimationFrame(() => scrollToBottom('smooth'));

    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }
    emitTypingState(false);

    const { data: inserted, error } = await insertChatMessage<ChatMessage>(insertPayload);
    if (!error && inserted) {
      const optimisticMsg = {
        ...inserted,
        staff: { name: user!.name, photo_url: getProfilePhotoUrl(user!) },
      };
      setMessages((prev) => {
        const seenIds = new Set<string>();
        return prev
          .map((message: ChatMessage) =>
            message.id === optimisticId ? optimisticMsg : message
          )
          .filter((message: ChatMessage) => {
            const normalizedId = String(message.id || '');
            if (seenIds.has(normalizedId)) return false;
            seenIds.add(normalizedId);
            return true;
          });
      });
      setDeliveryStates((prev) => {
        const next = { ...prev };
        delete next[optimisticId];
        next[String(inserted.id)] = {
          status: 'sent',
          retryPayload: retrySnapshot,
          error: null,
        };
        return next;
      });
      setChatRooms((prev) =>
        sortChatRoomsWithNoticeFirst(
          prev.map((room: ChatRoom) =>
            room.id === roomId
              ? {
                  ...room,
                  last_message: getMessageDisplayText(
                    content,
                    resolvedFileName,
                    resolvedFileUrl,
                    room.last_message
                  ),
                  last_message_preview: getMessageDisplayText(
                    content,
                    resolvedFileName,
                    resolvedFileUrl,
                    room.last_message_preview
                  ),
                  last_message_at: inserted.created_at || new Date().toISOString(),
                }
              : room
          )
        )
      );
      broadcastChatSync('message-sent', roomId);
      if (shouldTriggerImmediateChatPush({
        albumId: inserted.album_id,
        albumIndex: inserted.album_index,
        albumTotal: inserted.album_total,
      })) {
        void triggerChatPush(String(inserted.room_id), String(inserted.id));
      }
      return true;
    } else {
      setDeliveryStates((prev) => ({
        ...prev,
        [optimisticId]: {
          status: 'failed',
          retryPayload: retrySnapshot,
          error: error?.message || '메시지 전송 실패',
        },
      }));
      console.error('message send failed', error);
      return false;
    }
  }, [selectedRoomId, user?.id, user?.name, user?.avatar_url, replyTo, canWriteNotice, scrollToBottom, broadcastChatSync, emitTypingState, triggerChatPush, selectedRoom, visibleRoomIds, insertChatMessage]);

  const sendWardQuickReply = useCallback(
    async (message: ChatMessage, replyText: string) => {
      const messageId = String(message.id || '').trim();
      if (!messageId || wardQuickReplySendingMessageId === messageId) return;

      setWardQuickReplySendingMessageId(messageId);
      try {
        await handleSendMessage({
          contentOverride: replyText,
          clearComposerIfUnchangedFrom: '__ward-quick-reply__',
          replyToIdOverride: messageId,
        });
      } finally {
        setWardQuickReplySendingMessageId(null);
      }
    },
    [handleSendMessage, wardQuickReplySendingMessageId],
  );

  const retryFailedMessage = useCallback(async (messageId: string) => {
    await handleSendMessage({ retryMessageId: messageId });
  }, [handleSendMessage]);

  const [fileUploading, setFileUploading] = useState(false);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);

  // Web Share Target: 공유된 파일/텍스트를 캐시에서 꺼내 채팅창에 준비
  useEffect(() => {
    if (!shareTarget) return;
    onConsumeShareTarget?.();

    void (async () => {
      try {
        // 텍스트/URL을 입력창에 설정
        const parts: string[] = [];
        if (shareTarget.title) parts.push(shareTarget.title);
        if (shareTarget.text && shareTarget.text !== shareTarget.url) parts.push(shareTarget.text);
        if (shareTarget.url) parts.push(shareTarget.url);
        if (parts.length > 0) {
          const msg = parts.join('\n');
          setInputMsg(msg);
          inputMsgRef.current = msg;
        }

        // 공유된 파일을 SW 캐시에서 꺼내 pendingAttachmentFiles에 추가
        if (shareTarget.fileCount > 0 && 'caches' in window) {
          const cache = await caches.open('erp-share-target-v1');
          const keys = await cache.keys();
          const shareKeys = keys.filter((req) => req.url.includes(`/share-target-file/${shareTarget.id}/`));
          const files: File[] = [];
          for (const req of shareKeys) {
            const res = await cache.match(req);
            if (!res) continue;
            const buf = await res.arrayBuffer();
            const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
            const fileName = res.headers.get('X-File-Name') ||
              decodeURIComponent(new URL(req.url).searchParams.get('name') || 'file');
            files.push(new File([buf], fileName, { type: contentType }));
            await cache.delete(req);
          }
          if (files.length > 0) {
            setPendingAttachmentFiles((prev) => [...prev, ...files]);
          }
        }
      } catch (err) {
        console.warn('[Share Target] 파일 복원 실패:', err);
      }
    })();
  }, [shareTarget]);
  const getFileKind = (mime: string): 'image' | 'video' | 'file' => {
    if (!mime) return 'file';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
  };
  const [isDragging, setIsDragging] = useState(false);

  const appendPendingAlbumFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const previewUrls = imageFiles.map((file) => URL.createObjectURL(file));
    setPendingAlbumFiles((prev) => [...prev, ...imageFiles]);
    setAlbumPreviewUrls((prev) => [...prev, ...previewUrls]);
  }, []);

  const processFileUpload = async (
    file: File,
    options?: {
      contentSnapshot?: string;
      shouldClearSnapshot?: boolean;
      albumId?: string | null;
      albumIndex?: number | null;
      albumTotal?: number | null;
    }
  ) => {
    if (file.type.startsWith('image/')) {
      // 사진: 용량 제한 없음
    } else if (file.type.startsWith('video/')) {
      if (file.size > MAX_VIDEO_SIZE_BYTES) {
        toast('동영상 크기는 200MB 이하여야 합니다.');
        return false;
      }
    } else {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast('파일 크기는 20MB 이하여야 합니다.');
        return false;
      }
    }
    const contentSnapshot = options?.contentSnapshot ?? inputMsgRef.current;
    const uploadFileName = buildUploadRequestFileName(file);
    setFileUploading(true);
    try {
      const uploadViaAppServer = async () => {
        const formData = new FormData();
        formData.append('file', file, uploadFileName);

        const fallbackResponse = await fetch('/api/chat/upload', {
          method: 'POST',
          body: formData,
        });
        const fallbackPayload = await fallbackResponse.json().catch(() => null) as {
          provider?: 'supabase' | 'r2';
          bucket?: string;
          path?: string;
          fileName?: string;
          url?: string;
          error?: string;
        } | null;

        if (!fallbackResponse.ok || !fallbackPayload?.path || !fallbackPayload?.url) {
          throw new Error(fallbackPayload?.error || `파일 업로드에 실패했습니다. (HTTP ${fallbackResponse.status})`);
        }

        return fallbackPayload;
      };

      const response = await fetch('/api/chat/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: uploadFileName,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        provider?: 'supabase' | 'r2';
        bucket?: string;
        path?: string;
        token?: string;
        signedUrl?: string;
        url?: string;
        headers?: Record<string, string>;
        error?: string;
      } | null;
      if (!response.ok || !payload?.path || !payload?.signedUrl || !payload?.provider) {
        throw new Error(payload?.error || `파일 업로드 준비에 실패했습니다. (HTTP ${response.status})`);
      }

      let publicUrl =
        payload.url || (
          payload.provider === 'supabase' && payload.bucket
            ? supabase.storage.from(payload.bucket).getPublicUrl(payload.path).data.publicUrl
            : ''
        );
      try {
        let uploadErrorMessage = '';
        if (payload.provider === 'supabase' && payload.bucket && payload.token) {
          const uploadClient = supabase.storage.from(payload.bucket) as typeof supabase.storage extends {
            from: (...args: unknown[]) => infer TStorageClient;
          }
            ? TStorageClient & {
                uploadToSignedUrl?: (
                  path: string,
                  token: string,
                  fileBody: File,
                  options?: Record<string, unknown>,
                ) => Promise<{ error: { message?: string } | null }>;
              }
            : {
                uploadToSignedUrl?: (
                  path: string,
                  token: string,
                  fileBody: File,
                  options?: Record<string, unknown>,
                ) => Promise<{ error: { message?: string } | null }>;
              };

          if (typeof uploadClient.uploadToSignedUrl === 'function') {
            const uploadResult = await uploadClient.uploadToSignedUrl(payload.path, payload.token, file, {
              contentType: file.type || 'application/octet-stream',
              upsert: false,
              cacheControl: '3600',
            });
            uploadErrorMessage = uploadResult.error?.message || '';
          }
        }

        if (payload.provider !== 'supabase' || uploadErrorMessage) {
          const directUploadResponse = await fetch(payload.signedUrl, {
            method: 'PUT',
            headers: payload.provider === 'r2'
              ? payload.headers || { 'content-type': file.type || 'application/octet-stream' }
              : {
                  'content-type': file.type || 'application/octet-stream',
                  'x-upsert': 'false',
                  'cache-control': '3600',
                },
            body: file,
          });

          if (!directUploadResponse.ok) {
            throw new Error(uploadErrorMessage || `Storage 직접 업로드에 실패했습니다. (HTTP ${directUploadResponse.status})`);
          }
        }
      } catch (directUploadError) {
        console.warn('직접 업로드 실패, 서버 업로드로 재시도합니다.', directUploadError);
        const fallbackPayload = await uploadViaAppServer();
        publicUrl = fallbackPayload.url || '';
      }

      if (!publicUrl) {
        throw new Error('업로드된 파일 URL을 확인하지 못했습니다.');
      }

      const fileKind = getFileKind(file.type || '');
      return await handleSendMessage({
        fileUrl: publicUrl,
        fileSizeBytes: file.size,
        fileKind,
        fileName: uploadFileName,
        contentOverride: contentSnapshot.trim(),
        clearComposerIfUnchangedFrom: options?.shouldClearSnapshot === false ? undefined : contentSnapshot,
        albumId: options?.albumId ?? null,
        albumIndex: options?.albumIndex ?? null,
        albumTotal: options?.albumTotal ?? null,
      });
    } catch (err: unknown) {
      console.error('파일 업로드 실패:', err);
      const msg = (err as Error)?.message || String(err);
      const hint = msg.includes('Unauthorized')
        ? '로그인 세션이 만료되었을 수 있습니다. 다시 로그인 후 시도해 주세요.'
        : msg.includes('버킷') || msg.includes('bucket') || msg.includes('not found') || msg.includes('r2')
          ? 'Cloudflare R2 설정 또는 Supabase Storage 버킷 구성이 올바른지 확인해 주세요.'
          : msg.includes('413') || msg.toLowerCase().includes('entity too large')
            ? '서버 요청 한도를 초과했습니다. 이 경우 직접 업로드 경로가 반영된 최신 버전으로 다시 실행해 주세요.'
            : msg;
      toast(`파일 업로드에 실패했습니다.\n\n${hint}`, 'error');
      return false;
    } finally {
      setFileUploading(false);
    }
  };

  const confirmPendingAttachmentUpload = useCallback(async () => {
    if (pendingAttachmentFiles.length === 0) return;
    const queuedFiles = [...pendingAttachmentFiles];
    const contentSnapshot = inputMsgRef.current;
    setPendingAttachmentFiles([]);
    for (const [index, attachmentFile] of queuedFiles.entries()) {
      await processFileUpload(attachmentFile, {
        contentSnapshot: index === 0 ? contentSnapshot : '',
      });
    }
  }, [pendingAttachmentFiles, processFileUpload]);

  const cancelPendingAttachmentUpload = useCallback(() => {
    setPendingAttachmentFiles([]);
  }, []);

  // ── 앨범 처리 함수 ──
  const handleAlbumFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    appendPendingAlbumFiles(files);
    e.target.value = '';
  }, [appendPendingAlbumFiles]);

  const removeAlbumFile = useCallback((index: number) => {
    URL.revokeObjectURL(albumPreviewUrls[index]);
    setPendingAlbumFiles(prev => prev.filter((_, i) => i !== index));
    setAlbumPreviewUrls(prev => prev.filter((_, i) => i !== index));
  }, [albumPreviewUrls]);

  const cancelAlbumUpload = useCallback(() => {
    albumPreviewUrls.forEach(u => URL.revokeObjectURL(u));
    setPendingAlbumFiles([]);
    setAlbumPreviewUrls([]);
  }, [albumPreviewUrls]);

  const sendAlbum = useCallback(async () => {
    if (pendingAlbumFiles.length === 0 || !selectedRoomId) return;
    const files = [...pendingAlbumFiles];
    const composerSnapshot = inputMsgRef.current;
    cancelAlbumUpload();

    // 1장이면 일반 전송
    if (files.length === 1) {
      await processFileUpload(files[0], { contentSnapshot: composerSnapshot });
      return;
    }

    // 2장 이상: 공통 album_id 생성 후 순서대로 전송
    const albumId = crypto.randomUUID();
    let successCount = 0;
    let failedCount = 0;
    let captionConsumed = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sent = await processFileUpload(file, {
        contentSnapshot: captionConsumed ? '' : composerSnapshot,
        shouldClearSnapshot: !captionConsumed,
        albumId,
        albumIndex: i,
        albumTotal: files.length,
      });
      if (sent) {
        successCount += 1;
        captionConsumed = true;
      } else {
        failedCount += 1;
      }
    }

    if (successCount > 0) {
      requestAnimationFrame(() => scrollToBottom('smooth'));
    }

    if (failedCount > 0) {
      if (successCount > 0) {
        toast(`사진 ${successCount}장은 전송했고 ${failedCount}장은 실패했습니다.`, 'warning');
      } else {
        toast('선택한 사진 업로드에 모두 실패했습니다.', 'error');
      }
    }
  }, [pendingAlbumFiles, selectedRoomId, cancelAlbumUpload, processFileUpload]);

  const handleComposerPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = Array.from(e.clipboardData?.items || []);
    if (clipboardItems.length === 0) return;

    const imageFiles = clipboardItems
      .filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);

    if (imageFiles.length === 0) return;

    e.preventDefault();
    if (imageFiles.length > 1 || pendingAlbumFiles.length > 0) {
      appendPendingAlbumFiles(imageFiles);
      return;
    }
    setPendingAttachmentFiles((prev) => [...prev, ...imageFiles]);
  }, [appendPendingAlbumFiles, pendingAlbumFiles.length]);

  const queueDroppedFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const otherFiles = files.filter((file) => !file.type.startsWith('image/'));
    const shouldBundleImages = imageFiles.length > 1 || (pendingAlbumFiles.length > 0 && imageFiles.length > 0);

    if (shouldBundleImages) {
      appendPendingAlbumFiles(imageFiles);
      if (otherFiles.length > 0) {
        setPendingAttachmentFiles((prev) => [...prev, ...otherFiles]);
      }
      return;
    }

    setPendingAttachmentFiles((prev) => [...prev, ...files]);
  }, [appendPendingAlbumFiles, pendingAlbumFiles.length]);

  const handleAttachmentSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    queueDroppedFiles(files);
    e.target.value = '';
  }, [queueDroppedFiles]);

  useEffect(() => {
    setPendingAttachmentFiles([]);
    setPendingAlbumFiles([]);
    setAlbumPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
  }, [selectedRoomId]);

  const handleAction = async (type: 'task') => {
    if (!activeActionMsg) return;
    if (type === 'task') {
      if (!effectiveTodoUserId) {
        toast('연결된 직원 계정을 찾지 못했습니다.');
        setActiveActionMsg(null);
        return;
      }
      const content =
        getMessageDisplayText(
          activeActionMsg.content,
          activeActionMsg.file_name,
          activeActionMsg.file_url
        ) || '첨부 파일 확인';
      const { error } = await supabase.from('todos').insert([{
        user_id: effectiveTodoUserId,
        content: `[채팅] ${content}`,
        is_complete: false,
        task_date: getKoreanTodayString(),
        source_message_id: activeActionMsg.id,
        source_room_id: activeActionMsg.room_id,
      }]);
      if (!error) {
        toast('할 일 등록 완료', 'success');
        if (onRefresh) onRefresh();
      } else {
        toast('할 일 등록 중 오류가 발생했습니다.', 'error');
      }
    }
    setActiveActionMsg(null);
  };

  const createGroupChat = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return toast('방 이름과 멤버를 선택해 주세요.', 'warning');
    if (!effectiveChatUserId) return toast('연결된 직원 계정을 찾지 못했습니다.', 'error');
    const { data: room, error } = (await supabase.from('chat_rooms').insert([{
      name: groupName,
      type: 'group',
      created_by: effectiveChatUserId,
      members: [effectiveChatUserId, ...selectedMembers]
    }]).select(CHAT_ROOM_SELECT).single()) as { data: ChatRoom | null; error: unknown };

    if (!error && room) {
      setGroupName('');
      setSelectedMembers([]);
      setShowGroupModal(false);
      setRoom(room.id);
      fetchData();
      setTimeout(() => fetchData(), 300);
    }
  };

  const groupedStaffs = useMemo(() => {
    const grouped: Record<string, Record<string, StaffMember[]>> = {};
    allKnownStaffs.forEach(( s: StaffMember) => {
      if (s.status === '퇴사' || s.status === '퇴직') return;
      const company = s.company || '기타';
      const dept = s.department || '미지정';
      if (!grouped[company]) grouped[company] = {};
      if (!grouped[company][dept]) grouped[company][dept] = [];
      grouped[company][dept].push(s);
    });
    return grouped;
  }, [allKnownStaffs]);

  const openDirectChat = useCallback(async ( staff: StaffMember) => {
    const otherId = String(staff?.id || '').trim();
    if (!effectiveChatUserId || !otherId) {
      toast('채팅 상대를 찾지 못했습니다.');
      return;
    }

    try {
      const { data: rooms, error } = (await supabase
        .from('chat_rooms')
        .select(CHAT_ROOM_SELECT)
        .eq('type', 'direct')) as { data: ChatRoom[] | null; error: unknown };
      if (error) throw error;

      const repairedRooms = await repairDirectRooms(rooms || []);
      const isSelfTarget = otherId === effectiveChatUserId;
      const targetMembers = new Set(isSelfTarget ? [effectiveChatUserId] : [effectiveChatUserId, otherId]);
      const foundRoom = repairedRooms
        .filter(( room: ChatRoom) => {
          const members = Array.isArray(room?.members)
            ? room.members.map((memberId: unknown) => String(memberId))
            : [];
          return members.length === targetMembers.size && [...targetMembers].every((memberId) => members.includes(memberId));
        })
        .sort((a: ChatRoom, b: ChatRoom) =>
          new Date(b.last_message_at || b.created_at || 0).getTime() -
          new Date(a.last_message_at || a.created_at || 0).getTime()
        )[0];

      if (foundRoom) {
        setChatRooms((prev) =>
          sortChatRoomsWithNoticeFirst([
            ...prev.filter(( room: ChatRoom) => String(room.id) !== String(foundRoom.id)),
            isSelfTarget ? { ...foundRoom, name: SELF_ROOM_NAME, type: 'direct' as const, members: [effectiveChatUserId] } : foundRoom,
          ])
        );
        setRoom(foundRoom.id);
      } else {
        const { data: room, error: insertError } = (await supabase
          .from('chat_rooms')
          .insert([{
            name: isSelfTarget ? SELF_ROOM_NAME : `${staff.name}`,
            type: 'direct',
            members: isSelfTarget ? [effectiveChatUserId] : [effectiveChatUserId, otherId],
          }])
          .select(CHAT_ROOM_SELECT)
          .single()) as { data: ChatRoom | null; error: unknown };
        if (insertError) throw insertError;
        if (room) {
          setChatRooms((prev) =>
            sortChatRoomsWithNoticeFirst([
              ...prev.filter((candidate: ChatRoom) => String(candidate.id) !== String(room.id)),
              isSelfTarget ? { ...room, name: SELF_ROOM_NAME, type: 'direct' as const, members: [effectiveChatUserId] } : room,
            ])
          );
          setRoom(room.id);
          await fetchData();
        }
      }

      setViewMode('chat');
    } catch (error) {
      console.error('openDirectChat failed', error);
      toast('채팅방을 여는 중 오류가 발생했습니다.', 'error');
    }
  }, [effectiveChatUserId, fetchData, repairDirectRooms]);
  const openMemberFromGlobalSearch = useCallback(async (staff: StaffMember) => {
    closeGlobalSearch();
    await openDirectChat(staff);
  }, [closeGlobalSearch, openDirectChat]);

  const mediaMessages = useMemo(() => {
    return messages.filter((m: ChatMessage) => m.file_url && !m.is_deleted);
  }, [messages]);

  const filteredMediaMessages = useMemo(() => {
    if (mediaFilter === 'all') return mediaMessages;
    if (mediaFilter === 'media') {
      return mediaMessages.filter((m: ChatMessage) => resolveAttachmentKind(m.file_url, m.file_kind) !== 'file');
    }
    return mediaMessages.filter(( m: ChatMessage) => {
      const attachmentKind = resolveAttachmentKind(m.file_url, m.file_kind);
      if (mediaFilter === 'image') return attachmentKind === 'image';
      if (mediaFilter === 'video') return attachmentKind === 'video';
      return attachmentKind === 'file';
    });
  }, [mediaMessages, mediaFilter]);

  const sharedMediaPreviewMessages = useMemo(
    () =>
      mediaMessages
        .filter((message) => resolveAttachmentKind(message.file_url, message.file_kind) !== 'file')
        .slice(-6),
    [mediaMessages]
  );

  const sharedFilePreviewMessages = useMemo(
    () =>
      mediaMessages
        .filter((message) => {
          const fileUrl = String(message.file_url || '');
          if (!fileUrl) return false;
          if (message.file_kind === 'file') return true;
          return resolveAttachmentKind(fileUrl, message.file_kind) === 'file';
        })
        .slice(-6),
    [mediaMessages]
  );

  const openMediaArchive = useCallback((nextFilter: MediaFilter) => {
    setMediaFilter(nextFilter);
    setShowDrawer(false);
    setShowMediaPanel(true);
  }, []);

  const sharedLinkPreviewMessages = useMemo(
    () => messages.filter((message) => message.content && message.content.includes('http')).slice(-3),
    [messages]
  );

  const openAttachmentPreviewForMessage = useCallback(
    (message: ChatMessage) => {
      const attachmentUrl = String(message.file_url || '').trim();
      if (!attachmentUrl) return;

      const previewKind = resolveAttachmentKind(attachmentUrl, message.file_kind);
      if (previewKind === 'image' && message.album_id) {
        const albumMessages = sortAlbumMessages(
          messages.filter(
            (candidate) =>
              !candidate.is_deleted &&
              String(candidate.album_id || '') === String(message.album_id || '') &&
              resolveAttachmentKind(candidate.file_url, candidate.file_kind) === 'image'
          )
        );

        if (albumMessages.length > 1) {
          const previewItems = albumMessages
            .map((candidate) =>
              buildAttachmentPreviewItem(
                candidate.file_url,
                candidate.file_name,
                resolveAttachmentKind(candidate.file_url, candidate.file_kind)
              )
            )
            .filter((item): item is AttachmentPreviewItem => Boolean(item));
          const startIndex = Math.max(
            0,
            albumMessages.findIndex((candidate) => String(candidate.id) === String(message.id))
          );

          if (previewItems.length > 1) {
            openAttachmentPreviewGallery(previewItems, startIndex);
            return;
          }
        }
      }

      openAttachmentPreview(attachmentUrl, message.file_name || null, previewKind);
    },
    [buildAttachmentPreviewItem, messages, openAttachmentPreview, openAttachmentPreviewGallery]
  );

  const mentionCandidates = useMemo(() => {
    if (!showMentionList) return [];
    const base =
      Array.isArray(roomMembers) && roomMembers.length > 0
        ? roomMembers
        : staffs;
    const q = mentionQuery.trim();
    if (!q) return base.slice(0, 8);
    return base
      .filter((s) =>
        (s.name || '').toLowerCase().includes(q.toLowerCase())
      )
      .slice(0, 8);
  }, [showMentionList, mentionQuery, roomMembers, staffs]);

  const handleCreatePoll = async () => {
    if (!pollQuestion.trim()) { toast('질문을 입력해 주세요.', 'warning'); return; }
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) { toast('선택지는 최소 2개 이상 입력해 주세요.', 'warning'); return; }
    try {
        const { data: poll, error } = await supabase.from('polls').insert([{
        room_id: selectedRoomId, creator_id: effectiveChatUserId || user?.id, question: pollQuestion, options
      }]).select().single();
      if (!error && poll) {
        setPolls((p) => [...p, poll as PollItem]);
        setPollQuestion('');
        setPollOptions(['찬성', '반대']);
        setShowPollModal(false);
      } else throw new Error();
    } catch {
      const id = Date.now().toString();
      setPolls((p) => [...p, { id, room_id: selectedRoomId, question: pollQuestion, options }]);
      setPollQuestion('');
      setPollOptions(['찬성', '반대']);
      setShowPollModal(false);
    }
  };

  const handleVote = async (pollId: string, optionIndex: number) => {
    try {
      // 이전 투표 옵션 확인
      const { data: prevVote } = await supabase
        .from('poll_votes')
        .select('option_index')
        .eq('poll_id', pollId)
        .eq('user_id', effectiveChatUserId || user?.id)
        .maybeSingle();
      const prevOptionIndex = prevVote?.option_index as number | null | undefined;

      const { error } = await supabase.from('poll_votes').upsert(
        { poll_id: pollId, user_id: effectiveChatUserId || user?.id, option_index: optionIndex },
        { onConflict: 'poll_id,user_id' }
      );
      if (!error) {
        // 낙관적 업데이트: 이전 옵션 -1, 새 옵션 +1
        setPollVotes((prev) => {
          const ex = { ...(prev[pollId] || {}) };
          if (prevOptionIndex != null && prevOptionIndex !== optionIndex) {
            ex[prevOptionIndex] = Math.max((ex[prevOptionIndex] || 0) - 1, 0);
          }
          if (prevOptionIndex !== optionIndex) {
            ex[optionIndex] = (ex[optionIndex] || 0) + 1;
          }
          return { ...prev, [pollId]: ex };
        });
        fetchData();
      }
    } catch (_) { }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      const { data: myReact } = await supabase.from('message_reactions').select('id').eq('message_id', messageId).eq('user_id', effectiveChatUserId || user!.id).eq('emoji', emoji).maybeSingle();
      if (myReact) {
        await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', effectiveChatUserId || user!.id).eq('emoji', emoji);
      } else {
        await supabase.from('message_reactions').insert([{ message_id: messageId, user_id: effectiveChatUserId || user!.id, emoji }]);
      }
      await fetchData();
    } catch (error) {
      console.error('toggleReaction error', error);
    }
  };

  const togglePin = async (messageId: string) => {
    const normalizedMessageId = String(messageId);
    const isPinned = pinnedIds.includes(normalizedMessageId);
    try {
      if (isPinned) {
        const { error } = await supabase
          .from('pinned_messages')
          .delete()
          .eq('room_id', selectedRoomId)
          .eq('message_id', normalizedMessageId);
        if (error) throw error;
        setPinnedIds([]);
        writeStoredPinnedIds(selectedRoomId, []);
      } else {
        const { error: clearError } = await supabase.from('pinned_messages').delete().eq('room_id', selectedRoomId);
        if (clearError) throw clearError;
        const { error: insertError } = await supabase
          .from('pinned_messages')
          .insert([{ room_id: selectedRoomId, message_id: normalizedMessageId, pinned_by: effectiveChatUserId || user?.id }]);
        if (insertError) throw insertError;
        setPinnedIds([normalizedMessageId]);
        writeStoredPinnedIds(selectedRoomId, [normalizedMessageId]);
      }
      await fetchData();
    } catch (error) {
      console.error('공지 등록 상태 변경 실패:', error);
      toast(isPinned ? '공지 해제에 실패했습니다.' : '공지 등록에 실패했습니다.', 'error');
    }
  };

  const toggleBookmark = async (messageId: string) => {
    const normalizedMessageId = String(messageId);
    const isBookmarked = bookmarkedIds.has(normalizedMessageId);
    const nextBookmarkIds = isBookmarked
      ? Array.from(bookmarkedIds).filter((id) => id !== normalizedMessageId)
      : [...Array.from(bookmarkedIds), normalizedMessageId];
    try {
      if (!effectiveTodoUserId) {
        throw new Error('missing-user');
      }
      if (isBookmarked) {
        const { error } = await supabase
          .from('message_bookmarks')
          .delete()
          .eq('user_id', effectiveTodoUserId)
          .eq('message_id', normalizedMessageId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('message_bookmarks').insert([
          {
            user_id: effectiveTodoUserId,
            message_id: normalizedMessageId,
            room_id: selectedRoomId,
          },
        ]);
        if (error) throw error;
      }
      setBookmarkedIds(new Set(nextBookmarkIds));
      writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
      await fetchData();
    } catch (error) {
      console.error('toggleBookmark error', error);
      setBookmarkedIds(new Set(nextBookmarkIds));
      writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
    }
  };

  const markMessageRead = async (msg: ChatMessage) => {
    if (String(msg.sender_id) === effectiveChatUserId) return;
    try {
        const targetRoomIds = getConversationRoomIdsByRoomId(msg.room_id, chatRoomsRef.current as ChatRoom[]);
        const readAt = new Date().toISOString();
        await persistMessageReads([msg.id]);
        await Promise.allSettled(
          (targetRoomIds.length > 0 ? targetRoomIds : [String(msg.room_id)]).map((roomId) =>
            persistRoomReadCursor(roomId, readAt)
          )
        );
        broadcastChatSync('message-read', msg.room_id);
        fetchData();
    } catch (_) { }
  };

  const handleGlobalSearch = useCallback(async (rawQuery?: string) => {
    const q = String(rawQuery ?? globalSearchQuery).trim();
    if (!q) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }
    setGlobalSearchLoading(true);
    try {
      if (visibleRoomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }
      // 대화내용 + 파일URL(파일명·사진명) 통합 OR 검색
      const { data, error } = await withMissingColumnsFallback<ChatMessage[]>(
        (omittedColumns) => {
          const searchableColumns = ['content'];
          if (!omittedColumns.has('file_url')) {
            searchableColumns.push('file_url');
          }

          let query = supabase
            .from('messages')
            .select(buildChatMessageSelect(omittedColumns))
            .in('room_id', visibleRoomIds)
            .or(searchableColumns.map((column) => `${column}.ilike.%${q}%`).join(','))
            .order('created_at', { ascending: false })
            .limit(100);

          if (!omittedColumns.has('is_deleted')) {
            query = query.eq('is_deleted', false);
          }

          return query as PromiseLike<{ data: ChatMessage[] | null; error: unknown }>;
        },
        [...CHAT_MESSAGE_OPTIONAL_COLUMNS],
      );

      if (error) throw error;
      const messageRows = Array.isArray(data) ? data : [];
      const relatedRoomIds = Array.from(new Set(messageRows.map(( message: ChatMessage) => String(message.room_id)).filter(Boolean)));
      if (relatedRoomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }
      const { data: roomRows, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, name, type, members')
        .in('id', relatedRoomIds);
      if (roomError) throw roomError;

      const roomMap = new Map<string, ChatRoom>();
      (roomRows || []).forEach(( room: ChatRoom) => {
        roomMap.set(String(room.id), room);
      });

      const enrichedRows = messageRows.map(( message: ChatMessage) => ({
        ...message,
        staff: resolveStaffProfile(message.sender_id, message.sender_name),
        chat_rooms: roomMap.get(String(message.room_id)) || null,
      }));

      setGlobalSearchResults(enrichedRows);
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalSearchLoading(false);
    }
  }, [globalSearchQuery, resolveStaffProfile, visibleRoomIds]);
  useEffect(() => {
    if (!showGlobalSearch) return;
    const q = deferredGlobalSearchQuery.trim();
    if (!q) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      void handleGlobalSearch(q);
    }, 180);
    return () => clearTimeout(timer);
  }, [deferredGlobalSearchQuery, handleGlobalSearch, showGlobalSearch]);

  const visibleTimelineMessages = useMemo(() => {
    const msgs = messages;
    if (deferredChatSearch.trim()) {
      const q = deferredChatSearch.toLowerCase();
      return msgs.filter((m) =>
        ((m.is_deleted ? getDeletedMessagePreviewText() : (m.content || ''))).toLowerCase().includes(q) ||
        ((m.staff as { name?: string } | null | undefined)?.name || '').toLowerCase().includes(q)
      );
    }
    return msgs;
  }, [messages, deferredChatSearch]);
  const activeMessageHighlightQuery = deferredChatSearch.trim() || transientHighlightQuery.trim();
  const selectedRoomPollTimelineItems = useMemo(
    () =>
      polls
      .filter((p: Record<string, unknown>) => p.room_id === selectedRoomId)
      .map(p => ({ ...p, type: 'poll', created_at: p.created_at || new Date().toISOString() })),
    [polls, selectedRoomId]
  );
  const combinedTimeline = useMemo(() => {
    const ms = visibleTimelineMessages.map(m => ({ ...m, type: 'message' }));
    const ps = selectedRoomPollTimelineItems;
    const sorted = [...ms, ...ps].sort((a, b) => new Date((a as Record<string,unknown>).created_at as string || 0).getTime() - new Date((b as Record<string,unknown>).created_at as string || 0).getTime());

    // album_id 있는 이미지 메시지를 하나의 'album' 아이템으로 합침
    const grouped: typeof sorted = [];
    const albumMap = new Map<string, ChatMessage[]>();
    const albumOrder: string[] = [];

    for (const item of sorted) {
      const msg = item as unknown as ChatMessage & { album_id?: string };
      if (msg.type === 'message' && msg.album_id && resolveAttachmentKind(msg.file_url, msg.file_kind) === 'image' && !msg.is_deleted) {
        const aid = msg.album_id;
        if (!albumMap.has(aid)) {
          albumMap.set(aid, []);
          albumOrder.push(aid);
        }
        albumMap.get(aid)!.push(msg);
      } else {
        grouped.push(item);
      }
    }

    // album 아이템을 첫 번째 메시지 위치에 삽입
    for (const aid of albumOrder) {
      const msgs = sortAlbumMessages(albumMap.get(aid)!);
      const representative =
        msgs.find((message) => Number(message.album_index) === 0) ||
        msgs.find((message) => String(message.content || '').trim()) ||
        msgs[0];
      const albumItem = {
        ...representative,
        type: 'album',
        albumMessages: msgs,
      };
      grouped.push(albumItem);
    }

    return grouped.sort((a, b) => new Date((a as Record<string,unknown>).created_at as string || 0).getTime() - new Date((b as Record<string,unknown>).created_at as string || 0).getTime());
  }, [selectedRoomPollTimelineItems, visibleTimelineMessages]);

  useEffect(() => {
    const load = async () => {
      if (!(effectiveChatUserId || user?.id) || !selectedRoomId) {
        setRoomNotifyOn(true);
        return;
      }
      const { data, error } = await supabase
        .from('room_notification_settings')
        .select('notifications_enabled')
        .eq('user_id', effectiveChatUserId || user?.id)
        .eq('room_id', selectedRoomId)
        .maybeSingle();
      if (error) {
        setRoomNotifyOn(true);
        return;
      }
      setRoomNotifyOn(data?.notifications_enabled !== false);
    };
    load();
  }, [selectedRoomId, effectiveChatUserId, user?.id]);
  const toggleRoomNotify = async () => {
    if (!(effectiveChatUserId || user?.id) || !selectedRoomId) return;
    setRoomNotifyOn((p) => !p);
    await supabase.from('room_notification_settings').upsert({ user_id: effectiveChatUserId || user?.id, room_id: selectedRoomId, notifications_enabled: !roomNotifyOn }, { onConflict: 'user_id,room_id' });
  };

  const deleteMessage = async (msg: ChatMessage) => {
    if (selectedRoom?.id === NOTICE_ROOM_ID && !isMso) {
      toast('공지 채널 메시지는 삭제할 수 없습니다.', 'success');
      return;
    }
    if (String(msg.sender_id) !== String(effectiveChatUserId || user?.id || '') && !isMso) return;
    if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
    let nextMessagesSnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      nextMessagesSnapshot = prev.map((message: ChatMessage) =>
        String(message.id) === String(msg.id)
          ? {
              ...message,
              is_deleted: true,
            }
          : message
      );
      return nextMessagesSnapshot;
    });
    setPersistedPinnedMessages((prev) =>
      prev.map((message: ChatMessage) =>
        String(message.id) === String(msg.id)
          ? {
              ...message,
              is_deleted: true,
            }
          : message
      )
    );
    syncRoomSummaryFromMessages(msg.room_id || selectedRoomId, nextMessagesSnapshot);
    await supabase.from('messages').update({ is_deleted: true }).eq('id', msg.id);
    // 감사 로그 기록
    try {
      await supabase.from('audit_logs').insert([
        {
          user_id: user?.id,
          user_name: user?.name,
          action: 'message_delete',
          target_type: 'message',
          target_id: msg.id,
          details: {
            room_id: selectedRoomId,
            content: msg.content,
          },
        },
      ]);
      } catch {
      }
    fetchData();
    setActiveActionMsg(null);
  };

  const openMessageActions = useCallback((msg: ChatMessage) => {
    markMessageRead(msg);
    setActiveActionMsg(msg);
  }, [markMessageRead]);

  const startReplyToMessage = useCallback((msg: ChatMessage) => {
    setReplyTo(msg);
    setActiveActionMsg(null);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      if (!isMobileChatViewport()) {
        composerRef.current?.scrollIntoView({ block: 'nearest' });
      }
    });
  }, []);


  const startForwardMessage = useCallback((msg: ChatMessage) => {
    setForwardSourceMsg(msg);
    setShowForwardModal(true);
    setActiveActionMsg(null);
  }, []);

  const openReadStatusPanel = useCallback((msg: ChatMessage) => {
    void loadReadStatusForMessage(msg);
    setActiveActionMsg(null);
  }, [loadReadStatusForMessage]);

  const openThreadPanel = useCallback((msg: ChatMessage) => {
    setThreadRoot(msg);
    setActiveActionMsg(null);
  }, []);

  const deleteMessageFromActions = useCallback(async (msg: ChatMessage) => {
    await deleteMessage(msg);
  }, [deleteMessage]);

  const startEditMessage = useCallback((msg: ChatMessage) => {
    if (String(msg.sender_id) !== String(effectiveChatUserId || user?.id || '') && !isMso) return;
    setEditingMessage(msg);
    setEditingMessageDraft(msg.content || '');
    setActiveActionMsg(null);
  }, [effectiveChatUserId, isMso, user?.id]);

  const saveEditedMessage = useCallback(async () => {
    if (!editingMessage) return;
    const targetMessage = editingMessage;
    const nextContent = editingMessageDraft.trim();
    if (!nextContent) {
      toast('메시지 내용을 입력해 주세요.', 'warning');
      return;
    }

    const messageId = String(targetMessage.id);
    setEditingMessage(null);
    setEditingMessageDraft('');
    let nextMessagesSnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      nextMessagesSnapshot = prev.map((message: ChatMessage) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent }
          : message
      );
      return nextMessagesSnapshot;
    });
    setPersistedPinnedMessages((prev) =>
      prev.map((message: ChatMessage) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent }
          : message
      )
    );
    syncRoomSummaryFromMessages(targetMessage.room_id || selectedRoomId, nextMessagesSnapshot);

    const { error } = await supabase
      .from('messages')
      .update({ content: nextContent })
      .eq('id', targetMessage.id);

    if (error) {
      toast('메시지 수정 실패', 'error');
      fetchData();
      return;
    }
  }, [editingMessage, editingMessageDraft, fetchData, selectedRoomId, syncRoomSummaryFromMessages]);

  return (
    <div data-testid="chat-view" className="flex flex-1 min-h-0 overflow-hidden relative font-sans bg-[var(--background)] md:h-[100dvh] md:max-h-[100dvh] md:bg-[var(--card)]">

      <aside className={`${selectedRoomId ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-[var(--border)] dark:border-zinc-800 bg-[var(--card)] dark:bg-zinc-950 flex-col shrink-0 z-50 transition-all`}>
        <div className="p-3 md:p-3 space-y-3 flex flex-col min-h-0">
          <div className="flex items-center gap-1">
            <div className="flex flex-1 gap-1 bg-[var(--tab-bg)] dark:bg-zinc-800 p-1 rounded-xl glass">
              <button
                data-testid="chat-tab-chat"
                onClick={() => setViewMode('chat')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'chat'
                  ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-premium'
                  : 'text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)] dark:hover:text-[var(--toss-gray-3)]'
                  }`}
              >
                채팅
              </button>
              <button
                data-testid="chat-tab-org"
                onClick={() => setViewMode('org')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'org'
                  ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-premium'
                  : 'text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)] dark:hover:text-[var(--toss-gray-3)]'
                  }`}
              >
                조직도
              </button>
            </div>
            {/* 통합 검색 버튼 — 항상 노출 */}
            <button
              data-testid="chat-open-group-modal-legacy"
              type="button"
              onClick={() => setShowGroupModal(true)}
              title="새 그룹 채팅방 만들기"
              className="hidden"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 4v12"/><path d="M4 10h12"/>
              </svg>
            </button>
            <button
              data-testid="chat-open-global-search"
              onClick={openGlobalSearch}
              title="대화내용·파일·사진 통합 검색"
              className="shrink-0 flex items-center justify-center w-9 h-8 rounded-xl bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--accent)] hover:bg-[var(--toss-blue-light)] transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="5.5"/><line x1="12.5" y1="12.5" x2="18" y2="18"/><path d="M15 3v4"/><path d="M13 5h4"/>
              </svg>
            </button>
          </div>

        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-0.5 custom-scrollbar">
          {viewMode === 'chat' ? (
            <>
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
                  {showHiddenRooms ? '숨김 대화 포함' : '숨김 대화 제외'}
                </span>
                <button
                  type="button"
                  data-testid="chat-toggle-hidden-rooms"
                  onClick={() => setShowHiddenRooms((prev) => !prev)}
                  className="text-[10px] font-semibold text-blue-500 hover:text-blue-600"
                >
                  {showHiddenRooms ? '숨김방 닫기' : '숨김방 보기'}
                </button>
              </div>
              {sidebarRoomItems.map(({ room, roomId, unread, isSelected, isNoticeChannel, label, preview, peerName, peerPhotoUrl, isPeerOnline, isPinned, isHidden, pinnedIndex, pinnedCount }) => {
                  return (
                    <div
                      key={roomId}
                      data-testid={`chat-room-${roomId}`}
                      onClick={() => handleRoomListClick(room.id)}
                      className={`group p-2.5 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-3 border relative overflow-hidden ${isSelected
                        ? 'bg-zinc-800 border-zinc-700 shadow-sm'
                        : 'bg-[var(--card)] dark:bg-zinc-900 border-transparent hover:border-[var(--border)] dark:hover:border-zinc-800'
                        }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/100"></div>
                      )}
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {isNoticeChannel ? (
                            <div
                              data-testid={`chat-room-icon-${roomId}`}
                              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[15px] leading-none text-blue-600 ring-1 ring-blue-200/70"
                            >
                              📢
                            </div>
                          ) : peerName ? (
                            <div
                              data-testid={`chat-room-icon-${roomId}`}
                              className="relative flex h-10 w-10 shrink-0 items-center justify-center"
                            >
                              <MessengerAvatar
                                name={peerName || label}
                                photoUrl={peerPhotoUrl}
                                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-4)] ring-1 ring-black/5 dark:bg-zinc-800"
                                decorative
                              />
                              {isPeerOnline && (
                                <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900" />
                              )}
                            </div>
                          ) : (
                            <div
                              data-testid={`chat-room-icon-${roomId}`}
                              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tab-bg)] text-[15px] leading-none text-[var(--toss-gray-4)] ring-1 ring-black/5 dark:bg-zinc-800"
                            >
                              💬
                            </div>
                          )}
                        <div data-testid={`chat-room-summary-${roomId}`} className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <p className={`text-[12px] font-bold ${room.type === 'group' ? 'line-clamp-2 break-words whitespace-normal leading-4' : 'truncate'} ${isSelected ? 'text-white' : 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]'}`}>
                              {label}
                            </p>
                            {unread > 0 && (
                              <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-bold shadow-soft">
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}
                            {isPinned && <span className="text-[9px] font-bold text-amber-400">PIN</span>}
                            {isHidden && <span className="text-[9px] font-bold text-[var(--toss-gray-3)]">HIDE</span>}
                          </div>
                          <div
                            data-testid={`chat-room-preview-${roomId}`}
                            className={`inline-flex max-w-[190px] items-center rounded-2xl border px-2.5 py-1 text-[10px] font-medium ${
                              isSelected
                                ? 'border-white/10 bg-white/10 text-white/80'
                                : 'border-[var(--border)] bg-[var(--tab-bg)] text-[var(--toss-gray-3)] dark:border-zinc-800 dark:bg-zinc-800/80'
                            }`}
                          >
                            <span className="truncate">{preview}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isNoticeChannel && (
                          <>
                            <button
                              type="button"
                               data-testid={`chat-room-pin-${roomId}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                 toggleRoomPinned(room.id, !isPinned);
                              }}
                              className={`min-w-[44px] min-h-[44px] flex items-center justify-center px-1.5 py-1 rounded-md text-[9px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'}`}
                              title={isPinned ? '고정 해제' : '상단 고정'}
                            >
                              {isPinned ? '해제' : '고정'}
                            </button>
                            {isPinned && (
                              <>
                                <button
                                  type="button"
                                  data-testid={`chat-room-pin-up-${roomId}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    movePinnedRoom(room.id, 'up');
                                  }}
                                  disabled={pinnedIndex <= 0}
                                  className={`min-w-[36px] min-h-[44px] flex items-center justify-center px-1 py-1 rounded-md text-[10px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10 disabled:text-white/30' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 disabled:text-[var(--toss-gray-1)]'} disabled:cursor-not-allowed`}
                                  title="고정방 위로"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  data-testid={`chat-room-pin-down-${roomId}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    movePinnedRoom(room.id, 'down');
                                  }}
                                  disabled={pinnedIndex < 0 || pinnedIndex >= pinnedCount - 1}
                                  className={`min-w-[36px] min-h-[44px] flex items-center justify-center px-1 py-1 rounded-md text-[10px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10 disabled:text-white/30' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 disabled:text-[var(--toss-gray-1)]'} disabled:cursor-not-allowed`}
                                  title="고정방 아래로"
                                >
                                  ↓
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                               data-testid={`chat-room-hide-${roomId}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                updateRoomPreference(room.id, { hidden: !isHidden });
                              }}
                              className={`min-w-[44px] min-h-[44px] flex items-center justify-center px-1.5 py-1 rounded-md text-[9px] font-bold ${isSelected ? 'text-white/80 hover:bg-[var(--card)]/10' : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'}`}
                              title={isHidden ? '숨김 해제' : '대화 숨김'}
                            >
                              {isHidden ? '표시' : '숨김'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
            </>
          ) : (
            <div data-testid="chat-org-list" className="space-y-3">
              {Object.entries(groupedStaffs).map(([company, depts]) => (
                <div key={company} className="space-y-1">
                  {/* 회사 헤더 */}
                  <div className="flex items-center gap-2 px-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/100 shrink-0" />
                    <h3 className="text-[11px] font-black text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] uppercase tracking-wider truncate">{company}</h3>
                    <div className="flex-1 h-[1px] bg-[var(--tab-bg)] dark:bg-zinc-800/50" />
                  </div>
                  {/* 팀(부서) — 클릭 시 접기/펼치기 */}
                  <div className="space-y-0.5 pl-1">
                    {Object.entries(depts as Record<string, StaffMember[]>).map(([dept, members]) => {
                      const key = `${company}::${dept}`;
                      const collapsed = !expandedDepts.has(key);
                      return (
                        <div key={dept}>
                          {/* 팀 헤더 (토글 버튼) */}
                          <button
                            type="button"
                            onClick={() => toggleDept(key)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/60 transition-colors text-left"
                          >
                            <span className={`text-[9px] text-[var(--toss-gray-3)] transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}>▼</span>
                            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] dark:text-[var(--toss-gray-4)] flex-1 truncate">{dept}</span>
                            <span className="text-[9px] font-semibold text-[var(--toss-gray-3)] shrink-0">{(members as StaffMember[]).length}명</span>
                          </button>
                          {/* 팀원 목록 (접힐 때 숨김) */}
                          {!collapsed && (
                            <div className="space-y-0.5 pl-2 pt-0.5 pb-1">
                              {(members as StaffMember[]).map((s: StaffMember) => (
                                <div key={s.id} className="flex items-center gap-2.5 px-2 py-2 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border-subtle)] dark:border-zinc-800/50 rounded-xl hover:border-blue-400/50 dark:hover:border-blue-500/50 transition-all group cursor-default">
                                  <MessengerAvatar
                                    name={s.name}
                                    photoUrl={s.photo_url}
                                    className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-[var(--tab-bg)] text-[11px] font-bold text-[var(--toss-gray-3)] dark:bg-zinc-800"
                                    decorative
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                      <p className="text-[11px] font-bold text-foreground truncate">{s.name}</p>
                                      <span className="text-[9px] font-medium text-[var(--toss-gray-3)] shrink-0">{s.position}</span>
                                    </div>
                                  </div>
                                  <button
                                    data-testid={`chat-direct-${s.id}`}
                                    onClick={() => void openDirectChat(s)}
                                    className="px-2 py-0.5 bg-blue-500/10 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md text-[9px] font-bold opacity-100 transition-all border border-blue-100 dark:border-blue-800/50 shrink-0"
                                  >
                                    대화
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className={`${!selectedRoomId ? 'hidden md:flex' : 'flex'} flex-1 min-h-0 flex-col overflow-hidden bg-[var(--muted)] relative`}>
        {selectedRoomId && selectedRoom && (
          <header className="px-4 py-2.5 flex items-center justify-between border-b border-[var(--border)]/50 dark:border-zinc-800/50 glass glass-border shrink-0 z-40">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setRoom(null)} className="md:hidden text-[var(--toss-gray-3)]">뒤로</button>
              <div data-testid="chat-room-header-avatar" className="flex h-9 w-9 shrink-0 items-center justify-center">
                {selectedRoom.id === NOTICE_ROOM_ID ? (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-lg text-blue-600">
                    📢
                  </div>
                ) : selectedPeer ? (
                  <MessengerAvatar
                    name={selectedPeer.name || selectedRoomLabel}
                    photoUrl={selectedPeerPhotoUrl}
                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-4)] dark:bg-zinc-800"
                    decorative
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--tab-bg)] text-lg text-[var(--toss-gray-4)] dark:bg-zinc-800">
                    💬
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className={`text-[13px] font-bold text-foreground ${selectedRoom.type === 'group' ? 'line-clamp-2 break-words whitespace-normal leading-4' : 'truncate'}`}>
                  {selectedRoomLabel}
                </h3>
                <div className="flex items-center gap-1.5 text-[10px] font-medium">
                  <p className="text-[var(--toss-gray-4)]">
                    {typingNoticeText
                      ? typingNoticeText
                      : selectedPeer
                        ? selectedPeerIsOnline
                          ? '온라인'
                          : '오프라인'
                        : `${roomMembers.length || 0}명 참여중`}
                  </p>
                  <span className="text-[var(--toss-gray-4)]">·</span>
                  <span className={`inline-flex items-center gap-1 ${realtimeConnectionMeta.textClassName}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${realtimeConnectionMeta.dotClassName}`} />
                    <span>{realtimeConnectionMeta.label}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                data-testid="chat-open-drawer"
                onClick={() => setShowDrawer(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-foreground"
                title="채팅방 정보 및 참여자 보기"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M4 5.5H16" />
                  <path d="M4 10H16" />
                  <path d="M4 14.5H16" />
                </svg>
              </button>
            </div>
          </header>
        )}

        {selectedRoomId && noticeMessages.length > 0 && (
          <div className="shrink-0 border-b border-orange-100 bg-orange-500/10/80 px-4 py-3 md:px-4">
            <div className="flex flex-wrap gap-2">
              {noticeMessages.map((pinnedMessage) => (
                <button
                  key={`pin-${pinnedMessage.id}`}
                  type="button"
                  onClick={() => scrollToMessage(pinnedMessage.id)}
                  className="min-w-0 max-w-full rounded-[var(--radius-lg)] border border-orange-500/20 bg-[var(--card)] px-3 py-2 text-left shadow-sm transition-colors hover:bg-orange-500/20"
                >
                  <p className="text-[10px] font-bold text-orange-500">공지 메시지</p>
                  <p className="mt-1 max-w-[280px] truncate text-xs font-semibold text-[var(--foreground)]">
                    {getMessageDisplayText(
                      pinnedMessage.content,
                      pinnedMessage.file_name,
                      pinnedMessage.file_url,
                      '첨부 파일 메시지'
                    )}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          ref={messageListRef}
          data-testid="chat-message-list"
          onScroll={updateScrollPositionState}
          className="flex-1 min-h-0 overflow-y-auto px-2 py-0.5 pb-1 md:px-4 md:py-2 md:pb-2 space-y-0 custom-scrollbar"
        >
          {!selectedRoomId ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
              <span className="text-4xl mb-2">💬</span>
              <p className="text-sm font-bold">채팅방을 선택하세요.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <span className="text-6xl mb-4">💬</span>
              <p className="font-semibold text-sm">대화 내용이 없습니다.</p>
            </div>
          ) : (
            (() => {
              let lastDateLabel = '';
              let lastSenderId = '';
              return combinedTimeline.map((item) => {
                if (item.type === 'poll') {
                  const pollItem = item as unknown as PollItem;
                  const votes = pollVotes[pollItem.id] || {};
                  const totalVotes = (Object.values(votes) as number[]).reduce((a: number, b: number) => a + b, 0);
                  return (
                    <div data-testid={`chat-poll-${pollItem.id}`} key={`poll-${pollItem.id}`} className="max-w-[85%] md:max-w-[70%] bg-blue-500/10 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4 shadow-soft">
                      <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <span className="text-sm">🗳️</span> 투표
                      </p>
                      <p className="mb-4 text-xs font-bold text-foreground leading-relaxed">{pollItem.question}</p>
                      <div className="space-y-1.5">
                        {(pollItem.options || []).map((opt: string, idx: number) => (
                          <button
                            data-testid={`chat-poll-vote-${pollItem.id}-${idx}`}
                            key={idx}
                            onClick={() => handleVote(pollItem.id, idx)}
                            className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-[var(--card)] dark:bg-zinc-800/50 border border-blue-500/20/50 dark:border-blue-700/30 hover:border-blue-400 dark:hover:border-blue-500 transition-all text-[11px] font-medium group"
                          >
                            <span className="text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{opt}</span>
                            <span className="text-blue-600 font-bold bg-blue-500/10 dark:bg-blue-900/50 px-2 py-0.5 rounded-md">
                              {votes[idx] || 0}
                              {totalVotes > 0 && <span className="ml-1 opacity-60 font-medium">({Math.round(((votes[idx] || 0) / totalVotes) * 100)}%)</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                // ── 앨범 그룹 렌더링 ──
                if (item.type === 'album') {
                  type AlbumItem = ChatMessage & { albumMessages: ChatMessage[]; staff?: { name?: string; photo_url?: string | null } | null };
                  const albumItem = item as unknown as AlbumItem;
                  const albumMsgs = albumItem.albumMessages || [];
                  const isMineAlbum = String(albumItem.sender_id) === effectiveChatUserId;
                  const senderName = (albumItem.staff as { name?: string } | null)?.name || albumItem.sender_name || '알 수 없음';
                  const created = new Date(albumItem.created_at || 0);
                  const dateLabel = created.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
                  const showDateDivider = dateLabel !== lastDateLabel;
                  if (showDateDivider) lastDateLabel = dateLabel;
                  lastSenderId = String(albumItem.sender_id);
                  const count = albumMsgs.length;
                  // 그리드 레이아웃: 1장=1열, 2장=2열, 3장=2+1, 4장=2+2, 5+장=3열
                  const gridCols = count === 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : 'grid-cols-3';
                  const timeStr = created.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                  const albumReplyTarget =
                    albumMsgs.find((message) => String(message.content || '').trim()) ||
                    albumMsgs[0] ||
                    albumItem;

                  return (
                    <div
                      data-testid={`chat-album-${albumItem.album_id || albumItem.id}`}
                      key={`album-${albumItem.album_id || albumItem.id}`}
                      className={showDateDivider ? 'mt-0.5 md:mt-1' : 'mt-[2px]'}
                    >
                      {showDateDivider && (
                        <div className="my-0.5 flex items-center justify-center gap-1 md:my-1 md:gap-2">
                          <div className="flex-1 h-px bg-[var(--border)]" />
                          <span className="px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-semibold text-[var(--toss-gray-3)] shrink-0">{dateLabel}</span>
                          <div className="flex-1 h-px bg-[var(--border)]" />
                        </div>
                      )}
                      <div className={`flex items-end gap-2 ${isMineAlbum ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* 아바타 */}
                        {!isMineAlbum && (
                          <MessengerAvatar
                            name={senderName}
                            photoUrl={(albumItem.staff as { photo_url?: string | null } | null)?.photo_url || null}
                            className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--muted)] text-[11px] font-bold text-[var(--toss-gray-4)]"
                            decorative
                          />
                        )}
                        <div className={`flex flex-col gap-1 max-w-[75%] ${isMineAlbum ? 'items-end' : 'items-start'}`}>
                          {!isMineAlbum && (
                            <span className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">{senderName}</span>
                          )}
                          {/* 앨범 그리드 */}
                          <div className={`grid ${gridCols} gap-0.5 rounded-[var(--radius-lg)] overflow-hidden`}
                            style={{ maxWidth: count === 1 ? 200 : count <= 4 ? 260 : 300 }}>
                            {albumMsgs.map((m, idx) => (
                              <button
                                key={m.id}
                                className={`relative overflow-hidden bg-[var(--muted)] ${count === 3 && idx === 2 ? 'col-span-2' : ''} ${count === 5 && idx === 3 ? 'col-span-1' : ''}`}
                                style={{ aspectRatio: count === 1 ? '4/3' : '1/1' }}
                                onClick={() => openAttachmentPreviewForMessage(m)}
                                aria-label={`${m.file_name || `앨범 사진 ${idx + 1}`} 미리보기`}
                              >
                                <img
                                  src={m.file_url || ''}
                                  alt={m.file_name || '사진'}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {idx === 4 && count > 5 && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <span className="text-white font-bold text-lg">+{count - 5}</span>
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                          <div className={`mx-1 flex items-center gap-2 text-[10px] ${isMineAlbum ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[var(--toss-gray-3)]">{timeStr} · 사진 {count}장</span>
                            {albumReplyTarget ? (
                              <button
                                type="button"
                                data-testid={`chat-album-reply-${albumItem.album_id || albumItem.id}`}
                                onClick={() => startReplyToMessage(albumReplyTarget)}
                                className="font-bold text-amber-700 transition-colors hover:text-amber-800"
                              >
                                답글
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                type MsgItem = ChatMessage & { staff?: { name?: string; position?: string; photo_url?: string | null } | null; reply_to_id?: string | null };
                const msg = item as unknown as MsgItem;
                const isMine = String(msg.sender_id) === effectiveChatUserId;
                const isDeletedMessage = Boolean(msg.is_deleted);
                const msgReacts = reactions[msg.id] || {};
                const hasReacts = Object.keys(msgReacts).some(e => (msgReacts[e] || 0) > 0);

                const readersCount = readCounts[msg.id] || 0;
                const totalRecipients = Math.max(
                  0,
                  roomMembers.filter((member) => String(member?.id ?? '') !== String(msg.sender_id || '')).length
                );
                const unreadRecipients = Math.max(0, totalRecipients - readersCount);
                const deliveryStateInfo = deliveryStates[msg.id];
                const deliveryState = deliveryStateInfo?.status || (String(msg.id).startsWith('temp-') ? 'sending' : 'sent');
                const deliveryStateLabel = isMine && deliveryState === 'sending'
                  ? '전송 중'
                  : isMine && deliveryState === 'failed'
                    ? '전송 실패'
                    : null;
                const deliveryErrorText = isMine && deliveryState === 'failed'
                  ? String(deliveryStateInfo?.error || '').trim()
                  : '';
                const readStatusSummary = totalRecipients > 0 && unreadRecipients > 0
                  ? `${unreadRecipients}`
                  : null;
                const canOpenReadStatus = Boolean(
                  deliveryState === 'sent' &&
                  totalRecipients > 0
                );
                const displayedReadStatusSummary = isMine ? readStatusSummary : null;

                const TOOLBAR_EMOJIS = ['👍', '❤️', '👏', '🎉', '🔥', '✅', '👀', '🙏'];

                const created = new Date(msg.created_at || 0);
                const dateLabel = created.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                });
                const showDateDivider = dateLabel !== lastDateLabel;
                if (showDateDivider) lastDateLabel = dateLabel;

                const isSystemInvite = typeof msg.content === 'string' && msg.content.startsWith('[초대]');
                const systemText = isSystemInvite ? (msg.content as string).replace(/^\[초대\]\s*/, '') : '';
                const isContinuous = !showDateDivider && !isSystemInvite && String(msg.sender_id) === lastSenderId;
                const senderProfile =
                  !isMine
                    ? resolveStaffProfile(
                        String(msg.sender_id || ''),
                        (msg.staff as { name?: string } | null | undefined)?.name || null
                      ) || (msg.staff as StaffMember | null | undefined) || null
                    : null;
                  const senderName = senderProfile?.name || (msg.staff as { name?: string } | null | undefined)?.name || '이름 없음';
                const senderPhotoUrl = senderProfile ? getProfilePhotoUrl(senderProfile as StaffMember) : null;
                const wardMessageMeta = !isDeletedMessage ? extractWardMessageMeta(msg.content) : { displayContent: '', meta: null };
                const showWardQuickReplies =
                  !isMine &&
                  !isDeletedMessage &&
                  wardMessageMeta.meta?.type === 'op_ward_request';
                const isWardQuickReplySending = wardQuickReplySendingMessageId === String(msg.id || '');
                const showIncomingAvatar = !isMine && !isContinuous;
                lastSenderId = String(msg.sender_id);

                return (
                  <div key={msg.id} data-testid={`chat-message-row-${msg.id}`} className={isContinuous ? 'mt-[2px]' : 'mt-0.5 md:mt-1'}>
                    {showDateDivider && (
                      <div className="my-0.5 flex items-center justify-center gap-1 md:my-1 md:gap-2">
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-semibold text-[var(--toss-gray-3)] shrink-0">
                          {dateLabel}
                        </span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                      </div>
                    )}
                    {isSystemInvite ? (
                      <div className="flex justify-center my-1">
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--toss-blue-light)] text-[10px] font-semibold text-[var(--accent)]">
                          초대 {systemText}
                        </span>
                      </div>
                    ) : (
                      <div
                        ref={el => { msgRefs.current[msg.id] = el; }}
                        className={`flex w-full flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`flex ${isMine ? 'max-w-[78%] flex-col items-end md:max-w-[72%]' : 'w-full items-start gap-2'}`}>
                          {!isMine ? (
                            showIncomingAvatar ? (
                              <div data-testid={`chat-message-sender-avatar-${msg.id}`} className="shrink-0 self-start pt-0.5">
                                <MessengerAvatar
                                  name={senderName}
                                  photoUrl={senderPhotoUrl}
                                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-3)] ring-1 ring-black/5 dark:bg-zinc-800"
                                  decorative
                                />
                              </div>
                            ) : (
                              <div aria-hidden="true" className="w-10 shrink-0" />
                            )
                          ) : null}
                          <div
                            data-testid={!isMine ? `chat-message-stack-${msg.id}` : undefined}
                            className={`${isMine ? 'flex w-full flex-col items-end' : 'flex min-w-0 max-w-[82%] flex-col items-start md:max-w-[74%]'}`}
                          >
                            {!isMine && showIncomingAvatar && (
                              <span
                                data-testid={`chat-message-sender-name-${msg.id}`}
                                className="mb-1 px-0.5 text-[11px] font-bold leading-none text-[var(--toss-gray-4)]"
                              >
                                {senderName}
                              </span>
                            )}
                            <div
                              data-testid={isDeletedMessage ? `chat-message-deleted-${msg.id}` : `chat-message-${msg.id}`}
                              onClick={(e) => {
                                if (isDeletedMessage) return;
                                e.stopPropagation();
                                openMessageActions(msg);
                              }}
                              className={`group relative ${
                                isDeletedMessage
                                  ? 'border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[var(--toss-gray-3)] italic'
                                  : !msg.content
                                    ? 'p-0 bg-transparent shadow-none border-none'
                                    : 'border px-3 py-2'
                              } rounded-2xl text-[13px] md:text-sm ${isDeletedMessage ? 'cursor-default' : 'cursor-pointer'} transition-all max-w-full ${
                                isDeletedMessage
                                  ? isMine
                                    ? 'rounded-tr-sm'
                                    : 'rounded-tl-sm'
                                  : !msg.content
                                    ? ''
                                    : isMine
                                      ? 'bg-[var(--accent)] text-white border-transparent rounded-tr-sm'
                                      : 'bg-[var(--card)] dark:bg-zinc-800 border-[var(--border)] dark:border-zinc-700 rounded-tl-sm hover:border-blue-300 dark:hover:border-blue-700 text-foreground'
                              }`}
                              role="button"
                              tabIndex={isDeletedMessage ? -1 : 0}
                              onKeyDown={(e) => {
                                if (isDeletedMessage) return;
                                if (e.key === 'Enter') markMessageRead(msg);
                              }}
                              aria-label={`${msg.staff?.name || '이름 없음'} ${isDeletedMessage ? '삭제된 메시지' : '메시지'}`}
                            >
                              {!isDeletedMessage && msg.reply_to_id && (() => {
                                const parent = messages.find(( m: ChatMessage) => m.id === msg.reply_to_id);
                                return parent ? (
                                  <div
                                    className={`mb-1 p-1.5 rounded-[var(--radius-md)] text-[11px] border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${isMine ? 'bg-white/10 border-white/40 text-white/90' : 'bg-[var(--muted)] border-[var(--accent)]/40 text-[var(--foreground)]'
                                      }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      scrollToMessage(msg.reply_to_id!);
                                    }}
                                  >
                                    <span className="font-bold opacity-80">답글 {(parent.staff as { name?: string } | null | undefined)?.name}: </span>
                                    <span className="truncate block mt-0.5">
                                      {getMessageDisplayText(
                                        parent.content,
                                        parent.file_name,
                                        parent.file_url,
                                        '첨부 파일'
                                      )}
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                              <div className={`leading-relaxed ${(msg.content && !isDeletedMessage) ? 'mb-0.5' : ''}`}>
                                {isDeletedMessage ? getDeletedMessagePreviewText() : renderMessageContent(msg.content || '', isMine, activeMessageHighlightQuery)}
                              </div>
                              {!isDeletedMessage && msg.file_url && (() => {
                                const furl = msg.file_url!;
                                const attachmentName = getAttachmentDisplayName(msg.file_name, furl);
                                const attachmentKind = resolveAttachmentKind(furl, msg.file_kind);
                                return (
                                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                    <AttachmentListCard
                                      url={furl}
                                      name={attachmentName}
                                      kind={attachmentKind}
                                      onPreview={() => openAttachmentPreview(furl, attachmentName, attachmentKind)}
                                      layout="bubble"
                                      tone={isMine ? 'accent' : 'default'}
                                    />
                                  </div>
                                );
                              })()}

                              {!isDeletedMessage && hasReacts && (
                                <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
                                  <span className="flex gap-1 flex-wrap">
                                    {Object.entries(msgReacts).map(([emoji, cnt]) =>
                                    ((cnt as number) > 0 ? (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openReactionDetail(msg, emoji);
                                        }}
                                        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${isMine ? 'bg-[var(--card)]/20 hover:bg-[var(--card)]/30' : 'bg-[var(--muted)] hover:bg-[var(--toss-blue-light)]'
                                          }`}
                                        aria-label={`${emoji} 반응 누른 사람 ${(cnt as number)}명 보기`}
                                      >
                                        {emoji} {cnt as number}
                                      </button>
                                    ) : null)
                                    )}
                                  </span>
                                </div>
                              )}

                              <div
                                className={`absolute bottom-0 z-10 ${isMine ? 'right-full mr-2 items-end' : 'left-full ml-2 items-start'
                                  } flex flex-col gap-0.5 whitespace-nowrap`}
                              >
                                {displayedReadStatusSummary && (
                                  canOpenReadStatus ? (
                                    <button
                                      data-testid={`chat-message-read-status-${msg.id}`}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        loadReadStatusForMessage(msg);
                                      }}
                                      className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 underline underline-offset-2"
                                    >
                                      {displayedReadStatusSummary}
                                    </button>
                                  ) : (
                                    <span
                                      data-testid={`chat-message-read-status-${msg.id}`}
                                      className={`text-[10px] font-bold ${deliveryState === 'failed' ? 'text-red-500' : 'text-emerald-500'}`}
                                    >
                                      {displayedReadStatusSummary}
                                    </span>
                                  )
                                )}
                                <span className="text-[8px] font-bold text-[var(--toss-gray-4)]">
                                  {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            {showWardQuickReplies && (
                              <div
                                data-testid={`chat-ward-quick-replies-${msg.id}`}
                                className="mt-2 flex w-full flex-col gap-1"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <p className="px-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                                  빠른 응답
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {WARD_QUICK_REPLY_OPTIONS.map((option) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      data-testid={`chat-ward-quick-reply-${msg.id}-${option.id}`}
                                      disabled={isWardQuickReplySending}
                                      onClick={() => {
                                        void sendWardQuickReply(msg, option.text);
                                      }}
                                      className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-[var(--toss-blue-light)] disabled:cursor-wait disabled:opacity-60"
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        {isMine && deliveryStateLabel && (
                          <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                deliveryState === 'failed'
                                  ? 'bg-red-500/10 text-red-500'
                                  : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {deliveryStateLabel}
                            </span>
                            {deliveryState === 'failed' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retryFailedMessage(String(msg.id));
                                }}
                                className="px-2.5 py-1 rounded-[var(--radius-md)] text-[10px] font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                aria-label="재전송"
                              >
                                재전송
                              </button>
                            )}
                          </div>
                        )}
                        {isMine && deliveryState === 'failed' && deliveryErrorText && (
                          <p className="mt-1 max-w-[78%] text-right text-[10px] text-red-500 break-words">
                            {deliveryErrorText}
                          </p>
                        )}
                        <div
                          className={`flex items-center gap-1 overflow-hidden opacity-0 pointer-events-none transition-all max-h-0 ${isMine ? 'flex-row-reverse' : ''} group-hover:mt-0.5 group-hover:max-h-10 group-hover:opacity-100 group-hover:pointer-events-auto [@media(hover:none)]:mt-0.5 [@media(hover:none)]:max-h-10 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto`}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => { startReplyToMessage(msg); }}
                            className="touch-manipulation min-h-[32px] p-1 px-2 rounded-lg hover:bg-[var(--tab-bg)] active:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)] hover:text-blue-500 transition-colors"
                          >
                            답장
                          </button>
                          <button
                            type="button"
                            onClick={() => { openMessageActions(msg); }}
                            className="touch-manipulation min-h-[32px] p-1 px-2 rounded-lg hover:bg-[var(--tab-bg)] active:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] transition-colors"
                          >
                            ···
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}

          <div ref={scrollRef} />
        </div>

        {showScrollToLatest && selectedRoomId && (
          <div className="absolute right-4 bottom-4 z-20">
            <button
              type="button"
              onClick={() => scrollToBottom('smooth')}
              className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--card)] border border-[var(--border)] shadow-sm text-[11px] font-bold text-[var(--foreground)]"
            >
              최신 메시지
            </button>
          </div>
        )}

        <div
          data-testid="chat-upload-dropzone"
          className={`relative z-10 shrink-0 bg-[var(--card)] px-1 py-0.5 pb-[calc(env(safe-area-inset-bottom)+4px)] md:px-2.5 md:py-1.5 md:pb-1.5 transition-all ${isDragging ? 'border-t-2 border-[var(--accent)] border-dashed bg-blue-500/10 dark:bg-blue-900/20' : 'border-t border-[var(--border)]'}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={async (e) => {
            e.preventDefault(); e.stopPropagation(); setIsDragging(false);
            const files = Array.from(e.dataTransfer.files || []).filter((file): file is File => !!file);
            queueDroppedFiles(files);
          }}
        >
          {replyTo && (
            <div
              data-testid="chat-reply-banner"
              className="mb-1 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)] px-2 py-1 animate-in slide-in-from-bottom-2"
            >
              <p className="text-[11px] font-bold text-[var(--accent)]">@{(replyTo.staff as { name?: string } | null | undefined)?.name}님에게 답글 작성 중...</p>
              <button onClick={() => setReplyTo(null)} className="text-[var(--accent)] hover:text-[var(--accent)] font-semibold">닫기</button>
            </div>
          )}

          {/* 앨범(다중 이미지) 미리보기 패널 */}
          {pendingAlbumFiles.length > 0 && (
            <div
              data-testid="chat-pending-album-panel"
              className="mb-1 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--accent)]/30 bg-blue-500/10 dark:bg-blue-950/20 px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[var(--accent)]">📷 사진 {pendingAlbumFiles.length}장 묶어 보내기</span>
                <button
                  data-testid="chat-pending-album-cancel-button"
                  onClick={cancelAlbumUpload}
                  className="text-[11px] text-[var(--toss-gray-3)] hover:text-red-500 font-semibold"
                >
                  취소
                </button>
              </div>
              {/* 썸네일 그리드 */}
              <div className="flex gap-1.5 flex-wrap">
                {albumPreviewUrls.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0">
                    <img
                      src={url}
                      alt={buildMessengerImageAlt(pendingAlbumFiles[i]?.name, `업로드 예정 사진 ${i + 1}`)}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeAlbumFile(i)}
                      aria-label={`앨범 미리보기 ${i + 1} 제거`}
                      className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-white text-[9px] font-bold hover:bg-red-600 transition-colors"
                    >✕</button>
                  </div>
                ))}
                {/* 추가 버튼 */}
                <button
                  onClick={() => albumFileInputRef.current?.click()}
                  aria-label="앨범에 사진 추가"
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--border)] flex items-center justify-center text-[var(--toss-gray-3)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-xl shrink-0"
                  title="사진 추가"
                >+</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="chat-pending-album-send-button"
                  onClick={() => void sendAlbum()}
                  disabled={fileUploading}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50 flex items-center gap-1"
                >
                  {fileUploading ? <span className="animate-pulse">전송 중...</span> : `📤 묶어서 전송`}
                </button>
              </div>
            </div>
          )}

          {pendingAttachmentFiles.length > 0 && (
            <div
              data-testid="chat-pending-upload-panel"
              className="mb-1 flex flex-col gap-1 rounded-[var(--radius-lg)] border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[12px] text-blue-900"
            >
              <p className="font-semibold">
                선택한 파일 {pendingAttachmentFiles.length}개를 채팅방에 전송할까요?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pendingAttachmentFiles.map((file, index) => {
                  const displayName = getPendingAttachmentDisplayName(file);
                  return (
                    <span
                      key={`${displayName}-${index}`}
                      data-testid={`chat-pending-upload-file-${index}`}
                      className="max-w-full truncate rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)]"
                      title={displayName}
                    >
                      {displayName}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="chat-pending-upload-cancel-button"
                  onClick={cancelPendingAttachmentUpload}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)]"
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="chat-pending-upload-send-button"
                  onClick={() => void confirmPendingAttachmentUpload()}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  전송
                </button>
              </div>
            </div>
          )}

          <div
            aria-live="polite"
            className="mb-0.5 min-h-[8px] px-1 text-[10px] font-medium"
          >
            {typingNoticeText ? (
              <span className="text-blue-500">{typingNoticeText}</span>
            ) : null}
          </div>

          <div className={`flex items-end gap-1 rounded-[var(--radius-lg)] border px-1 py-1 md:gap-2 md:px-2.5 md:py-2 transition-all ${selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice
            ? 'bg-[var(--muted)] border-[var(--border)] opacity-80 pointer-events-none'
            : 'bg-[var(--muted)] border-[var(--border)] focus-within:bg-[var(--card)] focus-within:ring-2 focus-within:ring-[var(--accent)]/50'
            }`}>
            <input
              data-testid="chat-file-input"
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleAttachmentSelect}
              accept="image/*,.heic,.heif,.avif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.hwp,.hwpx,.csv"
              multiple
            />
            <input
              data-testid="chat-album-file-input"
              type="file"
              ref={albumFileInputRef}
              className="hidden"
              onChange={handleAlbumFileSelect}
              accept="image/*"
              multiple
            />
            {/* 통합 첨부 버튼 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              aria-label="사진 또는 파일 첨부"
              title="사진/파일 첨부"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-3)] transition-colors hover:text-[var(--accent)] disabled:opacity-50 md:h-8 md:w-8"
            >
              {fileUploading ? <span className="animate-pulse text-xs">...</span> : <span className="text-[11px] font-bold md:text-xs">첨부</span>}
            </button>
            <div className="relative flex-1">
              <textarea
                ref={composerRef}
                data-testid="chat-message-input"
                rows={1}
                className="block min-h-[28px] w-full min-w-0 resize-none bg-transparent px-1 py-0.5 text-[16px] font-bold leading-5 outline-none md:min-h-[22px] md:px-2 md:py-1 md:text-sm md:leading-5"
                style={{ fontSize: '16px' }}
                placeholder={selectedRoomId === NOTICE_ROOM_ID && !canWriteNotice ? "부서장 이상만 공지 작성 가능" : "메시지를 입력하세요... (@이름 멘션 가능)"}
                value={inputMsg}
                onChange={e => {
                  const value = e.target.value;
                  handleComposerChange(value, e.target.selectionStart ?? value.length);
                }}
                onPaste={handleComposerPaste}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  if (e.nativeEvent.isComposing) return;

                  const isMobileComposer = isMobileChatViewport();

                  if (isMobileComposer || e.shiftKey) {
                    return;
                  }

                  e.preventDefault();
                  void handleSendMessage();
                }}
              />
              {showMentionList && mentionCandidates.length > 0 && (
                <div className="absolute left-0 bottom-full mb-1 w-full max-h-48 overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm z-20 text-xs">
                  {mentionCandidates.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        const value = inputMsg;
                        const match = value.match(/@([^\s@]{0,20})$/);
                        if (match) {
                          const replaced = value.replace(/@([^\s@]{0,20})$/, `@${m.name} `);
                          setInputMsg(replaced);
                        }
                        setShowMentionList(false);
                        setMentionQuery('');
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--toss-blue-light)] text-left"
                    >
                      <span className="text-[11px] font-semibold text-[var(--foreground)] truncate">{m.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)] truncate">
                        {(m.department || '')}{m.position ? ` · ${m.position}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              data-testid="chat-send-button"
              onClick={() => handleSendMessage()}
              className="flex h-7 min-w-[52px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] px-2 text-[12px] font-bold text-white shadow-sm transition-all hover:scale-105 active:scale-95 md:h-8 md:min-w-[56px] md:px-3 md:text-sm"
            >
              전송
            </button>
          </div>
        </div>

        {showDrawer && (
          <>
            <div className="absolute inset-0 bg-black/10 z-50 animate-in fade-in duration-200" onClick={() => setShowDrawer(false)} aria-hidden="true" />
            <div data-testid="chat-room-drawer" className="absolute top-0 right-0 bottom-0 w-full md:w-80 bg-[var(--card)] dark:bg-zinc-900 shadow-sm z-[60] flex flex-col animate-in slide-in-from-right duration-300 border-l border-[var(--border)]">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--card)]">
                <span className="text-sm font-bold">채팅방 정보</span>
              <button onClick={() => setShowDrawer(false)} className="p-2 text-[var(--toss-gray-3)] hover:text-black dark:hover:text-white rounded-[var(--radius-md)]">닫기</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <div className="flex items-center justify-between p-3 bg-[var(--tab-bg)] dark:bg-zinc-800/50 rounded-2xl">
                  <span className="text-sm font-semibold">알림 설정</span>
                  <button
                    onClick={() => setRoomNotifyOn(!roomNotifyOn)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${roomNotifyOn ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-[var(--card)] rounded-full transition-all ${roomNotifyOn ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <button data-testid="chat-open-poll-modal" onClick={() => { setShowPollModal(true); setShowDrawer(false); }} className="w-full flex items-center justify-between p-3.5 bg-blue-500/10 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 hover:bg-blue-500/20 dark:hover:bg-blue-900/40 transition-colors group">
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
                      onClick={() => openMediaArchive('media')}
                      className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
                    >
                      전체보기
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
                    {sharedMediaPreviewMessages.map((m) => (
                      <div
                        key={m.id}
                        className="aspect-square bg-[var(--tab-bg)] dark:bg-zinc-800 relative group cursor-pointer"
                        onClick={() => openAttachmentPreviewForMessage(m)}
                      >
                        {resolveAttachmentKind(m.file_url, m.file_kind) === 'image' ? (
                          <img
                            src={m.file_url || ''}
                            alt={buildMessengerImageAlt(m.file_name, '공유된 이미지')}
                            className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>
                        )}
                        {m.file_url && (
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity bg-black/40 flex items-center justify-center rounded-[inherit] pointer-events-none px-2">
                            <AttachmentQuickActions
                              url={m.file_url}
                              name={getAttachmentDisplayName(m.file_name, m.file_url)}
                              onPreview={() => openAttachmentPreviewForMessage(m)}
                              onReply={() => startReplyToMessage(m)}
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
                      onClick={() => openMediaArchive('file')}
                      className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
                    >
                      전체보기
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sharedFilePreviewMessages.map((m) => {
                      const fileUrl = String(m.file_url || '');
                      const attachmentName = getAttachmentDisplayName(m.file_name, fileUrl);
                      return (
                        <AttachmentListCard
                          key={m.id}
                          url={fileUrl}
                          name={attachmentName}
                          kind="file"
                          meta={`${(m.staff as { name?: string } | null | undefined)?.name || '알 수 없음'} · ${new Date(m.created_at || 0).toLocaleDateString()}`}
                          onPreview={() => openAttachmentPreviewForMessage(m)}
                          onReply={() => startReplyToMessage(m)}
                          replyTestId={`chat-file-reply-${m.id}`}
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
                    {sharedLinkPreviewMessages.map((m) => {
                      const url = extractFirstLinkUrl(m.content);
                      return (
                        <div
                          key={m.id}
                          data-testid={`chat-shared-link-${m.id}`}
                          className="p-3 bg-[var(--tab-bg)] dark:bg-zinc-800/50 rounded-xl border border-[var(--border-subtle)] dark:border-zinc-800"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block hover:opacity-90 transition-opacity"
                          >
                            <p className="text-[11px] font-bold truncate text-emerald-600 mb-0.5">{url}</p>
                            <p className="text-[10px] text-[var(--toss-gray-4)] truncate">
                              {(m.staff as { name?: string } | null | undefined)?.name} · {new Date(m.created_at || 0).toLocaleDateString()}
                            </p>
                          </a>
                          <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] font-bold">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700"
                            >
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
                              data-testid={`chat-shared-link-reply-${m.id}`}
                              onClick={() => startReplyToMessage(m)}
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
                <button data-testid="chat-open-add-member-modal" onClick={() => setShowAddMemberModal(true)} className="w-6 h-6 flex items-center justify-center bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-[var(--radius-md)] text-[var(--toss-gray-4)] hover:text-emerald-500 transition-colors">+</button>
              )}
                  </div>
                  <div className="space-y-3">
                    {roomMembers.map((member) => {
                      const memberId = String(member.id);
                      const s =
                        selectedRoom?.id === NOTICE_ROOM_ID
                          ? member
                          : resolveRoomMemberProfile(selectedRoom!, memberId);
                      const isOwner = selectedRoom?.id !== NOTICE_ROOM_ID && selectedRoom?.created_by === (effectiveChatUserId || user?.id);
                      return (
                        <div data-testid={`chat-room-member-${memberId}`} key={memberId} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <MessengerAvatar
                              name={s?.name}
                              photoUrl={s?.photo_url}
                              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30"
                              decorative
                            />
                            <div>
                              <p className="text-xs font-bold text-foreground">{s?.name || '이름 없음'}</p>
                              <p className="text-[10px] text-[var(--toss-gray-4)] font-medium">{[s?.department, s?.position].filter(Boolean).join(' · ')}</p>
                            </div>
                          </div>
                          {isOwner && String(memberId) !== String(effectiveChatUserId || user?.id || '') && (
                            <button data-testid={`chat-remove-member-${memberId}`} onClick={() => { void removeRoomMember(String(memberId)); }} className="touch-manipulation opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 min-h-[36px] px-2 py-1 text-red-500 text-[10px] font-bold hover:bg-red-500/10 active:bg-red-500/10 dark:hover:bg-red-900/20 rounded-md transition-all">내보내기</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[var(--tab-bg)] dark:bg-zinc-800/50 border-t border-[var(--border)] flex flex-col gap-2">
                {/* 이름 수정 인라인 폼 */}
                {editingRoomName ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={roomNameDraft}
                      onChange={e => setRoomNameDraft(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const name = roomNameDraft.trim();
                          if (!name || !selectedRoom) return;
                          await supabase.from('chat_rooms').update({ name }).eq('id', selectedRoom.id);
                          setChatRooms(prev => prev.map((r: ChatRoom) => r.id === selectedRoom.id ? { ...r, name } : r));
                          setEditingRoomName(false);
                          toast('채팅방 이름이 변경되었습니다.');
                        }
                        if (e.key === 'Escape') setEditingRoomName(false);
                      }}
                      placeholder="새 채팅방 이름"
                      className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm font-bold outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={async () => {
                        const name = roomNameDraft.trim();
                        if (!name || !selectedRoom) return;
                        await supabase.from('chat_rooms').update({ name }).eq('id', selectedRoom.id);
                        setChatRooms(prev => prev.map((r: ChatRoom) => r.id === selectedRoom.id ? { ...r, name } : r));
                        setEditingRoomName(false);
                        toast('채팅방 이름이 변경되었습니다.');
                      }}
                      className="px-3 py-2 bg-[var(--accent)] text-white rounded-xl text-xs font-bold"
                    >저장</button>
                    <button onClick={() => setEditingRoomName(false)} className="px-3 py-2 bg-[var(--muted)] rounded-xl text-xs font-bold">취소</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {!isSelfChatRoom(selectedRoom, effectiveChatUserId) && selectedRoom?.id !== NOTICE_ROOM_ID && (
                      <button onClick={() => { setShowDrawer(false); handleLeaveRoom(); }} className="flex-1 py-2.5 bg-red-500/10 dark:bg-red-900/20 text-red-600 rounded-xl text-[11px] font-bold hover:bg-red-500/20 transition-colors">방 나가기</button>
                    )}
                    {/* 이름 수정: 그룹방 or 멤버 3명 이상(direct→그룹 전환) */}
                    {selectedRoom?.id !== NOTICE_ROOM_ID &&
                      (selectedRoom?.type !== 'direct' || (Array.isArray(selectedRoom?.members) && selectedRoom.members.length > 2)) && (
                      <button onClick={() => { setEditingRoomName(true); setRoomNameDraft(selectedRoom?.name || ''); }} className="flex-1 py-2.5 bg-[var(--muted)] text-foreground rounded-xl text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-colors">이름 수정</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeActionMsg && (
          <>
            <div className="absolute inset-0 bg-black/10 z-30 animate-in fade-in duration-200" onClick={() => { setActiveActionMsg(null); }} aria-hidden="true" />

            <div className="md:hidden absolute left-0 right-0 bottom-0 bg-[var(--card)] dark:bg-zinc-900 rounded-t-[24px] shadow-sm z-40 flex flex-col animate-in slide-in-from-bottom duration-300 max-h-[70vh] overflow-hidden">
              <div className="w-12 h-1.5 bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />
              <div className="px-4 pb-8 space-y-4 overflow-y-auto">
                <div className="flex justify-between items-center bg-[var(--tab-bg)] dark:bg-zinc-800/50 p-2 rounded-[var(--radius-xl)] gap-1 px-4">
                  {['👍', '❤️', '👏', '🎉', '🔥', '✅', '👀', '🙏'].map(emoji => (
                    <button key={emoji} onClick={() => { toggleReaction(activeActionMsg.id, emoji); setActiveActionMsg(null); }} className="text-2xl hover:scale-110 transition-transform p-1">{emoji}</button>
                  ))}
                </div>
                <div className="space-y-1">
                  <button onClick={() => { handleAction('task'); setActiveActionMsg(null) }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">✅</span>
                    <span className="text-sm font-bold">할 일 추가</span>
                  </button>
                  <button onClick={() => { if (!activeActionMsg) return; void togglePin(activeActionMsg.id); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">📢</span>
                    <span className="text-sm font-bold">{pinnedIds.includes(String(activeActionMsg.id)) ? '공지 해제' : '공지 등록'}</span>
                  </button>
                  <button data-testid="chat-message-action-bookmark-mobile" onClick={() => { if (!activeActionMsg) return; void toggleBookmark(activeActionMsg.id); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">🔖</span>
                    <span className="text-sm font-bold">{bookmarkedIds.has(String(activeActionMsg.id)) ? '북마크 해제' : '북마크 등록'}</span>
                  </button>
                  <button onClick={async () => { await navigator.clipboard?.writeText(activeActionMsg.content || ''); toast('복사했습니다.'); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">📋</span>
                    <span className="text-sm font-bold">복사</span>
                  </button>
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && !activeActionMsg.is_deleted && (
                    <button data-testid="chat-message-action-edit-mobile" onClick={() => { startEditMessage(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                      <span className="text-xl">✏️</span>
                      <span className="text-sm font-bold">수정</span>
                    </button>
                  )}
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && (
                    <button onClick={() => { void deleteMessageFromActions(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-red-500/10 dark:hover:bg-red-900/20 rounded-[var(--radius-md)] transition-colors text-red-500">
                      <span className="text-xl">🗑️</span>
                      <span className="text-sm font-bold">삭제</span>
                    </button>
                  )}
                  <button onClick={() => { startReplyToMessage(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">↩️</span>
                    <span className="text-sm font-bold">답장</span>
                  </button>
                  <button onClick={() => { startForwardMessage(activeActionMsg); }} className="w-full flex items-center gap-4 p-4 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-[var(--radius-md)] transition-colors">
                    <span className="text-xl">📤</span>
                    <span className="text-sm font-bold">전달</span>
                  </button>
                </div>
              </div>
            </div>

            <div data-testid="chat-message-actions-panel" className="hidden md:flex absolute top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-40 flex-col animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">메시지 작업</span>
            <button onClick={() => { setActiveActionMsg(null); }} className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">닫기</button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">빠른 반응</p>
                <div className="flex gap-2 flex-wrap">
                  {['👍', '❤️', '👏', '🔥', '🙏'].map(emoji => (
                    <button key={emoji} onClick={() => { toggleReaction(activeActionMsg.id, emoji); }} className="w-11 h-11 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] hover:bg-[var(--toss-blue-light)] text-xl transition-colors" title={emoji}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase pt-2">기능</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { startReplyToMessage(activeActionMsg); }}
                    className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  >
                    답글 달기
                  </button>
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && !activeActionMsg.is_deleted && (
                    <button data-testid="chat-message-action-edit" onClick={() => { startEditMessage(activeActionMsg); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">메시지 수정</button>
                  )}
                  {String(activeActionMsg.sender_id) === String(effectiveChatUserId || user?.id || '') && (
                    <button data-testid="chat-message-action-delete" onClick={() => { void deleteMessageFromActions(activeActionMsg); }} className="w-full p-3 text-left hover:bg-red-500/10 rounded-[var(--radius-md)] text-xs font-semibold text-red-600 transition-colors">메시지 삭제</button>
                  )}
                  <button data-testid="chat-message-action-pin" onClick={() => { void togglePin(activeActionMsg.id); setActiveActionMsg(null); }} className={`w-full p-3 text-left rounded-[var(--radius-md)] text-xs font-semibold transition-colors ${pinnedIds.includes(String(activeActionMsg.id)) ? 'hover:bg-[var(--muted)] text-[var(--toss-gray-3)]' : 'hover:bg-orange-500/10 text-orange-500'}`}>{pinnedIds.includes(String(activeActionMsg.id)) ? '공지 해제' : '공지로 등록'}</button>
                  <button onClick={() => { handleAction('task'); setActiveActionMsg(null) }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">할 일로 등록</button>
                  <button
                    data-testid="chat-message-action-read-status"
                    onClick={() => { openReadStatusPanel(activeActionMsg); }}
                    className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  >
                    읽음 확인
                  </button>
                  <button
                    data-testid="chat-message-action-forward"
                    onClick={() => { startForwardMessage(activeActionMsg); }}
                    className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors"
                  >
                    다른 채팅방으로 전달
                  </button>
                  <button data-testid="chat-message-action-thread" onClick={() => { openThreadPanel(activeActionMsg); }} className="w-full p-3 text-left hover:bg-[var(--toss-blue-light)] rounded-[var(--radius-md)] text-xs font-semibold text-[var(--accent)] transition-colors">이 메시지 스레드 보기</button>
                  <button onClick={async () => { try { const base = `[채팅] ${(activeActionMsg.staff as { name?: string } | null | undefined)?.name || '이름 없음'} (${new Date(activeActionMsg.created_at || 0).toLocaleString('ko-KR')})\n${activeActionMsg.content || ''}${activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : ''}`; await navigator.clipboard?.writeText(`[전자결재 메모]\n${base}`); toast('전자결재용으로 복사했습니다.'); } catch { toast('복사 실패', 'error'); } setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">전자결재용 내용 복사</button>
                  <button onClick={async () => { try { const base = `[채팅] ${(activeActionMsg.staff as { name?: string } | null | undefined)?.name || '이름 없음'} (${new Date(activeActionMsg.created_at || 0).toLocaleString('ko-KR')})\n${activeActionMsg.content || ''}${activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : ''}`; await navigator.clipboard?.writeText(`[게시판 메모]\n${base}`); toast('게시판용으로 복사했습니다.'); } catch { toast('복사 실패', 'error'); } setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">게시판용 내용 복사</button>
                  <button data-testid="chat-message-action-bookmark" onClick={() => { void toggleBookmark(activeActionMsg.id); setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-xs font-semibold transition-colors">{bookmarkedIds.has(String(activeActionMsg.id)) ? '북마크 해제' : '중요 메시지 북마크'}</button>
                </div>
              </div>
            </div>
          </>
        )}

        {editingMessage && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[115] p-4" onClick={() => setEditingMessage(null)}>
            <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-5 shadow-sm border border-[var(--border)] space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">메시지 수정</h3>
                <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">전송한 메시지를 수정한 뒤 다시 저장합니다.</p>
              </div>
              <textarea
                data-testid="chat-message-edit-input"
                value={editingMessageDraft}
                onChange={(e) => setEditingMessageDraft(e.target.value)}
                rows={4}
                className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm font-medium outline-none resize-none focus:border-[var(--accent)]"
                placeholder="수정할 메시지를 입력하세요."
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditingMessage(null)} className="flex-1 py-3 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-sm">
                  취소
                </button>
                <button data-testid="chat-message-edit-save" type="button" onClick={() => { void saveEditedMessage(); }} className="flex-1 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm">
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {showGroupModal && (
          <div data-testid="chat-group-modal" className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[110] p-4" onClick={() => setShowGroupModal(false)}>
            <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-5 shadow-sm space-y-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-semibold text-[var(--foreground)] italic">새 그룹 채팅방</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">방 이름</label>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]" placeholder="예: 운영팀 공지방" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">멤버 선택 ({selectedMembers.length}명)</label>
                  <div className="h-48 overflow-y-auto border border-[var(--border)] rounded-[var(--radius-md)] p-4 space-y-2 custom-scrollbar bg-[var(--muted)]/30">
                    {allKnownStaffs.filter(( s: StaffMember) => String(s.id) !== String(effectiveChatUserId || user?.id || '') && s.status !== '퇴사' && s.status !== '퇴직').map(( s: StaffMember) => (
                      <label key={s.id} className="flex items-center gap-3 p-3 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] transition-all">
                        <input type="checkbox" checked={selectedMembers.includes(s.id)} onChange={e => {
                          if (e.target.checked) setSelectedMembers([...selectedMembers, s.id]);
                          else setSelectedMembers(selectedMembers.filter(id => id !== s.id));
                        }} className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]" />
                        <span className="text-xs font-bold text-[var(--foreground)]">{s.name} ({s.company ? `${s.company} · ` : ''}{s.position})</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowGroupModal(false)} className="flex-1 py-4 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-xs">취소</button>
                  <button onClick={createGroupChat} className="flex-2 py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-xs shadow-sm shadow-[var(--accent)]">채팅방 생성</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showPollModal && (
        <div data-testid="chat-poll-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4">
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">새 투표 만들기</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              질문과 선택지를 입력해 주세요. 선택지는 항목별로 따로 입력합니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">질문</label>
                <input
                  data-testid="chat-poll-question"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full mt-1 p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                  placeholder="예: 이번 주 회의 시간은 언제가 좋을까요?"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">선택지</label>
                <div className="mt-1 space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        data-testid={`chat-poll-option-${idx}`}
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                        className="flex-1 p-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                        placeholder={`선택지 ${idx + 1}`}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="w-full py-3 border-2 border-dashed border-[var(--border)] rounded-xl text-xs font-bold text-[var(--toss-gray-4)] hover:text-blue-500 hover:border-blue-300"
                  >
                    + 항목 추가
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
              >
                취소
              </button>
              <button
                data-testid="chat-poll-submit"
                type="button"
                onClick={handleCreatePoll}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md"
              >
                투표 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {showSlashModal && slashCommand && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => setShowSlashModal(false)}>
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              {slashCommand === 'annual_leave' ? '연차 요청 초안 만들기' : '발주 요청 초안 만들기'}
            </h3>
            {slashCommand === 'annual_leave' ? (
              <>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                  시작일, 종료일, 사유를 입력하면 전자결재용 연차/휴가 초안을 생성합니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">시작일</label>
                      <input
                        type="date"
                        value={slashForm.startDate}
                        onChange={e => setSlashForm((f) => ({ ...f, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">종료일</label>
                      <input
                        type="date"
                        value={slashForm.endDate}
                        onChange={e => setSlashForm((f) => ({ ...f, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">사유(선택)</label>
                    <input
                      type="text"
                      value={slashForm.reason}
                      onChange={e => setSlashForm((f) => ({ ...f, reason: e.target.value }))}
                      placeholder="예: 개인 일정, 병원 방문"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!slashForm.startDate || !slashForm.endDate) {
                        toast('시작일과 종료일을 입력해 주세요.', 'warning');
                        return;
                      }
                      try {
                        const title = `[채팅]/연차 자동 기안 - ${user?.name}`;
                        const contentLines = [
                          `요청자: ${user?.name} (${user?.department || ''} ${user?.position || ''})`,
                          `기간: ${slashForm.startDate} ~ ${slashForm.endDate}`,
                          slashForm.reason ? `사유: ${slashForm.reason}` : '',
                          '',
                          '이 요청서는 채팅 명령어(/연차)로 자동 생성되었습니다.',
                        ].filter(Boolean);
                        await supabase.from('approvals').insert([
                          {
                            sender_id: effectiveChatUserId || user?.id,
                            sender_name: user?.name,
                            sender_company: user?.company,
                            type: '연차/휴가',
                            title,
                            content: contentLines.join('\n'),
                            status: '대기',
                          },
                        ]);
                        toast('연차/휴가 전자결재 초안을 생성했습니다. 전자결재 메뉴에서 내용을 확인 후 제출해 주세요.', 'warning');
                      } catch {
                        toast('연차 초안 생성 중 오류가 발생했습니다.', 'error');
                      } finally {
                        setShowSlashModal(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md"
                  >
                    전자결재 초안 생성
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                  품목명과 수량을 입력하면 비품구매(발주) 결재 초안을 생성합니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div>
                    <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">품목명</label>
                    <input
                      type="text"
                      value={slashForm.itemName}
                      onChange={e => setSlashForm((f) => ({ ...f, itemName: e.target.value }))}
                      placeholder="예: A4 용지, 프린터 토너"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">수량</label>
                      <input
                        type="number"
                        min={1}
                        value={slashForm.quantity}
                        onChange={e => setSlashForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">비고(선택)</label>
                      <input
                        type="text"
                        value={slashForm.reason}
                        onChange={e => setSlashForm((f) => ({ ...f, reason: e.target.value }))}
                        placeholder="예: 재고 부족, 교체 주기 도래"
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!slashForm.itemName || !slashForm.quantity) {
                        toast('품목명과 수량을 입력해 주세요.', 'warning');
                        return;
                      }
                      try {
                        const title = `[채팅]/발주 자동 기안 - ${slashForm.itemName} x ${slashForm.quantity}`;
                        const contentLines = [
                          `요청자: ${user?.name} (${user?.department || ''} ${user?.position || ''})`,
                          `품목: ${slashForm.itemName}`,
                          `수량: ${slashForm.quantity}`,
                          slashForm.reason ? `비고: ${slashForm.reason}` : '',
                          '',
                          '이 요청서는 채팅 명령어(/발주)로 자동 생성되었습니다.',
                        ].filter(Boolean);
                        await supabase.from('approvals').insert([
                          {
                            sender_id: effectiveChatUserId || user?.id,
                            sender_name: user?.name,
                            sender_company: user?.company,
                            type: '비품구매',
                            title,
                            content: contentLines.join('\n'),
                            status: '대기',
                          },
                        ]);
                        toast('비품구매 전자결재 초안을 생성했습니다. 전자결재 메뉴에서 내용을 확인 후 제출해 주세요.', 'warning');
                      } catch {
                        toast('발주 초안 생성 중 오류가 발생했습니다.', 'error');
                      } finally {
                        setShowSlashModal(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent)] shadow-md"
                  >
                    전자결재 초안 생성
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {threadRoot && (
        <>
          <div
            className="absolute inset-0 bg-black/10 z-40"
            onClick={() => setThreadRoot(null)}
            aria-hidden="true"
          />
          <aside data-testid="chat-thread-panel" className="absolute top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                  스레드
                </p>
                <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-2">
                  {getMessageDisplayText(
                    threadRoot.content,
                    threadRoot.file_name,
                    threadRoot.file_url,
                    '첨부 파일 메시지'
                  )}
                </p>
              </div>
              <button
                onClick={() => setThreadRoot(null)}
                className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              {threadMessages.length === 0 ? (
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-4 text-center">
                  이 메시지에 연결된 대화가 없습니다.
                </p>
              ) : (
                threadMessages.map(( m: ChatMessage) => {
                  const isRoot = m.id === threadRoot.id;
                  const staff = (m.staff as { name?: string; position?: string } | null | undefined) || resolveStaffProfile(m.sender_id);
                  const createdAt = new Date(m.created_at || 0);
                  return (
                    <div
                      key={m.id}
                      className={`border rounded-[var(--radius-md)] p-3 text-[11px] space-y-1 ${isRoot ? 'bg-[var(--toss-blue-light)] border-[var(--accent)]' : 'bg-[var(--muted)] border-[var(--border)]'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--foreground)] truncate">
                          {staff?.name || '이름 없음'} {staff?.position || ''}
                        </span>
                        <span className="text-[11px] text-[var(--toss-gray-3)]">
                          {createdAt.toLocaleDateString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                          })}{' '}
                          {createdAt.toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--foreground)] whitespace-pre-wrap break-words">
                        {getMessageDisplayText(
                          m.content,
                          m.file_name,
                          m.file_url,
                          '첨부 파일 메시지'
                        )}
                      </p>
                      {m.file_url && (() => {
                        const attachmentUrl = String(m.file_url);
                        const attachmentName = getAttachmentDisplayName(m.file_name, attachmentUrl);
                        const attachmentKind = resolveAttachmentKind(attachmentUrl, m.file_kind);
                        return (
                          <AttachmentListCard
                            url={attachmentUrl}
                            name={attachmentName}
                            kind={attachmentKind}
                            meta={`${staff?.name || '이름 없음'} · ${createdAt.toLocaleDateString('ko-KR')} ${createdAt.toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`}
                            onPreview={() => openAttachmentPreviewForMessage(m)}
                            onReply={() => startReplyToMessage(m)}
                            replyTestId={`chat-attachment-reply-${m.id}`}
                            actionVariant="subtle"
                            className="mt-2"
                          />
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}

      {unreadModalMsg && (
        <div data-testid="chat-read-status-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => setUnreadModalMsg(null)}>
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                  읽음 확인 상세
                </p>
                <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-1 opacity-60">
                  {getMessageDisplayText(
                    unreadModalMsg.content,
                    unreadModalMsg.file_name,
                    unreadModalMsg.file_url,
                    '첨부 파일 메시지'
                  )}
                </p>
              </div>
              <button
                onClick={() => setUnreadModalMsg(null)}
                className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>

            <div className="border-t border-[var(--border)] pt-3 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
              {unreadLoading ? (
                <div className="py-5 flex justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">읽지 않음 ({unreadUsers.length})</p>
                    </div>
                    {unreadUsers.length === 0 ? (
                      <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">모두 읽었습니다.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {unreadUsers.map((u: StaffMember) => (
                          <MessengerStatusUserRow key={u.id} staff={u} />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">읽음 ({readUsers.length})</p>
                    </div>
                    {readUsers.length === 0 ? (
                      <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">아직 읽은 사람이 없습니다.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {readUsers.map((u: StaffMember) => (
                          <MessengerStatusUserRow key={u.id} staff={u} tone="success" />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {reactionDetailTarget && (() => {
        const reactionUsers =
          reactionUsersByMessage[String(reactionDetailTarget.message.id)]?.[reactionDetailTarget.emoji] || [];
        return (
          <div
            data-testid="chat-reaction-detail-modal"
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
            onClick={() => setReactionDetailTarget(null)}
          >
            <div
              className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                    반응 상세
                  </p>
                  <div className="mt-1 flex items-center gap-2 min-w-0">
                    <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-bold text-[var(--foreground)]">
                      {reactionDetailTarget.emoji} {reactionUsers.length}
                    </span>
                    <p className="text-xs font-semibold text-[var(--foreground)] line-clamp-1 opacity-60">
                      {getMessageDisplayText(
                        reactionDetailTarget.message.content,
                        reactionDetailTarget.message.file_name,
                        reactionDetailTarget.message.file_url,
                        '첨부 파일 메시지'
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReactionDetailTarget(null)}
                  className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
                >
                  닫기
                </button>
              </div>

              <div className="border-t border-[var(--border)] pt-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {reactionUsers.length === 0 ? (
                  <p className="text-[10px] text-[var(--toss-gray-3)] font-bold py-2 px-1">
                    아직 이 반응을 누른 사람이 없습니다.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {reactionUsers.map((staff) => (
                      <MessengerStatusUserRow
                        key={`${reactionDetailTarget.emoji}-${staff.id}`}
                        staff={staff}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {showForwardModal && forwardSourceMsg && (
        <div data-testid="chat-forward-modal" className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}>
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">다른 채팅방으로 전달</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              선택한 메시지를 전달할 채팅방을 선택하세요.
            </p>
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
              {forwardTargetRooms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--toss-gray-3)]">
                  전달할 수 있는 채팅방이 없습니다.
                </div>
              ) : (
                forwardTargetRooms.map(( room: ChatRoom) => (
                  <button
                    data-testid={`chat-forward-target-${room.id}`}
                    key={room.id}
                    type="button"
                    onClick={async () => {
                      try {
                        const { data: forwardedMessage, error } = await insertChatMessage<Pick<ChatMessage, 'id' | 'room_id'>>(
                          {
                            room_id: room.id,
                            sender_id: effectiveChatUserId || user?.id,
                            content:
                              `[전달] ${(forwardSourceMsg.staff as { name?: string } | null | undefined)?.name || '이름 없음'}: ` +
                              getMessageDisplayText(
                                forwardSourceMsg.content,
                                forwardSourceMsg.file_name,
                                forwardSourceMsg.file_url,
                                '첨부 파일'
                              ),
                            file_url: forwardSourceMsg.file_url || null,
                            file_name: forwardSourceMsg.file_name || null,
                          },
                          'id, room_id'
                        );
                        if (error) throw error;
                        if (forwardedMessage?.id && forwardedMessage?.room_id) {
                          void triggerChatPush(String(forwardedMessage.room_id), String(forwardedMessage.id));
                        }
                        toast(`"${room.name || '채팅방'}"으로 메시지를 전달했습니다.`);
                      } catch {
                        toast('메시지 전달 중 오류가 발생했습니다.', 'error');
                      } finally {
                        setShowForwardModal(false);
                        setForwardSourceMsg(null);
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] hover:bg-[var(--toss-blue-light)] text-left text-xs font-bold text-[var(--foreground)]"
                  >
                    <span className="truncate">{room.name || '채팅방'}</span>
                    <span className="text-[11px] text-[var(--toss-gray-3)]">
                      {getConversationUnreadCountForRoom(room, roomUnreadCounts, chatRooms)
                        ? String(getConversationUnreadCountForRoom(room, roomUnreadCounts, chatRooms))
                        : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddMemberModal && selectedRoom && (
        <div
          data-testid="chat-add-member-modal"
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
          onClick={() => {
            setShowAddMemberModal(false);
            setAddMemberSelectingIds([]);
          }}
        >
          <div
            className="bg-[var(--card)] w-full max-w-md rounded-2xl p-4 space-y-4 shadow-sm border border-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              참여자 추가
            </h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              현재 채팅방에 새로 초대할 직원을 선택하세요.
            </p>
            <input
              data-testid="chat-add-member-search"
              type="text"
              value={addMemberSearch}
              onChange={(e) => setAddMemberSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              placeholder="이름, 부서, 직급으로 검색"
            />
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
              {addableMembers.length === 0 ? (
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold py-4 text-center">
                  추가할 수 있는 직원이 없습니다.
                </p>
              ) : (
                addableMembers.map(( s: StaffMember) => {
                  const checked = addMemberSelectingIds.includes(s.id);
                  return (
                    <label
                      data-testid={`chat-add-member-option-${s.id}`}
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--border)] hover:bg-[var(--muted)] cursor-pointer text-[11px]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAddMemberSelectingIds((prev) =>
                              prev.includes(s.id) ? prev : [...prev, s.id]
                            );
                          } else {
                            setAddMemberSelectingIds((prev) =>
                              prev.filter((id) => id !== s.id)
                            );
                          }
                        }}
                        className="w-3 h-3"
                      />
                      <span className="flex-1">
                        <span className="font-semibold text-[var(--foreground)]">
                          {s.name}
                        </span>
                        <span className="ml-1 text-[var(--toss-gray-3)]">
                          {s.position ? ` ${s.position}` : ''}
                          {s.company || s.department
                            ? ` · ${s.company || s.department}`
                            : ''}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                data-testid="chat-add-member-cancel"
                type="button"
                onClick={() => {
                  setShowAddMemberModal(false);
                  setAddMemberSelectingIds([]);
                }}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
              >
                취소
              </button>
              <button
                data-testid="chat-add-member-submit"
                type="button"
                disabled={addMemberSelectingIds.length === 0}
                onClick={async () => {
                  if (!selectedRoom) return;
                  try {
                    const currentMembers: string[] = Array.isArray(
                      selectedRoom.members
                    )
                      ? selectedRoom.members
                      : [];
                    const setIds = new Set(
                      currentMembers.map((id: unknown) => String(id))
                    );
                    addMemberSelectingIds.forEach((id) =>
                      setIds.add(String(id))
                    );
                    const newMembers = Array.from(setIds);

                    const invitedNames = addMemberSelectingIds
                      .map((id) => resolveStaffProfile(id)?.name || '이름 없음')
                      .join(', ');
                    const inviterName = user?.name || '이름 없음';
                    const systemContent = `[초대] ${inviterName}님이 ${invitedNames}님을 초대했습니다.`;
                    await applyRoomMemberChange({
                      roomId: String(selectedRoom.id),
                      members: newMembers,
                      systemContent,
                    });
                    setShowAddMemberModal(false);
                    setAddMemberSelectingIds([]);
                    toast('참여자가 추가되었습니다.');
                  } catch (e) {
                    console.error('add members error', e);
                    toast('참여자 추가 중 오류가 발생했습니다.', 'error');
                  }
                }}
                className="flex-1 py-3 rounded-[var(--radius-lg)] text-[11px] font-semibold text-white bg-[var(--accent)] disabled:bg-[var(--toss-gray-3)] hover:bg-[var(--accent)]"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaPanel && (
        <>
          <div className="fixed inset-0 bg-black/5 z-[100] md:z-30 animate-in fade-in" onClick={() => setShowMediaPanel(false)} />
          <aside
            data-testid="chat-media-panel"
            className="fixed top-0 right-0 bottom-0 w-80 bg-[var(--card)] border-l border-[var(--border)] shadow-sm z-[101] md:z-40 flex flex-col animate-in slide-in-from-right duration-300"
          >
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-xs font-black text-[var(--toss-gray-4)] uppercase tracking-widest">첨부 내역</span>
              <button
                data-testid="chat-media-panel-close"
                onClick={() => setShowMediaPanel(false)}
                className="p-2 text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 rounded-xl"
              >
                닫기
              </button>
            </div>

            <div className="flex p-2 gap-1 bg-[var(--tab-bg)] dark:bg-zinc-900 border-b border-[var(--border)]">
              {(['all', 'media', 'image', 'video', 'file'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setMediaFilter(f)}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mediaFilter === f ? 'bg-[var(--card)] dark:bg-zinc-800 text-blue-600 shadow-soft' : 'text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)]'}`}
                >
                  {f === 'all' ? '전체' : f === 'media' ? '사진/동영상' : f === 'image' ? '이미지' : f === 'video' ? '동영상' : '파일'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {filteredMediaMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-[var(--toss-gray-3)]">
                  <span className="text-4xl mb-2">📭</span>
                  <p className="text-[11px] font-bold">내역이 없습니다.</p>
                </div>
              ) : (
                filteredMediaMessages.map(( m: ChatMessage) => {
                  const furl = (m.file_url || '') as string;
                  const attachmentName = getAttachmentDisplayName(m.file_name, furl);
                  const previewKind = resolveAttachmentKind(furl, m.file_kind);
                  return (
                    <AttachmentListCard
                      key={m.id}
                      url={furl}
                      name={attachmentName}
                      kind={previewKind}
                      summary={m.content || null}
                      meta={new Date(m.created_at || 0).toLocaleDateString()}
                      onPreview={() => openAttachmentPreviewForMessage(m)}
                      onReply={() => startReplyToMessage(m)}
                      replyTestId={`chat-media-reply-${m.id}`}
                      actionVariant="subtle"
                    />
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}

      {showGlobalSearch && (
        <div data-testid="chat-global-search-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-start md:items-center justify-center p-4 pt-12 md:p-4 animate-in fade-in" onClick={closeGlobalSearch}>
          <div className="bg-[var(--card)] dark:bg-zinc-900 w-full max-w-3xl rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[80vh] md:max-h-[85vh] border border-[var(--border)] dark:border-zinc-800" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-[var(--border)] dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--toss-gray-3)]">
                  <circle cx="8" cy="8" r="5.5"/><line x1="12.5" y1="12.5" x2="18" y2="18"/><path d="M15 3v4"/><path d="M13 5h4"/>
                </svg>
                <input
                  data-testid="chat-global-search-input"
                  autoFocus
                  value={globalSearchQuery}
                  onChange={e => setGlobalSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleGlobalSearch(globalSearchQuery)}
                  placeholder="멤버, 채팅방, 메시지, 파일을 통합 검색"
                  className="flex-1 bg-transparent text-foreground text-sm font-bold outline-none placeholder:text-[var(--toss-gray-3)] placeholder:font-normal"
                />
                <button
                  data-testid="chat-open-group-modal"
                  type="button"
                  onClick={openGroupFromGlobalSearch}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap"
                >
                  새 그룹
                </button>
                <button
                  data-testid="chat-global-search-submit"
                  onClick={() => { void handleGlobalSearch(globalSearchQuery); }}
                  className="px-3 py-1.5 bg-[var(--accent)] text-white font-bold text-xs rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  검색
                </button>
                <button onClick={closeGlobalSearch} className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-lg font-bold leading-none px-1">×</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', '전체', globalSearchCounts.all],
                  ['member', '멤버', globalSearchCounts.member],
                  ['room', '채팅방', globalSearchCounts.room],
                  ['message', '메시지', globalSearchCounts.message],
                  ['file', '파일', globalSearchCounts.file],
                ] as const).map(([tab, label, count]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setGlobalSearchTab(tab)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${globalSearchTab === tab ? 'bg-[var(--accent)] text-white' : 'bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)]'}`}
                  >
                    {label}{count > 0 ? ` ${count}` : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--tab-bg)] dark:bg-zinc-950 p-3">
              {!globalSearchQuery.trim() ? (
                <div className="h-40 flex flex-col items-center justify-center text-[var(--toss-gray-3)] gap-2">
                  <p className="text-sm font-bold">통합 검색으로 멤버, 채팅방, 메시지, 파일을 한 번에 찾을 수 있습니다.</p>
                  <button
                    type="button"
                    onClick={openGroupFromGlobalSearch}
                    className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
                  >
                    새 그룹 채팅 만들기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {globalSearchLoading && (
                    <div className="px-1 text-[11px] font-bold text-[var(--toss-gray-3)]">메시지와 파일을 검색하고 있습니다…</div>
                  )}

                  {(globalSearchTab === 'all' || globalSearchTab === 'member') && (
                    globalSearchMemberResults.length > 0 ? (
                      <div className="space-y-2">
                        {globalSearchTab === 'all' && <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">멤버</p>}
                        {globalSearchMemberResults.slice(0, globalSearchTab === 'all' ? 4 : globalSearchMemberResults.length).map((staff: StaffMember) => (
                          <button
                            key={`member-${staff.id}`}
                            type="button"
                            onClick={() => void openMemberFromGlobalSearch(staff)}
                            className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <MessengerAvatar
                                name={staff.name}
                                photoUrl={staff.photo_url}
                                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-3)] dark:bg-zinc-800"
                                decorative
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-bold text-foreground truncate">{staff.name}</p>
                                <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{[staff.company, staff.department, staff.position].filter(Boolean).join(' · ')}</p>
                              </div>
                              <span className="text-[10px] font-bold text-blue-600 shrink-0">대화</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : globalSearchTab === 'member' ? (
                      <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">멤버 검색 결과가 없습니다.</div>
                    ) : null
                  )}

                  {(globalSearchTab === 'all' || globalSearchTab === 'room') && (
                    globalSearchRoomResults.length > 0 ? (
                      <div className="space-y-2">
                        {globalSearchTab === 'all' && <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">채팅방</p>}
                        {globalSearchRoomResults.slice(0, globalSearchTab === 'all' ? 4 : globalSearchRoomResults.length).map(({ room, roomId, label, preview, memberCount, isHidden, isNoticeChannel }) => (
                          <button
                            key={`room-${roomId}`}
                            type="button"
                            onClick={() => openRoomFromGlobalSearch(String(room.id))}
                            className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="text-[12px] font-bold text-foreground truncate">{label}</p>
                                  {isNoticeChannel && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 font-bold shrink-0">공지</span>}
                                  {isHidden && <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-bold shrink-0">숨김</span>}
                                </div>
                                <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{preview || '대화가 없습니다.'}</p>
                              </div>
                              <span className="text-[10px] font-bold text-[var(--toss-gray-3)] shrink-0">{memberCount}명</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : globalSearchTab === 'room' ? (
                      <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">채팅방 검색 결과가 없습니다.</div>
                    ) : null
                  )}

                  {(globalSearchTab === 'all' || globalSearchTab === 'message' || globalSearchTab === 'file') && (() => {
                    const targetResults =
                      globalSearchTab === 'file'
                        ? globalSearchFileResults
                        : globalSearchTab === 'message'
                          ? globalSearchMessageResults
                          : globalSearchResults;
                    if (!globalSearchLoading && targetResults.length === 0) {
                      return (globalSearchTab === 'message' || globalSearchTab === 'file') ? (
                        <div className="h-24 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">
                          {globalSearchTab === 'file' ? '파일 검색 결과가 없습니다.' : '메시지 검색 결과가 없습니다.'}
                        </div>
                      ) : null;
                    }
                    return (
                      <div className="space-y-2">
                        {globalSearchTab === 'all' && <p className="px-1 text-[10px] font-bold text-[var(--toss-gray-3)]">메시지 / 파일</p>}
                        {targetResults.slice(0, globalSearchTab === 'all' ? 6 : targetResults.length).map((msg: ChatMessage) => {
                          type SearchRoom = { name?: string; type?: string; members?: string[] };
                          const msgRoom = (msg.chat_rooms as SearchRoom | null | undefined);
                          let roomName = msgRoom?.name || '채팅방';
                          if (msgRoom?.type === 'direct' && Array.isArray(msgRoom?.members)) {
                            const otherStaff = allKnownStaffs.find((s: StaffMember) => msgRoom.members!.includes(String(s.id)) && String(s.id) !== effectiveChatUserId);
                            if (otherStaff) roomName = otherStaff.name;
                          }
                          const fileUrl = msg.file_url || '';
                          const attachmentKind = resolveAttachmentKind(fileUrl, msg.file_kind);
                          const isImage = attachmentKind === 'image';
                          const isFile = !!fileUrl && attachmentKind === 'file';
                          const fileName = fileUrl ? getAttachmentDisplayName(msg.file_name, fileUrl) : '';
                          return (
                            <div
                              data-testid={`chat-global-search-result-${msg.id}`}
                              key={msg.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openRoomFromGlobalSearch(String(msg.room_id), String(msg.id))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  openRoomFromGlobalSearch(String(msg.room_id), String(msg.id));
                                }
                              }}
                              className="w-full text-left p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl hover:border-[var(--accent)] hover:shadow-sm transition-all cursor-pointer"
                            >
                              {fileUrl ? (
                                <AttachmentListCard
                                  url={fileUrl}
                                  name={fileName}
                                  kind={attachmentKind}
                                  summary={msg.content || null}
                                  meta={`${roomName} · ${(msg.staff as { name?: string } | null | undefined)?.name || '이름 없음'} · ${new Date(msg.created_at || 0).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ${new Date(msg.created_at || 0).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                                  badgeLabel={isImage ? '이미지' : isFile ? '파일' : '동영상'}
                                  onPreview={() => openAttachmentPreview(fileUrl, fileName, attachmentKind)}
                                  onActivate={() => openRoomFromGlobalSearch(String(msg.room_id), String(msg.id))}
                                  actionVariant="subtle"
                                  className="border-0 bg-transparent p-0 shadow-none"
                                />
                              ) : (
                                <>
                                  <div className="flex items-center justify-between mb-1.5 gap-3">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="px-1.5 py-0.5 bg-[var(--muted)] dark:bg-zinc-800 text-[var(--toss-gray-4)] rounded text-[10px] font-bold truncate shrink-0 max-w-[110px]">
                                        {roomName}
                                      </span>
                                      <span className="text-[11px] font-bold text-foreground truncate">{(msg.staff as { name?: string } | null | undefined)?.name || '이름 없음'}</span>
                                    </div>
                                    <span className="text-[10px] font-medium text-[var(--toss-gray-3)] shrink-0">
                                      {new Date(msg.created_at || 0).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {new Date(msg.created_at || 0).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {msg.content && (
                                    <p className="text-[12px] font-semibold text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] line-clamp-2 leading-relaxed">
                                      {msg.content}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {!globalSearchLoading && globalSearchCounts.all === 0 && (
                    <div className="h-24 flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
                      <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                      <p className="text-xs mt-1 text-[var(--toss-gray-3)]">멤버, 채팅방, 메시지, 파일을 함께 검색했습니다.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {false && showGlobalSearch && (
        <div data-testid="chat-global-search-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-start md:items-center justify-center p-4 pt-12 md:p-4 animate-in fade-in" onClick={() => { setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); }}>
          <div className="bg-[var(--card)] dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[80vh] md:max-h-[85vh] border border-[var(--border)] dark:border-zinc-800" onClick={e => e.stopPropagation()}>
            {/* 검색 헤더 */}
            <div className="p-3 border-b border-[var(--border)] dark:border-zinc-800 flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--toss-gray-3)]">
                <circle cx="9" cy="9" r="6"/><line x1="15" y1="15" x2="19" y2="19"/>
              </svg>
              <input
                data-testid="chat-global-search-input"
                autoFocus
                value={globalSearchQuery}
                onChange={e => setGlobalSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()}
                placeholder="대화내용, 파일명, 사진명 통합 검색..."
                className="flex-1 bg-transparent text-foreground text-sm font-bold outline-none placeholder:text-[var(--toss-gray-3)] placeholder:font-normal"
              />
              <button
                data-testid="chat-global-search-submit"
                onClick={() => {
                  void handleGlobalSearch();
                }}
                className="px-3 py-1.5 bg-[var(--accent)] text-white font-bold text-xs rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                {globalSearchLoading ? '검색중…' : '검색'}
              </button>
              <button onClick={() => { setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); }} className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-lg font-bold leading-none px-1">×</button>
            </div>

            {/* 결과 목록 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--tab-bg)] dark:bg-zinc-950 p-3">
              {globalSearchLoading && (
                <div className="h-40 flex items-center justify-center text-sm text-[var(--toss-gray-3)] font-bold">검색 중…</div>
              )}
              {!globalSearchLoading && globalSearchResults.length === 0 && globalSearchQuery.trim() && (
                <div className="h-40 flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
                  <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                  <p className="text-xs mt-1 text-[var(--toss-gray-3)]">대화내용, 파일명, 사진명으로 검색됩니다.</p>
                </div>
              )}
              {!globalSearchLoading && globalSearchResults.length > 0 && (
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-2 px-1">{globalSearchResults.length}건 검색됨</p>
              )}
              <div className="space-y-2">
                {globalSearchResults.map((msg: ChatMessage) => {
                  type SearchRoom = { name?: string; type?: string; members?: string[] };
                  const msgRoom = (msg.chat_rooms as SearchRoom | null | undefined);
                  let roomName = msgRoom?.name || '채팅방';
                  if (msgRoom?.type === 'direct' && Array.isArray(msgRoom?.members)) {
                    const otherStaff = allKnownStaffs.find(( s: StaffMember) => msgRoom.members!.includes(String(s.id)) && String(s.id) !== effectiveChatUserId);
                    if (otherStaff) roomName = otherStaff.name;
                  }
                  const fileUrl = msg.file_url || '';
                  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif|avif)(\?|$)/i.test(fileUrl);
                  const isFile = !!fileUrl && !isImage;
                  const fileName = fileUrl ? getAttachmentDisplayName(msg.file_name, fileUrl) : '';
                  return (
                    <div
                      data-testid={`chat-global-search-result-${msg.id}`}
                      key={msg.id}
                      onClick={() => { setRoom(msg.room_id); setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); }}
                      className="group p-3 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-xl cursor-pointer hover:border-[var(--accent)] hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 bg-[var(--muted)] dark:bg-zinc-800 text-[var(--toss-gray-4)] rounded text-[10px] font-bold truncate shrink-0 max-w-[110px]">
                            {roomName}
                          </span>
                          <span className="text-[11px] font-bold text-foreground truncate">{(msg.staff as { name?: string } | null | undefined)?.name || '알 수 없음'}</span>
                          {isImage && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold shrink-0">사진</span>}
                          {isFile && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 font-bold shrink-0">파일</span>}
                        </div>
                        <span className="text-[10px] font-medium text-[var(--toss-gray-3)] shrink-0">
                          {new Date(msg.created_at || 0).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {new Date(msg.created_at || 0).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {msg.content && (
                        <p className="text-[12px] font-semibold text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] line-clamp-2 leading-relaxed">
                          {msg.content}
                        </p>
                      )}
                      {fileName && (
                        <p className="text-[11px] font-semibold text-[var(--toss-gray-4)] truncate mt-0.5">
                          📎 {fileName}
                        </p>
                      )}
                      {fileUrl && (
                        <AttachmentQuickActions
                          url={fileUrl}
                          name={fileName}
                          onPreview={() => openAttachmentPreview(fileUrl, fileName, isImage ? 'image' : 'file')}
                          variant="subtle"
                          className="mt-2"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 이미지 전체화면 미리보기 모달 ── */}
      {attachmentPreview && activeAttachmentPreview && (
        <div
          data-testid="chat-attachment-preview-modal"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={closeAttachmentPreview}
          tabIndex={-1}
        >
          {/* 상단 버튼 바 - safe-area 적용 */}
          <div
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-end gap-2 px-4 pb-2"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 12px) + 12px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mr-auto flex items-center gap-2 text-white">
              {activeAttachmentPreview.kind === 'image' && (
                <div className="inline-flex items-center gap-1 rounded-full bg-white/15 p-1 text-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => nudgeAttachmentZoom(-0.25)}
                    className="h-9 min-w-9 rounded-full px-2 text-sm font-bold transition-colors hover:bg-white/15"
                    aria-label="축소"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={resetAttachmentImageTransform}
                    className="h-9 min-w-[68px] rounded-full px-3 text-[11px] font-bold transition-colors hover:bg-white/15"
                  >
                    {Math.round(attachmentZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeAttachmentZoom(0.25)}
                    className="h-9 min-w-9 rounded-full px-2 text-sm font-bold transition-colors hover:bg-white/15"
                    aria-label="확대"
                  >
                    +
                  </button>
                </div>
              )}
              {attachmentPreviewCount > 1 ? (
                <div
                  data-testid="chat-attachment-preview-counter"
                  className="rounded-full bg-white/15 px-3 py-2 text-[11px] font-semibold shadow-sm"
                >
                  {attachmentPreview.activeIndex + 1} / {attachmentPreviewCount}
                </div>
              ) : null}
            </div>
            <a
              href={activeAttachmentPreview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-11 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 px-4 text-white text-xs font-semibold transition-colors"
            >
              새 창
            </a>
            <a
              href={buildDownloadUrl(activeAttachmentPreview.url, activeAttachmentPreview.name ?? '')}
              onClick={(e) => e.stopPropagation()}
              className="h-11 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 px-4 text-white text-xs font-semibold transition-colors"
              aria-label="다운로드"
            >
              다운로드
            </a>
            <button
              type="button"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl font-light transition-colors"
              onClick={closeAttachmentPreview}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
          {canNavigateAttachmentPreview && activeAttachmentPreview.kind === 'image' && (
            <>
              <button
                type="button"
                data-testid="chat-attachment-preview-prev-button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveAttachmentPreview(-1);
                }}
                className="absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white transition-colors hover:bg-white/30"
                style={{ left: 'max(12px, calc(var(--sidebar-width, 72px) + 12px))' }}
                aria-label="이전 사진"
              >
                ‹
              </button>
              <button
                type="button"
                data-testid="chat-attachment-preview-next-button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveAttachmentPreview(1);
                }}
                className="absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white transition-colors hover:bg-white/30 md:right-6"
                aria-label="다음 사진"
              >
                ›
              </button>
            </>
          )}
          <div
            className="max-w-[92vw] max-h-[88vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {activeAttachmentPreview.kind === 'image' ? (
              <div
                className={`flex max-w-[92vw] max-h-[80vh] items-center justify-center overflow-hidden rounded-xl ${attachmentZoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
                style={{ touchAction: attachmentZoom > 1 ? 'none' : 'manipulation' }}
                onWheel={handleAttachmentImageWheel}
                onPointerDown={handleAttachmentImagePointerDown}
                onPointerMove={handleAttachmentImagePointerMove}
                onPointerUp={handleAttachmentImagePointerUp}
                onPointerCancel={handleAttachmentImagePointerUp}
                onDoubleClick={handleAttachmentImageDoubleClick}
              >
                <img
                  src={activeAttachmentPreview.url}
                  alt={activeAttachmentPreview.name || '미리보기'}
                  data-testid="chat-attachment-preview-image"
                  className="max-w-[92vw] max-h-[80vh] rounded-xl object-contain shadow-sm select-none"
                  style={{
                    transform: `translate3d(${attachmentOffset.x}px, ${attachmentOffset.y}px, 0) scale(${attachmentZoom})`,
                    transformOrigin: 'center center',
                    transition: attachmentDragRef.current ? 'none' : 'transform 160ms ease',
                  }}
                  draggable={false}
                />
              </div>
            ) : activeAttachmentPreview.kind === 'video' ? (
              <video
                src={activeAttachmentPreview.url}
                controls
                autoPlay
                playsInline
                className="max-w-[92vw] max-h-[88vh] rounded-xl bg-black shadow-sm"
              />
            ) : /\.pdf(\?|#|$)/i.test(activeAttachmentPreview.url) ? (
              <iframe
                src={activeAttachmentPreview.url}
                title={activeAttachmentPreview.name}
                className="w-[92vw] h-[88vh] rounded-xl bg-[var(--card)] shadow-sm"
              />
            ) : (
              <div className="w-full max-w-md rounded-[var(--radius-xl)] bg-[var(--card)] p-6 shadow-sm text-left">
                <p className="text-sm font-bold text-[var(--foreground)] break-all">{activeAttachmentPreview.name}</p>
                <p className="mt-2 text-xs text-[var(--toss-gray-4)] break-all">{activeAttachmentPreview.url}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={activeAttachmentPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white"
                  >
                    새 창 열기
                  </a>
                  <a
                    href={buildDownloadUrl(activeAttachmentPreview.url, activeAttachmentPreview.name ?? '')}
                    className="inline-flex items-center rounded-lg bg-[var(--tab-bg)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                  >
                    다운로드
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

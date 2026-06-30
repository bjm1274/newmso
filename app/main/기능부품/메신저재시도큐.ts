'use client';

import { STORAGE_KEYS } from '@/lib/storage-keys';
import type { ChatMessage, StaffMember } from '@/types';
import type { MessageRetryPayload } from './메신저유틸';
import { sortByCreatedAt, limitToMaxSize } from './메신저재시도큐공통';

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000] as const;
const MAX_QUEUE_SIZE = 50;

export type PersistedChatRetryEntry = {
  id: string;
  actorId: string;
  payload: MessageRetryPayload;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  attemptCount: number;
  nextAutoRetryAt: string | null;
};

function getRetryQueueStorageKey(actorId: string | null | undefined) {
  return STORAGE_KEYS.chatRetryQueue(String(actorId || '').trim() || 'guest');
}

function clampAttemptCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizeRetryEntry(raw: unknown): PersistedChatRetryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = String(record.id || '').trim();
  const actorId = String(record.actorId || '').trim();
  const payloadRecord =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : null;
  const roomId = String(payloadRecord?.roomId || '').trim();
  if (!id || !actorId || !roomId) return null;

  return {
    id,
    actorId,
    payload: {
      roomId,
      content: String(payloadRecord?.content || ''),
      fileUrl: payloadRecord?.fileUrl ? String(payloadRecord.fileUrl) : null,
      fileName: payloadRecord?.fileName ? String(payloadRecord.fileName) : null,
      fileSizeBytes: Number.isFinite(Number(payloadRecord?.fileSizeBytes))
        ? Number(payloadRecord?.fileSizeBytes)
        : null,
      fileKind:
        payloadRecord?.fileKind === 'image' ||
        payloadRecord?.fileKind === 'video' ||
        payloadRecord?.fileKind === 'file'
          ? payloadRecord.fileKind
          : null,
      replyToId: payloadRecord?.replyToId ? String(payloadRecord.replyToId) : null,
      albumId: payloadRecord?.albumId ? String(payloadRecord.albumId) : null,
      albumIndex: Number.isFinite(Number(payloadRecord?.albumIndex))
        ? Number(payloadRecord?.albumIndex)
        : null,
      albumTotal: Number.isFinite(Number(payloadRecord?.albumTotal))
        ? Number(payloadRecord?.albumTotal)
        : null },
    createdAt: String(record.createdAt || '') || new Date().toISOString(),
    updatedAt: String(record.updatedAt || '') || new Date().toISOString(),
    error: typeof record.error === 'string' ? record.error : null,
    attemptCount: clampAttemptCount(record.attemptCount),
    nextAutoRetryAt:
      typeof record.nextAutoRetryAt === 'string' && record.nextAutoRetryAt.trim()
        ? record.nextAutoRetryAt.trim()
        : null };
}

function readQueueEntries(actorId: string | null | undefined): PersistedChatRetryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getRetryQueueStorageKey(actorId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return sortByCreatedAt(
      parsed.map(normalizeRetryEntry).filter((entry): entry is PersistedChatRetryEntry => Boolean(entry)),
    );
  } catch {
    return [];
  }
}

function writeQueueEntries(actorId: string | null | undefined, entries: PersistedChatRetryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      getRetryQueueStorageKey(actorId),
      JSON.stringify(limitToMaxSize(entries, MAX_QUEUE_SIZE)),
    );
  } catch {
    // ignore storage failures
  }
}

function buildNextAutoRetryAt(attemptCount: number) {
  const delay = RETRY_DELAYS_MS[Math.min(RETRY_DELAYS_MS.length - 1, Math.max(0, attemptCount - 1))];
  return new Date(Date.now() + delay).toISOString();
}

export function readChatRetryQueue(actorId: string | null | undefined) {
  return readQueueEntries(actorId);
}

export function upsertFailedChatRetryEntry(
  actorId: string | null | undefined,
  params: {
    id: string;
    payload: MessageRetryPayload;
    error?: string | null;
    createdAt?: string | null;
  },
) {
  const normalizedActorId = String(actorId || '').trim();
  const normalizedId = String(params.id || '').trim();
  if (!normalizedActorId || !normalizedId) return [];

  const existingEntries = readQueueEntries(normalizedActorId);
  const existing = existingEntries.find((entry) => entry.id === normalizedId) || null;
  const attemptCount = (existing?.attemptCount || 0) + 1;
  const now = new Date().toISOString();
  const nextEntry: PersistedChatRetryEntry = {
    id: normalizedId,
    actorId: normalizedActorId,
    payload: params.payload,
    createdAt: params.createdAt || existing?.createdAt || now,
    updatedAt: now,
    error: params.error || null,
    attemptCount,
    nextAutoRetryAt: buildNextAutoRetryAt(attemptCount) };

  const nextEntries = sortByCreatedAt([
    ...existingEntries.filter((entry) => entry.id !== normalizedId),
    nextEntry,
  ]);
  writeQueueEntries(normalizedActorId, nextEntries);
  return nextEntries;
}

export function removeChatRetryQueueEntry(
  actorId: string | null | undefined,
  entryId: string | null | undefined,
) {
  const normalizedActorId = String(actorId || '').trim();
  const normalizedEntryId = String(entryId || '').trim();
  if (!normalizedActorId || !normalizedEntryId) return [];
  const nextEntries = readQueueEntries(normalizedActorId).filter((entry) => entry.id !== normalizedEntryId);
  writeQueueEntries(normalizedActorId, nextEntries);
  return nextEntries;
}

export function getDueChatRetryQueueEntries(
  actorId: string | null | undefined,
  roomIds?: Array<string | null | undefined>,
) {
  const roomIdSet = new Set(
    (roomIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  const now = Date.now();
  return readQueueEntries(actorId).filter((entry) => {
    if (roomIdSet.size > 0 && !roomIdSet.has(String(entry.payload.roomId || '').trim())) {
      return false;
    }
    if (!entry.nextAutoRetryAt) return true;
    const retryAt = new Date(entry.nextAutoRetryAt).getTime();
    if (!Number.isFinite(retryAt)) return true;
    return retryAt <= now;
  });
}

export function buildRetryQueueMessage(
  entry: PersistedChatRetryEntry,
  user: StaffMember | null | undefined,
): ChatMessage {
  return {
    id: entry.id,
    room_id: entry.payload.roomId,
    sender_id: entry.actorId,
    sender_name: user?.name || null,
    content: entry.payload.content,
    file_url: entry.payload.fileUrl,
    file_name: entry.payload.fileName,
    file_size_bytes: entry.payload.fileSizeBytes,
    file_kind: entry.payload.fileKind,
    reply_to_id: entry.payload.replyToId,
    album_id: entry.payload.albumId ?? null,
    album_index: entry.payload.albumIndex ?? null,
    album_total: entry.payload.albumTotal ?? null,
    created_at: entry.createdAt,
    is_deleted: false,
    staff: {
      name: user?.name || null,
      position: user?.position || null,
      photo_url: user?.photo_url || user?.avatar_url || null } } as ChatMessage;
}

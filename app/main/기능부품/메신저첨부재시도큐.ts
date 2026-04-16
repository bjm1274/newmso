'use client';

import { buildRetryQueueId, sortByCreatedAt } from './메신저재시도큐공통';

export const CHAT_ATTACHMENT_RETRY_EVENT = 'erp-chat-attachment-retry-changed';

const DB_NAME = 'erp-chat-attachment-retries';
const STORE_NAME = 'entries';
const DB_VERSION = 1;
const MAX_ENTRIES_PER_ACTOR = 24;

type AttachmentRetryRecord = {
  id: string;
  actorId: string;
  roomId: string;
  content: string;
  replyToId: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileBlob: Blob;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  error: string | null;
};

export type AttachmentRetryQueueEntry = Omit<AttachmentRetryRecord, 'fileBlob'> & {
  file: File;
};

function dispatchChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_ATTACHMENT_RETRY_EVENT));
}

function openAttachmentRetryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('indexeddb open failed'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('actorId', 'actorId', { unique: false });
        store.createIndex('roomId', 'roomId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => Promise<T>,
) {
  return openAttachmentRetryDb().then((db) =>
    new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        callback();
      };

      transaction.onabort = () => finish(() => reject(transaction.error || new Error('indexeddb aborted')));
      transaction.onerror = () => finish(() => reject(transaction.error || new Error('indexeddb failed')));
      transaction.oncomplete = () => finish(() => resolve(result as T));

      let result: T;
      runner(store)
        .then((value) => {
          result = value;
        })
        .catch((error) => {
          finish(() => reject(error));
          try {
            transaction.abort();
          } catch {
            // ignore
          }
        });
    }).finally(() => db.close()),
  );
}

const buildQueueId = buildRetryQueueId;

function toFile(record: AttachmentRetryRecord) {
  return new File([record.fileBlob], record.fileName, {
    type: record.fileType || 'application/octet-stream',
    lastModified: new Date(record.updatedAt || record.createdAt || Date.now()).getTime(),
  });
}

function normalizeRecord(raw: unknown): AttachmentRetryRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = String(record.id || '').trim();
  const actorId = String(record.actorId || '').trim();
  const roomId = String(record.roomId || '').trim();
  const fileName = String(record.fileName || '').trim();
  if (!id || !actorId || !roomId || !fileName || !(record.fileBlob instanceof Blob)) return null;

  return {
    id,
    actorId,
    roomId,
    content: String(record.content || ''),
    replyToId: typeof record.replyToId === 'string' && record.replyToId.trim() ? record.replyToId.trim() : null,
    fileName,
    fileType: String(record.fileType || ''),
    fileSize: Number.isFinite(Number(record.fileSize)) ? Number(record.fileSize) : 0,
    fileBlob: record.fileBlob,
    createdAt: String(record.createdAt || '') || new Date().toISOString(),
    updatedAt: String(record.updatedAt || '') || new Date().toISOString(),
    attemptCount: Math.max(1, Math.floor(Number(record.attemptCount) || 1)),
    error: typeof record.error === 'string' ? record.error : null,
  };
}

async function getAllRecords(store: IDBObjectStore) {
  return new Promise<AttachmentRetryRecord[]>((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error || new Error('attachment retry getAll failed'));
    request.onsuccess = () => {
      resolve(
        (Array.isArray(request.result) ? request.result : [])
          .map(normalizeRecord)
          .filter((entry): entry is AttachmentRetryRecord => Boolean(entry)),
      );
    };
  });
}

export async function readFailedAttachmentRetryQueue(actorId: string | null | undefined) {
  const normalizedActorId = String(actorId || '').trim();
  if (!normalizedActorId || typeof indexedDB === 'undefined') return [] as AttachmentRetryQueueEntry[];

  return withStore('readonly', async (store) => {
    const all = await getAllRecords(store);
    return sortByCreatedAt(all.filter((entry) => entry.actorId === normalizedActorId))
      .map((entry) => ({
        ...entry,
        file: toFile(entry),
      }));
  });
}

export async function queueFailedAttachmentRetryEntry(
  actorId: string | null | undefined,
  params: {
    roomId: string;
    content: string;
    replyToId?: string | null;
    file: File;
    error?: string | null;
  },
) {
  const normalizedActorId = String(actorId || '').trim();
  const roomId = String(params.roomId || '').trim();
  if (!normalizedActorId || !roomId || typeof indexedDB === 'undefined') {
    return [] as AttachmentRetryQueueEntry[];
  }

  await withStore('readwrite', async (store) => {
    const all = await getAllRecords(store);
    const sameActor = sortByCreatedAt(all.filter((entry) => entry.actorId === normalizedActorId));
    const overflow = Math.max(0, sameActor.length + 1 - MAX_ENTRIES_PER_ACTOR);
    for (const entry of sameActor.slice(0, overflow)) {
      store.delete(entry.id);
    }

    const now = new Date().toISOString();
    const record: AttachmentRetryRecord = {
      id: buildQueueId(),
      actorId: normalizedActorId,
      roomId,
      content: String(params.content || ''),
      replyToId: params.replyToId ? String(params.replyToId).trim() || null : null,
      fileName: params.file.name || '첨부 파일',
      fileType: params.file.type || 'application/octet-stream',
      fileSize: params.file.size || 0,
      fileBlob: params.file,
      createdAt: now,
      updatedAt: now,
      attemptCount: 1,
      error: params.error || null,
    };
    store.put(record);
    return undefined;
  });

  dispatchChanged();
  return readFailedAttachmentRetryQueue(normalizedActorId);
}

export async function removeFailedAttachmentRetryEntry(
  actorId: string | null | undefined,
  entryId: string | null | undefined,
) {
  const normalizedActorId = String(actorId || '').trim();
  const normalizedEntryId = String(entryId || '').trim();
  if (!normalizedActorId || !normalizedEntryId || typeof indexedDB === 'undefined') {
    return [] as AttachmentRetryQueueEntry[];
  }

  await withStore('readwrite', async (store) => {
    store.delete(normalizedEntryId);
    return undefined;
  });
  dispatchChanged();
  return readFailedAttachmentRetryQueue(normalizedActorId);
}

export async function clearFailedAttachmentRetryQueue(actorId: string | null | undefined) {
  const normalizedActorId = String(actorId || '').trim();
  if (!normalizedActorId || typeof indexedDB === 'undefined') return [] as AttachmentRetryQueueEntry[];

  await withStore('readwrite', async (store) => {
    const all = await getAllRecords(store);
    all
      .filter((entry) => entry.actorId === normalizedActorId)
      .forEach((entry) => {
        store.delete(entry.id);
      });
    return undefined;
  });
  dispatchChanged();
  return readFailedAttachmentRetryQueue(normalizedActorId);
}


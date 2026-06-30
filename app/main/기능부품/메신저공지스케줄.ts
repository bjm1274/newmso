'use client';

import { STORAGE_KEYS } from '@/lib/storage-keys';

export const CHAT_NOTICE_SCHEDULE_EVENT = 'erp-chat-notice-schedule-changed';

export type NoticeReminderLogEntry = {
  offsetMinutes: number;
  unreadCount: number;
  sentAt: string;
};

export type NoticeScheduleJob = {
  id: string;
  actorId: string;
  actorName: string;
  content: string;
  sendAt: string;
  createdAt: string;
  updatedAt: string;
  status: 'scheduled' | 'sent' | 'cancelled';
  sentMessageId: string | null;
  sentAt: string | null;
  reminderMinutes: number[];
  reminderLog: NoticeReminderLogEntry[];
};

function getStorageKey(actorId: string | null | undefined) {
  return STORAGE_KEYS.chatNoticeSchedules(String(actorId || '').trim() || 'guest');
}

function normalizeReminderMinutes(value: unknown) {
  if (!Array.isArray(value)) return [60, 240];
  const normalized = Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => Math.min(7 * 24 * 60, Math.floor(entry))),
    ),
  ).sort((left, right) => left - right);
  return normalized.length > 0 ? normalized : [60, 240];
}

function normalizeJob(raw: unknown): NoticeScheduleJob | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = String(record.id || '').trim();
  const actorId = String(record.actorId || '').trim();
  const content = String(record.content || '').trim();
  const sendAt = String(record.sendAt || '').trim();
  if (!id || !actorId || !content || !sendAt) return null;

  const reminderLog = Array.isArray(record.reminderLog)
    ? record.reminderLog
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
          const item = entry as Record<string, unknown>;
          const offsetMinutes = Number(item.offsetMinutes);
          const unreadCount = Number(item.unreadCount);
          const sentAt = String(item.sentAt || '').trim();
          if (!Number.isFinite(offsetMinutes) || !Number.isFinite(unreadCount) || !sentAt) return null;
          return {
            offsetMinutes: Math.floor(offsetMinutes),
            unreadCount: Math.max(0, Math.floor(unreadCount)),
            sentAt } satisfies NoticeReminderLogEntry;
        })
        .filter((entry): entry is NoticeReminderLogEntry => Boolean(entry))
    : [];

  const status =
    record.status === 'sent' || record.status === 'cancelled'
      ? record.status
      : 'scheduled';

  return {
    id,
    actorId,
    actorName: String(record.actorName || '').trim() || '알 수 없음',
    content,
    sendAt,
    createdAt: String(record.createdAt || '').trim() || new Date().toISOString(),
    updatedAt: String(record.updatedAt || '').trim() || new Date().toISOString(),
    status,
    sentMessageId:
      typeof record.sentMessageId === 'string' && record.sentMessageId.trim()
        ? record.sentMessageId.trim()
        : null,
    sentAt:
      typeof record.sentAt === 'string' && record.sentAt.trim()
        ? record.sentAt.trim()
        : null,
    reminderMinutes: normalizeReminderMinutes(record.reminderMinutes),
    reminderLog };
}

function readJobs(actorId: string | null | undefined) {
  if (typeof window === 'undefined') return [] as NoticeScheduleJob[];
  try {
    const raw = window.localStorage.getItem(getStorageKey(actorId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeJob)
      .filter((entry): entry is NoticeScheduleJob => Boolean(entry))
      .sort(
        (left, right) =>
          new Date(left.sendAt || 0).getTime() - new Date(right.sendAt || 0).getTime(),
      );
  } catch {
    return [];
  }
}

function writeJobs(actorId: string | null | undefined, jobs: NoticeScheduleJob[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(actorId), JSON.stringify(jobs));
    window.dispatchEvent(new CustomEvent(CHAT_NOTICE_SCHEDULE_EVENT));
  } catch {
    // ignore storage failures
  }
}

export function readScheduledNoticeJobs(actorId: string | null | undefined) {
  return readJobs(actorId);
}

export function saveScheduledNoticeJob(
  actorId: string | null | undefined,
  job: Pick<NoticeScheduleJob, 'content' | 'sendAt' | 'actorName'> & {
    id?: string | null;
    reminderMinutes?: number[] | null;
  },
) {
  const normalizedActorId = String(actorId || '').trim();
  const content = String(job.content || '').trim();
  const sendAt = String(job.sendAt || '').trim();
  if (!normalizedActorId || !content || !sendAt) return readJobs(actorId);

  const existingJobs = readJobs(normalizedActorId);
  const now = new Date().toISOString();
  const normalizedId =
    String(job.id || '').trim() ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const existing = existingJobs.find((entry) => entry.id === normalizedId) || null;

  const nextJob: NoticeScheduleJob = {
    id: normalizedId,
    actorId: normalizedActorId,
    actorName: String(job.actorName || '').trim() || existing?.actorName || '알 수 없음',
    content,
    sendAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    status: existing?.status === 'sent' ? 'sent' : 'scheduled',
    sentMessageId: existing?.sentMessageId || null,
    sentAt: existing?.sentAt || null,
    reminderMinutes: normalizeReminderMinutes(job.reminderMinutes ?? existing?.reminderMinutes),
    reminderLog: existing?.reminderLog || [] };

  const nextJobs = [
    ...existingJobs.filter((entry) => entry.id !== normalizedId),
    nextJob,
  ].sort((left, right) => new Date(left.sendAt || 0).getTime() - new Date(right.sendAt || 0).getTime());
  writeJobs(normalizedActorId, nextJobs);
  return nextJobs;
}

export function updateScheduledNoticeJobs(
  actorId: string | null | undefined,
  updater: (jobs: NoticeScheduleJob[]) => NoticeScheduleJob[],
) {
  const normalizedActorId = String(actorId || '').trim();
  if (!normalizedActorId) return [] as NoticeScheduleJob[];
  const nextJobs = updater(readJobs(normalizedActorId));
  writeJobs(normalizedActorId, nextJobs);
  return nextJobs;
}

export function cancelScheduledNoticeJob(
  actorId: string | null | undefined,
  jobId: string | null | undefined,
) {
  const normalizedJobId = String(jobId || '').trim();
  return updateScheduledNoticeJobs(actorId, (jobs) =>
    jobs.map((job) =>
      job.id === normalizedJobId
        ? {
            ...job,
            status: 'cancelled',
            updatedAt: new Date().toISOString() }
        : job,
    ),
  );
}

export function removeScheduledNoticeJob(
  actorId: string | null | undefined,
  jobId: string | null | undefined,
) {
  const normalizedJobId = String(jobId || '').trim();
  return updateScheduledNoticeJobs(actorId, (jobs) => jobs.filter((job) => job.id !== normalizedJobId));
}

export function markScheduledNoticeSent(
  actorId: string | null | undefined,
  jobId: string,
  messageId: string,
) {
  return updateScheduledNoticeJobs(actorId, (jobs) =>
    jobs.map((job) =>
      job.id === jobId
        ? {
            ...job,
            status: 'sent',
            sentMessageId: messageId,
            sentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString() }
        : job,
    ),
  );
}

export function recordScheduledNoticeReminder(
  actorId: string | null | undefined,
  jobId: string,
  offsetMinutes: number,
  unreadCount: number,
) {
  return updateScheduledNoticeJobs(actorId, (jobs) =>
    jobs.map((job) => {
      if (job.id !== jobId) return job;
      if (job.reminderLog.some((entry) => entry.offsetMinutes === offsetMinutes)) return job;
      return {
        ...job,
        updatedAt: new Date().toISOString(),
        reminderLog: [
          ...job.reminderLog,
          {
            offsetMinutes,
            unreadCount: Math.max(0, Math.floor(unreadCount)),
            sentAt: new Date().toISOString() },
        ].sort((left, right) => left.offsetMinutes - right.offsetMinutes) };
    }),
  );
}

export function getDueScheduledNoticeJobs(
  actorId: string | null | undefined,
  now = Date.now(),
) {
  return readJobs(actorId).filter((job) => {
    if (job.status !== 'scheduled') return false;
    const sendAt = new Date(job.sendAt || 0).getTime();
    return Number.isFinite(sendAt) && sendAt <= now;
  });
}

export function getDueScheduledNoticeReminderStages(
  actorId: string | null | undefined,
  now = Date.now(),
) {
  return readJobs(actorId).flatMap((job) => {
    if (job.status !== 'sent' || !job.sentAt || !job.sentMessageId) return [];
    const sentAt = new Date(job.sentAt || 0).getTime();
    if (!Number.isFinite(sentAt)) return [];

    return job.reminderMinutes
      .filter((offsetMinutes) => !job.reminderLog.some((entry) => entry.offsetMinutes === offsetMinutes))
      .filter((offsetMinutes) => sentAt + offsetMinutes * 60 * 1000 <= now)
      .map((offsetMinutes) => ({
        job,
        offsetMinutes }));
  });
}

export function getNextScheduledNoticeRunAt(
  actorId: string | null | undefined,
  now = Date.now(),
) {
  const timestamps = readJobs(actorId).flatMap((job) => {
    if (job.status === 'scheduled') {
      const sendAt = new Date(job.sendAt || 0).getTime();
      return Number.isFinite(sendAt) ? [sendAt] : [];
    }

    if (job.status !== 'sent' || !job.sentAt || !job.sentMessageId) return [];
    const sentAt = new Date(job.sentAt || 0).getTime();
    if (!Number.isFinite(sentAt)) return [];

    return job.reminderMinutes
      .filter((offsetMinutes) => !job.reminderLog.some((entry) => entry.offsetMinutes === offsetMinutes))
      .map((offsetMinutes) => sentAt + offsetMinutes * 60 * 1000)
      .filter((timestamp) => Number.isFinite(timestamp));
  });

  if (timestamps.length === 0) return null;
  return Math.min(...timestamps.map((timestamp) => Math.max(timestamp, now)));
}


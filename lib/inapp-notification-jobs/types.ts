/**
 * Phase 8-A — 인앱 알림 보강 cron 공통 타입/유틸.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mirrorNotificationsToD1, type NotificationRow } from '../notification-utils';

export type CheckJobResult = {
  detected: number;
  created: number;
  errors: string[];
};

export type NotificationInsertRow = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: null;
};

type ExistingNotificationRow = {
  user_id: string | null;
  metadata: Record<string, unknown> | null;
};

const DEDUPE_LOOKBACK_DAYS = 7;
const DEDUPE_LOOKBACK_MS = DEDUPE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

export function dedupeCutoffIso(): string {
  return new Date(Date.now() - DEDUPE_LOOKBACK_MS).toISOString();
}

export function emptyResult(): CheckJobResult {
  return { detected: 0, created: 0, errors: [] };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function readDedupeKey(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const value = metadata.dedupe_key;
  return typeof value === 'string' ? value : '';
}

/**
 * 최근 DEDUPE_LOOKBACK_DAYS 이내 같은 type + user_id 알림 중
 * metadata.dedupe_key 값 집합을 `${userId}|${dedupeKey}` 형식으로 반환.
 */
export async function loadExistingDedupeKeys(
  supabase: SupabaseClient,
  type: string,
  userIds: string[],
): Promise<Set<string>> {
  const sent = new Set<string>();
  if (userIds.length === 0) return sent;

  const cutoff = dedupeCutoffIso();
  const chunkSize = 200;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('notifications')
      .select('user_id, metadata')
      .eq('type', type)
      .in('user_id', chunk)
      .gte('created_at', cutoff);
    if (error) throw error;

    for (const row of (data ?? []) as ExistingNotificationRow[]) {
      const key = readDedupeKey(row.metadata);
      const uid = String(row.user_id ?? '');
      if (key && uid) sent.add(`${uid}|${key}`);
    }
  }
  return sent;
}

export async function insertNotificationsChunked(
  supabase: SupabaseClient,
  rows: NotificationInsertRow[],
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('notifications').insert(chunk);
    // dual-write: D1 미러는 Supabase 결과와 무관하게 시도
    await mirrorNotificationsToD1(chunk as NotificationRow[]);
    if (error) {
      errors.push(error.message);
      continue;
    }
    created += chunk.length;
  }
  return { created, errors };
}

/**
 * lib/hooks/useCachedQuery.ts
 * SWR + lib/fetcher 래퍼 — 캐시·dedup·조건부 fetch (JM2·JM4)
 */

'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type UseCachedQueryOptions = {
  /** lib/fetcher TTL (ms). 기본 5분 */
  ttl?: number;
  /**
   * SWR focus 시 revalidate 여부. 기본 false.
   * 탭 전환마다 재호출되는 폭증을 방지합니다 (JM2).
   */
  revalidateOnFocus?: boolean;
};

export type UseCachedQueryResult<T> = {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: () => Promise<T | undefined>;
};

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

/**
 * SWR 기반 캐시 쿼리 hook.
 *
 * - key가 null이면 fetch하지 않습니다 (조건부 fetch).
 * - 내부적으로 lib/fetcher TTL 캐시를 사용해 SWR revalidate도 캐시에서 서빙합니다.
 *
 * @example
 * const { data, isLoading } = useCachedQuery(
 *   userId ? `payroll/${userId}` : null,
 *   () => supabase.from('payroll_records').select('*').eq('user_id', userId).then(r => r.data ?? []),
 * );
 */
export function useCachedQuery<T>(
  key: string | null,
  fn: () => Promise<T>,
  options?: UseCachedQueryOptions,
): UseCachedQueryResult<T> {
  const ttl = options?.ttl;
  const revalidateOnFocus = options?.revalidateOnFocus ?? false;

  const swrFetcher = key
    ? () => fetcher<T>(key, fn, { ttl })
    : null;

  const { data, error, isLoading, mutate } = useSWR<T, Error>(
    key,
    swrFetcher,
    {
      revalidateOnFocus,
      // SWR 자체 dedupe window: fetcher 레이어에서 이미 처리하므로 0으로
      dedupingInterval: 0,
    },
  );

  return {
    data,
    error,
    isLoading,
    mutate: () => mutate(),
  };
}

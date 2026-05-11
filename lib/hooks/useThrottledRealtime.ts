/**
 * lib/hooks/useThrottledRealtime.ts
 * Supabase Realtime 이벤트를 throttle해 refetch를 제한합니다 (JM2·JM4)
 */

'use client';

import { useEffect, useRef } from 'react';
import { subscribeRealtime, type TableFilter } from '@/lib/realtime-bus';

/**
 * Realtime 이벤트를 구독하고 throttle된 refetch를 실행합니다.
 *
 * - 이벤트가 연속으로 발생해도 throttleMs(기본 30초) 간격으로만 refetch 호출
 * - 컴포넌트 unmount 시 자동으로 구독 해제
 *
 * @param channelKey  realtime-bus 채널 식별자 (동일 key = 채널 공유)
 * @param tables      구독할 테이블 및 이벤트 목록
 * @param refetch     실행할 refetch 함수 (useCachedQuery의 mutate 등)
 * @param throttleMs  최소 호출 간격(ms). 기본 30000(30초)
 *
 * @example
 * const { data, mutate } = useCachedQuery('payroll-list', fetchPayroll);
 *
 * useThrottledRealtime(
 *   'payroll-list',
 *   [{ table: 'payroll_records', event: '*' }],
 *   mutate,
 * );
 */
export function useThrottledRealtime(
  channelKey: string,
  tables: TableFilter[],
  refetch: () => void,
  throttleMs = 30_000,
): void {
  // 마지막 refetch 호출 시각
  const lastCalledAt = useRef<number>(0);
  // 최신 refetch / throttleMs 참조 (클로저 stale 방지)
  const refetchRef = useRef(refetch);
  const throttleMsRef = useRef(throttleMs);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    throttleMsRef.current = throttleMs;
  }, [throttleMs]);

  useEffect(() => {
    const unsubscribe = subscribeRealtime(
      channelKey,
      tables,
      () => {
        const now = Date.now();
        if (now - lastCalledAt.current >= throttleMsRef.current) {
          lastCalledAt.current = now;
          refetchRef.current();
        }
      },
    );

    return unsubscribe;
    // tables 배열은 렌더마다 새 참조가 생성될 수 있으므로
    // channelKey 변경만 재구독 트리거로 사용합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey]);
}

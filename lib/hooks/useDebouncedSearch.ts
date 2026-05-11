/**
 * lib/hooks/useDebouncedSearch.ts
 * 검색 input 300ms debounce hook (JM2·JM4)
 */

'use client';

import { useEffect, useState } from 'react';

/**
 * 입력값을 지정된 지연 후에 업데이트하는 debounce hook.
 *
 * - value가 빠르게 변경될 때 마지막 안정된 값만 반환합니다.
 * - 검색 API 호출 빈도를 줄이는 데 사용하세요 (JM2).
 *
 * @param value  감시할 입력값
 * @param delayMs  debounce 지연(ms). 기본 300
 *
 * @example
 * const [query, setQuery] = useState('');
 * const debouncedQuery = useDebouncedSearch(query);
 *
 * const { data } = useCachedQuery(
 *   debouncedQuery ? `search/${debouncedQuery}` : null,
 *   () => searchStaff(debouncedQuery),
 * );
 */
export function useDebouncedSearch<T extends string>(
  value: T,
  delayMs = 300,
): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

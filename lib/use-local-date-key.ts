'use client';

import { useEffect, useState } from 'react';

import { toDateKey } from '@/lib/date-utils';

/**
 * Date → 로컬 TZ 기준 'YYYY-MM-DD' 키.
 *
 * 예전에는 `date-utils.toDateKey` 와 글자 단위로 똑같은 본문을 여기에도 두었다.
 * 같은 규약을 두 곳에서 관리하니 한쪽만 KST 로 바꾸는 식의 drift 가 생겼다(8차 D10-011).
 * 이제 정본 하나만 남기고 이름만 유지한다(기존 import 호환).
 */
export const formatLocalDateKey = toDateKey;

export function useLocalDateKey() {
  const [dateKey, setDateKey] = useState(() => formatLocalDateKey(new Date()));

  useEffect(() => {
    const updateDateKey = () => {
      const nextDateKey = formatLocalDateKey(new Date());
      setDateKey((currentDateKey) => (currentDateKey === nextDateKey ? currentDateKey : nextDateKey));
    };

    updateDateKey();
    const timer = window.setInterval(updateDateKey, 60 * 1000);
    window.addEventListener('focus', updateDateKey);
    document.addEventListener('visibilitychange', updateDateKey);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateDateKey);
      document.removeEventListener('visibilitychange', updateDateKey);
    };
  }, []);

  return dateKey;
}

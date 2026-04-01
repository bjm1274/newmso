'use client';

import { useEffect, useState } from 'react';

export function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

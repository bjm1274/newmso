'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from './toast';

/** 같은 조회 범위의 마지막 성공값만 보존하고 다른 범위의 늦은 응답은 폐기한다. */
export function useHrQuery<T>(key: string, load: () => Promise<T>, empty: T, refreshKey: unknown = 0) {
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; data: T; error: string | null; loading: boolean }>({ key, data: empty, error: null, loading: true });
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setState((prev) => ({ key, data: prev.key === key ? prev.data : empty, error: null, loading: true }));
    void loadRef.current().then((data) => {
      if (active) setState({ key, data, error: null, loading: false });
    }).catch(() => {
      if (!active) return;
      const error = '인사 정보를 불러오지 못했습니다. 다시 시도해 주세요.';
      setState((prev) => ({ ...prev, error, loading: false }));
      toast(error, 'error');
    });
    return () => { active = false; };
  }, [key, version, refreshKey]);
  return { data: state.key === key ? state.data : empty, error: state.key === key ? state.error : null, loading: state.key !== key || state.loading, reload };
}

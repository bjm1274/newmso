'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  buildStaffBootstrapSelect,
  STAFF_BOOTSTRAP_OPTIONAL_COLUMNS,
} from '@/lib/staff-query-columns';

let cachedStaffs: StaffMember[] | null = null;
let fetchPromise: Promise<StaffMember[]> | null = null;

async function fetchStaffs(): Promise<StaffMember[]> {
  const { data, error } = await withMissingColumnsFallback<StaffMember[]>(
    (omittedColumns) =>
      supabase
        .from('staff_members')
        .select(buildStaffBootstrapSelect(omittedColumns))
        .order('employee_no', { ascending: true })
        .returns<StaffMember[]>(),
    STAFF_BOOTSTRAP_OPTIONAL_COLUMNS,
  );
  if (error) {
    throw error;
  }
  return (data ?? []) as StaffMember[];
}

/**
 * 훅 외부나 비동기 콜백에서 캐시 데이터를 즉시 가져올 때 사용하는 헬퍼.
 * 이미 캐싱되어 있거나 로딩 중인 Promise가 있으면 이를 재사용합니다.
 */
export async function getStaffsCached(force = false): Promise<StaffMember[]> {
  if (force) {
    cachedStaffs = null;
    fetchPromise = null;
  }
  if (cachedStaffs) return cachedStaffs;
  if (!fetchPromise) {
    fetchPromise = fetchStaffs().catch((err) => {
      fetchPromise = null; // 에러 시 초기화하여 재동작 유도
      throw err;
    });
  }
  return fetchPromise;
}

export function useStaffCache() {
  const [staffs, setStaffs] = useState<StaffMember[]>(cachedStaffs ?? []);
  const [loading, setLoading] = useState(!cachedStaffs);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    if (cachedStaffs) {
      setStaffs(cachedStaffs);
      setLoading(false);
      return;
    }
    getStaffsCached()
      .then((data) => {
        cachedStaffs = data;
        setStaffs(data);
        setError(null);
      })
      .catch((err) => {
        console.error('[staff-cache] load failed', err);
        setError(err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const refresh = useCallback(async () => {
    fetchPromise = null;
    cachedStaffs = null;
    setLoading(true);
    try {
      const data = await fetchStaffs();
      cachedStaffs = data;
      setStaffs(data);
      setError(null);
    } catch (err) {
      console.error('[staff-cache] refresh failed', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { staffs, loading, error, refresh };
}

export default useStaffCache;

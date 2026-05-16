'use client';

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizeProfileUser } from '@/lib/profile-photo';
import { hasUserPayloadChanged } from '@/lib/access-control';
import {
  buildStaffBootstrapSelect,
  STAFF_BOOTSTRAP_OPTIONAL_COLUMNS,
} from '@/lib/staff-query-columns';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import type { ErpUser, ERPData, StaffMember } from '@/types';

export interface ERPDataState {
  data: ERPData;
  setData: Dispatch<SetStateAction<ERPData>>;
  loading: boolean;
  hasLoadedInitialData: boolean;
  fetchERPData: (currentUser?: ErpUser | null) => Promise<void>;
}

const REFETCH_DEBOUNCE_MS = 500;

export function useERPData(
  persistClientUser: (nextUser: ErpUser | null) => void,
  getUser: () => ErpUser | null
): ERPDataState {
  const [loading, setLoading] = useState(true);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  const [data, setData] = useState<ERPData>({
    staffs: [],
    depts: [],
    posts: [],
    tasks: [],
    surgeries: [],
    mris: [],
  });

  const fetchERPData = useCallback(
    async (currentUser?: ErpUser | null) => {
      setLoading(true);
      const u = currentUser ?? getUser();
      try {
        const { data: staffData, error: staffError } =
          await withMissingColumnsFallback<StaffMember[]>(
            (omittedColumns) =>
              supabase
                .from('staff_members')
                .select(buildStaffBootstrapSelect(omittedColumns))
                .order('employee_no', { ascending: true })
                .returns<StaffMember[]>(),
            STAFF_BOOTSTRAP_OPTIONAL_COLUMNS,
          );

        if (staffError) throw staffError;

        const normalizedStaffData = Array.isArray(staffData)
          ? staffData.map((staff: StaffMember) => normalizeProfileUser(staff))
          : [];

        // 현재 사용자의 변경된 정보(팀/부서 등)가 있으면 세션 동기화
        if (normalizedStaffData.length > 0 && u?.id) {
          const updatedSelf = normalizedStaffData.find((s: StaffMember) => s.id === u.id);
          if (updatedSelf) {
            const safeSelf = { ...updatedSelf };
            delete safeSelf.password;
            delete safeSelf.passwd;
            const normalizedSelf = normalizeProfileUser(safeSelf);
            if (hasUserPayloadChanged(u, normalizedSelf)) {
              persistClientUser(normalizedSelf);
            }
          }
        }

        const uniqueDepts = Array.from(
          new Set(normalizedStaffData.map((s: StaffMember) => String(s.department || '').trim()))
        ).filter(Boolean);

        setData({
          staffs: normalizedStaffData,
          depts: uniqueDepts || [],
          posts: [],
          tasks: [],
          surgeries: [],
          mris: [],
        });
      } catch (error) {
        console.error('데이터 로딩 실패:', error);
      } finally {
        setHasLoadedInitialData(true);
        setLoading(false);
      }
    },
    [persistClientUser, getUser]
  );

  // staff_members realtime: 직원 추가/수정/삭제·퇴사 처리 시 자동 갱신.
  // 디바운스로 연속 변경(예: 대량 인사발령)에서 fetch 폭주 방지.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void fetchERPData(getUser());
      }, REFETCH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('erp-data-staff_members-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_members' },
        scheduleRefetch,
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchERPData, getUser]);

  return {
    data,
    setData,
    loading,
    hasLoadedInitialData,
    fetchERPData,
  };
}

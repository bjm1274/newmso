'use client';

import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizeProfileUser } from '@/lib/profile-photo';
import { hasUserPayloadChanged } from '@/lib/access-control';
import type { ErpUser, ERPData, StaffMember } from '@/types';

export interface ERPDataState {
  data: ERPData;
  setData: Dispatch<SetStateAction<ERPData>>;
  loading: boolean;
  hasLoadedInitialData: boolean;
  fetchERPData: (currentUser?: ErpUser | null) => Promise<void>;
}

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
        const { data: staffData, error: staffError } = await supabase
          .from('staff_members')
          .select('*')
          .order('employee_no', { ascending: true });

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

  return {
    data,
    setData,
    loading,
    hasLoadedInitialData,
    fetchERPData,
  };
}

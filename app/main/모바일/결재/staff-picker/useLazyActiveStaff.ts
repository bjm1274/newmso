'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';

/** staff_members select — 결재선/참조 피커 동일 컬럼 */
export const STAFF_PICKER_SELECT =
  'id, name, company, department, position, status, hire_date, resign_date, email, phone, role, permissions';

/**
 * 시트 첫 open 시 활성 직원 1회 lazy fetch.
 * staffRows === null 이면 아직 미로드, [] 이면 로드 완료(빈 결과 포함).
 */
export function useLazyActiveStaff(
  open: boolean,
  logTag = 'mobile-staff-picker'
): { staffRows: StaffMember[] | null; loading: boolean } {
  const [staffRows, setStaffRows] = useState<StaffMember[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);
  const logTagRef = useRef(logTag);
  logTagRef.current = logTag;

  useEffect(() => {
    if (!open) return;
    if (staffRows !== null) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await db
          .from('staff_members')
          .select(STAFF_PICKER_SELECT);
        if (error) throw error;
        const rows = ((data ?? []) as StaffMember[]).filter((s) => isActiveStaff(s));
        setStaffRows(rows);
      } catch (err) {
        console.error(`[${logTagRef.current}] staff fetch failed`, err);
        setStaffRows([]);
      } finally {
        setLoading(false);
        inflightRef.current = false;
      }
    })();
  }, [open, staffRows]);

  return { staffRows, loading };
}

/**
 * 로그인 user 객체에서 staff_members.id 를 안정적으로 해석.
 * PC resolveStaffLike 와 동일 경로 — 모바일 raw user.id 만 쓰던 버그 방지.
 */

'use client';

import { useEffect, useState } from 'react';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';

export function useResolvedStaffId(
  user: Record<string, unknown> | null | undefined,
): string | null {
  const seed = getStaffLikeId(user) || null;
  const [staffId, setStaffId] = useState<string | null>(seed);

  const userId = typeof user?.id === 'string' ? user.id : '';
  const employeeNo = typeof user?.employee_no === 'string' ? user.employee_no : '';
  const authUserId = typeof user?.auth_user_id === 'string' ? user.auth_user_id : '';
  const name = typeof user?.name === 'string' ? user.name : '';

  useEffect(() => {
    let cancelled = false;
    const direct = getStaffLikeId({
      id: userId,
      employee_no: employeeNo,
      auth_user_id: authUserId,
      name,
    });
    if (direct) {
      setStaffId(direct);
      return;
    }
    void (async () => {
      try {
        const resolved = await resolveStaffLike({
          id: userId,
          employee_no: employeeNo,
          auth_user_id: authUserId,
          name,
        });
        if (cancelled) return;
        setStaffId(getStaffLikeId(resolved) || null);
      } catch {
        if (!cancelled) setStaffId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, employeeNo, authUserId, name]);

  return staffId;
}

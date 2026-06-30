'use client';

/**
 * useApproverLine — 결재선 자동 매핑 + 수동 변경 상태 훅.
 * 본인 회사의 APPROVER_POSITIONS 보유자 1~3명을 직급 위계순으로 자동 결재선 구성.
 * 여러 양식 폼이 공유.
 *
 * JM: 단일 책임(결재선 상태), JM2(staff fetch 1회), JM4(any 금지)
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import { isActiveStaff, isDepartmentHeadOrAbove, getPositionOrder } from '@/lib/active-staff';
import { toApproverPick, type ApproverPick } from './결재선피커';

export type UseApproverLine = {
  approverLine: ApproverPick[];
  approverDefaults: ApproverPick[];
  approverLoading: boolean;
  approverManual: boolean;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  applyPick: (next: ApproverPick[]) => void;
};

export function useApproverLine(staffId: string | null, company: string): UseApproverLine {
  const [approverDefaults, setApproverDefaults] = useState<ApproverPick[]>([]);
  const [approverLine, setApproverLine] = useState<ApproverPick[]>([]);
  const [approverLoading, setApproverLoading] = useState(true);
  const [approverManual, setApproverManual] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!staffId) {
      setApproverLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setApproverLoading(true);
      try {
        const { data, error } = await db
          .from('staff_members')
          .select('id, name, company, department, position, status, hire_date, resign_date, email, phone, role, permissions');
        if (error) throw error;
        if (cancelled) return;
        const candidates = ((data ?? []) as StaffMember[])
          .filter((s) => isActiveStaff(s))
          .filter((s) => isDepartmentHeadOrAbove(s))
          .filter((s) => String(s.id) !== staffId)
          .filter((s) => s.company === company || s.company === 'SY INC.')
          .sort((a, b) => getPositionOrder(a.position, a.role) - getPositionOrder(b.position, b.role) || (a.name || '').localeCompare(b.name || ''));
        const picks = candidates.map(toApproverPick);
        setApproverDefaults(picks);
        if (!approverManual) {
          setApproverLine(picks);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-approval] approver candidates load failed', err);
          setApproverDefaults([]);
          if (!approverManual) setApproverLine([]);
        }
      } finally {
        if (!cancelled) setApproverLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // approverManual은 의도적으로 의존성 제외 — manual 토글로 재fetch하면 안 됨
  }, [staffId, company]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPick = useCallback(
    (next: ApproverPick[]) => {
      setApproverLine(next);
      const sameAsDefault =
        next.length === approverDefaults.length &&
        next.every((p, i) => p.id === approverDefaults[i]?.id);
      setApproverManual(!sameAsDefault);
    },
    [approverDefaults],
  );

  return {
    approverLine,
    approverDefaults,
    approverLoading,
    approverManual,
    pickerOpen,
    setPickerOpen,
    applyPick };
}

'use client';

import { useCallback } from 'react';
import { buildApprovalHistoryEntryCore } from '@/lib/approval-shared';
import type { StaffMember } from '@/types';

/**
 * 결재 이력 엔트리 빌더 훅(공용).
 * useApprovalActions/useApprovalRouting/useApprovalSubmit에 동일하게 중복돼 있던
 * buildApprovalHistoryEntry useCallback 래퍼를 단일화한 것. actor(id/name)는 user에서 캡처.
 */
export function useApprovalHistoryEntry(user: StaffMember | null) {
  return useCallback(
    <A extends string>(action: A, note?: string | null) =>
      buildApprovalHistoryEntryCore(
        user?.id ? String(user.id) : null,
        user?.name ? String(user.name) : null,
        action,
        note,
      ),
    [user?.id, user?.name],
  );
}

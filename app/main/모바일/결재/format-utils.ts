'use client';

import { useCallback } from 'react';
import type { MAvatarTone } from '../공통/MAvatar';
import { pickAvatarTone as pickAvatarToneLib, type AvatarTone } from '@/lib/avatar-tone';
import { formatTs as formatTsLib, type FormatTsMode } from '@/lib/format-display';
import { buildApprovalHistoryEntryCore } from '@/lib/approval-shared';
import type { StaffMember } from '@/types';

export type { AvatarTone, FormatTsMode };
export { formatMoney } from '@/lib/format-display';

/** Re-export: maps lib AvatarTone → MAvatarTone (same union). */
export function pickAvatarTone(seed: string | null | undefined): MAvatarTone {
  return pickAvatarToneLib(seed) as MAvatarTone;
}

export function formatTs(iso?: string | null, mode: FormatTsMode = 'relative'): string {
  return formatTsLib(iso, mode);
}

export function elapsedDays(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export function readAmount(row: Record<string, unknown>): string | null {
  const meta = (row.meta_data ?? {}) as Record<string, unknown>;
  const candidates = [
    meta.total_amount,
    meta.amount,
    meta.requested_amount,
    (meta.summary as Record<string, unknown> | undefined)?.amount,
  ];
  for (const v of candidates) {
    if (v == null) continue;
    const num = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(num) && num !== 0) {
      return num.toLocaleString('ko-KR');
    }
  }
  return null;
}

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

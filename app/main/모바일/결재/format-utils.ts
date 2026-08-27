'use client';

import { useCallback } from 'react';
import type { MAvatarTone } from '../공통/MAvatar';
import { pickAvatarTone as pickAvatarToneLib, type AvatarTone } from '@/lib/avatar-tone';
import { formatTs as formatTsLib, type FormatTsMode } from '@/lib/format-display';
import { parseDbTimestampMs } from '@/lib/date-formatter';
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

/**
 * 기안 후 경과일.
 *
 * raw `new Date(iso)` 를 쓰면 안 된다. approvals.created_at 은 운영에 두 형식이
 * 섞여 있고(공백형 428 / T형 280), `new Date()` 는 공백형을 **로컬(KST)** 로
 * 파싱해 실제(UTC)보다 9시간 늦은 것으로 본다. 그래서 경과시간에 +9시간이
 * 얹혀 기안 15시간 만에 '24h 초과' 배지가 붙었다(9차 TZ-06).
 *
 * 같은 파일의 formatTs 는 이미 정본 파서(parseDbTimestamp)를 타는데
 * 이 함수만 raw 였다.
 */
export function elapsedDays(iso?: string | null): number {
  if (!iso) return 0;
  const ms = parseDbTimestampMs(iso);
  if (Number.isNaN(ms)) return 0;
  const diff = Date.now() - ms;
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

'use client';

import { useCallback } from 'react';
import type { MAvatarTone } from '../공통/MAvatar';
import { buildApprovalHistoryEntryCore } from '@/lib/approval-shared';
import type { StaffMember } from '@/types';

const AVATAR_TONES: MAvatarTone[] = ['blue', 'pink', 'violet', 'orange', 'cyan', 'green'];

export function pickAvatarTone(seed: string | null | undefined): MAvatarTone {
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function formatTs(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return '어제';
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
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

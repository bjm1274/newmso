'use client';

/**
 * 소멸 예정 알림 보드 (LeaveExpiryBoard)
 *
 * - rows: 잔여 > 0 & 소멸까지 30일 이내
 * - row 클릭 → onSuggestUse(권유 모달) — 부모가 결정
 * - 알림 발송 버튼 → notifications insert
 * - JM3: 비동기 알림 try/catch + toast
 * - JM6: <ul>/<li> 시맨틱, 각 버튼 aria-label
 */

import { memo, useState } from 'react';
import { toast } from '@/lib/toast';
import { sendExpiryAlert, type LeaveExpiryItem } from './data';

interface Props {
  items: LeaveExpiryItem[];
  loading?: boolean;
  onSuggestUse: (item: LeaveExpiryItem) => void;
}

interface RowProps {
  item: LeaveExpiryItem;
  busy: boolean;
  onAlert: (item: LeaveExpiryItem) => void;
  onSuggestUse: (item: LeaveExpiryItem) => void;
}

const Row = memo(function ExpiryRow({ item, busy, onAlert, onSuggestUse }: RowProps) {
  const name = item.staff.name ?? '직원';
  const dept = item.staff.department ?? '-';
  const expiryLabel = item.expiryDate
    ? new Date(item.expiryDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : '연말';
  const danger = item.daysUntilExpiry <= 7;
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
      <span className={danger ? 'badge badge-red' : 'badge badge-yellow'}>
        {item.daysUntilExpiry <= 0 ? '소멸' : `D-${item.daysUntilExpiry}`}
      </span>
      <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
        {name.charAt(0)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12px] font-bold text-[var(--foreground)]">{name}</span>
        <span className="text-[11px] text-[var(--toss-gray-4)]">
          {dept} · 잔여 {item.remaining}일 · {expiryLabel} 소멸
        </span>
      </div>
      <button
        type="button"
        onClick={() => onAlert(item)}
        disabled={busy}
        aria-label={`${name}에게 소멸 권고 알림 발송`}
        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
      >
        {busy ? '발송...' : '권고 알림'}
      </button>
      <button
        type="button"
        onClick={() => onSuggestUse(item)}
        aria-label={`${name} 연차 사용 권유`}
        className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:opacity-90"
      >
        사용 권유
      </button>
    </li>
  );
});

function LeaveExpiryBoardInner({ items, loading, onSuggestUse }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const handleAlert = async (item: LeaveExpiryItem) => {
    if (pendingId) return;
    setPendingId(String(item.staff.id));
    try {
      await sendExpiryAlert(String(item.staff.id), item.remaining, item.expiryDate);
      toast('소멸 권고 알림을 발송했습니다.', 'success');
    } catch (error) {
      console.error('소멸 권고 알림 실패:', error);
      const message = error instanceof Error ? error.message : '알림 발송에 실패했습니다.';
      toast(message, 'error');
    } finally {
      setPendingId(null);
    }
  };

  // reference §1106: "일괄 권고 알림 발송" — 보드 상단 액션
  const handleBulkAlert = async () => {
    if (bulkBusy || items.length === 0) return;
    setBulkBusy(true);
    let success = 0;
    let fail = 0;
    for (const item of items) {
      try {
        await sendExpiryAlert(String(item.staff.id), item.remaining, item.expiryDate);
        success += 1;
      } catch (error) {
        console.error('일괄 권고 알림 — 개별 실패:', error);
        fail += 1;
      }
    }
    setBulkBusy(false);
    if (fail === 0) {
      toast(`${success}명에게 일괄 권고 알림을 발송했습니다.`, 'success');
    } else {
      toast(`성공 ${success}건 · 실패 ${fail}건. 실패 건은 콘솔을 확인하세요.`, 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state py-8 text-center">
        <div className="text-[12px] font-bold text-[var(--foreground)]">
          소멸 임박 대상자가 없습니다.
        </div>
        <div className="mt-1 text-[11px] text-[var(--toss-gray-4)]">
          현재 30일 이내 소멸 예정인 잔여 연차가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[var(--toss-gray-4)]">
          소멸 임박 대상자 {items.length}명
        </span>
        <button
          type="button"
          onClick={() => void handleBulkAlert()}
          disabled={bulkBusy || items.length === 0}
          aria-label="일괄 권고 알림 발송"
          className="rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20 disabled:opacity-50"
        >
          {bulkBusy ? '발송 중…' : `일괄 권고 알림 (${items.length})`}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <Row
            key={String(item.staff.id)}
            item={item}
            busy={pendingId === String(item.staff.id)}
            onAlert={handleAlert}
            onSuggestUse={onSuggestUse}
          />
        ))}
      </ul>
    </div>
  );
}

export const LeaveExpiryBoard = memo(LeaveExpiryBoardInner);

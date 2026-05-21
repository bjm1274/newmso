'use client';

/**
 * 직원별 연차 현황 표 (LeaveBalanceTable)
 *
 * - 행 클릭 → 빠른 신청 폼 prefill (onPick)
 * - 잔여 ≤ 3일 → danger 색, 소멸 임박 → warn 배지
 * - JM6: <button> 행, aria-label, 키보드 Tab 가능
 * - JM2: 행 memo로 불필요 리렌더 방지
 */

import { memo } from 'react';
import type { LeaveStaffRow } from './data';

interface Props {
  rows: LeaveStaffRow[];
  selectedStaffId?: string | null;
  loading?: boolean;
  onPick: (row: LeaveStaffRow) => void;
}

function statusBadge(row: LeaveStaffRow) {
  if (row.daysUntilExpiry > 0 && row.daysUntilExpiry <= 30 && row.remaining > 0) {
    return (
      <span className="badge badge-yellow">
        소멸 D-{row.daysUntilExpiry}
      </span>
    );
  }
  if (row.daysUntilExpiry <= 0 && row.remaining > 0) {
    return <span className="badge badge-red">소멸</span>;
  }
  if (row.pending > 0) {
    return <span className="badge badge-blue">신청 {row.pending}건</span>;
  }
  return null;
}

interface RowProps {
  row: LeaveStaffRow;
  active: boolean;
  onPick: (row: LeaveStaffRow) => void;
}

const TableRow = memo(function TableRow({ row, active, onPick }: RowProps) {
  const remainColor = row.remaining <= 3
    ? 'text-[#DC2626]'
    : 'text-[var(--accent)]';
  const name = row.staff.name ?? '직원';
  return (
    <tr
      className={`border-b border-[var(--border)] last:border-b-0 transition-colors ${
        active ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]/60'
      }`}
    >
      <td className="sticky left-0 z-[1] bg-[var(--card)] px-3 py-2">
        <button
          type="button"
          onClick={() => onPick(row)}
          aria-label={`${name} 잔여 ${row.remaining}일 — 빠른 신청 폼에 채우기`}
          className="flex items-center gap-2 text-left"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
            {name.charAt(0)}
          </span>
          <span className="text-[12px] font-bold text-[var(--foreground)]">
            {name}
          </span>
        </button>
      </td>
      <td className="px-3 py-2 text-[11px] text-[var(--toss-gray-4)]">
        {row.staff.department ?? '-'}
      </td>
      <td className="px-3 py-2 text-center text-[12px] tnum text-[var(--foreground)]">
        {row.total}
      </td>
      <td className="px-3 py-2 text-center text-[12px] tnum text-[var(--toss-gray-4)]">
        {row.used}
      </td>
      <td className={`px-3 py-2 text-center text-[12px] tnum font-bold ${remainColor}`}>
        {row.remaining}
      </td>
      <td className="px-3 py-2">
        {statusBadge(row)}
      </td>
    </tr>
  );
});

function LeaveBalanceTableInner({ rows, selectedStaffId, loading, onPick }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state py-10 text-center">
        <div className="text-[13px] font-bold text-[var(--foreground)]">
          표시할 직원이 없습니다.
        </div>
        <div className="mt-1 text-[11px] text-[var(--toss-gray-4)]">
          회사 필터를 변경하거나 직원을 등록해 주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table w-full text-[12px]">
        <thead className="sticky top-0 z-[1] bg-[var(--tab-bg)]">
          <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
            <th className="sticky left-0 z-[2] bg-[var(--tab-bg)] px-3 py-2">이름</th>
            <th className="px-3 py-2">부서</th>
            <th className="px-3 py-2 text-center">부여</th>
            <th className="px-3 py-2 text-center">사용</th>
            <th className="px-3 py-2 text-center">잔여</th>
            <th className="px-3 py-2">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TableRow
              key={String(row.staff.id)}
              row={row}
              active={selectedStaffId === String(row.staff.id)}
              onPick={onPick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const LeaveBalanceTable = memo(LeaveBalanceTableInner);

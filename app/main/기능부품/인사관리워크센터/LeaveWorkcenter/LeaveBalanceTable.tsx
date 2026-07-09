'use client';

/**
 * 직원별 연차 현황 표 (LeaveBalanceTable)
 *
 * - 검색바로 이름/부서 검색 기능 추가
 * - 행 클릭 → 빠른 신청 폼 prefill (onPick)
 * - 행 더블클릭 → 상세 연차 사용/발생 내역 팝업 트리거 (onDoubleClick)
 * - 잔여 ≤ 3일 → danger 색, 소멸 임박 → warn 배지
 * - JM6: <button> 행, aria-label, 키보드 Tab 가능
 * - JM2: 행 memo로 불필요 리렌더 방지
 */

import { memo, useMemo, useState } from 'react';
import type { LeaveStaffRow } from './data';

interface Props {
  rows: LeaveStaffRow[];
  selectedStaffId?: string | null;
  loading?: boolean;
  onPick: (row: LeaveStaffRow) => void;
  onDoubleClick: (row: LeaveStaffRow, event: React.MouseEvent<HTMLTableRowElement>) => void;
  /** 상세 보기 (더블클릭 대체 버튼) */
  onOpenDetail?: (row: LeaveStaffRow) => void;
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
  onDoubleClick: (row: LeaveStaffRow, event: React.MouseEvent<HTMLTableRowElement>) => void;
  onOpenDetail?: (row: LeaveStaffRow) => void;
}

const TableRow = memo(function TableRow({ row, active, onPick, onDoubleClick, onOpenDetail }: RowProps) {
  const remainColor = row.remaining <= 3
    ? 'text-[#DC2626]'
    : 'text-[var(--accent)]';
  const name = row.staff.name ?? '직원';
  const overuse = row.used > row.total + 0.01;
  return (
    <tr
      onClick={() => onPick(row)}
      onDoubleClick={(e) => onDoubleClick(row, e)}
      className={`border-b border-[var(--border)] last:border-b-0 transition-colors cursor-pointer bg-[var(--card)] ${
        active ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]/60'
      }`}
    >
      <td className="sticky left-0 z-[1] bg-inherit px-3 py-2">
        <div className="flex items-center gap-2 text-left">
          <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
            {name.charAt(0)}
          </span>
          <span className="text-[12px] font-bold text-[var(--foreground)]">
            {name}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-[11px] text-[var(--toss-gray-4)]">
        {row.staff.department ?? '-'}
      </td>
      <td className="px-3 py-2 text-center text-[12px] tnum text-[var(--foreground)]">
        {row.total}
      </td>
      <td className={`px-3 py-2 text-center text-[12px] tnum ${overuse ? 'font-bold text-rose-600' : 'text-[var(--toss-gray-4)]'}`}>
        {row.used}
      </td>
      <td className={`px-3 py-2 text-center text-[12px] tnum font-bold ${remainColor}`}>
        {row.remaining}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {overuse && <span className="badge badge-red">사용&gt;부여</span>}
          {statusBadge(row)}
        </div>
      </td>
      <td className="px-2 py-2 text-right">
        {onOpenDetail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(row);
            }}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
          >
            상세
          </button>
        )}
      </td>
    </tr>
  );
});

function LeaveBalanceTableInner({ rows, selectedStaffId, loading, onPick, onDoubleClick, onOpenDetail }: Props) {
  const [query, setQuery] = useState('');

  const filteredRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return rows;
    return rows.filter((row) => {
      const name = (row.staff.name ?? '').toLowerCase();
      const dept = (row.staff.department ?? '').toLowerCase();
      return name.includes(trimmed) || dept.includes(trimmed);
    });
  }, [rows, query]);

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
    <div className="flex flex-col min-h-0 w-full">
      {/* 구성원 현황 스타일의 검색바 추가 */}
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-3 py-2 shrink-0">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·부서 검색"
          aria-label="직원 검색"
          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-1.5 text-[12px] outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="data-table w-full text-[12px]">
          <thead className="sticky top-0 z-[1] bg-[var(--tab-bg)]">
            <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
              <th className="sticky left-0 z-[2] bg-[var(--tab-bg)] px-3 py-2">이름</th>
              <th className="px-3 py-2">부서</th>
              <th className="px-3 py-2 text-center">부여</th>
              <th className="px-3 py-2 text-center">사용</th>
              <th className="px-3 py-2 text-center">잔여</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-2 py-2 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--toss-gray-4)] font-medium">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <TableRow
                  key={String(row.staff.id)}
                  row={row}
                  active={selectedStaffId === String(row.staff.id)}
                  onPick={onPick}
                  onDoubleClick={onDoubleClick}
                  onOpenDetail={onOpenDetail}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const LeaveBalanceTable = memo(LeaveBalanceTableInner);

'use client';

import { useMemo } from 'react';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

type DailyRow = {
  _id: string;
  raw: Record<string, unknown>;
  staff: Record<string, unknown> | null;
  staffName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
};

export default function DailyView({ date, dailyData, onEdit }: Record<string, unknown>) {
  const _dailyData = (Array.isArray(dailyData) ? dailyData : []) as Array<Record<string, unknown>>;
  const _onEdit = onEdit as (...args: unknown[]) => void;

  const rows: DailyRow[] = useMemo(() => {
    return _dailyData.map((d, idx) => {
      const staff = (d.staff && typeof d.staff === 'object') ? d.staff as Record<string, unknown> : null;
      const rawId = (d.id ?? d.attendance_id ?? null) as string | number | null;
      const staffId = staff ? (staff.id as string | number | undefined) : undefined;
      const _id = rawId != null ? String(rawId) : staffId != null ? `staff-${staffId}-${idx}` : `row-${idx}`;
      const checkIn = typeof d.check_in === 'string' ? d.check_in : null;
      const checkOut = typeof d.check_out === 'string' ? d.check_out : null;
      const status = typeof d.status === 'string' ? d.status : null;
      const staffName = staff && typeof staff.name === 'string' ? staff.name : null;
      return { _id, raw: d, staff, staffName, checkIn, checkOut, status };
    });
  }, [_dailyData]);

  const columns = useMemo((): Column<DailyRow>[] => [
    {
      key: 'staffName',
      label: '이름',
      primary: true,
      render: (r) => <b>{r.staffName ?? '—'}</b>,
    },
    {
      key: 'checkIn',
      label: '출근',
      render: (r) => (
        <span className="text-[var(--accent)] font-medium">
          {r.checkIn ? r.checkIn.slice(11, 16) : '-'}
        </span>
      ),
    },
    {
      key: 'checkOut',
      label: '퇴근',
      render: (r) => (
        <span className="text-orange-600 font-medium">
          {r.checkOut ? r.checkOut.slice(11, 16) : '-'}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: (r) => (
        <span
          className={`px-2 py-1 rounded text-xs font-bold ${
            r.status === '지각' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
          }`}
        >
          {r.status ?? '—'}
        </span>
      ),
    },
    {
      key: '_actions',
      label: '관리',
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            _onEdit(r.raw, r.staff);
          }}
          className="text-xs bg-[var(--muted)] px-2 py-1 rounded font-bold hover:bg-[var(--toss-gray-2)]"
        >
          수정
        </button>
      ),
    },
  ], [_onEdit]);

  return (
    <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden h-full">
      <div className="p-4 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--card)] z-10">
        <h3 className="font-bold text-lg">📅 {date as string} 근태 현황</h3>
      </div>
      <div className="overflow-y-auto h-full pb-20 custom-scrollbar">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] mx-1">
          <ResponsiveTable<DailyRow>
            columns={columns}
            rows={rows}
            keyField="_id"
            emptyMessage="표시할 데이터가 없습니다."
          />
        </div>
      </div>
    </div>
  );
}

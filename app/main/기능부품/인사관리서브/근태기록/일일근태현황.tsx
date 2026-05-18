'use client';

/**
 * 일일근태현황.tsx
 *
 * 일별 출퇴근 현황 — 표시 + 정렬 + 행 클릭으로 수정 콜백.
 * 기본 정렬: 이름 오름차순. 헤더 칩으로 이름·출근시각·퇴근시각·상태 정렬 토글.
 *
 * 제약
 * - JM: 단일 책임, ~250줄
 * - JM2: 정렬 결과는 useMemo로 캐싱 (매 렌더 sort 호출 방지)
 * - JM3: 입력값 타입 가드, raw/staff null 안전 처리
 * - JM4: any 금지(불가피한 외부 prop은 unknown→가드)
 * - JM6: 정렬 칩 aria-pressed/aria-label
 */

import { useMemo, useState } from 'react';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

type DailyRow = {
  _id: string;
  raw: Record<string, unknown>;
  staff: Record<string, unknown> | null;
  staffName: string | null;
  staffDept: string | null;
  staffPosition: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
  checkInMinutes: number;
  checkOutMinutes: number;
};

type SortKey = 'name' | 'checkIn' | 'checkOut' | 'status' | 'department';
type SortDir = 'asc' | 'desc';

// 상태 정렬 우선순위: 출근(정상)→지각→조퇴→결근→휴가→휴일→기타
const STATUS_ORDER: Record<string, number> = {
  정상: 0,
  출근: 0,
  present: 0,
  지각: 1,
  late: 1,
  조퇴: 2,
  early_leave: 2,
  결근: 3,
  absent: 3,
  반차: 4,
  half_leave: 4,
  연차: 4,
  annual_leave: 4,
  병가: 4,
  sick_leave: 4,
  휴일: 5,
  holiday: 5,
};

function timeToMinutes(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  // value 예: '2026-05-18T09:12:00+09:00' 또는 '09:12'
  const slice = value.length >= 16 ? value.slice(11, 16) : value;
  const [h, m] = slice.split(':').map((s) => Number(s));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  return h * 60 + m;
}

export default function DailyView({ date, dailyData, onEdit }: Record<string, unknown>) {
  const _dailyData = (Array.isArray(dailyData) ? dailyData : []) as Array<Record<string, unknown>>;
  const _onEdit = onEdit as (...args: unknown[]) => void;

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'name',
    dir: 'asc',
  });

  const nameCollator = useMemo(
    () => new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' }),
    [],
  );

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
      const staffDept = staff && typeof staff.department === 'string' ? staff.department : null;
      const staffPosition = staff && typeof staff.position === 'string' ? staff.position : null;
      return {
        _id,
        raw: d,
        staff,
        staffName,
        staffDept,
        staffPosition,
        checkIn,
        checkOut,
        status,
        checkInMinutes: timeToMinutes(checkIn),
        checkOutMinutes: timeToMinutes(checkOut),
      };
    });
  }, [_dailyData]);

  // 정렬된 행 (JM2 — sort 결과 캐싱). 기본은 이름 오름차순으로 항상 정렬된 상태 유지.
  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'name') {
        cmp = nameCollator.compare(a.staffName || '', b.staffName || '');
      } else if (sort.key === 'department') {
        cmp = nameCollator.compare(a.staffDept || '', b.staffDept || '');
        if (cmp === 0) cmp = nameCollator.compare(a.staffPosition || '', b.staffPosition || '');
        if (cmp === 0) cmp = nameCollator.compare(a.staffName || '', b.staffName || '');
      } else if (sort.key === 'checkIn') {
        cmp = a.checkInMinutes - b.checkInMinutes;
      } else if (sort.key === 'checkOut') {
        cmp = a.checkOutMinutes - b.checkOutMinutes;
      } else if (sort.key === 'status') {
        const oa = STATUS_ORDER[a.status ?? ''] ?? 99;
        const ob = STATUS_ORDER[b.status ?? ''] ?? 99;
        cmp = oa - ob;
      }
      if (cmp === 0) cmp = nameCollator.compare(a.staffName || '', b.staffName || '');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return next;
  }, [rows, sort, nameCollator]);

  const toggleSort = (key: SortKey) => {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const indicator = (key: SortKey): string => {
    if (sort.key !== key) return '↕';
    return sort.dir === 'asc' ? '↑' : '↓';
  };

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

  const SORT_OPTIONS: ReadonlyArray<{ id: SortKey; label: string; aria: string }> = [
    { id: 'name', label: '이름', aria: '이름순 정렬' },
    { id: 'department', label: '부서', aria: '부서·직급·이름순 정렬' },
    { id: 'checkIn', label: '출근', aria: '출근시각순 정렬' },
    { id: 'checkOut', label: '퇴근', aria: '퇴근시각순 정렬' },
    { id: 'status', label: '상태', aria: '상태순 정렬' },
  ];

  return (
    <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden h-full">
      <div className="p-4 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--card)] z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h3 className="font-bold text-lg">📅 {date as string} 근태 현황</h3>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="정렬 옵션">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">정렬</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleSort(opt.id)}
              aria-pressed={sort.key === opt.id}
              aria-label={opt.aria}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold transition-colors ${
                sort.key === opt.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:text-foreground'
              }`}
            >
              <span>{opt.label}</span>
              <span aria-hidden="true" className="text-[10px] font-black">
                {indicator(opt.id)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto h-full pb-20 custom-scrollbar">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] mx-1">
          <ResponsiveTable<DailyRow>
            columns={columns}
            rows={sortedRows}
            keyField="_id"
            emptyMessage="표시할 데이터가 없습니다."
          />
        </div>
      </div>
    </div>
  );
}

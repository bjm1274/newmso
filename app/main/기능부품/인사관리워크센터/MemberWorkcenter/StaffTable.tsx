'use client';

/**
 * MemberWorkcenter — 직원 표 (좌측 패널)
 *
 * - 부서 chip 필터 + 키워드 검색
 * - 행 클릭 시 우측 드로어에 직원 정보를 전달
 *
 * JM6: th scope="col", 행은 button(role="row") 대신 tr + onClick + role="row" + aria-selected.
 *      행을 button으로 만들지 않고 tr를 유지하되 키보드 접근은 별도의 row focus 패턴은 생략
 *      (대신 검색·필터로 좁힐 수 있는 UI). 향후 필요 시 row를 button[role="row"]로 재구성.
 */

import { memo, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import {
  aggregateDepartments,
  formatJoinDate,
  formatTenure,
  isActive,
  pickHireDate,
  pickToneForStaff,
} from './data';

const TONE_BG: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  warn: 'bg-amber-500/15 text-amber-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

const EMPLOY_CHIP: Record<string, string> = {
  정규직: 'bg-emerald-500/15 text-emerald-700',
  계약직: 'bg-amber-500/15 text-amber-700',
  수습: 'bg-[var(--accent-soft)] text-[var(--accent)]',
};

interface StaffTableProps {
  staffs: StaffMember[];
  selectedId: string | null;
  onSelect: (staff: StaffMember) => void;
  onDoubleClick?: (staff: StaffMember) => void;
  onOpenNewStaff?: () => void;
  canRegisterNewStaff?: boolean;
}

function StaffTableBase({
  staffs,
  selectedId,
  onSelect,
  onDoubleClick,
  onOpenNewStaff,
  canRegisterNewStaff = false,
}: StaffTableProps) {
  const [deptFilter, setDeptFilter] = useState<string>('전체');
  const [query, setQuery] = useState('');

  const activeStaffs = useMemo(() => staffs.filter(isActive), [staffs]);

  const departments = useMemo(() => aggregateDepartments(activeStaffs), [activeStaffs]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return activeStaffs.filter((staff) => {
      if (deptFilter !== '전체') {
        const dept = (staff.department ?? '').trim() || '미지정';
        if (dept !== deptFilter) return false;
      }
      if (!trimmed) return true;
      const name = (staff.name ?? '').toLowerCase();
      const empNo = (staff.employee_no ?? '').toLowerCase();
      const position = (staff.position ?? '').toLowerCase();
      return name.includes(trimmed) || empNo.includes(trimmed) || position.includes(trimmed);
    });
  }, [activeStaffs, deptFilter, query]);

  return (
    <div className="app-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">구성원 목록</h3>
            <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
              {filtered.length}명
            </span>
          </div>
          {canRegisterNewStaff && onOpenNewStaff && (
            <button
              type="button"
              data-testid="new-staff-button"
              onClick={onOpenNewStaff}
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
              aria-label="신규 직원 등록"
            >
              <span aria-hidden="true">＋</span>
              <span>신규 등록</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·사번·직급 검색"
            aria-label="직원 검색"
            className="min-w-[160px] flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-1.5 text-[12px] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div role="tablist" aria-label="부서 필터" className="flex flex-wrap gap-1.5">
          <DeptChip
            label="전체"
            count={activeStaffs.length}
            active={deptFilter === '전체'}
            onClick={() => setDeptFilter('전체')}
          />
          {departments.map((d) => (
            <DeptChip
              key={d.key}
              label={d.label}
              count={d.count}
              active={deptFilter === d.key}
              onClick={() => setDeptFilter(d.key)}
            />
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
            조건에 맞는 직원이 없습니다.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--card)]">
              <tr className="border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
                <th scope="col" className="sticky left-0 z-[2] w-9 bg-[var(--card)] px-2 py-2 text-left"></th>
                <th scope="col" className="sticky left-9 z-[2] bg-[var(--card)] px-2 py-2 text-left">이름</th>
                <th scope="col" className="px-2 py-2 text-left">부서</th>
                <th scope="col" className="px-2 py-2 text-left">직급</th>
                <th scope="col" className="px-2 py-2 text-left">입사일</th>
                <th scope="col" className="px-2 py-2 text-left">근속</th>
                <th scope="col" className="px-2 py-2 text-left">고용</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((staff) => (
                <StaffRow
                  key={String(staff.id)}
                  staff={staff}
                  selected={selectedId === String(staff.id)}
                  onSelect={onSelect}
                  onDoubleClick={onDoubleClick}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface DeptChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}
function DeptChip({ label, count, active, onClick }: DeptChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? 'bg-[var(--accent)] text-white'
          : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
      }`}
    >
      <span>{label}</span>
      <span
        className={`min-w-[16px] rounded-full px-1 text-[10px] font-bold ${
          active ? 'bg-white/25 text-white' : 'bg-[var(--card)] text-[var(--toss-gray-4)]'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

interface StaffRowProps {
  staff: StaffMember;
  selected: boolean;
  onSelect: (staff: StaffMember) => void;
  onDoubleClick?: (staff: StaffMember) => void;
}

const StaffRow = memo(function StaffRow({ staff, selected, onSelect, onDoubleClick }: StaffRowProps) {
  const tone = pickToneForStaff(staff.name ?? '');
  const hire = pickHireDate(staff);
  const employ = (staff as Record<string, unknown>).employment_type;
  const employText = typeof employ === 'string' ? employ : '정규직';
  const employCls = EMPLOY_CHIP[employText] ?? 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
  const initial = (staff.name ?? '?').charAt(0);
  return (
    <tr
      role="row"
      aria-selected={selected}
      onClick={() => onSelect(staff)}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(staff) : undefined}
      className={`cursor-pointer border-b border-[var(--border)] transition-colors ${
        selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--muted)]'
      }`}
    >
      <td className="sticky left-0 z-[1] bg-[var(--card)] px-2 py-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[11px] font-bold ${TONE_BG[tone]}`}
          aria-hidden="true"
        >
          {initial}
        </div>
      </td>
      <td className="sticky left-9 z-[1] bg-[var(--card)] px-2 py-2">
        <div className="font-bold text-[var(--foreground)]">{staff.name}</div>
        {staff.employee_no && (
          <div className="text-[10px] text-[var(--toss-gray-4)]">{staff.employee_no}</div>
        )}
      </td>
      <td className="px-2 py-2 text-[var(--toss-gray-4)]">{staff.department || '-'}</td>
      <td className="px-2 py-2 font-semibold text-[var(--foreground)]">{staff.position || '-'}</td>
      <td className="tnum px-2 py-2 text-[var(--toss-gray-4)]">{formatJoinDate(hire)}</td>
      <td className="tnum px-2 py-2 text-[var(--toss-gray-4)]">{formatTenure(hire)}</td>
      <td className="px-2 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${employCls}`}>
          {employText}
        </span>
      </td>
    </tr>
  );
});

export default memo(StaffTableBase);

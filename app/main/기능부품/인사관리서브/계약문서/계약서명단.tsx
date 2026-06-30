'use client';
import { useMemo, useState } from 'react';
import { isActiveStaff } from '@/lib/active-staff';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

type Staff = { id: string | number; name: string; employee_no?: string; company?: string; department?: string; position?: string; status?: string | null };
type Contract = { staff_id: string | number; status?: string };

interface ContractListProps {
  selectedCo?: string;
  staffs?: any[];
  contracts?: any[];
  onSelect?: (id: any) => void;
  checkedIds?: any[];
  setCheckedIds?: (ids: any[]) => void;
  isCompact?: boolean;
}

type Row = Staff & { __status: string; __statusClass: string };

const statusClass = (status: string) => {
  if (status === '서명완료') return 'text-emerald-500 bg-emerald-50';
  if (status === '서명대기') return 'text-blue-500 bg-blue-500/10';
  return 'text-[var(--toss-gray-3)] bg-[var(--tab-bg)]';
};

export default function ContractList({
  selectedCo,
  staffs,
  contracts = [],
  onSelect,
  checkedIds: _checkedIds,
  setCheckedIds: _setCheckedIds,
  isCompact }: ContractListProps) {
  const [filter, setFilter] = useState('');

  const checkedIds = (_checkedIds ?? []) as any[];
  const setCheckedIds = (_setCheckedIds ?? (() => {})) as (ids: any[]) => void;

  // 계약 발송 대상 명부 — 퇴사자 제외 (현직 직원만 신규/변경 계약 발송)
  const filtered = useMemo(
    () =>
      (staffs ?? []).filter(
        (s) =>
          isActiveStaff(s) &&
          (selectedCo === '전체' || s.company === selectedCo) &&
          (s.name.includes(filter) || s.employee_no?.includes(filter)),
      ),
    [staffs, selectedCo, filter],
  );

  const rows: Row[] = useMemo(
    () =>
      filtered.map((s) => {
        const contract = contracts.find((c) => String(c.staff_id) === String(s.id));
        const status = contract?.status || '미발송';
        return { ...s, __status: status, __statusClass: statusClass(status) };
      }),
    [filtered, contracts],
  );

  const selectedKeys = useMemo(() => new Set(checkedIds.map(String)), [checkedIds]);
  const allSelected = filtered.length > 0 && checkedIds.length === filtered.length;
  const indeterminate = checkedIds.length > 0 && checkedIds.length < filtered.length;

  const toggleAll = () => {
    if (checkedIds.length === filtered.length) setCheckedIds([]);
    else setCheckedIds(filtered.map((s) => s.id));
  };

  const toggleOne = (key: string) => {
    if (!key) return;
    const exists = checkedIds.some((i) => String(i) === key);
    if (exists) {
      setCheckedIds(checkedIds.filter((i) => String(i) !== key));
    } else {
      const originalStaff = filtered.find((s) => String(s.id) === key);
      if (originalStaff) {
        setCheckedIds([...checkedIds, originalStaff.id]);
      } else {
        setCheckedIds([...checkedIds, key]);
      }
    }
  };

  const columns: Column<Row>[] = isCompact
    ? [
        {
          key: 'name',
          label: '성명',
          primary: true,
          render: (r) => (
            <div>
              <p className="text-xs font-bold text-[var(--foreground)]">{r.name}</p>
              <p className="text-[10px] text-[var(--toss-gray-3)] font-medium">
                {r.department} · {r.position}
              </p>
            </div>
          ) },
        {
          key: '__status',
          label: '상태',
          align: 'right',
          render: (r) => (
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${r.__statusClass}`}>
              {r.__status}
            </span>
          ) },
      ]
    : [
        {
          key: 'employee_no',
          label: '사번',
          render: (r) => (
            <span className="text-xs font-medium text-[var(--toss-gray-3)]">{r.employee_no || '-'}</span>
          ) },
        {
          key: 'name',
          label: '성명',
          primary: true,
          render: (r) => <span className="text-xs font-bold text-[var(--foreground)]">{r.name}</span> },
        {
          key: 'department',
          label: '부서 / 직위',
          render: (r) => (
            <span className="text-xs font-medium text-[var(--toss-gray-3)]">
              {r.department} / {r.position}
            </span>
          ) },
        {
          key: '__status',
          label: '상태',
          render: (r) => (
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${r.__statusClass}`}>
              {r.__status}
            </span>
          ) },
      ];

  return (
    <div
      className={`p-0 ${
        isCompact
          ? ''
          : 'bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm'
      }`}
    >
      {!isCompact && (
        <div className="p-4 border-b border-[var(--border)] flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="text-base font-bold text-[var(--foreground)]">계약 대상자 관리</h3>
          <div className="relative w-full md:w-64">
            <span 
              className="absolute top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)]"
              style={{ left: '12px' }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="이름/사번 검색"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="이름 또는 사번으로 검색"
              className="w-full pr-4 py-2 bg-[var(--page-bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs outline-none focus:border-[var(--accent)] transition-all"
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>
      )}

      {isCompact && (
        <div className="mb-4 relative px-1">
          <span 
            className="absolute top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)] text-[10px]"
            style={{ left: '10px' }}
          >
            🔍
          </span>
          <input
            type="text"
            placeholder="이름 검색"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="이름 검색"
            className="w-full pr-4 py-1.5 bg-[var(--tab-bg)] border border-[var(--border)] rounded-lg text-[10px] outline-none focus:border-[var(--accent)]"
            style={{ paddingLeft: '32px' }}
          />
        </div>
      )}

      <div className={isCompact ? 'px-1' : 'px-2 pb-2'}>
        <ResponsiveTable<Row>
          columns={columns}
          rows={rows}
          keyField={'id' as keyof Row}
          onRowClick={(r) => onSelect?.(r.id)}
          emptyMessage="대상자가 없습니다."
          selection={{
            selected: selectedKeys,
            onToggle: toggleOne,
            onToggleAll: toggleAll,
            allSelected,
            indeterminate,
            getRowAriaLabel: (key) => `${key}번 직원 선택` }}
        />
      </div>
    </div>
  );
}

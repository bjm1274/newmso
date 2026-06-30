'use client';

import { EditableGrid, type EditableGridField } from '@/app/components/EditableGrid';
import { calculateAnnualLeaveExpiryDate } from '@/lib/annual-leave-promotion';

export type EditState = {
  total: number;
  used: number;
  expired: number;
  compensated: number;
};

export type CompanyPolicy = {
  basis: 'fiscal' | 'hire';
  fiscalStartMonth: number;
};

type CycleInfo = {
  start: Date;
  end: Date;
  basis: '입사일' | '회계연도';
};

function fmtYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fiscalYearCycle(refDate: Date, fiscalStartMonth: number): CycleInfo {
  const month = fiscalStartMonth - 1;
  let start = new Date(refDate.getFullYear(), month, 1);
  if (refDate.getTime() < start.getTime()) {
    start = new Date(refDate.getFullYear() - 1, month, 1);
  }
  const end = new Date(start.getFullYear() + 1, month, 0);
  return { start, end, basis: '회계연도' };
}

function hireDateCycle(hireDate: string, refDate: Date): CycleInfo | null {
  const hire = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(hire.getTime())) return null;
  const nextExpiry = calculateAnnualLeaveExpiryDate(hire, refDate);
  const start = new Date(nextExpiry);
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date(nextExpiry);
  end.setDate(end.getDate() - 1);
  return { start, end, basis: '입사일' };
}

export function computeCycleInfo(
  staff: any,
  policy: CompanyPolicy | undefined,
  refDate: Date,
): CycleInfo | null {
  if (policy?.basis === 'fiscal') {
    return fiscalYearCycle(refDate, policy.fiscalStartMonth);
  }
  const hire = staff.hire_date || staff.join_date || staff.joined_at;
  if (!hire) return null;
  return hireDateCycle(String(hire), refDate);
}

type ManualGrantGridProps = {
  rows: any[];
  companyPolicies: Record<string, CompanyPolicy>;
  today: Date;
  saving: boolean;
  getTotal: (staff: any) => number;
  getUsed: (staff: any) => number;
  getExpired: (staff: any) => number;
  getCompensated: (staff: any) => number;
  getRemaining: (staff: any) => number;
  setField: (id: string, key: keyof EditState, value: number) => void;
  onSaveOne: (staff: any) => void | Promise<void>;
};

export default function ManualGrantGrid({
  rows,
  companyPolicies,
  today,
  saving,
  getTotal,
  getUsed,
  getExpired,
  getCompensated,
  getRemaining,
  setField,
  onSaveOne }: ManualGrantGridProps) {
  const numberInput = (
    staff: any,
    key: keyof EditState,
    value: number,
    ariaLabel: string,
  ) => {
    const inputId = `manual-grant-${key}-${staff.id}`;
    return (
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const next = Number(event.target.value);
          setField(String(staff.id), key, Number.isFinite(next) ? next : 0);
        }}
        className="w-full md:w-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2 text-sm font-bold"
        aria-label={ariaLabel}
      />
    );
  };

  const isOver = (staff: any) =>
    getUsed(staff) + getExpired(staff) + getCompensated(staff) > getTotal(staff) + 0.001;

  const fields: EditableGridField<any>[] = [
    {
      id: 'name',
      label: '이름',
      showOnMobile: false,
      render: (staff) => (
        <span className="font-bold text-[var(--foreground)]">{staff.name}</span>
      ) },
    {
      id: 'company',
      label: '회사/부서',
      render: (staff) => (
        <span className="text-xs text-[var(--toss-gray-3)]">
          {staff.company} / {staff.department || '-'}
        </span>
      ) },
    {
      id: 'hire',
      label: '입사일',
      render: (staff) => (
        <span className="text-xs text-[var(--toss-gray-4)]">
          {staff.hire_date || staff.join_date || staff.joined_at || '-'}
        </span>
      ) },
    {
      id: 'cycle',
      label: '부여 기간',
      render: (staff) => {
        const policy = staff.company ? companyPolicies[staff.company] : undefined;
        const cycle = computeCycleInfo(staff, policy, today);
        if (!cycle) return <span className="text-[var(--toss-gray-4)]">-</span>;
        return (
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-bold text-[var(--foreground)]">
              {fmtYmd(cycle.start)} ~ {fmtYmd(cycle.end)}
            </span>
            <span className="mt-0.5 text-[10px] text-[var(--toss-gray-3)]">
              {cycle.basis} 기준
            </span>
          </div>
        );
      } },
    {
      id: 'total',
      label: '부여',
      width: '96px',
      render: (staff) => numberInput(staff, 'total', getTotal(staff), `${staff.name} 부여 연차`) },
    {
      id: 'used',
      label: '사용',
      width: '96px',
      render: (staff) => numberInput(staff, 'used', getUsed(staff), `${staff.name} 사용 연차`) },
    {
      id: 'expired',
      label: '소멸',
      width: '96px',
      render: (staff) => numberInput(staff, 'expired', getExpired(staff), `${staff.name} 소멸 연차`) },
    {
      id: 'compensated',
      label: '수당지급',
      width: '96px',
      render: (staff) =>
        numberInput(staff, 'compensated', getCompensated(staff), `${staff.name} 수당지급 연차`) },
    {
      id: 'remaining',
      label: '잔여',
      align: 'right',
      width: '80px',
      render: (staff) => (
        <span
          className={`text-sm font-bold ${
            isOver(staff) ? 'text-[var(--danger)]' : 'text-[var(--success,#16a34a)]'
          }`}
        >
          {getRemaining(staff).toFixed(1)}일
        </span>
      ) },
  ];

  return (
    <EditableGrid
      rows={rows}
      fields={fields}
      rowKey={(staff) => String(staff.id)}
      rowTone={(staff) => (isOver(staff) ? 'error' : 'normal')}
      mobileTitle={(staff) => staff.name}
      actions={(staff) => (
        <button
          type="button"
          onClick={() => void onSaveOne(staff)}
          disabled={saving || isOver(staff)}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          저장
        </button>
      )}
      emptyMessage="표시할 직원이 없습니다."
    />
  );
}

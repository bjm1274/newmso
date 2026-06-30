'use client';
// 급여정산 1단계: 대상 선택 (순수 추출 — 인라인 JSX → props)
import type { StaffMember } from '@/types';
import type { SavedPayrollRecord } from './급여정산-types';

export function Step1TargetSelection({
  hasExactTaxTable,
  yearMonth,
  onYearMonthChange,
  filteredStaffs,
  selectedStaffs,
  savedRecordsByStaff,
  onSelectAll,
  onToggleStaff,
  onNext,
  loading,
  isLocked }: {
  hasExactTaxTable: boolean;
  yearMonth: string;
  onYearMonthChange: (value: string) => void;
  filteredStaffs: StaffMember[];
  selectedStaffs: StaffMember[];
  savedRecordsByStaff: Record<string, SavedPayrollRecord>;
  onSelectAll: () => void;
  onToggleStaff: (staff: StaffMember) => void;
  onNext: () => void;
  loading: boolean;
  isLocked?: boolean;
}) {
  return (
    <div className="space-y-5">
      {!hasExactTaxTable && (
        <div data-testid="salary-settlement-missing-tax-warning" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-800">주의: 근로소득세 간이세액표가 설정되지 않았습니다.</p>
          <p className="mt-1 text-xs font-medium text-amber-700">
            보험요율은 반영되지만, 소득세는 운영 확정에 사용할 수 없습니다. 정확한 세액표를 먼저 입력해야 합니다.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--toss-gray-4)]">정산 월</label>
          <input data-testid="salary-settlement-month-input" type="month" value={yearMonth} onChange={e => onYearMonthChange(e.target.value)} className="h-9 px-3 border border-[var(--border)] rounded-md text-sm font-medium" />
        </div>
        <p className="text-sm text-[var(--toss-gray-3)]">정산 대상을 선택하세요. (근태 자동 반영)</p>
        <button data-testid="salary-settlement-select-all" onClick={onSelectAll} className="text-sm font-medium text-[var(--accent)] hover:underline">전체 선택</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar">
        {filteredStaffs.map((s: StaffMember) => (
          <div
            key={s.id}
            data-testid={`salary-settlement-staff-${s.id}`}
            onClick={() => onToggleStaff(s)}
            className={`p-4 rounded-[var(--radius-md)] border cursor-pointer transition-colors flex items-center gap-3 ${selectedStaffs.find(ts => ts.id === s.id) ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
              }`}
          >
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--tab-bg)] flex items-center justify-center text-sm font-semibold text-[var(--accent)]">{s.name[0]}</div>
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{s.name}</p>
              {savedRecordsByStaff[String(s.id)]?.status && (
                <span
                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    savedRecordsByStaff[String(s.id)]?.status === '확정'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {savedRecordsByStaff[String(s.id)]?.status}
                </span>
              )}
              <p className="text-xs text-[var(--toss-gray-3)]">기본급 ₩{(s.base_salary || 0).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
      <button data-testid="salary-settlement-next-button" onClick={onNext} disabled={loading || isLocked} className="w-full py-3.5 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-colors disabled:opacity-50">{loading ? '로딩 중...' : isLocked ? '정산 불가 (마감 잠금됨)' : '다음: 수당 설정 및 정산'}</button>
    </div>
  );
}

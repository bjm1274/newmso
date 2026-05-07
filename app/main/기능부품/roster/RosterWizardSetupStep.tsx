'use client';

import type { StaffMember } from '@/types';
import SmartMonthPicker from '../공통/SmartMonthPicker';

type RosterWizardSetupStepProps = {
  selectedMonth: string;
  onSelectedMonthChange: (value: string) => void;
  selectedCompany: string;
  onSelectedCompanyChange: (value: string) => void;
  isAdmin: boolean;
  companyLockedByHrFilter: boolean;
  companyOptions: string[];
  teamOptions: string[];
  activeStaffs: StaffMember[];
  getDepartmentName: (staff: StaffMember) => string;
  selectedDepartment: string;
  onSelectedDepartmentChange: (department: string) => void;
  workingShiftsCount: number;
  availableIncludedDepartments: string[];
  includedDepartments: string[];
  onToggleIncludedDepartment: (department: string) => void;
  rosterScopeLabel: string;
};

export default function RosterWizardSetupStep({
  selectedMonth,
  onSelectedMonthChange,
  selectedCompany,
  onSelectedCompanyChange,
  isAdmin,
  companyLockedByHrFilter,
  companyOptions,
  teamOptions,
  activeStaffs,
  getDepartmentName,
  selectedDepartment,
  onSelectedDepartmentChange,
  availableIncludedDepartments,
  includedDepartments,
  onToggleIncludedDepartment,
  rosterScopeLabel,
}: RosterWizardSetupStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="flex flex-col gap-0">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
              <SmartMonthPicker
                value={selectedMonth}
                onChange={onSelectedMonthChange}
                className="w-[150px]"
                inputClassName="text-sm font-semibold text-[var(--foreground)]"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">사업체</span>
            <select
              value={selectedCompany}
              onChange={(event) => onSelectedCompanyChange(event.target.value)}
              disabled={!isAdmin || companyLockedByHrFilter}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
            >
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-5 py-4">
            <p className="text-sm font-bold text-[var(--foreground)]">어떤 팀의 근무표를 만들까요?</p>
          </div>

          {teamOptions.length === 0 ? (
            <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
              선택한 회사에 등록된 팀이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {teamOptions.map((department) => {
                const teamStaffCount = activeStaffs.filter(
                  (staff) => staff.company === selectedCompany && getDepartmentName(staff) === department
                ).length;
                const selected = selectedDepartment === department;

                return (
                  <button
                    key={department}
                    type="button"
                    onClick={() => onSelectedDepartmentChange(department)}
                    className={`rounded-[var(--radius-xl)] border px-7 py-4 text-left transition-all ${selected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 shadow-[0_18px_40px_rgba(37,99,235,0.12)] ring-1 ring-[var(--accent)]/20' : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] text-xl ${selected ? 'bg-[var(--card)] text-[var(--accent)]' : 'bg-[var(--muted)] text-[var(--accent)]'}`}>
                        팀
                      </div>
                      {selected ? (
                        <span className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1 text-[10px] font-bold text-white">
                          선택됨
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-xl font-bold tracking-[-0.02em] text-[var(--foreground)]">{department}</p>
                    <p className="mt-3 text-sm text-[var(--toss-gray-3)]">
                      {selectedCompany || '회사'} · 직원 {teamStaffCount}명
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {selectedDepartment ? (
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">같이 생성할 팀 추가</p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                  현재 범위 {rosterScopeLabel}
                </span>
              </div>

              {availableIncludedDepartments.length === 0 ? (
                <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                  추가로 포함할 팀이 없습니다.
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableIncludedDepartments.map((department, index) => {
                    const included = includedDepartments.includes(department);

                    return (
                      <button
                        key={department}
                        type="button"
                        onClick={() => onToggleIncludedDepartment(department)}
                        className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold transition-colors ${included ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'}`}
                        data-testid={`roster-wizard-include-team-${index + 1}`}
                      >
                        {included ? '포함중' : '추가'} · {department}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

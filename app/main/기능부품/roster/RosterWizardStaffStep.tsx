'use client';

import type { StaffMember } from '@/types';

type RosterWizardStaffStepProps = {
  rosterScopeLabel: string;
  wizardSelectedStaffIds: string[];
  wizardExcludedStaffs: StaffMember[];
  targetStaffs: StaffMember[];
  getDepartmentName: (staff: StaffMember) => string;
  onIncludeAllWizardStaff: () => void;
  onClearWizardStaffSelection: () => void;
  onToggleWizardStaff: (staffId: string) => void;
};

export default function RosterWizardStaffStep({
  rosterScopeLabel,
  wizardSelectedStaffIds,
  wizardExcludedStaffs,
  targetStaffs,
  getDepartmentName,
  onIncludeAllWizardStaff,
  onClearWizardStaffSelection,
  onToggleWizardStaff,
}: RosterWizardStaffStepProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-[var(--foreground)]">{rosterScopeLabel} 직원 선택</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]"
              data-testid="roster-wizard-included-count"
            >
              포함 {wizardSelectedStaffIds.length}
            </span>
            <span
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
              data-testid="roster-wizard-excluded-count"
            >
              제외 {wizardExcludedStaffs.length}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onIncludeAllWizardStaff}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
            data-testid="roster-wizard-include-all"
          >
            전체 포함
          </button>
          <button
            type="button"
            onClick={onClearWizardStaffSelection}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)]"
            data-testid="roster-wizard-exclude-all"
          >
            전체 제외
          </button>
        </div>
      </div>

      {targetStaffs.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
          이 팀에 등록된 직원이 없습니다.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {targetStaffs.map((staff) => {
              const staffId = String(staff.id);
              const selected = wizardSelectedStaffIds.includes(staffId);

              return (
                <div
                  key={staff.id}
                  className={`rounded-[var(--radius-xl)] border p-4 text-left transition-all ${selected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)] bg-[var(--muted)]/70'}`}
                  data-testid={`roster-wizard-staff-card-${staffId}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--tab-bg)] text-sm font-bold text-[var(--accent)]">
                        {String(staff.name || '?').slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)]">
                          {getDepartmentName(staff)} · {staff.position || '직원'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-[var(--radius-md)] px-3 py-1 text-[10px] font-bold ${selected ? 'bg-[var(--card)] text-[var(--accent)]' : 'bg-[var(--toss-gray-2)] text-[var(--toss-gray-3)]'}`}
                    >
                      {selected ? '포함' : '제외'}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleWizardStaff(staffId)}
                      className={`rounded-[var(--radius-md)] px-3 py-2 text-[11px] font-bold transition-colors ${selected ? 'bg-rose-50 text-rose-600' : 'bg-[var(--accent)] text-white'}`}
                      data-testid={`roster-wizard-toggle-${staffId}`}
                    >
                      {selected ? '이번 편성에서 제외' : '다시 포함'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {wizardExcludedStaffs.length > 0 ? (
            <div
              className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]"
              data-testid="roster-wizard-excluded-summary"
            >
              제외 직원: {wizardExcludedStaffs.map((staff) => staff.name).join(', ')}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

'use client';

import RosterWizardPairRulesSection from './RosterWizardPairRulesSection';
import type { StaffMember } from '@/types';
import {
  STAFF_SHIFT_TYPE_OPTIONS,
  type CoverageBand,
  type StaffShiftType,
  type StaffRestrictionDraft,
  type WizardNightRangeDraft,
  type WizardOffOverride,
  type WizardPairRule,
  type WorkShift,
} from '../근무표자동편성-types';

type RosterWizardExceptionsStepProps = {
  preferredOffStaffId: string;
  onPreferredOffStaffIdChange: (value: string) => void;
  preferredOffDate: string;
  onPreferredOffDateChange: (value: string) => void;
  monthDates: string[];
  onAddPreferredOffDate: () => void;
  wizardSelectedStaffs: StaffMember[];
  wizardNightRangeDrafts: Record<string, WizardNightRangeDraft>;
  wizardDedicatedBandDrafts: Record<string, StaffShiftType | ''>;
  wizardCoverageRoleDrafts: Record<string, string[]>;
  wizardStaffRestrictionDrafts: Record<string, StaffRestrictionDraft>;
  buildDefaultStaffRestrictionDraft: () => StaffRestrictionDraft;
  updateWizardNightRangeDraft: (
    staffId: string,
    field: keyof WizardNightRangeDraft,
    value: string
  ) => void;
  updateWizardDedicatedBandDraft: (staffId: string, value: string) => void;
  serializeCoverageRoleTags: (tags: string[]) => string;
  updateWizardCoverageRoleDraft: (staffId: string, value: string) => void;
  updateWizardStaffRestrictionDraft: (
    staffId: string,
    field: keyof StaffRestrictionDraft,
    value: string | boolean | CoverageBand[] | number[]
  ) => void;
  weekdayPickerOrder: number[];
  weekdayLabels: string[];
  wizardPairRules: WizardPairRule[];
  onAddWizardPairRule: () => void;
  updateWizardPairRule: (
    ruleId: string,
    field: keyof Omit<WizardPairRule, 'id'>,
    value: string
  ) => void;
  onRemoveWizardPairRule: (ruleId: string) => void;
  wizardOffOverrides: Record<string, WizardOffOverride>;
  wizardOverrideDateOptions: string[];
  wizardOverrideShiftOptions: WorkShift[];
  updateWizardOffOverride: (staffId: string, patch: Partial<WizardOffOverride>) => void;
  getDepartmentName: (staff: StaffMember) => string;
  getShiftCode: (shiftName: string) => string;
  getShiftNameById: (shiftId: string, shifts: WorkShift[]) => string;
  workShifts: WorkShift[];
};

export default function RosterWizardExceptionsStep({
  preferredOffStaffId,
  onPreferredOffStaffIdChange,
  preferredOffDate,
  onPreferredOffDateChange,
  monthDates,
  onAddPreferredOffDate,
  wizardSelectedStaffs,
  wizardNightRangeDrafts,
  wizardDedicatedBandDrafts,
  wizardCoverageRoleDrafts,
  wizardStaffRestrictionDrafts,
  buildDefaultStaffRestrictionDraft,
  updateWizardNightRangeDraft,
  updateWizardDedicatedBandDraft,
  serializeCoverageRoleTags,
  updateWizardCoverageRoleDraft,
  updateWizardStaffRestrictionDraft,
  weekdayPickerOrder,
  weekdayLabels,
  wizardPairRules,
  onAddWizardPairRule,
  updateWizardPairRule,
  onRemoveWizardPairRule,
  wizardOffOverrides,
  wizardOverrideDateOptions,
  wizardOverrideShiftOptions,
  updateWizardOffOverride,
  getDepartmentName,
  getShiftCode,
  getShiftNameById,
  workShifts,
}: RosterWizardExceptionsStepProps) {
  return (
    <div className="space-y-4" data-testid="roster-wizard-step-4">
      <div>
        <h4 className="text-base font-bold text-[var(--foreground)]">직원별 예외 일정 설정</h4>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-bold text-amber-800">희망 휴무 직원</span>
            <select
              value={preferredOffStaffId}
              onChange={(event) => onPreferredOffStaffIdChange(event.target.value)}
              className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
              data-testid="roster-wizard-preferred-off-staff-select"
            >
              {wizardSelectedStaffs.map((staff) => (
                <option key={staff.id} value={String(staff.id)}>
                  {staff.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-bold text-amber-800">희망 휴무 날짜</span>
            <select
              value={preferredOffDate}
              onChange={(event) => onPreferredOffDateChange(event.target.value)}
              className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
              data-testid="roster-wizard-preferred-off-date-select"
            >
              {monthDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onAddPreferredOffDate}
            className="rounded-[var(--radius-md)] bg-amber-500 px-4 py-3 text-sm font-bold text-white"
            data-testid="roster-wizard-preferred-off-add"
          >
            희망 휴무 추가
          </button>
        </div>
      </div>

      {wizardSelectedStaffs.length > 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="space-y-3">
            {wizardSelectedStaffs.map((staff) => {
              const staffId = String(staff.id);
              const nightRange = wizardNightRangeDrafts[staffId] || {
                minNightShiftCount: 0,
                maxNightShiftCount: 0,
              };
              const dedicatedBand = wizardDedicatedBandDrafts[staffId] || '';
              const coverageTags = wizardCoverageRoleDrafts[staffId] || [];
              const restrictions = wizardStaffRestrictionDrafts[staffId] || buildDefaultStaffRestrictionDraft();

              return (
                <div
                  key={`wizard-personal-rule-${staffId}`}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4"
                >
                  <div className="mb-3">
                    <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">
                      {getDepartmentName(staff)} · {staff.position || '직원'}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최소</span>
                      <input
                        type="number"
                        min={0}
                        max={31}
                        value={nightRange.minNightShiftCount}
                        onChange={(event) =>
                          updateWizardNightRangeDraft(staffId, 'minNightShiftCount', event.target.value)
                        }
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        data-testid={`roster-wizard-night-min-${staffId}`}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최대</span>
                      <input
                        type="number"
                        min={0}
                        max={31}
                        value={nightRange.maxNightShiftCount}
                        onChange={(event) =>
                          updateWizardNightRangeDraft(staffId, 'maxNightShiftCount', event.target.value)
                        }
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        data-testid={`roster-wizard-night-max-${staffId}`}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">근무형태</span>
                      <select
                        value={dedicatedBand}
                        onChange={(event) => updateWizardDedicatedBandDraft(staffId, event.target.value)}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        data-testid={`roster-wizard-dedicated-band-${staffId}`}
                      >
                        {STAFF_SHIFT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">역할 태그</span>
                      <input
                        value={serializeCoverageRoleTags(coverageTags)}
                        onChange={(event) => updateWizardCoverageRoleDraft(staffId, event.target.value)}
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        data-testid={`roster-wizard-role-tags-${staffId}`}
                      />
                    </label>
                  </div>
                  <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                    <div>
                      <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">금지 타임</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(['day', 'evening', 'night'] as const).map((band) => {
                          const selected = restrictions.blockedShiftBands.includes(band);

                          return (
                            <button
                              key={`${staffId}-${band}`}
                              type="button"
                              onClick={() =>
                                updateWizardStaffRestrictionDraft(
                                  staffId,
                                  'blockedShiftBands',
                                  selected
                                    ? restrictions.blockedShiftBands.filter((value) => value !== band)
                                    : [...restrictions.blockedShiftBands, band]
                                )
                              }
                              className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold ${selected ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'}`}
                              data-testid={`roster-wizard-blocked-band-${staffId}-${band}`}
                            >
                              {band === 'day' ? '데이' : band === 'evening' ? '이브닝' : '나이트'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">금지 요일</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {weekdayPickerOrder.map((weekday) => {
                          const selected = restrictions.blockedWeekdays.includes(weekday);

                          return (
                            <button
                              key={`${staffId}-weekday-${weekday}`}
                              type="button"
                              onClick={() =>
                                updateWizardStaffRestrictionDraft(
                                  staffId,
                                  'blockedWeekdays',
                                  selected
                                    ? restrictions.blockedWeekdays.filter((value) => value !== weekday)
                                    : [...restrictions.blockedWeekdays, weekday]
                                )
                              }
                              className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold ${selected ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'}`}
                              data-testid={`roster-wizard-blocked-weekday-${staffId}-${weekday}`}
                            >
                              {weekdayLabels[weekday]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                        <span className="text-[11px] font-bold text-[var(--foreground)]">주말 근무 금지</span>
                        <input
                          type="checkbox"
                          checked={restrictions.avoidWeekendWork}
                          onChange={(event) =>
                            updateWizardStaffRestrictionDraft(staffId, 'avoidWeekendWork', event.target.checked)
                          }
                          data-testid={`roster-wizard-avoid-weekend-${staffId}`}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                        <span className="text-[11px] font-bold text-[var(--foreground)]">공휴일 근무 금지</span>
                        <input
                          type="checkbox"
                          checked={restrictions.avoidHolidayWork}
                          onChange={(event) =>
                            updateWizardStaffRestrictionDraft(staffId, 'avoidHolidayWork', event.target.checked)
                          }
                          data-testid={`roster-wizard-avoid-holiday-${staffId}`}
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                        <span className="text-[11px] font-bold text-[var(--foreground)]">주말 휴무 선호</span>
                        <input
                          type="checkbox"
                          checked={restrictions.preferWeekendOff}
                          onChange={(event) =>
                            updateWizardStaffRestrictionDraft(staffId, 'preferWeekendOff', event.target.checked)
                          }
                          data-testid={`roster-wizard-prefer-weekend-off-${staffId}`}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                        <span className="text-[11px] font-bold text-[var(--foreground)]">공휴일 휴무 선호</span>
                        <input
                          type="checkbox"
                          checked={restrictions.preferHolidayOff}
                          onChange={(event) =>
                            updateWizardStaffRestrictionDraft(staffId, 'preferHolidayOff', event.target.checked)
                          }
                          data-testid={`roster-wizard-prefer-holiday-off-${staffId}`}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                        <span className="text-[11px] font-bold text-[var(--foreground)]">연속 이브닝 회피</span>
                        <input
                          type="checkbox"
                          checked={restrictions.avoidConsecutiveEvening}
                          onChange={(event) =>
                            updateWizardStaffRestrictionDraft(staffId, 'avoidConsecutiveEvening', event.target.checked)
                          }
                          data-testid={`roster-wizard-avoid-consecutive-evening-${staffId}`}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                        <span className="text-[11px] font-bold text-[var(--foreground)]">월초 나이트 선호</span>
                        <input
                          type="checkbox"
                          checked={restrictions.preferEarlyMonthNight}
                          onChange={(event) =>
                            updateWizardStaffRestrictionDraft(staffId, 'preferEarlyMonthNight', event.target.checked)
                          }
                          data-testid={`roster-wizard-prefer-early-night-${staffId}`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {wizardSelectedStaffs.length > 1 ? (
        <RosterWizardPairRulesSection
          onAddWizardPairRule={onAddWizardPairRule}
          onRemoveWizardPairRule={onRemoveWizardPairRule}
          updateWizardPairRule={updateWizardPairRule}
          wizardPairRules={wizardPairRules}
          wizardSelectedStaffs={wizardSelectedStaffs}
        />
      ) : null}

      {wizardSelectedStaffs.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
          먼저 직원을 한 명 이상 선택하세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {wizardSelectedStaffs.map((staff, index) => {
            const staffId = String(staff.id);
            const override = wizardOffOverrides[staffId] || {
              enabled: false,
              offDate: wizardOverrideDateOptions[index] || wizardOverrideDateOptions[0] || '',
              nextShiftId: wizardOverrideShiftOptions[0]?.id || '',
            };
            const offDateIndex = monthDates.indexOf(override.offDate);
            const nextDate = offDateIndex >= 0 ? monthDates[offDateIndex + 1] || '' : '';

            return (
              <div
                key={staffId}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-bold text-[var(--foreground)]">{staff.name}</p>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      {getDepartmentName(staff)} · {staff.position || '직원'}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]">
                    <input
                      type="checkbox"
                      checked={override.enabled}
                      onChange={(event) =>
                        updateWizardOffOverride(staffId, { enabled: event.target.checked })
                      }
                      data-testid={`roster-wizard-off-toggle-${staffId}`}
                    />
                    휴무 예외 사용
                  </label>
                </div>

                {override.enabled ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">휴무 날짜</span>
                      <select
                        value={override.offDate}
                        onChange={(event) =>
                          updateWizardOffOverride(staffId, { offDate: event.target.value })
                        }
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                        data-testid={`roster-wizard-off-date-${staffId}`}
                      >
                        {wizardOverrideDateOptions.map((date) => (
                          <option key={date} value={date}>
                            {date} ({weekdayLabels[new Date(`${date}T00:00:00`).getDay()]})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">휴무 다음날 근무</span>
                      <select
                        value={override.nextShiftId}
                        onChange={(event) =>
                          updateWizardOffOverride(staffId, { nextShiftId: event.target.value })
                        }
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                        data-testid={`roster-wizard-post-off-shift-${staffId}`}
                      >
                        {wizardOverrideShiftOptions.map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name} · {getShiftCode(shift.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--foreground)] md:col-span-2">
                      {override.offDate || '날짜 미선택'} 휴무
                      {nextDate
                        ? ` → ${nextDate} ${getShiftNameById(override.nextShiftId, workShifts)}`
                        : ' → 다음날 없음'}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

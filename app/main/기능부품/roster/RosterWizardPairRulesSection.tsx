'use client';

type RosterWizardPairRulesSectionProps = Record<string, any>;

export default function RosterWizardPairRulesSection({
  onAddWizardPairRule,
  onRemoveWizardPairRule,
  updateWizardPairRule,
  wizardPairRules,
  wizardSelectedStaffs,
}: RosterWizardPairRulesSectionProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--foreground)]">직원 페어 규칙</p>
        </div>
        <button
          type="button"
          onClick={onAddWizardPairRule}
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
          data-testid="roster-wizard-pair-rule-add"
        >
          페어 추가
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {wizardPairRules.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
            아직 추가한 페어 규칙이 없습니다.
          </div>
        ) : (
          wizardPairRules.map((pairRule: any, index: any) => (
            <div
              key={pairRule.id}
              className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px_auto]"
            >
              <select
                value={pairRule.primaryStaffId}
                onChange={(event) =>
                  updateWizardPairRule(pairRule.id, 'primaryStaffId', event.target.value)
                }
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid={`roster-wizard-pair-primary-${index + 1}`}
              >
                {wizardSelectedStaffs.map((staff: any) => (
                  <option key={staff.id} value={String(staff.id)}>
                    {staff.name}
                  </option>
                ))}
              </select>
              <select
                value={pairRule.secondaryStaffId}
                onChange={(event) =>
                  updateWizardPairRule(pairRule.id, 'secondaryStaffId', event.target.value)
                }
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid={`roster-wizard-pair-secondary-${index + 1}`}
              >
                {wizardSelectedStaffs.map((staff: any) => (
                  <option key={staff.id} value={String(staff.id)}>
                    {staff.name}
                  </option>
                ))}
              </select>
              <select
                value={pairRule.mode}
                onChange={(event) => updateWizardPairRule(pairRule.id, 'mode', event.target.value)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid={`roster-wizard-pair-mode-${index + 1}`}
              >
                <option value="together">같이</option>
                <option value="separate">분리</option>
              </select>
              <select
                value={pairRule.band}
                onChange={(event) => updateWizardPairRule(pairRule.id, 'band', event.target.value)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid={`roster-wizard-pair-band-${index + 1}`}
              >
                <option value="night">나이트 기준</option>
                <option value="work">같은 근무 기준</option>
              </select>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onRemoveWizardPairRule(pairRule.id)}
                  className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700"
                  data-testid={`roster-wizard-pair-remove-${index + 1}`}
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

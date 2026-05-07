'use client';

type RosterRuleListPanelProps = Record<string, any>;

export default function RosterRuleListPanel({
  companyGenerationRules,
  deleteGenerationRule,
  editGenerationRule,
}: RosterRuleListPanelProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <h4 className="text-lg font-bold text-[var(--foreground)]">저장된 규칙</h4>

      {companyGenerationRules.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5 text-sm font-semibold text-[var(--toss-gray-3)]">
          아직 저장된 근무규칙이 없습니다.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {companyGenerationRules.map((rule: any) => (
            <div
              key={rule.id}
              className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/80 p-4"
              data-testid={`generation-rule-card-${rule.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)]">{rule.name}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--accent)]">
                    {rule.teamKeywords.join(', ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => editGenerationRule(rule)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                    data-testid={`generation-rule-edit-${rule.id}`}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`"${rule.name}" 규칙을 삭제할까요?`)) {
                        deleteGenerationRule(rule.id);
                      }
                    }}
                    className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600"
                    data-testid={`generation-rule-delete-${rule.id}`}
                  >
                    삭제
                  </button>
                </div>
                <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                  연속근무 {rule.maxConsecutiveWorkDays}일
                </span>
                {rule.distributeWeekendShifts ? (
                  <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                    주말 분산
                  </span>
                ) : null}
                {rule.distributeHolidayShifts ? (
                  <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                    공휴일 분산
                  </span>
                ) : null}
                {rule.separateNewNursesByShift ? (
                  <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                    신규간호사 분산
                  </span>
                ) : null}
                {(rule.minDayStaff || rule.minEveningStaff || rule.minNightStaff) > 0 ? (
                  <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                    최소 데이/이브닝/나이트 {rule.minDayStaff}/{rule.minEveningStaff}/{rule.minNightStaff}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--foreground)]">
                <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                  월 나이트 {rule.minRotationNightCount}~{rule.maxRotationNightCount}회
                </span>
                <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                  연속 나이트 {rule.nightBlockSize}회
                </span>
                <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                  휴무 {rule.offDaysAfterNight}일
                </span>
                <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                  최소 휴무 {rule.minMonthlyOffDays}일
                </span>
                {rule.maxConsecutiveEveningShifts > 0 ? (
                  <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                    연속 이브닝 최대 {rule.maxConsecutiveEveningShifts}일
                  </span>
                ) : null}
                {rule.maxConsecutiveWeekendWorkDays > 0 ? (
                  <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                    주말 연속근무 최대 {rule.maxConsecutiveWeekendWorkDays}일
                  </span>
                ) : null}
              </div>

              {rule.description ? (
                <p className="mt-3 text-sm leading-6 text-[var(--toss-gray-4)]">
                  {rule.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

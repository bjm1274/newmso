'use client';

type RosterPreferredOffManagerProps = Record<string, any>;

export default function RosterPreferredOffManager(props: RosterPreferredOffManagerProps) {
  const {
    addPreferredOffDate,
    clearAllPreferredOff,
    clearPreferredOffForStaff,
    monthDates,
    preferredOffCount,
    preferredOffDate,
    preferredOffEntries,
    preferredOffStaffId,
    removePreferredOffDate,
    setPreferredOffDate,
    setPreferredOffStaffId,
    targetStaffs,
  } = props;
  return (
<div
              className="w-full rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/80 px-4 py-4"
              data-testid="preferred-off-manager"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="mt-1 text-base font-bold text-[var(--foreground)]">개인 희망 휴무</h4>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={preferredOffStaffId}
                    onChange={(event) => setPreferredOffStaffId(event.target.value)}
                    disabled={targetStaffs.length === 0}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
                    data-testid="preferred-off-staff-select"
                  >
                    {targetStaffs.length === 0 ? (
                      <option value="">직원 없음</option>
                    ) : (
                      targetStaffs.map((staff: any) => (
                        <option key={staff.id} value={String(staff.id)}>
                          {staff.name}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    value={preferredOffDate}
                    onChange={(event) => setPreferredOffDate(event.target.value)}
                    disabled={monthDates.length === 0}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
                    data-testid="preferred-off-date-select"
                  >
                    {monthDates.map((date: any) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPreferredOffDate}
                    disabled={!preferredOffStaffId || !preferredOffDate}
                    className="rounded-[var(--radius-md)] bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    data-testid="preferred-off-add"
                  >
                    희망 휴무 추가
                  </button>
                  <button
                    type="button"
                    onClick={clearAllPreferredOff}
                    disabled={preferredOffCount === 0}
                    className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-2 text-sm font-bold text-amber-700 disabled:opacity-50"
                    data-testid="preferred-off-clear-all"
                  >
                    전체 비우기
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-amber-700">
                  등록 {preferredOffCount}건
                </span>
                {preferredOffEntries.map((entry: any) => (
                  <span
                    key={`preferred-off-summary-${entry.staff.id}`}
                    className="rounded-[var(--radius-md)] border border-amber-100 bg-[var(--card)]/80 px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                  >
                    {entry.staff.name} {entry.dates.length}일
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {preferredOffEntries.length === 0 ? (
                  <p className="text-[12px] font-semibold text-[var(--toss-gray-3)]">
                    등록된 개인 희망 휴무가 없습니다.
                  </p>
                ) : (
                  preferredOffEntries.map((entry: any) => (
                    <div
                      key={`preferred-off-row-${entry.staff.id}`}
                      className="rounded-[var(--radius-lg)] border border-amber-100 bg-[var(--card)]/90 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{entry.staff.name}</p>
                          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                            {entry.dates.length}일 등록
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => clearPreferredOffForStaff(String(entry.staff.id))}
                          className="rounded-[var(--radius-md)] border border-amber-200 px-3 py-1 text-[11px] font-bold text-amber-700"
                        >
                          직원 비우기
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.dates.map((date: any) => (
                          <button
                            type="button"
                            key={`${entry.staff.id}-${date}`}
                            onClick={() => removePreferredOffDate(String(entry.staff.id), date)}
                            className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                            data-testid={`preferred-off-chip-${entry.staff.id}-${date}`}
                          >
                            {date} x
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
  );
}

type FairnessRow = {
  staffId: string;
  staffName: string;
  nightCount: number;
  weekendWorkCount: number;
  holidayWorkCount: number;
  maxConsecutiveWorkDays: number;
  diversityScore: number;
  longestSameBandStreak: number;
  fairnessScore: number;
  note: string;
};

type RosterFairnessBoardProps = {
  scoreboard: {
    averageNight: number;
    averageWeekend: number;
    averageHoliday: number;
    averageConsecutive: number;
    averageDiversity: number;
    holidayCount: number;
    rows: FairnessRow[];
  };
};

export default function RosterFairnessBoard({ scoreboard }: RosterFairnessBoardProps) {
  if (scoreboard.rows.length === 0) return null;

  return (
    <div
      className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
      data-testid="roster-fairness-board"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h5 className="text-base font-bold text-[var(--foreground)]">공정성 점수판</h5>
          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
            나이트, 주말, 공휴일, 연속근무와 패턴 다양성을 함께 비교해 편중 여부를 빠르게
            확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
            평균 N {scoreboard.averageNight.toFixed(1)}
          </span>
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
            평균 주말 {scoreboard.averageWeekend.toFixed(1)}
          </span>
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
            평균 공휴일 {scoreboard.averageHoliday.toFixed(1)}
          </span>
          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
            평균 연속근무 {scoreboard.averageConsecutive.toFixed(1)}일
          </span>
          <span className="rounded-[var(--radius-md)] border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
            평균 다양성 {scoreboard.averageDiversity.toFixed(1)}점
          </span>
          <span className="rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700">
            공휴일 {scoreboard.holidayCount}일 기준
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[920px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-3 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                직원
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold text-[var(--toss-gray-3)]">
                나이트
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold text-[var(--toss-gray-3)]">
                주말
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold text-[var(--toss-gray-3)]">
                공휴일
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold text-[var(--toss-gray-3)]">
                최대 연속근무
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold text-[var(--toss-gray-3)]">
                다양성
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold text-[var(--toss-gray-3)]">
                최장 동일밴드
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-bold text-[var(--toss-gray-3)]">
                균형 점수
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                메모
              </th>
            </tr>
          </thead>
          <tbody>
            {scoreboard.rows.map((row) => {
              const fairnessToneClass =
                row.fairnessScore >= 90
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : row.fairnessScore >= 75
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700';
              const diversityToneClass =
                row.diversityScore >= 75
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : row.diversityScore >= 55
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-zinc-200 bg-zinc-100 text-zinc-700';

              return (
                <tr
                  key={row.staffId}
                  className="border-b border-[var(--border)] last:border-b-0"
                  data-testid={`roster-fairness-row-${row.staffId}`}
                >
                  <td className="px-3 py-3 text-sm font-bold text-[var(--foreground)]">
                    {row.staffName}
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--foreground)]">
                    {row.nightCount}
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--foreground)]">
                    {row.weekendWorkCount}
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--foreground)]">
                    {row.holidayWorkCount}
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--foreground)]">
                    {row.maxConsecutiveWorkDays}일
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-flex rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-bold ${diversityToneClass}`}
                    >
                      {row.diversityScore}점
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-[var(--foreground)]">
                    {row.longestSameBandStreak}일
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-flex rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-bold ${fairnessToneClass}`}
                    >
                      {row.fairnessScore}점
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                    {row.note}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

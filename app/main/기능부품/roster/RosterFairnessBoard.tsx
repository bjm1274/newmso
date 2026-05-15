import { useMemo } from 'react';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

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

function fairnessTone(score: number) {
  if (score >= 90) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (score >= 75) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function diversityTone(score: number) {
  if (score >= 75) return 'border-sky-200 bg-sky-50 text-sky-700';
  if (score >= 55) return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  return 'border-zinc-200 bg-zinc-100 text-zinc-700';
}

const COLUMNS: Column<FairnessRow>[] = [
  {
    key: 'staffName',
    label: '직원',
    primary: true,
    align: 'left',
  },
  {
    key: 'nightCount',
    label: '나이트',
    align: 'center',
  },
  {
    key: 'weekendWorkCount',
    label: '주말',
    align: 'center',
  },
  {
    key: 'holidayWorkCount',
    label: '공휴일',
    align: 'center',
  },
  {
    key: 'maxConsecutiveWorkDays',
    label: '최대 연속근무',
    align: 'center',
    render: (row) => `${row.maxConsecutiveWorkDays}일`,
  },
  {
    key: 'diversityScore',
    label: '다양성',
    align: 'center',
    render: (row) => (
      <span
        className={`inline-flex rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-bold ${diversityTone(row.diversityScore)}`}
      >
        {row.diversityScore}점
      </span>
    ),
  },
  {
    key: 'longestSameBandStreak',
    label: '최장 동일밴드',
    align: 'center',
    render: (row) => `${row.longestSameBandStreak}일`,
    showOnMobile: false,
  },
  {
    key: 'fairnessScore',
    label: '균형 점수',
    align: 'center',
    render: (row) => (
      <span
        className={`inline-flex rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-bold ${fairnessTone(row.fairnessScore)}`}
      >
        {row.fairnessScore}점
      </span>
    ),
  },
  {
    key: 'note',
    label: '메모',
    align: 'left',
    showOnMobile: false,
  },
];

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
        <ResponsiveTable<FairnessRow>
          columns={COLUMNS}
          rows={scoreboard.rows}
          keyField="staffId"
          emptyMessage="데이터가 없습니다."
          className="min-w-[920px] md:min-w-0"
        />
      </div>
    </div>
  );
}

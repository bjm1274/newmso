'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

// recharts는 번들 사이즈가 크므로 동적 로드
const ParetoChart = dynamic(() => import('./charts/ParetoChart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center text-xs text-[var(--toss-gray-3)]">
      차트를 불러오는 중...
    </div>
  ),
});

type InventoryItem = {
  id: string;
  name: string;
  category?: string;
  quantity: number;
  unit_price: number;
  department?: string;
};

type ABCItem = InventoryItem & {
  annualValue: number;
  cumulativePercent: number;
  grade: 'A' | 'B' | 'C';
};

type Props = {
  user: Record<string, unknown>;
  inventory?: InventoryItem[];
};

function classifyABC(items: InventoryItem[]): ABCItem[] {
  // 연간 사용금액 계산 (quantity × unit_price)
  const withValue = items.map((item) => ({
    ...item,
    annualValue: (item.quantity || 0) * (item.unit_price || 0),
  }));

  // 내림차순 정렬
  withValue.sort((a, b) => b.annualValue - a.annualValue);

  const totalValue = withValue.reduce((sum, item) => sum + item.annualValue, 0);
  if (totalValue === 0) return withValue.map((item) => ({ ...item, cumulativePercent: 0, grade: 'C' as const }));

  let cumulative = 0;
  return withValue.map((item) => {
    cumulative += item.annualValue;
    const cumulativePercent = (cumulative / totalValue) * 100;
    const grade: 'A' | 'B' | 'C' =
      cumulativePercent <= 80 ? 'A' : cumulativePercent <= 95 ? 'B' : 'C';
    return { ...item, cumulativePercent, grade };
  });
}

const GRADE_STYLES = {
  A: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/20', label: 'A등급 (핵심)' },
  B: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20', label: 'B등급 (중요)' },
  C: { bg: 'bg-[var(--muted)]', text: 'text-[var(--toss-gray-4)]', border: 'border-[var(--border)]', label: 'C등급 (일반)' },
};

const ABC_COLUMNS: Column<ABCItem>[] = [
  {
    key: 'grade',
    label: '등급',
    showOnMobile: false,
    render: (row) => {
      const style = GRADE_STYLES[row.grade];
      return (
        <span className={`rounded-[var(--radius-md)] px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text}`}>
          {row.grade}
        </span>
      );
    },
  },
  {
    key: 'name',
    label: '품목명',
    primary: true,
    render: (row) => {
      const style = GRADE_STYLES[row.grade];
      return (
        <span className="font-semibold text-[var(--foreground)]">
          <span className={`mr-1.5 rounded-[var(--radius-md)] px-1.5 py-0.5 text-[10px] font-bold md:hidden ${style.bg} ${style.text}`}>
            {row.grade}
          </span>
          {row.name}
        </span>
      );
    },
  },
  {
    key: 'category',
    label: '분류',
    render: (row) => <span className="text-[var(--toss-gray-3)]">{row.category ?? '-'}</span>,
  },
  {
    key: 'quantity',
    label: '수량',
    align: 'right',
    render: (row) => row.quantity.toLocaleString(),
  },
  {
    key: 'unit_price',
    label: '단가',
    align: 'right',
    showOnMobile: false,
    render: (row) => `${row.unit_price.toLocaleString()}원`,
  },
  {
    key: 'annualValue',
    label: '연간 금액',
    align: 'right',
    render: (row) => (
      <span className="font-bold">{Math.round(row.annualValue).toLocaleString()}원</span>
    ),
  },
  {
    key: 'cumulativePercent',
    label: '누적 %',
    align: 'right',
    showOnMobile: false,
    render: (row) => (
      <span className="text-[var(--toss-gray-3)]">{row.cumulativePercent.toFixed(1)}%</span>
    ),
  },
];

export default function ABCAnalysis({ user, inventory = [] }: Props) {
  const [gradeFilter, setGradeFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  const abcItems = useMemo(() => classifyABC(inventory), [inventory]);

  const summary = useMemo(() => {
    const result = { A: { count: 0, value: 0 }, B: { count: 0, value: 0 }, C: { count: 0, value: 0 } };
    for (const item of abcItems) {
      result[item.grade].count += 1;
      result[item.grade].value += item.annualValue;
    }
    return result;
  }, [abcItems]);

  const totalValue = summary.A.value + summary.B.value + summary.C.value;

  const chartData = useMemo(() => {
    return abcItems.slice(0, 30).map((item, i) => ({
      name: item.name.length > 8 ? item.name.slice(0, 8) + '…' : item.name,
      value: Math.round(item.annualValue),
      cumulative: Math.round(item.cumulativePercent * 10) / 10,
    }));
  }, [abcItems]);

  const filtered = gradeFilter === 'all' ? abcItems : abcItems.filter((item) => item.grade === gradeFilter);

  if (inventory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-3 text-4xl">📊</div>
        <p className="text-sm font-bold text-[var(--foreground)]">재고 데이터가 없습니다</p>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">품목을 등록한 후 ABC 분석을 실행하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(['A', 'B', 'C'] as const).map((grade) => {
          const style = GRADE_STYLES[grade];
          const data = summary[grade];
          const pct = totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1) : '0';
          return (
            <button
              key={grade}
              type="button"
              onClick={() => setGradeFilter(gradeFilter === grade ? 'all' : grade)}
              className={`rounded-[var(--radius-lg)] border p-4 text-left transition-all ${style.border} ${style.bg} ${gradeFilter === grade ? 'ring-2 ring-[var(--accent)]' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-lg font-black ${style.text}`}>{grade}</span>
                <span className={`rounded-[var(--radius-md)] px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-[var(--foreground)]">{data.count}개</div>
              <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                금액 비중 {pct}% · {Math.round(data.value).toLocaleString()}원
              </div>
            </button>
          );
        })}
      </div>

      {/* 파레토 차트 */}
      {chartData.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-[var(--foreground)]">파레토 분석 (상위 30개 품목)</h3>
          <ParetoChart data={chartData} />
        </div>
      )}

      {/* 품목 테이블 */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-sm font-bold text-[var(--foreground)]">
            품목 목록 {gradeFilter !== 'all' && `(${GRADE_STYLES[gradeFilter].label})`}
          </h3>
          <div className="flex gap-1">
            {(['all', 'A', 'B', 'C'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradeFilter(g)}
                className={`rounded-[var(--radius-md)] px-3 py-1.5 text-[11px] font-bold transition-all ${
                  gradeFilter === g
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)]'
                }`}
              >
                {g === 'all' ? '전체' : g}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveTable
          columns={ABC_COLUMNS}
          rows={filtered.slice(0, 100)}
          keyField="id"
          emptyMessage="해당 등급의 품목이 없습니다."
        />
      </div>
    </div>
  );
}

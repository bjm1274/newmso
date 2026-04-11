'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';

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
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <Tooltip />
              <Bar yAxisId="left" dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} opacity={0.7} name="금액" />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#ef4444" strokeWidth={2} dot={false} name="누적 %" />
            </ComposedChart>
          </ResponsiveContainer>
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">등급</th>
                <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">품목명</th>
                <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">분류</th>
                <th className="px-4 py-2.5 text-right font-bold text-[var(--toss-gray-4)]">수량</th>
                <th className="px-4 py-2.5 text-right font-bold text-[var(--toss-gray-4)]">단가</th>
                <th className="px-4 py-2.5 text-right font-bold text-[var(--toss-gray-4)]">연간 금액</th>
                <th className="px-4 py-2.5 text-right font-bold text-[var(--toss-gray-4)]">누적 %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((item) => {
                const style = GRADE_STYLES[item.grade];
                return (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-2.5">
                      <span className={`rounded-[var(--radius-md)] px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text}`}>
                        {item.grade}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--foreground)]">{item.name}</td>
                    <td className="px-4 py-2.5 text-[var(--toss-gray-3)]">{item.category || '-'}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--foreground)]">{item.quantity.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--foreground)]">{item.unit_price.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-right font-bold text-[var(--foreground)]">{Math.round(item.annualValue).toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-right text-[var(--toss-gray-3)]">{item.cumulativePercent.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">해당 등급의 품목이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}

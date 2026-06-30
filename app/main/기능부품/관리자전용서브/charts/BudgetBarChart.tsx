'use client';
/**
 * 예산관리 부서별 BarChart (recharts 동적 로딩 대상)
 *
 * 예산관리.tsx에서 next/dynamic으로 로드되어 메인 번들에서 recharts가 분리된다.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer } from 'recharts';

type BudgetRow = {
  dept: string;
  budget: number;
  executed: number;
  remaining: number;
};

export default function BudgetBarChart({ data }: { data: BudgetRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="dept" tick={{ fontSize: 12, fill: 'var(--toss-gray-3)' }} />
        <YAxis
          tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
          tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }}
        />
        <Tooltip
          formatter={(value: number | undefined, name: string | number | undefined) => [
            `${(value || 0).toLocaleString()}원`,
            name === 'budget' ? '예산' : name === 'executed' ? '집행' : '잔액',
          ]}
          contentStyle={{
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'var(--card)' }}
        />
        <Bar dataKey="budget" name="예산" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="executed" name="집행" fill="var(--danger, #FF6B6B)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="remaining" name="잔액" fill="var(--success, #34C759)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

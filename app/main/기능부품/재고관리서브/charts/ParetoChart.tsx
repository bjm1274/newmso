'use client';
/**
 * ABC분석 파레토 ComposedChart (recharts 동적 로딩 대상)
 */
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type ParetoRow = { name: string; value: number; cumulative: number };

export default function ParetoChart({ data }: { data: ParetoRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tick={{ fontSize: 10 }}
          unit="%"
        />
        <Tooltip />
        <Bar
          yAxisId="left"
          dataKey="value"
          fill="var(--accent)"
          radius={[4, 4, 0, 0]}
          opacity={0.7}
          name="금액"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulative"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          name="누적 %"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

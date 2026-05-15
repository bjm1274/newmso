'use client';
/**
 * 가격이력 단가 추이 LineChart (recharts 동적 로딩 대상)
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type PriceRow = { date: string; price: number };

export default function PriceTrendChart({ data }: { data: PriceRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="price"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="단가(원)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

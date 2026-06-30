'use client';
/**
 * 통합보고서 차트 묶음 (recharts 동적 로딩 대상)
 *
 * 통합보고서.tsx에서 next/dynamic으로 로드되므로
 * 메인 번들에서 recharts가 분리된다.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend } from 'recharts';

const PIE_COLORS = [
  'var(--accent)',
  'var(--success, #34C759)',
  'var(--warning, #FF9500)',
  'var(--danger, #FF6B6B)',
  '#AF52DE',
  '#5AC8FA',
];

type HrRow = { name: string; value: number; regular: number; contract: number };
type PieRow = { name: string; value: number };
type SalaryRow = { dept: string; total: number };
type InventoryRow = { category: string; count: number; totalAmount: number };

const TOOLTIP_STYLE = {
  borderRadius: '10px',
  border: '1px solid var(--border)',
  background: 'var(--card)' };

export function HrBarChart({ data }: { data: HrRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
        <Tooltip
          formatter={(value: number | undefined) => [`${value || 0}명`]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="regular" name="정규직" stackId="a" fill="#4F8EF7" />
        <Bar dataKey="contract" name="계약직" stackId="a" fill="var(--warning, #FF9500)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EmploymentPieChart({ data }: { data: PieRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
          label={({ name, percent }: { name?: string; percent?: number }) =>
            `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | undefined) => [`${value || 0}명`]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SalaryBarChart({ data }: { data: SalaryRow[] }) {
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
          formatter={(value: number | undefined) => [`${(value || 0).toLocaleString()}원`, '인건비']}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="total" name="인건비" fill="#4F8EF7" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function InventoryPieChart({ data }: { data: InventoryRow[] }) {
  const pieData = data.map((d) => ({ name: d.category, value: d.count }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {pieData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | undefined) => [`${value || 0}개`]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function InventoryBarChart({ data }: { data: InventoryRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
        <YAxis
          tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
          tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }}
        />
        <Tooltip
          formatter={(value: number | undefined) => [`${(value || 0).toLocaleString()}원`, '재고 금액']}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="totalAmount" name="재고 금액" fill="var(--success, #34C759)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

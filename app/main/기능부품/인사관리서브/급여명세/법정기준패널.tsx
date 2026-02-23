'use client';
import {
  TAX_FREE_LEGAL_LIMITS_2024,
  MINIMUM_WAGE_2024,
  MINIMUM_WAGE_2025,
  MONTHLY_STANDARD_HOURS,
  WEEKLY_MAX_HOURS,
  ANNUAL_LEAVE_FIRST_YEAR,
  ANNUAL_LEAVE_AFTER_ONE,
} from '@/lib/tax-free-limits';

export default function LegalStandardsPanel() {
  const items = [
    { title: '최저임금', rows: [{ label: '2024년 시급', value: `${MINIMUM_WAGE_2024.toLocaleString()}원` }, { label: '2025년 시급', value: `${MINIMUM_WAGE_2025.toLocaleString()}원` }, { label: '월 소정근로시간', value: `${MONTHLY_STANDARD_HOURS}시간` }] },
    { title: '주/연차', rows: [{ label: '주 52시간', value: '근로기준법' }, { label: '1년 미만 연차', value: `${ANNUAL_LEAVE_FIRST_YEAR}일` }, { label: '1년 이상 연차', value: `${ANNUAL_LEAVE_AFTER_ONE}일` }] },
    {
      title: '비과세 한도 (2024-2025 기준)',
      rows: Object.entries(TAX_FREE_LEGAL_LIMITS_2024).map(([k, v]) => ({
        label: v.name,
        value: `${(v as any).limit.toLocaleString()}원`,
        sub: v.basis,
      })),
    },
  ];

  return (
    <div className="border border-[var(--toss-border)] p-5 bg-[var(--toss-card)] rounded-lg shadow-sm">
      <div className="pb-3 border-b border-[var(--toss-border)] mb-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">법정 기준</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">근로기준법 · 소득세법</p>
      </div>
      <div className="space-y-5">
        {items.map((block) => (
          <div key={block.title}>
            <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-2">{block.title}</p>
            <div className="space-y-1.5">
              {block.rows.map((r: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-xs">
                  <span className="font-medium text-[var(--toss-gray-4)]">{r.label}</span>
                  <div className="text-right">
                    <span className="font-medium text-[var(--foreground)]">{r.value}</span>
                    {r.sub && <p className="text-[10px] text-[var(--toss-gray-3)]">{r.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-[var(--toss-gray-3)]">* 2024-2025년 기준. 법령 개정 시 갱신 필요.</p>
    </div>
  );
}

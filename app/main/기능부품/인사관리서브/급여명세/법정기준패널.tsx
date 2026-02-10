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
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-amber-600 uppercase tracking-widest mb-4">법정 기준 (근로기준법·소득세법)</h3>
      <div className="space-y-6">
        {items.map((block) => (
          <div key={block.title}>
            <p className="text-[10px] font-black text-gray-500 uppercase mb-2">{block.title}</p>
            <div className="space-y-1">
              {block.rows.map((r: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-xs">
                  <span className="font-bold text-gray-600">{r.label}</span>
                  <div className="text-right">
                    <span className="font-black text-gray-900">{r.value}</span>
                    {r.sub && <p className="text-[9px] text-gray-400">{r.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[9px] text-gray-400">* 기준일: 2024-2025년. 법령 개정 시 갱신 필요.</p>
    </div>
  );
}

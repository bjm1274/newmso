'use client';

import { useState } from 'react';
import { calculateTaxesAndInsurance } from '@/lib/salary-compliance';

export default function DeductionCalculator({ grossSalary: initialGross }: { grossSalary?: number }) {
  const [inputSalary, setInputSalary] = useState(initialGross?.toString() ?? '');
  const gross = Number(inputSalary) || 0;
  const result = gross > 0 ? calculateTaxesAndInsurance(gross) : null;

  const taxRates = [
    { name: '국민연금', rate: '4.5%', key: 'nationalPension' as const },
    { name: '건강보험', rate: '3.545%', key: 'healthInsurance' as const },
    { name: '고용보험', rate: '0.8%', key: 'employmentInsurance' as const },
    { name: '소득세', rate: '간이세액표', key: 'incomeTax' as const },
    { name: '지방소득세', rate: '소득세의 10%', key: 'localTax' as const },
  ];

  return (
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] p-4 rounded-[12px] shadow-sm">
      <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
        <span className="w-1 h-4 bg-red-500 rounded" /> 법정 공제 계산기 (2026)
      </h2>
      <div className="mb-3 space-y-1">
        <label className="block text-xs font-medium text-[var(--toss-gray-4)]">총급여 (원)</label>
        <input
          type="number"
          value={inputSalary}
          onChange={(e) => setInputSalary(e.target.value)}
          placeholder="총급여 입력"
          className="w-full h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {taxRates.map((t, i) => (
          <div key={i} className="p-3 border border-[var(--toss-border)] bg-[var(--page-bg)] rounded-[12px]">
            <p className="text-xs font-medium text-[var(--toss-gray-3)]">{t.name}</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {result && t.key in result
                ? `${(result[t.key] as number).toLocaleString()}원`
                : t.rate}
            </p>
          </div>
        ))}
      </div>
      {result && (
        <div className="mt-3 p-3 bg-[var(--tab-bg)] border border-[var(--toss-border)] rounded-[12px]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">실급여</p>
          <p className="text-base font-bold text-[var(--toss-blue)]">{result.netSalary.toLocaleString()}원</p>
        </div>
      )}
    </div>
  );
}
'use client';

import { useState } from 'react';
import { calculateTaxesAndInsurance } from '@/lib/salary-compliance';

const deductionCards = [
  { name: '국민연금', rate: '4.75%', key: 'nationalPension' as const },
  { name: '건강보험', rate: '3.595%', key: 'healthInsurance' as const },
  { name: '장기요양보험', rate: '건강보험료의 13.14%', key: 'longTermCare' as const },
  { name: '고용보험', rate: '0.9%', key: 'employmentInsurance' as const },
  { name: '소득세', rate: '간이세액표', key: 'incomeTax' as const },
  { name: '지방소득세', rate: '소득세의 10%', key: 'localTax' as const },
] as const;

export default function DeductionCalculator({ grossSalary: initialGross }: { grossSalary?: number }) {
  const [inputSalary, setInputSalary] = useState(initialGross?.toString() ?? '');
  const gross = Number(inputSalary) || 0;
  const result = gross > 0 ? calculateTaxesAndInsurance(gross) : null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        <span className="h-4 w-1 rounded bg-red-500" />
        법정 공제 계산기 (2026)
      </h2>
      <div className="mb-3 space-y-1">
        <label className="block text-xs font-medium text-[var(--toss-gray-4)]">월 총급여</label>
        <input
          type="number"
          value={inputSalary}
          onChange={(e) => setInputSalary(e.target.value)}
          placeholder="총급여를 입력하세요"
          className="h-9 w-full rounded-md border border-[var(--border)] px-3 text-sm font-medium"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {deductionCards.map((card) => (
          <div
            key={card.key}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-3"
          >
            <p className="text-xs font-medium text-[var(--toss-gray-3)]">{card.name}</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {result ? `${Number(result[card.key]).toLocaleString()}원` : card.rate}
            </p>
          </div>
        ))}
      </div>
      {result && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] p-3">
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">예상 실수령액</p>
          <p className="text-base font-bold text-[var(--accent)]">{result.netSalary.toLocaleString()}원</p>
        </div>
      )}
    </div>
  );
}

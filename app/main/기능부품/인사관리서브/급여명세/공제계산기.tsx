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
    <div className="bg-white border border-gray-200 p-6 rounded-none shadow-sm">
      <h2 className="text-xs font-black text-gray-800 mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-red-500" /> 법정 공제 계산기 (2026)
      </h2>
      <div className="mb-4">
        <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">총급여 (원)</label>
        <input
          type="number"
          value={inputSalary}
          onChange={(e) => setInputSalary(e.target.value)}
          placeholder="총급여 입력"
          className="w-full p-2 border border-gray-200 rounded text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {taxRates.map((t, i) => (
          <div key={i} className="p-3 border border-gray-50 bg-gray-50">
            <p className="text-[9px] font-black text-gray-400 uppercase">{t.name}</p>
            <p className="text-xs font-black text-gray-800">
              {result && t.key in result
                ? `${(result[t.key] as number).toLocaleString()}원`
                : t.rate}
            </p>
          </div>
        ))}
      </div>
      {result && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100">
          <p className="text-[9px] font-black text-blue-600 uppercase">실급여</p>
          <p className="text-lg font-black text-blue-800">{result.netSalary.toLocaleString()}원</p>
        </div>
      )}
    </div>
  );
}
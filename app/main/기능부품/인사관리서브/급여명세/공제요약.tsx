'use client';

import { calculateEmployeeInsuranceDeductions } from '@/lib/payroll-insurance-rates';

export default function DeductionSummary({ base }: { base: number }) {
  const deductions = calculateEmployeeInsuranceDeductions(base);

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="mb-3 border-b border-[var(--border)] pb-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">4대보험 요약</h3>
      </div>
      <div className="space-y-2 text-xs font-medium text-[var(--toss-gray-4)]">
        <div className="flex justify-between">
          <span>국민연금</span>
          <span className="text-red-500">-{deductions.nationalPension.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between">
          <span>건강보험</span>
          <span className="text-red-500">-{deductions.healthInsurance.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between">
          <span>장기요양보험</span>
          <span className="text-red-500">-{deductions.longTermCare.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between">
          <span>고용보험</span>
          <span className="text-red-500">-{deductions.employmentInsurance.toLocaleString()}원</span>
        </div>
      </div>
    </div>
  );
}

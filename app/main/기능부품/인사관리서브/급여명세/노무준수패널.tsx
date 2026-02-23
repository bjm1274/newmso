'use client';

import { generateComplianceReport, calculateTaxesAndInsurance } from '@/lib/salary-compliance';

export default function CompliancePanel({ staffs, companyName }: { staffs: any[]; companyName?: string }) {
  const staffsForCompliance = staffs.map((s) => ({
    id: s.id,
    name: s.name,
    base_salary: s.base_salary ?? s.base ?? 0,
    position: s.position ?? 0,
  }));

  const report = generateComplianceReport(staffsForCompliance);
  const totalTax = staffs.reduce((acc, s) => {
    const base = s.base_salary ?? s.base ?? 0;
    const pos = s.position ?? 0;
    const gross = base + pos;
    const { incomeTax, localTax } = calculateTaxesAndInsurance(gross);
    return acc + incomeTax + localTax;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">노무 준수</h3>
        <div className="space-y-2">
          <div className="p-3 bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-md flex justify-between items-center">
            <span className="text-xs font-medium text-[var(--toss-gray-3)]">준수율</span>
            <span className={`text-sm font-semibold ${Number(report.complianceRate) === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{report.complianceRate}%</span>
          </div>
          {report.totalViolations > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-md">
              <p className="text-xs font-medium text-amber-700">최저임금 미달</p>
              <p className="text-sm font-semibold text-amber-800">{report.totalViolations}명</p>
            </div>
          )}
        </div>
      </div>

      <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">원천세 신고</h3>
        <div className="space-y-3">
          <div className="p-3 bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-md">
            <p className="text-xs font-medium text-[var(--toss-gray-3)]">예상 원천세액</p>
            <p className="text-base font-semibold text-[var(--foreground)]">{Math.round(totalTax).toLocaleString()}원</p>
          </div>
          <button className="w-full py-2.5 bg-[var(--foreground)] text-white text-xs font-medium rounded-[12px] hover:opacity-90">
            홈택스 신고 파일(SAM) 추출
          </button>
        </div>
      </div>

      <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">알림톡</h3>
        <div className="p-3 bg-[var(--toss-blue-light)] border border-[var(--toss-blue)]/30 rounded-md mb-3">
          <p className="text-xs text-[var(--toss-blue)] leading-relaxed font-medium">
            [{companyName ?? '회사'}] {`{name}`}님, 02월 급여명세서가 발행되었습니다.
          </p>
        </div>
        <button className="w-full py-2.5 bg-[var(--toss-blue)] text-white text-xs font-medium rounded-[12px] hover:opacity-90">
          명세서 일괄 발송
        </button>
      </div>
    </div>
  );
}
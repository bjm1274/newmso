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
      <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">노무 준수</h3>
        <div className="space-y-2">
          <div className="p-3 bg-[#f8fafc] border border-gray-100 rounded-md flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">준수율</span>
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

      <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">원천세 신고</h3>
        <div className="space-y-3">
          <div className="p-3 bg-[#f8fafc] border border-gray-100 rounded-md">
            <p className="text-xs font-medium text-gray-500">예상 원천세액</p>
            <p className="text-base font-semibold text-gray-800">{Math.round(totalTax).toLocaleString()}원</p>
          </div>
          <button className="w-full py-2.5 bg-gray-700 text-white text-xs font-medium rounded-lg hover:bg-gray-800">
            홈택스 신고 파일(SAM) 추출
          </button>
        </div>
      </div>

      <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">알림톡</h3>
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-md mb-3">
          <p className="text-xs text-blue-900 leading-relaxed font-medium">
            [{companyName ?? '회사'}] {`{name}`}님, 02월 급여명세서가 발행되었습니다.
          </p>
        </div>
        <button className="w-full py-2.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
          명세서 일괄 발송
        </button>
      </div>
    </div>
  );
}
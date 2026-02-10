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
    <div className="space-y-8">
      {/* 노무 준수 리포트 */}
      <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
        <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-widest mb-4">Labor Law Compliance (노무 준수)</h3>
        <div className="space-y-2">
          <div className="p-3 bg-gray-50 border border-gray-100 flex justify-between">
            <span className="text-[9px] font-black text-gray-400 uppercase">준수율</span>
            <span className={`text-sm font-black ${Number(report.complianceRate) === 100 ? 'text-green-600' : 'text-orange-600'}`}>{report.complianceRate}%</span>
          </div>
          {report.totalViolations > 0 && (
            <div className="p-3 bg-orange-50 border border-orange-100">
              <p className="text-[9px] font-black text-orange-600 uppercase">최저임금 미달</p>
              <p className="text-xs font-bold text-orange-800">{report.totalViolations}명</p>
            </div>
          )}
        </div>
      </div>

      {/* 국세청 신고 영역 */}
      <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
        <h3 className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-4">Tax Compliance (원천세 신고)</h3>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 border border-gray-100">
            <p className="text-[9px] font-black text-gray-400 uppercase">예상 원천세액</p>
            <p className="text-lg font-black text-gray-800">{Math.round(totalTax).toLocaleString()}원</p>
          </div>
          <button className="w-full py-3 bg-[#232933] text-white text-[10px] font-black hover:bg-black transition-all">
            홈택스 신고 파일(SAM) 추출
          </button>
        </div>
      </div>

      {/* 알림톡 템플릿 영역 */}
      <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
        <h3 className="text-[11px] font-black text-gray-800 uppercase tracking-widest mb-4">Notification (알림톡)</h3>
        <div className="p-4 bg-blue-50 border border-blue-100 mb-4">
          <p className="text-[10px] text-blue-900 leading-relaxed font-bold">
            [{companyName ?? '회사'}] {`{name}`}님, 02월 급여명세서가 발행되었습니다.
          </p>
        </div>
        <button className="w-full py-3 bg-blue-600 text-white text-[10px] font-black shadow-lg">
          명세서 일괄 발송 시작
        </button>
      </div>
    </div>
  );
}
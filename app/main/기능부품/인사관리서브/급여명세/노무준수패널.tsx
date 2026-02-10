'use client';
// [디자인] image_21b997.png의 각진 스타일과 전문적인 데이터 그리드
export default function CompliancePanel({ staffs, companyName }: { staffs: any[]; companyName?: string }) {
  // 원천세 집계 로직
  const totalTax = staffs.reduce((acc, s) => acc + Math.floor((s.base + (s.position || 0)) * 0.03), 0);

  return (
    <div className="space-y-8">
      {/* 국세청 신고 영역 */}
      <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
        <h3 className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-4">Tax Compliance (원천세 신고)</h3>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 border border-gray-100">
            <p className="text-[9px] font-black text-gray-400 uppercase">예상 원천세액</p>
            <p className="text-lg font-black text-gray-800">{totalTax.toLocaleString()}원</p>
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
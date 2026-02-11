'use client';
// [디자인] 전문적인 A4 양식 레이아웃 및 6대 공제 항목 수식 반영 가능 구조
export default function ContractPreview({ contractId }: any) {
  // 실제 운영 시 contractId 기반 데이터 호출 (시뮬레이션 데이터)
  const doc = {
    title: "표준 근로계약서",
    company: contractId === 2 ? "SY(법인)" : (contractId === 3 ? "수연의원" : "박철홍정형외과"),
    ceo: "박철홍",
    address: "전라남도 목포시 ...",
    date: "2026년 02월 06일"
  };

  return (
    <div className="bg-white border border-gray-200 shadow-2xl p-12 flex flex-col h-[800px] overflow-y-auto rounded-none relative custom-scrollbar print:shadow-none">
      <div className="text-center mb-12">
        <h1 className="text-2xl font-black text-gray-900 border-b-2 border-gray-900 inline-block pb-1">{doc.title}</h1>
      </div>

      <div className="flex-1 space-y-6 text-[11px] leading-relaxed text-gray-700 font-medium">
        <p className="font-bold">
          &quot;{doc.company}&quot;(이하 &apos;갑&apos;)와 &quot;근로자&quot;(이하 &apos;을&apos;)는 다음과 같이 근로계약을 체결한다.
        </p>
        
        <div className="space-y-4">
          <section>
            <p className="font-black text-gray-900 mb-1">1. 근로계약기간</p>
            <p className="pl-3">2026년 02월 06일부터 기간의 정함이 없는 근로계약을 체결한다.</p>
          </section>
          
          <section>
            <p className="font-black text-gray-900 mb-1">2. 근무장소 및 업무내용</p>
            <p className="pl-3">- 근무장소: {doc.address}</p>
            <p className="pl-3">- 업무내용: 의료 행정 및 경영 지원 업무</p>
          </section>

          <section>
            <p className="font-black text-gray-900 mb-1">3. 소득 및 공제</p>
            <p className="pl-3 text-blue-600 font-bold">※ 급여 산정 시 국민연금, 건강보험, 장기요양, 고용보험, 소득세, 지방소득세 등 6대 항목을 공제한다.</p>
          </section>
        </div>

        <div className="mt-12 p-6 bg-gray-50 border border-gray-100 text-[10px] italic">
          (이하 보안서약 및 근로기준법 준수 사항 생략)
        </div>
      </div>

      {/* 사업체별 자동 직인 영역 */}
      <div className="mt-10 pt-8 border-t border-gray-100 flex justify-between items-end">
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400 font-bold mb-4">{doc.date}</p>
          <p className="text-xs font-bold text-gray-500 underline underline-offset-4">(갑) 사업자명: {doc.company}</p>
          <p className="text-xs font-bold text-gray-500 underline underline-offset-4">(갑) 대표이사: {doc.ceo}</p>
        </div>
        
        {/* 디지털 직인 시뮬레이션 */}
        <div className="relative w-20 h-20 flex items-center justify-center border-2 border-red-500 rounded-none rotate-6">
          <span className="text-[10px] font-black text-red-500 text-center leading-none">
            {doc.company.slice(0, 4)}<br/>인
          </span>
          <div className="absolute inset-0 bg-red-500/10"></div>
        </div>
      </div>
    </div>
  );
}
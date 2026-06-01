'use client';

/** [임시] 근로계약서 테두리/비밀유지서약서 시각 검증용 페이지. 검증 후 삭제. */
import ContractStandardPreview from '@/app/main/기능부품/인사관리서브/계약문서/계약서표준미리보기';
import ConfidentialityPledge from '@/app/main/기능부품/인사관리서브/계약문서/비밀유지서약서';

const MOCK_TEMPLATE = `제1조 [근로계약기간]
① 근로자는 2026년 06월 01일부터 정년까지로 한다.
② 본 계약은 별도의 수습기간을 두지 아니한다.

제2조 [근무장소 및 업무내용]
① 근무장소: 본사 및 회사가 지정하는 장소로 한다.
② 담당업무: 인사 및 총무 업무로 하며, 회사의 필요에 따라 변경될 수 있다.

제3조 [근로시간 및 휴게시간]
① 근로시간은 1일 8시간, 주 40시간을 원칙으로 한다.
② 휴게시간은 근로시간 4시간당 30분 이상 근무 중 부여한다.
③ 근무일은 월요일~금요일로 하며, 주휴일은 일요일로 한다.

제4조 [임금]
[임금 구성항목]
기본급    2,500,000
식대    100,000
① 임금은 매월 7일에 근로자가 지정한 계좌로 지급한다.
② 임금은 통화로 직접 근로자에게 그 전액을 지급한다.

제5조 [연차유급휴가]
① 연차유급휴가는 근로기준법이 정하는 바에 따라 부여한다.

제6조 [계약의 해지]
① 근로자가 정당한 사유 없이 무단결근하는 경우 회사는 계약을 해지할 수 있다.`;

export default function DevContractPreviewPage() {
  const closingData = {
    companyName: '에스와이 주식회사',
    companyBusinessNo: '123-45-67890',
    companyAddress: '서울특별시 강남구 테헤란로 123, 10층',
    companyPhone: '02-1234-5678',
    companyCeo: '김대표',
    employeeName: '홍길동',
    employeeAddress: '서울특별시 마포구 월드컵로 100',
    employeePhone: '010-1111-2222',
    contractDate: '2026년 06월 01일',
  };

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto custom-scrollbar bg-slate-100 print:bg-white print:h-auto print:overflow-visible">
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200 print:hidden">
        <span className="text-[13px] font-bold text-slate-800">홍길동 근로계약서 (검증용)</span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          🖨️ 인쇄
        </button>
      </div>

      <div className="flex-1 p-6 flex justify-center">
        <div
          data-print-root
          className="w-full max-w-[700px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.10)] min-h-[980px] flex flex-col print:shadow-none print:max-w-full"
        >
          <div className="flex flex-col flex-1 px-[44px] py-[40px] border-[1.5px] border-slate-600 rounded-[2px] shadow-[inset_0_0_0_3px_var(--card),inset_0_0_0_4px_rgba(100,116,139,0.4)] print:border-0 print:rounded-none print:shadow-none print:px-0 print:py-0">
            <ContractStandardPreview templateText={MOCK_TEMPLATE} closingData={closingData} />
            <ConfidentialityPledge
              companyName={closingData.companyName}
              employeeName={closingData.employeeName}
              contractDate={closingData.contractDate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

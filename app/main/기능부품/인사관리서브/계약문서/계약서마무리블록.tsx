'use client';

import type { ContractClosingData } from '@/lib/contract-template-closing';
import { resolveBrandAssetSrc } from '@/lib/company-brand-assets';

type Props = ContractClosingData & {
    onOpenSignature?: () => void;
    onOpenReceipt?: () => void;
    isInteractive?: boolean;
};

export default function ContractClosingBlock(props: Props) {
    const {
        companyName,
        companyAddress,
        companyCeo,
        companyPhone,
        companyBusinessNo,
        sealUrl,
        employeeName,
        employeeAddress,
        employeePhone,
        contractDate,
        signatureDataUrl,
        receiptTraceDataUrl,
        onOpenSignature,
        onOpenReceipt,
        isInteractive = false } = props;

    const renderRow = (
        label: string,
        value?: string,
        labelTone: 'company' | 'employee' = 'company',
    ) => {
        if (!value) return null;
        const labelClass =
            labelTone === 'employee'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-slate-100 text-slate-500';
        return (
            <div className="flex items-stretch text-[12px] min-h-[36px] print:min-h-[26px]">
                <span className={`w-[82px] shrink-0 flex items-start pt-[9px] px-3 ${labelClass} font-bold print:pt-[6px] print:px-1.5`}>{label}</span>
                <span
                    className="flex-1 min-w-0 px-3 py-[8px] text-slate-800 font-semibold leading-snug break-all whitespace-normal print:px-1.5 print:py-[5px]"
                    title={value}
                >
                    {value}
                </span>
            </div>
        );
    };

    return (
        <div
            className="mt-6 space-y-4 break-inside-avoid print:mt-2.5 print:space-y-2 print:break-inside-avoid"
            style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
        >
            <div className="text-center pb-1">
                <p className="text-[13px] text-slate-500 print:text-[11.5px] font-medium">
                    계약 체결일:{' '}
                    <span className="font-bold text-slate-900">{contractDate}</span>
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-3.5 break-inside-avoid print:gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-3 py-2 bg-slate-800 text-white text-center">
                        <span className="text-[11px] font-bold tracking-[0.2em]">사 용 자</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {renderRow(
                            '회사명',
                            companyBusinessNo
                                ? `${companyName ?? ''} (${companyBusinessNo})`.trim()
                                : companyName,
                        )}
                        {renderRow('소재지', companyAddress)}
                        {renderRow('연락처', companyPhone)}
                        <div className="flex items-stretch text-[12px] min-h-[38px] print:min-h-[26px] overflow-visible">
                            <span className="w-[82px] shrink-0 flex items-center px-3 bg-slate-100 text-slate-500 font-bold print:px-1.5">대표자</span>
                            <span className="relative flex-1 min-w-0 px-3 text-slate-800 font-semibold leading-snug flex items-center justify-between gap-2 overflow-visible print:px-1.5">
                                <span className="truncate" title={companyCeo || ''}>{companyCeo || '-'}</span>
                                {sealUrl ? (
                                    <img
                                        src={resolveBrandAssetSrc(sealUrl)}
                                        alt="직인"
                                        className="absolute right-4 w-16 h-16 object-contain select-none pointer-events-none z-10"
                                        style={{
                                            mixBlendMode: 'multiply',
                                            top: '50%',
                                            transform: 'translateY(-50%)' }}
                                    />
                                ) : (
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-red-500 font-black text-[10px] shrink-0">
                                        ( 인 )
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl overflow-hidden border-2 border-blue-300 bg-white shadow-sm">
                    <div className="px-3 py-2 bg-blue-600 text-white text-center flex items-center justify-center gap-1.5">
                        <span className="text-[11px] font-bold tracking-[0.2em]">근 로 자</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {renderRow('성명', employeeName, 'employee')}
                        {renderRow('주소', employeeAddress, 'employee')}
                        {renderRow('연락처', employeePhone, 'employee')}
                        <div id="employee-signature-section" className="flex items-stretch text-[12px] min-h-[50px] print:min-h-[36px] scroll-mt-20">
                            <span className="w-[82px] shrink-0 flex items-center px-3 bg-blue-50 text-blue-700 font-bold print:px-1.5">서명</span>
                            <span className="flex-1 min-w-0 px-3 py-1.5 leading-snug flex items-center justify-between gap-2 print:px-1.5 print:pb-1">
                                {signatureDataUrl ? (
                                    <div className="flex items-center justify-between w-full">
                                        <img
                                            src={signatureDataUrl}
                                            alt="서명"
                                            className="h-8 object-contain"
                                            style={{ mixBlendMode: 'multiply' }}
                                        />
                                        {isInteractive && onOpenSignature && (
                                            <button
                                                type="button"
                                                onClick={onOpenSignature}
                                                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors print:hidden cursor-pointer"
                                            >
                                                재서명
                                            </button>
                                        )}
                                    </div>
                                ) : isInteractive && onOpenSignature ? (
                                    <button
                                        type="button"
                                        onClick={onOpenSignature}
                                        className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] print:hidden cursor-pointer"
                                    >
                                        <span>✍️</span>
                                        <span>서명하기</span>
                                    </button>
                                ) : (
                                    <>
                                        <span className="flex-1 border-b-2 border-slate-300 min-w-[80px]" />
                                        <span className="text-[10px] text-slate-400 shrink-0">(서명)</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <div id="employee-receipt-section" className="flex items-stretch text-[12px] min-h-[50px] print:min-h-[34px] scroll-mt-20">
                            <span className="w-[82px] shrink-0 flex items-center px-3 bg-blue-50 text-blue-700 font-bold print:px-1.5">교부확인</span>
                            <span className="flex-1 min-w-0 px-3 py-1.5 flex items-center justify-between text-center leading-tight print:px-1.5">
                                {receiptTraceDataUrl ? (
                                    <div className="flex items-center justify-between w-full">
                                        <img
                                            src={receiptTraceDataUrl}
                                            alt="교부확인 자필"
                                            className="h-9 object-contain"
                                            style={{ mixBlendMode: 'multiply' }}
                                        />
                                        {isInteractive && onOpenReceipt && (
                                            <button
                                                type="button"
                                                onClick={onOpenReceipt}
                                                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors print:hidden cursor-pointer"
                                            >
                                                다시쓰기
                                            </button>
                                        )}
                                    </div>
                                ) : isInteractive && onOpenReceipt ? (
                                    <button
                                        type="button"
                                        onClick={onOpenReceipt}
                                        className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] print:hidden cursor-pointer"
                                    >
                                        <span>✍️</span>
                                        <span>&apos;교부 받음&apos; 자필 작성</span>
                                    </button>
                                ) : (
                                    <div className="w-full flex flex-col items-center justify-center">
                                        <span className="contract-receipt-trace text-[17px] font-bold tracking-[0.35em] text-slate-300 select-none">교부 받음</span>
                                        <span className="text-[8px] text-slate-400 mt-0.5">위 글자를 따라 자필로 적어 주세요</span>
                                    </div>
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

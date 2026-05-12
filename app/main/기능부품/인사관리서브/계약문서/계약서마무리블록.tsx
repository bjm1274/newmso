'use client';

import type { ContractClosingData } from '@/lib/contract-template-closing';

type Props = ContractClosingData;

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
    } = props;

    const renderRow = (
        label: string,
        value?: string,
        labelTone: 'company' | 'employee' = 'company',
    ) => {
        if (!value) return null;
        const labelClass =
            labelTone === 'employee'
                ? 'bg-blue-500/10 text-blue-700'
                : 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
        return (
            <div className="flex text-[11.5px]">
                <span className={`w-[78px] shrink-0 px-2.5 py-1.5 ${labelClass} font-bold`}>{label}</span>
                <span className="flex-1 px-2.5 py-1.5 text-[var(--foreground)] font-semibold leading-snug break-keep">
                    {value}
                </span>
            </div>
        );
    };

    return (
        <div className="mt-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--card)]">
                    <div className="px-3 py-2 bg-slate-800 text-white text-center">
                        <span className="text-[10px] font-black tracking-[0.2em]">사 용 자</span>
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)]">
                        {renderRow('회사명', companyName)}
                        {renderRow('사업자번호', companyBusinessNo)}
                        {renderRow('소재지', companyAddress)}
                        {renderRow('연락처', companyPhone)}
                        <div className="flex items-center text-[11.5px]">
                            <span className="w-[78px] shrink-0 px-2.5 py-1.5 bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold">대표자</span>
                            <span className="flex-1 px-2.5 py-1.5 text-[var(--foreground)] font-semibold leading-snug flex items-center gap-2">
                                <span>{companyCeo || '-'}</span>
                                {sealUrl ? (
                                    <img
                                        src={sealUrl}
                                        alt="직인"
                                        className="w-10 h-10 object-contain select-none pointer-events-none"
                                        style={{ mixBlendMode: 'multiply' }}
                                    />
                                ) : (
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 border-2 border-red-400/70 rounded-full text-red-500 font-black text-[10px]">
                                        ( 인 )
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-blue-200 bg-[var(--card)]">
                    <div className="px-3 py-2 bg-blue-600 text-white text-center">
                        <span className="text-[10px] font-black tracking-[0.2em]">근 로 자</span>
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)]">
                        {renderRow('성명', employeeName, 'employee')}
                        {renderRow('주소', employeeAddress, 'employee')}
                        {renderRow('연락처', employeePhone, 'employee')}
                        <div className="flex items-center text-[11.5px]">
                            <span className="w-[78px] shrink-0 px-2.5 py-1.5 bg-blue-500/10 text-blue-700 font-bold">서명</span>
                            <span className="flex-1 px-2.5 py-1.5 leading-snug flex items-center gap-2 min-h-[36px]">
                                {signatureDataUrl ? (
                                    <img
                                        src={signatureDataUrl}
                                        alt="서명"
                                        className="h-8 object-contain"
                                        style={{ mixBlendMode: 'multiply' }}
                                    />
                                ) : (
                                    <>
                                        <span className="flex-1 border-b-2 border-blue-300 min-w-[80px]" />
                                        <span className="text-[10px] text-[var(--toss-gray-3)] shrink-0">(서명)</span>
                                    </>
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--tab-bg)] px-4 py-3 text-[12px] text-[var(--foreground)]">
                <p className="font-bold mb-1">근로계약서 교부 확인</p>
                <p className="text-[var(--toss-gray-5)]">
                    본인은 본 근로계약서 1부를 교부받았음을 확인합니다.
                </p>
                <p className="mt-1.5 text-[var(--toss-gray-4)]">
                    계약 체결일:{' '}
                    <span className="font-bold text-[var(--foreground)]">{contractDate}</span>
                </p>
            </div>
        </div>
    );
}

'use client';

import {
    CONFIDENTIALITY_PLEDGE_AFFIRMATION,
    CONFIDENTIALITY_PLEDGE_CLAUSES,
    CONFIDENTIALITY_PLEDGE_INTRO_PREFIX,
    CONFIDENTIALITY_PLEDGE_INTRO_SUFFIX } from '@/lib/contract-confidentiality-pledge';

/**
 * 근로계약서에 첨부되는 비밀유지 서약서.
 * 인쇄 시에는 계약서 본문(서명·직인) 아래에 붙이지 않고 별도 페이지(뒷장)로 분리되도록 print:break-before-page 를 부여한다.
 * 서약서 본문(조항·문구)은 직원 서명 PDF(전자서명모달)와 동일하게 lib/contract-confidentiality-pledge 에서 공유한다.
 */
type Props = {
    companyName: string;
    employeeName: string;
    contractDate: string;
    signatureDataUrl?: string;
};

export default function ConfidentialityPledge({
    companyName,
    employeeName,
    contractDate,
    signatureDataUrl }: Props) {
    return (
        <section
            className="contract-pledge mt-10 print:mt-0 print:pt-0 print:break-before-page font-sans"
        >
            <div className="text-center mb-6">
                <h2 className="text-[20px] font-black tracking-wider text-slate-900">
                    비 밀 유 지 서 약 서
                </h2>
                <div className="flex items-center justify-center gap-2 mt-2">
                    <div className="w-12 h-px bg-slate-200" />
                    <div className="w-1.5 h-1.5 rotate-45 bg-blue-600" />
                    <div className="w-12 h-px bg-slate-200" />
                </div>
            </div>

            <p className="text-[13px] text-slate-700 leading-relaxed mb-5">
                {CONFIDENTIALITY_PLEDGE_INTRO_PREFIX}
                <span className="font-bold text-slate-900">{companyName || '회사'}</span>
                {CONFIDENTIALITY_PLEDGE_INTRO_SUFFIX}
            </p>

            <div className="space-y-4">
                {CONFIDENTIALITY_PLEDGE_CLAUSES.map((clause) => (
                    <div key={clause.title}>
                        <h4 className="text-[14px] font-extrabold text-slate-900 mb-1.5 flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0" />
                            {clause.title}
                        </h4>
                        <p className="pl-3.5 border-l-2 border-slate-200 text-[12.5px] text-slate-600 leading-relaxed">
                            {clause.body}
                        </p>
                    </div>
                ))}
            </div>

            <p className="mt-7 text-[13px] text-center font-bold text-slate-800">
                {CONFIDENTIALITY_PLEDGE_AFFIRMATION}
            </p>

            <p className="mt-6 text-center text-[13px] font-bold text-slate-900">
                {contractDate}
            </p>

            <div className="mt-5 flex justify-end">
                <div className="flex items-end gap-3 text-[13px]">
                    <span className="text-[11px] font-bold text-slate-500">[서약자]</span>
                    <span className="font-bold text-slate-900">{employeeName}</span>
                    {signatureDataUrl ? (
                        <img
                            src={signatureDataUrl}
                            alt="서명"
                            className="h-8 object-contain"
                            style={{ mixBlendMode: 'multiply' }}
                        />
                    ) : (
                        <>
                            <span className="inline-block w-[120px] border-b-2 border-slate-300" />
                            <span className="text-[11px] text-slate-400">(서명)</span>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}


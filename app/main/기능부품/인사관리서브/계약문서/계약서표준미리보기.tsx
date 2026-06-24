'use client';

import type { ContractClosingData } from '@/lib/contract-template-closing';
import ContractBodyBlock from './계약서본문블록';
import ContractClosingBlock from './계약서마무리블록';

type Props = {
    templateText: string;
    closingData: ContractClosingData;
    showTitle?: boolean;
    privacyConsent?: boolean | null;
};

export default function ContractStandardPreview({
    templateText,
    closingData,
    showTitle = true,
    privacyConsent,
}: Props) {
    return (
        <div className="text-[var(--foreground)]" style={{ fontFamily: 'Noto Sans KR, sans-serif' }}>
            {showTitle && (
                <div className="text-center mb-6">
                    <h1
                        className="text-[26px] font-black tracking-[0.35em] text-[var(--foreground)]"
                        style={{ fontFamily: '"Noto Serif KR", Georgia, serif' }}
                    >
                        근 로 계 약 서
                    </h1>
                    <div className="flex items-center justify-center gap-2 mt-2">
                        <div className="w-12 h-px bg-[var(--border)]" />
                        <div className="w-1.5 h-1.5 rotate-45 bg-[var(--toss-gray-3)]" />
                        <div className="w-12 h-px bg-[var(--border)]" />
                    </div>
                </div>
            )}
            <ContractBodyBlock templateText={templateText} privacyConsent={privacyConsent} />
            <ContractClosingBlock {...closingData} />
        </div>
    );
}

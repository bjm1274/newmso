'use client';

/**
 * 근로계약서 하단에 첨부되는 비밀유지 서약서.
 * 인쇄 시 별도 페이지에서 시작하도록 contract-pledge 클래스를 부여한다.
 */
type Props = {
    companyName: string;
    employeeName: string;
    contractDate: string;
    signatureDataUrl?: string;
};

const PLEDGE_CLAUSES = [
    {
        title: '제1조 [비밀정보의 범위]',
        body: '본인이 재직 중 알게 된 회사의 환자·고객 정보, 경영·재무 전략, 영업 비밀, 인사 정보, 의료·업무 프로세스 및 기타 회사가 비밀로 관리하는 일체의 정보를 비밀정보로 한다.',
    },
    {
        title: '제2조 [비밀유지 의무]',
        body: '본인은 회사의 사전 서면 승인 없이 비밀정보를 제3자에게 누설·제공하거나 업무 외의 목적으로 이용하지 아니한다.',
    },
    {
        title: '제3조 [자료의 반환]',
        body: '본인은 퇴직하거나 회사가 요청하는 경우, 비밀정보가 포함된 모든 문서·전자파일·저장매체 및 그 사본을 즉시 반환하거나 폐기한다.',
    },
    {
        title: '제4조 [유지 기간 및 책임]',
        body: '본 서약의 효력은 재직 기간은 물론 퇴직 후 3년간 유지되며, 위반 시 관계 법령 및 회사 규정에 따른 민·형사상 책임을 진다.',
    },
];

export default function ConfidentialityPledge({
    companyName,
    employeeName,
    contractDate,
    signatureDataUrl,
}: Props) {
    return (
        <section
            className="contract-pledge mt-10 print:mt-0"
            style={{ fontFamily: 'Noto Sans KR, sans-serif' }}
        >
            <div className="text-center mb-6">
                <h2
                    className="text-[22px] font-black tracking-[0.4em] text-[var(--foreground)]"
                    style={{ fontFamily: '"Noto Serif KR", Georgia, serif' }}
                >
                    비 밀 유 지 서 약 서
                </h2>
                <div className="flex items-center justify-center gap-2 mt-2">
                    <div className="w-12 h-px bg-[var(--border)]" />
                    <div className="w-1.5 h-1.5 rotate-45 bg-[var(--toss-gray-3)]" />
                    <div className="w-12 h-px bg-[var(--border)]" />
                </div>
            </div>

            <p className="text-[13px] text-[var(--toss-gray-5)] leading-[1.9] mb-5">
                본인(이하 &lsquo;서약자&rsquo;)은{' '}
                <span className="font-bold text-[var(--foreground)]">{companyName || '회사'}</span>
                (이하 &lsquo;회사&rsquo;)에 근무함에 있어, 업무상 알게 되는 회사 및 고객의 정보를
                보호할 책임이 있음을 충분히 인지하고 다음과 같이 서약합니다.
            </p>

            <div className="space-y-4">
                {PLEDGE_CLAUSES.map((clause) => (
                    <div key={clause.title}>
                        <h4 className="text-[14px] font-black text-[var(--foreground)] mb-1.5 flex items-center gap-2.5">
                            <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0" />
                            {clause.title}
                        </h4>
                        <p className="pl-4 border-l-2 border-[var(--border-subtle)] text-[13px] text-[var(--toss-gray-5)] leading-[1.85]">
                            {clause.body}
                        </p>
                    </div>
                ))}
            </div>

            <p className="mt-7 text-[13px] text-center font-bold text-[var(--foreground)]">
                위 내용을 충분히 이해하였으며, 이를 성실히 준수할 것을 서약합니다.
            </p>

            <p className="mt-6 text-center text-[13px] font-bold text-[var(--foreground)]">
                {contractDate}
            </p>

            <div className="mt-5 flex justify-end">
                <div className="flex items-end gap-3 text-[13px]">
                    <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">[서약자]</span>
                    <span className="font-bold text-[var(--foreground)]">{employeeName}</span>
                    {signatureDataUrl ? (
                        <img
                            src={signatureDataUrl}
                            alt="서명"
                            className="h-7 object-contain"
                            style={{ mixBlendMode: 'multiply' }}
                        />
                    ) : (
                        <>
                            <span className="inline-block w-[120px] border-b border-[var(--toss-gray-3)]" />
                            <span className="text-[11px] text-[var(--toss-gray-3)]">(서명)</span>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

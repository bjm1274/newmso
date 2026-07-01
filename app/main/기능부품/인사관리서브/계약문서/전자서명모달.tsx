'use client';
import { toast } from '@/lib/toast';
import { useState, useRef, useEffect } from 'react';
import { db } from '@/lib/db-client';
import SignatureCanvas from 'react-signature-canvas';
import { upgradeLegacyContractTemplate } from '@/lib/contract-template-defaults';
import { fillEmploymentContractTemplate } from '@/lib/contract-template-render';
import {
    buildClosingPrintHTML,
    stripContractClosingLines,
    type ContractClosingData } from '@/lib/contract-template-closing';
import { buildContractBodyPrintHTML } from '@/lib/contract-body-print-html';
import {
    buildConfidentialityPledgePrintHTML,
    CONFIDENTIALITY_PLEDGE_CLAUSES,
    CONFIDENTIALITY_PLEDGE_INTRO_PREFIX,
    CONFIDENTIALITY_PLEDGE_INTRO_SUFFIX,
    CONFIDENTIALITY_PLEDGE_AFFIRMATION } from '@/lib/contract-confidentiality-pledge';
import ContractClosingBlock from './계약서마무리블록';
import ContractBodyBlock from './계약서본문블록';
import {
    getShiftBandGroupRows,
    getWeeklyRotationShiftIds,
    isShiftBandGroupRow,
    orderShiftsByIds,
    withWeeklyRotationShifts } from '@/lib/contract-shift-rotation';

type Props = {
    contract: any;
    user: any;
    templateText?: string;
    onClose: () => void;
    onSuccess: (
        signatureData: string,
        contractText: string,
        receiptSignatureData?: string,
        privacyConsent?: boolean | null
    ) => Promise<void> | void;
};

const REQUIRED_AGREEMENTS = [
    { id: 'agree_content', title: '근로계약서 내용 확인', desc: '본 근로계약서의 기재사항(근로조건, 임금, 근로시간 등)을 충분히 확인하였고 이에 동의합니다.' },
    { id: 'agree_break', title: '휴게시간 분할 및 변경 동의', desc: '업무 특성(환자 진료 등)에 따라 휴게시간을 분할하여 사용하거나 시간을 변경하여 사용하는 것에 동의합니다.' },
    { id: 'agree_health', title: '건강검진 수검 의무 이행', desc: '정해진 기한 내에 일반/특수 건강검진을 성실히 수검하며, 미수검 시 관련 법규에 따른 불이익을 감수합니다.' },
    { id: 'agree_probation', title: '수습 기간 채용 거절 요건', desc: '수습 기간 중 근무 성적, 자질, 건강 상태 등이 직무에 부적합하다고 판단될 경우 채용이 거절될 수 있임을 확인합니다.' },
    { id: 'agree_handover_extended', title: '퇴사 시 인수인계 의무 (30일)', desc: '퇴사 최소 30일 전 통보하며, 업무 인수인계가 완료될 때까지 성실히 의무를 다할 것에 동의합니다.' },
    { id: 'agree_secrecy', title: '연봉/계약조건 비밀유지', desc: '본인의 급여 및 계약조건에 대해 사내외 타인에게 발설하지 않을 것에 동의합니다.' },
    { id: 'agree_insurance', title: '4대보험 및 세금 공제 동의', desc: '급여 지급 시 관련 법령에 따른 4대보험료 및 제세공과금 원천징수 후 지급받는 것에 동의합니다.' }
];

export default function ContractSignatureModal({ contract, user, templateText, onClose, onSuccess }: Props) {
    const [step, setStep] = useState<number>(1);
    const [privacyConsent, setPrivacyConsent] = useState<boolean | null>(null);
    const [agreements, setAgreements] = useState<Record<string, boolean>>({});
    const sigCanvas = useRef<SignatureCanvas>(null);
    const submitLockRef = useRef(false);
    const [isSigEmpty, setIsSigEmpty] = useState(true);
    // 교부확인: 최종 서명 단계에서 '교부 받음'을 자필로 작성하는 캔버스
    const [isReceiptEmpty, setIsReceiptEmpty] = useState(true);
    const receiptCanvas = useRef<SignatureCanvas>(null);
    const [company, setCompany] = useState<Record<string, unknown> | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const sigContainerRef = useRef<HTMLDivElement>(null);
    const receiptContainerRef = useRef<HTMLDivElement>(null);
    const [sigWidth, setSigWidth] = useState(400);
    const [sigHeight, setSigHeight] = useState(180);
    const [receiptWidth, setReceiptWidth] = useState(400);
    const [receiptHeight, setReceiptHeight] = useState(120);

    useEffect(() => {
        const updateSizes = () => {
            if (sigContainerRef.current) {
                // padding을 고려하여 크기 할당
                setSigWidth(sigContainerRef.current.clientWidth - 16);
                setSigHeight(sigContainerRef.current.clientHeight - 16);
            }
            if (receiptContainerRef.current) {
                setReceiptWidth(receiptContainerRef.current.clientWidth - 16);
                setReceiptHeight(receiptContainerRef.current.clientHeight - 16);
            }
        };

        if (step === 4) {
            const timer = setTimeout(updateSizes, 100);
            window.addEventListener('resize', updateSizes);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('resize', updateSizes);
            };
        }
    }, [step]);

    const [localTemplateText, setLocalTemplateText] = useState<string>('');
    const [isTemplateLoading, setIsTemplateLoading] = useState(false);
    const hasTemplateOverride = templateText !== undefined;

    useEffect(() => {
        let isMounted = true;

        const buildResolvedTemplateText = async (
            rawTemplateText: string,
            shiftData: Record<string, unknown> | null,
            companyData: Record<string, unknown> | null,
            sealUrl: string | null,
        ) => {
            const nextCompany =
                companyData || sealUrl
                    ? { ...(companyData ?? {}), ...(sealUrl ? { seal_url: sealUrl } : {}) }
                    : null;

            return fillEmploymentContractTemplate(
                upgradeLegacyContractTemplate(rawTemplateText),
                user,
                contract,
                shiftData,
                nextCompany,
            );
        };

        const fetchTemplateAndCompany = async () => {
            if (!contract || !user) {
                setLocalTemplateText('');
                setCompany(null);
                return;
            }

            setIsTemplateLoading(true);
            setLocalTemplateText('');
            try {
                const targetCompany = String(user?.company || contract?.company_name || '전체');
                let companyData: Record<string, unknown> | null = null;
                let sealUrl: string | null = null;
                let shiftData: Record<string, unknown> | null = null;
                let resolvedTemplateText = hasTemplateOverride ? (templateText || '') : '';

                const shiftIds = getWeeklyRotationShiftIds(user, contract?.shift_id ?? user?.shift_id);
                if (shiftIds.length > 0) {
                    const { data: shiftRows } = await db
                        .from('work_shifts')
                        .select('*')
                        .in('id', shiftIds);
                    let orderedShiftRows = orderShiftsByIds(shiftRows, shiftIds);
                    if (orderedShiftRows.length === 1 && isShiftBandGroupRow(orderedShiftRows[0])) {
                        const seedShift = orderedShiftRows[0];
                        const seedCompanyName = String(seedShift.company_name || seedShift.company || '');
                        const seedShiftType = String(seedShift.shift_type || '');
                        let siblingQuery = db
                            .from('work_shifts')
                            .select('*')
                            .eq('is_active', true);
                        if (seedCompanyName) siblingQuery = siblingQuery.eq('company_name', seedCompanyName);
                        if (seedShiftType) siblingQuery = siblingQuery.eq('shift_type', seedShiftType);
                        const { data: siblingRows } = await siblingQuery;
                        const groupedRows = getShiftBandGroupRows(seedShift, siblingRows);
                        if (groupedRows.length > 1) orderedShiftRows = groupedRows;
                    }
                    shiftData = withWeeklyRotationShifts(orderedShiftRows);
                }

                if (targetCompany && targetCompany !== '전체') {
                    const { data: companyRow } = await db
                        .from('companies')
                        .select('*')
                        .eq('name', targetCompany)
                        .maybeSingle();
                    companyData = companyRow;
                }

                if (!hasTemplateOverride) {
                    const { data: companyTemplateRow } = await db
                        .from('contract_templates')
                        .select('template_content, seal_url')
                        .eq('company_name', targetCompany)
                        .maybeSingle();

                    resolvedTemplateText = companyTemplateRow?.template_content || '';
                    sealUrl = companyTemplateRow?.seal_url || null;

                    if (!resolvedTemplateText && targetCompany !== '전체') {
                        const { data: fallbackTemplateRow } = await db
                            .from('contract_templates')
                            .select('template_content, seal_url')
                            .eq('company_name', '전체')
                            .maybeSingle();
                        resolvedTemplateText = fallbackTemplateRow?.template_content || '';
                        sealUrl = sealUrl || fallbackTemplateRow?.seal_url || null;
                    }
                }

                const nextCompany =
                    companyData || sealUrl
                        ? { ...(companyData ?? {}), ...(sealUrl ? { seal_url: sealUrl } : {}) }
                        : null;
                const result = await buildResolvedTemplateText(
                    resolvedTemplateText,
                    shiftData,
                    companyData,
                    sealUrl,
                );

                if (!isMounted) return;
                setCompany(nextCompany);
                setLocalTemplateText(result);
            } catch (err) {
                console.warn('Error applying template for modal:', err);
                if (!isMounted) return;
                setCompany(null);
                setLocalTemplateText('');
            } finally {
                if (isMounted) {
                    setIsTemplateLoading(false);
                }
            }
        };

        void fetchTemplateAndCompany();
        return () => {
            isMounted = false;
        };
        // JM2: contract/user 객체를 통째로 deps에 두면 상위에서 매 렌더마다 새 참조가
        // 들어올 때마다 fetchTemplateAndCompany가 재호출되어 무한 fetch → setState →
        // 부모 리렌더 루프의 원인이 된다. 실제 fetch에 영향을 주는 primitive만 deps에 둔다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        contract?.id,
        contract?.shift_id,
        contract?.company_name,
        contract?.contract_type,
        contract?.requested_at,
        contract?.sent_at,
        contract?.issued_at,
        contract?.created_at,
        user?.id,
        user?.name,
        user?.company,
        user?.shift_id,
        user?.address,
        user?.phone,
        templateText,
        hasTemplateOverride,
    ]);

    const allAgreed = REQUIRED_AGREEMENTS.every(item => agreements[item.id]);
    const isTemplateReady = localTemplateText.trim().length > 0;

    const formatKoreanDate = (input: unknown): string => {
        if (!input) return '';
        const date = input instanceof Date ? input : new Date(String(input));
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'long',
            day: 'numeric' });
    };

    const contractIssueDate =
        formatKoreanDate(
            contract?.requested_at ?? contract?.sent_at ?? contract?.issued_at ?? contract?.created_at,
        ) || formatKoreanDate(new Date());

    const closingData: ContractClosingData = {
        companyName: String(
            (company?.name as string | undefined) || user?.company || contract?.company_name || '',
        ),
        companyAddress: String((company?.address as string | undefined) || ''),
        companyCeo: String(
            (company?.ceo_name as string | undefined) ||
            (company?.representative_name as string | undefined) || '',
        ),
        companyPhone: String((company?.phone as string | undefined) || ''),
        companyBusinessNo: String(
            (company?.business_no as string | undefined) ||
            (company?.business_number as string | undefined) || '',
        ),
        sealUrl: (company?.seal_url as string | undefined) || null,
        employeeName: String(user?.name || ''),
        employeeAddress: String(user?.address || ''),
        employeePhone: String(user?.phone || ''),
        contractDate: contractIssueDate };

    const handleNext = () => {
        if (step === 1) {
            if (privacyConsent === null) {
                return toast('제11조 개인정보의 수집·이용 동의 여부를 선택해 주세요.');
            }
            setStep(2);
        }
        else if (step === 2) {
            if (!allAgreed) return toast('모든 필수 항목에 동의해야 합니다.');
            setStep(3);
        } else if (step === 3) {
            if (!agreements['confidentiality']) return toast('비밀유지서약서 내용에 동의해야 합니다.');
            setStep(4);
        }
    };

    const handleClearSignature = () => {
        sigCanvas.current?.clear();
        setIsSigEmpty(true);
    };

    const handleClearReceipt = () => {
        receiptCanvas.current?.clear();
        setIsReceiptEmpty(true);
    };

    const openContractPrintPreview = (fullContractHTML: string, targetWindow?: Window | null) => {
        // 모바일 기기(PWA/웹뷰)에서는 window.print() 호출 시 앱이 튕기거나(크래시) 오작동할 수 있으므로 인쇄 미리보기를 생략합니다.
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
        if (isMobile) {
            if (targetWindow) {
                try { targetWindow.close(); } catch (_) {}
            }
            return;
        }

        try {
            const printWindow = targetWindow || window.open('', '_blank');
            const styles = `
                    /* A4 고정: 용지 밖으로 내용이 짤리지 않도록 페이지 크기·여백을 명시 */
                    @page { size: A4 portrait; margin: 8mm 10mm; }
                    *, *::before, *::after { box-sizing: border-box; }
                    html, body { margin: 0; padding: 0; }
                    body {
                        font-family: 'Noto Sans KR', sans-serif;
                        line-height: 1.6;
                        color: #1f2937;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        padding: 0 8mm;
                    }
                    body::before {
                        content: '';
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        border: 2px solid #1e2a4a;
                        pointer-events: none;
                        z-index: 100;
                    }
                    body::after {
                        content: '';
                        position: fixed;
                        top: 1.2mm;
                        left: 1.2mm;
                        right: 1.2mm;
                        bottom: 1.2mm;
                        border: 1px solid #c2a14d;
                        pointer-events: none;
                        z-index: 100;
                    }
                    img { max-width: 100%; height: auto; }
                    pre { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
                    /* 모든 콘텐츠를 인쇄 영역 폭 안으로 제한 → 우측 짤림 방지 */
                    .contract-wrapper { padding: 0; }
                    .contract-wrapper, .contract-wrapper * { max-width: 100%; }

                    /* 조항 스타일 컴팩트화 */
                    .shift-card-container {
                        margin-top: 6px !important;
                        margin-bottom: 6px !important;
                        padding-bottom: 0 !important;
                    }
                    .shift-card {
                        padding: 8px 12px !important;
                    }
                    .contract-article {
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }

                    /* 페이지마다 상·하 여백 확보 (관리자 미리보기와 동일한 표 header/footer 스페이서 방식) */
                    .contract-print-table { width: 100%; border-collapse: collapse; }
                    .contract-print-table > thead { display: table-header-group; }
                    .contract-print-table > tfoot { display: table-footer-group; }
                    .contract-print-spacer { height: 12mm; padding: 0; border: 0; }

                    @media print {
                        body { margin: 0; padding: 0 8mm; }
                        .contract-page, [style*="page-break-before: always"] {
                            page-break-before: always;
                        }
                        /* 첫 콘텐츠 앞 빈 페이지 방지 */
                        .contract-wrapper > :first-child { page-break-before: avoid; }
                    }
                `;

            const fullHtml = `<html><head><meta charset="utf-8" /><title>계약서_통합본_${user?.name}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Serif+KR:wght@300;400;700;900&display=swap" rel="stylesheet"><style>${styles}</style></head><body>${fullContractHTML}</body></html>`;

            if (!printWindow) {
                const iframe = document.createElement('iframe');
                iframe.setAttribute('aria-hidden', 'true');
                iframe.style.position = 'fixed';
                iframe.style.right = '0';
                iframe.style.bottom = '0';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = '0';
                iframe.style.opacity = '0';

                const cleanup = () => {
                    window.setTimeout(() => {
                        iframe.remove();
                    }, 1200);
                };

                iframe.onload = () => {
                    const frameWindow = iframe.contentWindow;
                    if (!frameWindow) {
                        cleanup();
                        toast('인쇄 미리보기를 여는 중 오류가 발생했습니다.', 'error');
                        return;
                    }
                    frameWindow.focus();
                    frameWindow.print();
                    cleanup();
                };

                iframe.srcdoc = fullHtml;
                document.body.appendChild(iframe);
                return;
            }

            printWindow.document.open();
            printWindow.document.write(fullHtml);
            printWindow.document.close();

            window.setTimeout(() => {
                try {
                    printWindow.print();
                    printWindow.close();
                } catch (error) {
                    console.warn('Contract print preview failed:', error);
                }
            }, 500);
        } catch (error) {
            console.warn('Contract print preview failed:', error);
        }
    };

    const handleSubmit = async () => {
        if (submitLockRef.current || isGenerating) return;
        if (isSigEmpty || sigCanvas.current?.isEmpty()) {
            return toast('서명을 완료해 주세요.', 'success');
        }
        if (isReceiptEmpty || receiptCanvas.current?.isEmpty()) {
            return toast("교부확인란에 '교부 받음'을 자필로 작성해 주세요.");
        }

        submitLockRef.current = true;
        setIsGenerating(true);
        try {
            // react-signature-canvas v1.1.0-alpha부터 getTrimmedCanvas 제거 → toDataURL 직접 호출
            const signatureData = sigCanvas.current?.toDataURL('image/png');
            if (!signatureData) {
                toast('서명을 다시 시도해 주세요.', 'error');
                return;
            }
            // 교부확인('교부 받음') 자필 — 최종 서명 단계에서 함께 작성되어 계약서에 삽입된다.
            const receiptTraceData = receiptCanvas.current?.toDataURL('image/png');
            if (!receiptTraceData) {
                toast("'교부 받음' 자필을 다시 시도해 주세요.", 'error');
                return;
            }

            // 1. 전체 통합 HTML 구성 (인쇄 및 저장용)
            // - 계약서 본문
            // - 동의 항목 리스트 (서명 포함)
            // - 비밀유지서약서 (서명 포함)
            const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });

            const agreementsSection = `
                <div style="page-break-before: always; padding: 40px; font-family: sans-serif;">
                    <h2 style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px;">주요 계약 조항 동의서</h2>
                    <div style="margin-top: 30px;">
                        ${REQUIRED_AGREEMENTS.map(item => `
                            <div style="margin-bottom: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                                <p style="font-weight: bold; margin: 0;">[동의] ${item.title}</p>
                                <p style="font-size: 12px; color: #666; margin: 5px 0 0 0;">${item.desc}</p>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top: 50px; text-align: right;">
                        <p style="font-weight: bold;">위 항목들에 대해 충분히 설명 듣고 동의함</p>
                        <div style="display: inline-block; vertical-align: middle;">
                            <span style="font-weight: bold; margin-right: 10px;">근로자: ${user?.name}</span>
                            <img src="${signatureData}" style="width: 100px; height: auto; border-bottom: 1px solid #000;" />
                        </div>
                        <p style="margin-top: 20px;">${today}</p>
                    </div>
                </div>
            `;

            // 비밀유지서약서 본문은 관리자 미리보기(React 컴포넌트)와 동일한 공유 소스 사용
            const confidentialitySection = buildConfidentialityPledgePrintHTML({
                companyName: company?.name || user?.company || '',
                employeeName: user?.name || '',
                contractDate: today,
                signatureDataUrl: signatureData });

            const { mainText: strippedTemplate } = stripContractClosingLines(localTemplateText);
            const bodyText = strippedTemplate || localTemplateText;
            const closingHTML = buildClosingPrintHTML({
                ...closingData,
                signatureDataUrl: signatureData,
                receiptTraceDataUrl: receiptTraceData });

            let resolvedBodyText = bodyText;
            if (privacyConsent !== null) {
                // 개인정보 동의 선택 결과를 본문에 체크표시(☑/□)로 반영한다.
                // 템플릿마다 '□ 동의' 와 '□ 동의하지 않음' 사이 공백 수가 달라도 매칭되도록 정규식 사용.
                const agreeMark = privacyConsent ? '☑' : '□';
                const declineMark = privacyConsent ? '□' : '☑';
                resolvedBodyText = resolvedBodyText.replace(
                    /□\s*동의\s+□\s*동의하지\s*않음/,
                    `${agreeMark} 동의    ${declineMark} 동의하지 않음`,
                );
            }

            const bodyHTML = buildContractBodyPrintHTML(resolvedBodyText);

            // 비밀유지서약서와 주요 조항 동의서는 각각 별도의 tr 행으로 분리하여 인쇄 시 뒷장으로 깔끔하게 넘어가도록 처리한다.
            const fullContractHTML = `
                <table class="contract-print-table" style="width:100%; border-collapse:collapse;">
                    <thead><tr><td class="contract-print-spacer"></td></tr></thead>
                    <tbody>
                      <tr>
                        <td style="padding:0; margin:0; border:0;">
                          <div class="contract-wrapper">
                            <div class="contract-page">
                                ${bodyHTML}
                                ${closingHTML}
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr style="page-break-before:always; break-before:page;">
                        <td style="padding:0; margin:0; border:0;">
                          <div class="contract-wrapper">
                            <div class="contract-page">
                                ${confidentialitySection}
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr style="page-break-before:always; break-before:page;">
                        <td style="padding:0; margin:0; border:0;">
                          <div class="contract-wrapper">
                            ${agreementsSection}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                    <tfoot><tr><td class="contract-print-spacer"></td></tr></tfoot>
                </table>
            `;

            await Promise.resolve(onSuccess(signatureData, fullContractHTML, receiptTraceData, privacyConsent));
            try {
                openContractPrintPreview(fullContractHTML);
            } catch (printError) {
                console.warn('Failed to open contract print preview:', printError);
            }
        } catch (error) {
            console.error(error);
            toast(error instanceof Error ? error.message : "서류 생성 중 오류가 발생했습니다.", 'error');
        } finally {
            submitLockRef.current = false;
            setIsGenerating(false);
        }
    };

    return (
        <div data-testid="contract-signature-modal" className="fixed inset-0 z-[200] flex items-center justify-center md:p-4 p-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[var(--card)] w-full h-[100dvh] md:h-auto md:max-h-[90vh] max-w-2xl md:border-2 md:border-[var(--border)] md:radius-toss-xl shadow-sm overflow-hidden flex flex-col">

                <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--tab-bg)] shrink-0">
                    <div>
                        <span className="px-2.5 py-1 text-[10px] font-bold text-blue-700 bg-blue-500/20 rounded-[var(--radius-md)] mb-1 inline-block">전자서명 진행 중</span>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">{contract?.contract_type || '표준근로계약서'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-[var(--toss-gray-4)] hover:text-red-500 transition-colors" aria-label="닫기">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div className="flex bg-[var(--tab-bg)] h-1.5 shrink-0">
                    <div className="bg-blue-600 transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }} />
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-4 custom-scrollbar bg-[var(--page-bg)]">

                    {step === 1 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="text-center mb-4">
                                <span className="text-4xl block mb-2">📄</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">계약서 내용을 꼼꼼히 확인해 주세요</h3>
                                <p className="text-xs text-[var(--toss-gray-4)] font-bold mt-1">하단으로 끝까지 스크롤하여 모든 내용을 확인해야 합니다.</p>
                            </div>

                            <div className="bg-[var(--card)] p-4 md:p-5 border border-[var(--border)] max-h-[55vh] overflow-y-auto custom-scrollbar shadow-inner rounded-2xl" style={{ fontFamily: 'Noto Sans KR, sans-serif' }}>
                                {isTemplateLoading ? (
                                    <div className="min-h-[280px] flex flex-col items-center justify-center gap-3 text-center">
                                        <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                                        <p className="text-[13px] font-bold text-[var(--foreground)]">계약서 내용을 불러오는 중입니다.</p>
                                        <p className="text-[11px] text-[var(--toss-gray-4)]">잠시만 기다려 주세요.</p>
                                    </div>
                                ) : (
                                    <>
                                        <ContractBodyBlock
                                            templateText={localTemplateText}
                                            privacyConsent={privacyConsent}
                                            onPrivacyConsentChange={setPrivacyConsent}
                                            isInteractive={true}
                                        />
                                        <ContractClosingBlock {...closingData} />
                                    </>
                                )}
                            </div>

                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="text-center mb-4">
                                <span className="text-3xl block mb-2">✅</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">주요 계약 조항 확인 및 동의</h3>
                            </div>

                            <div className="space-y-2.5">
                                {REQUIRED_AGREEMENTS.map((item) => (
                                    <label
                                        key={item.id}
                                        className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${agreements[item.id]
                                            ? 'bg-blue-500/10 border-blue-500 shadow-sm'
                                            : 'bg-[var(--card)] border-[var(--border-subtle)] hover:border-[var(--border)]'
                                            }`}
                                    >
                                        <div className="pt-0.5">
                                            <input
                                                data-testid={`contract-agreement-${item.id}`}
                                                type="checkbox"
                                                checked={!!agreements[item.id]}
                                                onChange={(e) => setAgreements({ ...agreements, [item.id]: e.target.checked })}
                                                className="w-4 h-4 rounded border-[var(--border)] text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <p className={`text-[12px] font-black ${agreements[item.id] ? 'text-blue-700' : 'text-[var(--foreground)]'}`}>
                                                {item.title}
                                            </p>
                                            <p className="text-[10px] font-medium text-[var(--toss-gray-4)] mt-0.5 leading-relaxed">
                                                {item.desc}
                                            </p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="text-center mb-4">
                                <span className="text-3xl block mb-2">📜</span>
                                <h2 className="text-lg font-black tracking-widest underline underline-offset-4">비 밀 유 지 서 약 서</h2>
                            </div>

                            <div className="bg-[var(--tab-bg)] border border-[var(--border)] p-4 rounded-xl font-serif text-[11px] leading-[1.8] text-[var(--foreground)] overflow-y-auto max-h-[300px] custom-scrollbar">
                                <p className="mb-4 font-bold">
                                    {CONFIDENTIALITY_PLEDGE_INTRO_PREFIX}
                                    <span className="font-bold text-[var(--foreground)]">{String(company?.name || user?.company || '회사')}</span>
                                    {CONFIDENTIALITY_PLEDGE_INTRO_SUFFIX}
                                </p>
                                <div className="space-y-4">
                                    {CONFIDENTIALITY_PLEDGE_CLAUSES.map((clause, idx) => (
                                        <div key={idx} className="space-y-1">
                                            <p className="font-bold text-[12px] text-[var(--foreground)]">{clause.title}</p>
                                            <p className="text-[var(--toss-gray-5)] pl-2.5 border-l-2 border-[var(--border-subtle)] leading-relaxed">{clause.body}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <label className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors">
                                <input data-testid="contract-confidentiality-checkbox" type="checkbox" checked={agreements['confidentiality'] || false} onChange={e => setAgreements({ ...agreements, confidentiality: e.target.checked })} className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
                                <span className="text-[12px] font-black text-emerald-800">{CONFIDENTIALITY_PLEDGE_AFFIRMATION}</span>
                            </label>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="text-center mb-2">
                                <span className="text-3xl block mb-2">✍️</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">최종 전자서명</h3>
                                <p className="text-[10px] text-[var(--toss-gray-4)] font-bold mt-1">서명과 교부확인을 모두 자필로 작성해 주세요.</p>
                            </div>

                            {/* 전자서명 */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-black text-[var(--foreground)]">전자서명 <span className="text-[var(--toss-gray-4)] font-bold">(성함을 정자로)</span></span>
                                    <button type="button" onClick={handleClearSignature} className="text-[11px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] transition-colors">
                                        다시 쓰기
                                    </button>
                                </div>
                                <div ref={sigContainerRef} data-testid="contract-signature-canvas" className="bg-[var(--card)] border-2 border-[var(--accent)] rounded-2xl p-2 relative shadow-inner overflow-hidden h-[180px]">
                                    <SignatureCanvas
                                        ref={sigCanvas}
                                        penColor="#1e293b"
                                        canvasProps={{
                                            width: sigWidth,
                                            height: sigHeight,
                                            className: "w-full h-full cursor-crosshair",
                                            style: { touchAction: 'none', display: 'block' }
                                        }}
                                        onEnd={() => setIsSigEmpty(false)}
                                    />
                                    {isSigEmpty && (
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center flex-col opacity-20 text-[var(--toss-gray-3)] gap-1">
                                            <span className="text-[10px] font-black tracking-[.2em] uppercase">Sign Here</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 교부확인 자필 — 계약서 교부확인란에 삽입됨 */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-black text-[var(--foreground)]">교부확인 <span className="text-[var(--toss-gray-4)] font-bold">(‘교부 받음’ 자필 기재)</span></span>
                                    <button type="button" onClick={handleClearReceipt} className="text-[11px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] transition-colors">
                                        다시 쓰기
                                    </button>
                                </div>
                                <div ref={receiptContainerRef} data-testid="contract-receipt-canvas" className="bg-[var(--card)] border-2 border-emerald-400 rounded-2xl p-2 relative shadow-inner overflow-hidden h-[120px]">
                                    <SignatureCanvas
                                        ref={receiptCanvas}
                                        penColor="#1e293b"
                                        canvasProps={{
                                            width: receiptWidth,
                                            height: receiptHeight,
                                            className: "w-full h-full cursor-crosshair",
                                            style: { touchAction: 'none', display: 'block' }
                                        }}
                                        onEnd={() => setIsReceiptEmpty(false)}
                                    />
                                    {isReceiptEmpty && (
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20 text-[var(--toss-gray-3)]">
                                            <span className="text-[15px] font-black tracking-[0.3em]">교부 받음</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-blue-500/10 p-4 rounded-xl text-[10px] font-bold text-blue-600 text-center">
                                이 전자 서명은 인감 날인과 동일한 법적 효력을 가집니다.
                            </div>
                        </div>
                    )}

                </div>

                <div className="p-4 md:p-4 border-t border-[var(--border)] bg-[var(--card)] flex gap-3 shrink-0">
                    {step > 1 && (
                        <button data-testid="contract-signature-prev-button" onClick={() => setStep(s => s - 1)} className="px-5 py-3.5 rounded-xl bg-[var(--tab-bg)] text-[var(--toss-gray-4)] font-bold text-[12px] hover:bg-[var(--tab-bg)]">
                            이전
                        </button>
                    )}

                    {step < 4 ? (
                        <button
                            data-testid="contract-signature-next-button"
                            onClick={handleNext}
                            disabled={step === 1 && (!isTemplateReady || isTemplateLoading)}
                            className={`flex-1 px-5 py-3.5 rounded-xl text-white font-black text-[13px] shadow-md transition-all flex items-center justify-center gap-2 ${step === 1 && (!isTemplateReady || isTemplateLoading)
                                ? 'bg-[var(--border)] cursor-not-allowed opacity-60'
                                : 'bg-[var(--accent)] hover:bg-blue-600'
                                }`}
                        >
                            확인 및 다음 단계 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    ) : (
                        <button data-testid="contract-signature-submit-button" onClick={handleSubmit} disabled={isSigEmpty || isReceiptEmpty || isGenerating} className={`flex-1 px-5 py-3.5 rounded-xl text-white font-black text-[13px] shadow-sm transition-all flex items-center justify-center gap-2 ${isSigEmpty || isReceiptEmpty || isGenerating ? 'bg-[var(--border)] cursor-not-allowed opacity-60' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'}`}>
                            {isGenerating ? '서류 생성 중...' : '최종 서명 및 저장'}
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}

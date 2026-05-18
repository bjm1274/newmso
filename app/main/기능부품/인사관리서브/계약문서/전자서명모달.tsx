'use client';
import { toast } from '@/lib/toast';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SignatureCanvas from 'react-signature-canvas';
import { upgradeLegacyContractTemplate } from '@/lib/contract-template-defaults';
import { fillEmploymentContractTemplate } from '@/lib/contract-template-render';
import {
    buildClosingPrintHTML,
    stripContractClosingLines,
    type ContractClosingData,
} from '@/lib/contract-template-closing';
import ContractClosingBlock from './계약서마무리블록';
import {
    getShiftBandGroupRows,
    getWeeklyRotationShiftIds,
    isShiftBandGroupRow,
    orderShiftsByIds,
    withWeeklyRotationShifts,
} from '@/lib/contract-shift-rotation';

type Props = {
    contract: any;
    user: any;
    templateText?: string;
    onClose: () => void;
    onSuccess: (signatureData: string, contractText: string) => Promise<void> | void;
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
    const [agreements, setAgreements] = useState<Record<string, boolean>>({});
    const sigCanvas = useRef<SignatureCanvas>(null);
    const submitLockRef = useRef(false);
    const [isSigEmpty, setIsSigEmpty] = useState(true);
    const [company, setCompany] = useState<Record<string, unknown> | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

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
                    const { data: shiftRows } = await supabase
                        .from('work_shifts')
                        .select('*')
                        .in('id', shiftIds);
                    let orderedShiftRows = orderShiftsByIds(shiftRows, shiftIds);
                    if (orderedShiftRows.length === 1 && isShiftBandGroupRow(orderedShiftRows[0])) {
                        const seedShift = orderedShiftRows[0];
                        const seedCompanyName = String(seedShift.company_name || seedShift.company || '');
                        const seedShiftType = String(seedShift.shift_type || '');
                        let siblingQuery = supabase
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
                    const { data: companyRow } = await supabase
                        .from('companies')
                        .select('*')
                        .eq('name', targetCompany)
                        .maybeSingle();
                    companyData = companyRow;
                }

                if (!hasTemplateOverride) {
                    const { data: companyTemplateRow } = await supabase
                        .from('contract_templates')
                        .select('template_content, seal_url')
                        .eq('company_name', targetCompany)
                        .maybeSingle();

                    resolvedTemplateText = companyTemplateRow?.template_content || '';
                    sealUrl = companyTemplateRow?.seal_url || null;

                    if (!resolvedTemplateText && targetCompany !== '전체') {
                        const { data: fallbackTemplateRow } = await supabase
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
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
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
        contractDate: contractIssueDate,
    };

    const handleNext = () => {
        if (step === 1) setStep(2);
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

    const openContractPrintPreview = (fullContractHTML: string) => {
        try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) return;

            const styles = `
                    @media print {
                        body { margin: 0; padding: 0; }
                        .contract-page, [style*="page-break-before: always"] { 
                            page-break-before: always; 
                        }
                    }
                    body { font-family: 'Noto Sans KR', sans-serif; line-height: 1.6; }
                    img { max-width: 100%; height: auto; }
                    .contract-wrapper { padding: 20px; }
                `;

            printWindow.document.write(`<html><head><meta charset="utf-8" /><title>계약서_통합본_${user?.name}</title><style>${styles}</style></head><body>${fullContractHTML}</body></html>`);
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

        submitLockRef.current = true;
        setIsGenerating(true);
        try {
            // react-signature-canvas v1.1.0-alpha부터 getTrimmedCanvas 제거 → toDataURL 직접 호출
            const signatureData = sigCanvas.current?.toDataURL('image/png');
            if (!signatureData) {
                toast('서명을 다시 시도해 주세요.', 'error');
                return;
            }

            // 1. 전체 통합 HTML 구성 (인쇄 및 저장용)
            // - 계약서 본문
            // - 동의 항목 리스트 (서명 포함)
            // - 비밀유지서약서 (서명 포함)
            const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

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

            const confidentialitySection = `
                <div style="page-break-before: always; padding: 40px; font-family: serif;">
                    <h2 style="text-align: center; text-decoration: underline; letter-spacing: 5px;">비 밀 유 지 서 약 서</h2>
                    <p style="margin-top: 30px; line-height: 1.8;">본인(이하 '서약자')은 ${company?.name || user?.company}(이하 '회사')에 근무함에 있어 다음과 같이 서약합니다...</p>
                    <div style="margin-top: 20px; font-size: 13px; line-height: 1.6;">
                        <p><b>제1조 [비밀유지의 범위]</b> 환자 정보, 경영 전략, 의료 프로세스, 인사 정보 등</p>
                        <p><b>제2조 [비밀유지의 의무]</b> 사전 승인 없이 제3자 유출 금지</p>
                        <p><b>제3조 [비밀유지 기간]</b> 퇴직 후 3년 동안 효력 유지</p>
                    </div>
                    <div style="margin-top: 60px; border-top: 1px dotted #ccc; pt: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px;">
                            <div style="text-align: left;">
                                <p style="font-size: 10px; color: #999; margin: 0;">[서약자]</p>
                                <p style="font-weight: bold; font-size: 16px; margin: 5px 0;">${user?.name} (인)</p>
                                <img src="${signatureData}" style="width: 120px; height: auto;" />
                            </div>
                            <div style="text-align: right;">
                                <p style="font-weight: bold;">${today}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const { mainText: strippedTemplate } = stripContractClosingLines(localTemplateText);
            const bodyText = strippedTemplate || localTemplateText;
            const closingHTML = buildClosingPrintHTML({
                ...closingData,
                signatureDataUrl: signatureData,
            });

            const fullContractHTML = `
                <div class="contract-wrapper">
                    <div class="contract-page">
                        <pre style="white-space:pre-wrap;font-family:'Noto Sans KR', sans-serif;font-size:13px;line-height:1.75;margin:0;color:#1f2937;">${bodyText}</pre>
                        ${closingHTML}
                    </div>
                    ${agreementsSection}
                    ${confidentialitySection}
                </div>
            `;

            await Promise.resolve(onSuccess(signatureData, fullContractHTML));
            openContractPrintPreview(fullContractHTML);
        } catch (error) {
            console.error(error);
            toast(error instanceof Error ? error.message : "서류 생성 중 오류가 발생했습니다.", 'error');
        } finally {
            submitLockRef.current = false;
            setIsGenerating(false);
        }
    };

    return (
        <div data-testid="contract-signature-modal" className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[var(--card)] w-full max-w-2xl border-2 border-[var(--border)] radius-toss-xl shadow-sm overflow-hidden flex flex-col max-h-[90vh]">

                <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--tab-bg)] shrink-0">
                    <div>
                        <span className="px-2.5 py-1 text-[10px] font-bold text-blue-700 bg-blue-500/20 rounded-[var(--radius-md)] mb-1 inline-block">전자서명 진행 중</span>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">{contract?.contract_type || '표준근로계약서'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--toss-gray-4)] hover:text-red-500 transition-colors">✕</button>
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
                                ) : (() => {
                                    const stripped = stripContractClosingLines(localTemplateText);
                                    let raw = stripped.mainText || localTemplateText;
                                    if (!raw.trim()) {
                                        return (
                                            <div className="min-h-[280px] flex items-center justify-center text-center">
                                                <p className="text-[13px] font-semibold text-[var(--toss-gray-4)]">
                                                    표시할 계약서 내용을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.
                                                </p>
                                            </div>
                                        );
                                    }
                                    // ASCII 표 장식 제거 (단, 임금 구성항목 등 주요 라벨은 보존)
                                    raw = raw.replace(/[┌┬┐├┼┤└┴┘─│]+/g, '');

                                    // 제목 줄 및 기본정보 블록은 이미 상단에 표시되거나 본문에 포함됨
                                    // 조 단위 파싱
                                    const sectionRe = /제(\d+)조\s*\[([^\]]+)\]/g;
                                    const matches: { index: number; full: string; num: string; title: string }[] = [];
                                    let mm;
                                    while ((mm = sectionRe.exec(raw)) !== null) {
                                        matches.push({ index: mm.index, full: mm[0], num: mm[1], title: mm[2] });
                                    }

                                    if (matches.length === 0) {
                                        return (
                                            <>
                                                <p className="text-[14px] text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">{raw}</p>
                                                <ContractClosingBlock {...closingData} />
                                            </>
                                        );
                                    }

                                    const sectionNodes = matches.map((sec, si) => {
                                        const start = sec.index + sec.full.length;
                                        const end = si + 1 < matches.length ? matches[si + 1].index : raw.length;
                                        const body = raw.slice(start, end).replace(/─+/g, '').trim();
                                        const lines = body.split('\n').filter(l => l.trim());

                                        return (
                                            <div key={si} className="mb-4 last:mb-0">
                                                <h4 className="text-[15px] font-black text-[var(--foreground)] mb-3 flex items-center gap-2.5">
                                                    <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0" />
                                                    제{sec.num}조 [{sec.title}]
                                                </h4>
                                                <div className="pl-4 border-l-2 border-[var(--border-subtle)] space-y-2">
                                                    {lines.map((line, li) => {
                                                        const t = line.trim();
                                                        if (t.startsWith('[') && t.endsWith(']')) {
                                                            return <div key={li} className="mt-4 mb-2"><span className="inline-block text-[12px] font-black text-blue-700 bg-blue-500/10 px-2.5 py-1 rounded-md">{t.replace(/[\[\]]/g, '')}</span></div>;
                                                        }
                                                        if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) {
                                                            return (
                                                                <div key={li} className="flex gap-2 mt-1">
                                                                    <span className="text-blue-600 font-black text-[13px] shrink-0">{t[0]}</span>
                                                                    <span className="text-[13.5px] text-[var(--toss-gray-5)] leading-[1.8]">{t.slice(1).trim()}</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (t.startsWith('-') || t.startsWith('·') || t.startsWith('•')) {
                                                            return (
                                                                <div key={li} className="flex gap-2 pl-5 mt-0.5">
                                                                    <span className="text-[var(--toss-gray-3)] shrink-0">•</span>
                                                                    <span className="text-[13px] text-[var(--toss-gray-4)] leading-[1.8]">{t.replace(/^[-·•]\s*/, '')}</span>
                                                                </div>
                                                            );
                                                        }
                                                        // 급여 항목 테이블 스타일 대안 (그리드 레이아웃)
                                                        if (/^(기본급|식대|직책수당|기타수당|비과세)\s+/.test(t)) {
                                                            const parts = t.split(/\s{2,}/);
                                                            return (
                                                                <div key={li} className="flex justify-between py-1.5 border-b border-slate-50 px-1 hover:bg-[var(--tab-bg)] transition-colors">
                                                                    <span className="text-[13px] font-semibold text-[var(--toss-gray-4)]">{parts[0]}</span>
                                                                    <span className="text-[13px] font-black text-[var(--foreground)]">{parts[1] || ''}</span>
                                                                </div>
                                                            );
                                                        }
                                                        return <p key={li} className="text-[13.5px] text-[var(--toss-gray-5)] leading-[1.8]">{t}</p>;
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    });

                                    return (
                                        <>
                                            {sectionNodes}
                                            <ContractClosingBlock {...closingData} />
                                        </>
                                    );
                                })()}
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
                                <p className="mb-4 font-bold">본인은 회사의 영업비밀을 보호하고 정당한 권익을 지킬 것을 서약합니다.</p>
                                <div className="space-y-4">
                                    <p><b>1. 비밀유지 범위:</b> 환자정보, 경영 전략, 기술 노하우 등</p>
                                    <p><b>2. 위반 시 조치:</b> 민형사상 책임 및 손해 배상 의무 부담</p>
                                </div>
                            </div>

                            <label className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors">
                                <input data-testid="contract-confidentiality-checkbox" type="checkbox" checked={agreements['confidentiality'] || false} onChange={e => setAgreements({ ...agreements, confidentiality: e.target.checked })} className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
                                <span className="text-[12px] font-black text-emerald-800">비밀유지 내용을 이해하였으며 이에 서약합니다.</span>
                            </label>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="text-center mb-4">
                                <span className="text-3xl block mb-2">✍️</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">최종 전자서명</h3>
                                <p className="text-[10px] text-[var(--toss-gray-4)] font-bold mt-1">본인의 성함을 정자로 기재해 주세요.</p>
                            </div>

                            <div data-testid="contract-signature-canvas" className="bg-[var(--card)] border-2 border-[var(--accent)] rounded-2xl p-2 relative shadow-inner overflow-hidden">
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    penColor="#1e293b"
                                    canvasProps={{ className: "w-full h-[200px] cursor-crosshair touch-none" }}
                                    onEnd={() => setIsSigEmpty(false)}
                                />
                                {isSigEmpty && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center flex-col opacity-20 text-[var(--toss-gray-3)] gap-1">
                                        <span className="text-[10px] font-black tracking-[.2em] uppercase">Sign Here</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-start">
                                <button type="button" onClick={handleClearSignature} className="text-[11px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] transition-colors">
                                    다시 쓰기
                                </button>
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
                        <button data-testid="contract-signature-submit-button" onClick={handleSubmit} disabled={isSigEmpty || isGenerating} className={`flex-1 px-5 py-3.5 rounded-xl text-white font-black text-[13px] shadow-sm transition-all flex items-center justify-center gap-2 ${isSigEmpty || isGenerating ? 'bg-[var(--border)] cursor-not-allowed opacity-60' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'}`}>
                            {isGenerating ? '서류 생성 중...' : '최종 서명 및 저장'}
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}

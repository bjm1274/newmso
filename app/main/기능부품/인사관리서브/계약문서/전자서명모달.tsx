'use client';
import { toast } from '@/lib/toast';
import { useState, useRef, useEffect, useMemo } from 'react';
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
    const [privacyConsent, setPrivacyConsent] = useState<boolean | null>(null);
    const [agreements, setAgreements] = useState<Record<string, boolean>>({});
    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [receiptTraceDataUrl, setReceiptTraceDataUrl] = useState<string | null>(null);
    const [activePadModal, setActivePadModal] = useState<'signature' | 'receipt' | null>(null);
    const sigCanvas = useRef<SignatureCanvas>(null);
    const receiptCanvas = useRef<SignatureCanvas>(null);
    const [isPadEmpty, setIsPadEmpty] = useState(true);
    const submitLockRef = useRef(false);
    const [company, setCompany] = useState<Record<string, unknown> | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const padContainerRef = useRef<HTMLDivElement>(null);
    const [padWidth, setPadWidth] = useState(380);
    const [padHeight, setPadHeight] = useState(200);

    useEffect(() => {
        if (!activePadModal) return;
        const measure = () => {
            if (!padContainerRef.current) return;
            const rect = padContainerRef.current.getBoundingClientRect();
            const w = Math.floor(rect.width || padContainerRef.current.clientWidth);
            const h = Math.floor(rect.height || padContainerRef.current.clientHeight);
            if (w > 0 && h > 0) {
                setPadWidth(Math.max(260, w));
                setPadHeight(Math.max(140, h));
            }
        };
        measure();
        const t1 = setTimeout(measure, 60);
        const t2 = setTimeout(measure, 180);
        window.addEventListener('resize', measure);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            window.removeEventListener('resize', measure);
        };
    }, [activePadModal]);

    const [localTemplateText, setLocalTemplateText] = useState<string>('');
    const [isTemplateLoading, setIsTemplateLoading] = useState(false);
    const hasTemplateOverride = templateText !== undefined;

    useEffect(() => {
        let isMounted = true;
        const buildResolvedTemplateText = async (rawTemplateText: string, shiftData: Record<string, unknown> | null, companyData: Record<string, unknown> | null, sealUrl: string | null) => {
            const nextCompany = companyData || sealUrl ? { ...(companyData ?? {}), ...(sealUrl ? { seal_url: sealUrl } : {}) } : null;
            return fillEmploymentContractTemplate(upgradeLegacyContractTemplate(rawTemplateText), user, contract, shiftData, nextCompany);
        };

        const fetchTemplateAndCompany = async () => {
            if (!contract || !user) {
                setLocalTemplateText('');
                setCompany(null);
                return;
            }
            setIsTemplateLoading(true);
            try {
                const targetCompany = String(user?.company || contract?.company_name || '전체');
                let companyData: Record<string, unknown> | null = null;
                let sealUrl: string | null = null;
                let shiftData: Record<string, unknown> | null = null;
                let resolvedTemplateText = hasTemplateOverride ? (templateText || '') : '';
                const shiftIds = getWeeklyRotationShiftIds(user, contract?.shift_id ?? user?.shift_id);
                if (shiftIds.length > 0) {
                    const { data: shiftRows } = await db.from('work_shifts').select('*').in('id', shiftIds);
                    let orderedShiftRows = orderShiftsByIds(shiftRows, shiftIds);
                    if (orderedShiftRows.length === 1 && isShiftBandGroupRow(orderedShiftRows[0])) {
                        const seedShift = orderedShiftRows[0];
                        const seedCompanyName = String(seedShift.company_name || seedShift.company || '');
                        const seedShiftType = String(seedShift.shift_type || '');
                        let siblingQuery = db.from('work_shifts').select('*').eq('is_active', true);
                        if (seedCompanyName) siblingQuery = siblingQuery.eq('company_name', seedCompanyName);
                        if (seedShiftType) siblingQuery = siblingQuery.eq('shift_type', seedShiftType);
                        const { data: siblingRows } = await siblingQuery;
                        const groupedRows = getShiftBandGroupRows(seedShift, siblingRows);
                        if (groupedRows.length > 1) orderedShiftRows = groupedRows;
                    }
                    shiftData = withWeeklyRotationShifts(orderedShiftRows);
                }
                if (targetCompany && targetCompany !== '전체') {
                    const { data: companyRow } = await db.from('companies').select('*').eq('name', targetCompany).maybeSingle();
                    companyData = companyRow;
                }
                if (!hasTemplateOverride) {
                    const { data: companyTemplateRow } = await db.from('contract_templates').select('template_content, seal_url').eq('company_name', targetCompany).maybeSingle();
                    resolvedTemplateText = companyTemplateRow?.template_content || '';
                    sealUrl = companyTemplateRow?.seal_url || null;
                    if (!resolvedTemplateText && targetCompany !== '전체') {
                        const { data: fallbackTemplateRow } = await db.from('contract_templates').select('template_content, seal_url').eq('company_name', '전체').maybeSingle();
                        resolvedTemplateText = fallbackTemplateRow?.template_content || '';
                        sealUrl = sealUrl || fallbackTemplateRow?.seal_url || null;
                    }
                }
                const nextCompany = companyData || sealUrl ? { ...(companyData ?? {}), ...(sealUrl ? { seal_url: sealUrl } : {}) } : null;
                const result = await buildResolvedTemplateText(resolvedTemplateText, shiftData, companyData, sealUrl);
                if (!isMounted) return;
                setCompany(nextCompany);
                setLocalTemplateText(result);
            } catch (err) {
                console.warn('Error applying template for modal:', err);
                if (!isMounted) return;
                setCompany(null);
                setLocalTemplateText('');
            } finally {
                if (isMounted) setIsTemplateLoading(false);
            }
        };
        void fetchTemplateAndCompany();
        return () => { isMounted = false; };
    }, [contract?.id, contract?.shift_id, contract?.company_name, contract?.contract_type, contract?.requested_at, contract?.sent_at, contract?.issued_at, contract?.created_at, user?.id, user?.name, user?.company, user?.shift_id, user?.address, user?.phone, templateText, hasTemplateOverride]);

    const agreedCount = useMemo(() => REQUIRED_AGREEMENTS.filter(item => Boolean(agreements[item.id])).length, [agreements]);
    const allAgreed = agreedCount === REQUIRED_AGREEMENTS.length;
    const isPrivacyValid = privacyConsent !== null;
    const isSignatureDone = Boolean(signatureDataUrl);
    const isReceiptDone = Boolean(receiptTraceDataUrl);
    const isAllReadyToSubmit = allAgreed && isPrivacyValid && isSignatureDone && isReceiptDone;

    const handleToggleAllAgreements = () => {
        if (allAgreed) setAgreements({});
        else {
            const next: Record<string, boolean> = {};
            REQUIRED_AGREEMENTS.forEach(item => { next[item.id] = true; });
            setAgreements(next);
        }
    };

    const formatKoreanDate = (input: unknown): string => {
        if (!input) return '';
        const date = input instanceof Date ? input : new Date(String(input));
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
    };

    const contractIssueDate = formatKoreanDate(contract?.requested_at ?? contract?.sent_at ?? contract?.issued_at ?? contract?.created_at) || formatKoreanDate(new Date());
    const closingData: ContractClosingData = {
        companyName: String((company?.name as string | undefined) || user?.company || contract?.company_name || ''),
        companyAddress: String((company?.address as string | undefined) || ''),
        companyCeo: String((company?.ceo_name as string | undefined) || (company?.representative_name as string | undefined) || ''),
        companyPhone: String((company?.phone as string | undefined) || ''),
        companyBusinessNo: String((company?.business_no as string | undefined) || (company?.business_number as string | undefined) || ''),
        sealUrl: (company?.seal_url as string | undefined) || null,
        employeeName: String(user?.name || ''),
        employeeAddress: String(user?.address || ''),
        employeePhone: String(user?.phone || ''),
        contractDate: contractIssueDate
    };

    const openContractPrintPreview = (fullContractHTML: string) => {
        try {
            const printWindow = window.open('', '_blank');
            const styles = `
                @page { size: A4; margin: 12mm 14mm 14mm 14mm; }
                * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                html, body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Pretendard, -apple-system, 'Noto Sans KR', sans-serif; font-size: 11pt; line-height: 1.6; }
                body::before { content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0; border: 2px solid #1e2a4a; pointer-events: none; z-index: 100; }
                body::after { content: ''; position: fixed; top: 1.2mm; left: 1.2mm; right: 1.2mm; bottom: 1.2mm; border: 1px solid #c2a14d; pointer-events: none; z-index: 100; }
                img { max-width: 100%; height: auto; }
                pre { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
                .contract-wrapper { padding: 0; }
                .contract-wrapper, .contract-wrapper * { max-width: 100%; }
                .contract-article { break-inside: avoid; page-break-inside: avoid; }
                .contract-print-table { width: 100%; border-collapse: collapse; }
                .contract-print-table > thead { display: table-header-group; }
                .contract-print-table > tfoot { display: table-footer-group; }
                .contract-print-spacer { height: 12mm; padding: 0; border: 0; }
                @media print { body { margin: 0; padding: 0 8mm; } .contract-page, [style*="page-break-before: always"] { page-break-before: always; } .contract-wrapper > :first-child { page-break-before: avoid; } }
            `;
            const fullHtml = `<html><head><meta charset="utf-8" /><title>계약서_통합본_${user?.name}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Serif+KR:wght@300;400;700;900&display=swap" rel="stylesheet"><style>${styles}</style></head><body>${fullContractHTML}</body></html>`;
            if (!printWindow) {
                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; iframe.style.opacity = '0';
                const cleanup = () => { window.setTimeout(() => { iframe.remove(); }, 1200); };
                iframe.onload = () => { const frameWindow = iframe.contentWindow; if (!frameWindow) { cleanup(); toast('인쇄 미리보기 오류', 'error'); return; } frameWindow.focus(); frameWindow.print(); cleanup(); };
                iframe.srcdoc = fullHtml; document.body.appendChild(iframe); return;
            }
            printWindow.document.open(); printWindow.document.write(fullHtml); printWindow.document.close();
            window.setTimeout(() => { try { printWindow.print(); printWindow.close(); } catch (e) { console.warn(e); } }, 500);
        } catch (e) { console.warn(e); }
    };

    const handleApplySignaturePad = () => {
        if (!sigCanvas.current || sigCanvas.current.isEmpty()) { toast('서명을 입력해 주세요.', 'warning'); return; }
        setSignatureDataUrl(sigCanvas.current.toDataURL('image/png'));
        setActivePadModal(null);
        toast('근로자 서명이 등록되었습니다.', 'success');
    };

    const handleApplyReceiptPad = () => {
        if (!receiptCanvas.current || receiptCanvas.current.isEmpty()) { toast("'교부 받음'을 자필로 작성해 주세요.", 'warning'); return; }
        setReceiptTraceDataUrl(receiptCanvas.current.toDataURL('image/png'));
        setActivePadModal(null);
        toast('교부확인 자필이 등록되었습니다.', 'success');
    };

    const handleSubmit = async () => {
        if (submitLockRef.current || isGenerating) return;
        if (!isPrivacyValid || !allAgreed || !signatureDataUrl || !receiptTraceDataUrl) return toast('모든 필수 항목을 완료해 주세요.', 'warning');
        submitLockRef.current = true; setIsGenerating(true);
        try {
            const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
            const agreementsSection = `
                <div style="page-break-before: always; padding: 40px; font-family: sans-serif;">
                    <h2 style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px;">주요 계약 조항 동의서</h2>
                    <div style="margin-top: 30px;">
                        ${REQUIRED_AGREEMENTS.map(item => `<div style="margin-bottom: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 8px;"><p style="font-weight: bold; margin: 0;">[동의] ${item.title}</p><p style="font-size: 12px; color: #666; margin: 5px 0 0 0;">${item.desc}</p></div>`).join('')}
                    </div>
                    <div style="margin-top: 50px; text-align: right;"><p style="font-weight: bold;">위 항목들에 대해 충분히 설명 듣고 동의함</p>
                        <div style="display: inline-block; vertical-align: middle;"><span style="font-weight: bold; margin-right: 10px;">근로자: ${user?.name}</span><img src="${signatureDataUrl}" style="width: 100px; height: auto; border-bottom: 1px solid #000;" /></div>
                        <p style="margin-top: 20px;">${today}</p>
                    </div>
                </div>`;
            const confidentialitySection = buildConfidentialityPledgePrintHTML({ companyName: company?.name || user?.company || '', employeeName: user?.name || '', contractDate: today, signatureDataUrl: signatureDataUrl });
            const { mainText: strippedTemplate } = stripContractClosingLines(localTemplateText);
            const bodyText = strippedTemplate || localTemplateText;
            const closingHTML = buildClosingPrintHTML({ ...closingData, signatureDataUrl: signatureDataUrl, receiptTraceDataUrl: receiptTraceDataUrl });
            let resolvedBodyText = bodyText;
            if (privacyConsent !== null) {
                resolvedBodyText = resolvedBodyText.replace(/□\s*동의\s+□\s*동의하지\s*않음/, `${privacyConsent ? '☑' : '□'} 동의    ${privacyConsent ? '□' : '☑'} 동의하지 않음`);
            }
            const bodyHTML = buildContractBodyPrintHTML(resolvedBodyText);
            const fullContractHTML = `<table class="contract-print-table" style="width:100%; border-collapse:collapse;"><thead><tr><td class="contract-print-spacer"></td></tr></thead><tbody><tr><td style="padding:0; margin:0; border:0;"><div class="contract-wrapper"><div class="contract-page">${bodyHTML}${closingHTML}</div></div></td></tr><tr style="page-break-before:always; break-before:page;"><td style="padding:0; margin:0; border:0;"><div class="contract-wrapper"><div class="contract-page">${confidentialitySection}</div></div></td></tr><tr style="page-break-before:always; break-before:page;"><td style="padding:0; margin:0; border:0;"><div class="contract-wrapper">${agreementsSection}</div></td></tr></tbody><tfoot><tr><td class="contract-print-spacer"></td></tr></tfoot></table>`;
            await Promise.resolve(onSuccess(signatureDataUrl, fullContractHTML, receiptTraceDataUrl, privacyConsent));
            openContractPrintPreview(fullContractHTML);
        } catch (e) { console.error(e); toast('서류 생성 중 오류가 발생했습니다.', 'error'); } finally { submitLockRef.current = false; setIsGenerating(false); }
    };

    return (
        <div data-testid="contract-signature-modal" className="fixed inset-0 z-[1200] flex items-center justify-center md:p-4 p-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 font-sans">
            <div className="bg-slate-50 w-full h-[100dvh] md:h-[92vh] max-w-3xl md:border md:border-slate-300 md:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0" style={{ paddingTop: 12 }}>
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2 mb-1"><span className="px-2.5 py-0.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full inline-block">전자계약 체결</span><span className="text-[11.5px] font-medium text-slate-500">{isAllReadyToSubmit ? '✅ 모든 필수 입력 완료' : '필수 서명 및 동의를 진행해 주세요'}</span></div>
                        <h2 className="text-[17px] md:text-[19px] font-extrabold tracking-tight text-slate-900 truncate">{contract?.contract_type || '근로계약서'}</h2>
                    </div>
                    <button onClick={() => { if (!isGenerating) toast('서명을 완료해야 계약이 확정됩니다.', 'info'); onClose(); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer" aria-label="닫기"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 md:p-6 space-y-6">
                    <div className="bg-white p-5 md:p-7 border border-slate-200 rounded-2xl shadow-sm space-y-6">
                        {isTemplateLoading ? (
                            <div className="min-h-[280px] flex flex-col items-center justify-center gap-3 text-center"><div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" /><p className="text-[13.5px] font-bold text-slate-800">계약서 내용을 불러오는 중입니다.</p></div>
                        ) : (
                            <><div className="text-center pb-4 border-b border-slate-100"><h1 className="text-[20px] md:text-[22px] font-black text-slate-900 tracking-wider">근 로 계 약 서</h1></div><ContractBodyBlock templateText={localTemplateText} privacyConsent={privacyConsent} onPrivacyConsentChange={setPrivacyConsent} isInteractive={true} /></>
                        )}
                    </div>
                    <div className="bg-white p-5 md:p-6 border border-slate-200 rounded-2xl shadow-sm space-y-3.5">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /><h3 className="text-[14.5px] font-extrabold text-slate-900">주요 계약 조항 확인 및 동의</h3></div><button type="button" onClick={handleToggleAllAgreements} className="text-[12px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">{allAgreed ? '전체 해제' : '전체 동의하기'}</button></div>
                        {REQUIRED_AGREEMENTS.map((item) => {
                            const checked = Boolean(agreements[item.id]);
                            return (
                                <label key={item.id} className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer ${checked ? 'bg-blue-50/60 border-blue-300' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="pt-0.5 shrink-0"><input type="checkbox" checked={checked} onChange={(e) => setAgreements({ ...agreements, [item.id]: e.target.checked })} className="sr-only" /><span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-400 bg-white'}`}>{checked && <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}</span></div>
                                    <div><p className={`text-[13.5px] font-bold ${checked ? 'text-blue-900' : 'text-slate-800'}`}>{item.title}</p><p className="text-[11.5px] text-slate-500">{item.desc}</p></div>
                                </label>
                            );
                        })}
                    </div>
                    <div className="bg-white p-5 md:p-6 border border-slate-200 rounded-2xl shadow-sm space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                            <h3 className="text-[14.5px] font-extrabold text-slate-900">비밀유지 및 정보보호 서약서</h3>
                        </div>
                        <p className="text-[12.5px] text-slate-700 leading-relaxed">
                            {CONFIDENTIALITY_PLEDGE_INTRO_PREFIX}
                            <span className="font-bold text-slate-900">{company?.name || user?.company || '회사'}</span>
                            {CONFIDENTIALITY_PLEDGE_INTRO_SUFFIX}
                        </p>
                        <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-[12px] text-slate-600 leading-relaxed">
                            {CONFIDENTIALITY_PLEDGE_CLAUSES.map((clause, ci) => (
                                <div key={ci} className="space-y-0.5">
                                    <p className="font-bold text-slate-800">{clause.title}</p>
                                    <p className="pl-2 border-l border-slate-300 text-slate-600">{clause.body}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-[12.5px] font-bold text-slate-800 text-center pt-1">
                            {CONFIDENTIALITY_PLEDGE_AFFIRMATION}
                        </p>
                    </div>
                    <div className="bg-white p-5 md:p-6 border border-slate-200 rounded-2xl shadow-sm">
                        <h3 className="text-[14.5px] font-extrabold text-slate-900 pb-3">계약 당사자 확인 및 서명</h3>
                        <ContractClosingBlock {...closingData} signatureDataUrl={signatureDataUrl} receiptTraceDataUrl={receiptTraceDataUrl} isInteractive={true} onOpenSignature={() => { setIsPadEmpty(true); setActivePadModal('signature'); }} onOpenReceipt={() => { setIsPadEmpty(true); setActivePadModal('receipt'); }} />
                    </div>
                </div>
                <div className="p-4 bg-white border-t border-slate-200 shrink-0 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <span className={`px-2.5 py-1 text-[11.5px] font-bold rounded-lg border flex items-center gap-1 ${
                            isPrivacyValid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                            <span>{isPrivacyValid ? '✓' : '•'}</span> 개인정보동의
                        </span>
                        <span className={`px-2.5 py-1 text-[11.5px] font-bold rounded-lg border flex items-center gap-1 ${
                            allAgreed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                            <span>{allAgreed ? '✓' : '•'}</span> 주요조항 ({agreedCount}/7)
                        </span>
                        <span className={`px-2.5 py-1 text-[11.5px] font-bold rounded-lg border flex items-center gap-1 ${
                            isSignatureDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                            <span>{isSignatureDone ? '✓' : '•'}</span> 근로자서명
                        </span>
                        <span className={`px-2.5 py-1 text-[11.5px] font-bold rounded-lg border flex items-center gap-1 ${
                            isReceiptDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                            <span>{isReceiptDone ? '✓' : '•'}</span> 교부확인
                        </span>
                    </div>

                    <button
                        data-testid="contract-signature-submit-button"
                        type="button"
                        onClick={handleSubmit}
                        disabled={!isAllReadyToSubmit || isGenerating}
                        className={`w-full md:w-auto md:min-w-[240px] py-3.5 px-6 rounded-xl font-bold text-[14.5px] shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] ${
                            isAllReadyToSubmit && !isGenerating
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
                        }`}
                    >
                        {isGenerating ? (
                            <>
                                <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                <span>계약서 생성 및 저장 중…</span>
                            </>
                        ) : (
                            <>
                                <span>✍️</span>
                                <span>전자서명 제출 및 계약 완료</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* ─── 서명 패드 팝업 모달 ─── */}
            {activePadModal === 'signature' && (
                <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="text-[15px] font-extrabold text-slate-900">근로자 전자서명</h3>
                                <p className="text-[11px] text-slate-500">서명 패드에 정자로 서명해 주세요.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActivePadModal(null)}
                                className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 flex flex-col items-center">
                            <div
                                ref={padContainerRef}
                                className="w-full h-48 bg-slate-50 border-2 border-dashed border-blue-300 rounded-xl relative overflow-hidden flex items-center justify-center shadow-inner"
                            >
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    canvasProps={{
                                        width: padWidth,
                                        height: padHeight,
                                        className: 'touch-none cursor-crosshair w-full h-full block' }}
                                    backgroundColor="rgba(255, 255, 255, 0)"
                                    penColor="#1e293b"
                                    onBegin={() => setIsPadEmpty(false)}
                                />
                                {isPadEmpty && (
                                    <span className="absolute text-[13px] font-medium text-slate-400 select-none pointer-events-none">
                                        이곳에 서명해 주세요
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    sigCanvas.current?.clear();
                                    setIsPadEmpty(true);
                                }}
                                className="py-2.5 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-100 cursor-pointer"
                            >
                                다시 쓰기
                            </button>
                            <button
                                type="button"
                                onClick={handleApplySignaturePad}
                                className="flex-1 py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13.5px] shadow-sm cursor-pointer"
                            >
                                서명 등록 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 교부확인 자필 팝업 모달 ─── */}
            {activePadModal === 'receipt' && (
                <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="text-[15px] font-extrabold text-slate-900">근로계약서 교부확인 자필</h3>
                                <p className="text-[11px] text-slate-500">'교부 받음' 글자를 따라 정자로 작성해 주세요.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActivePadModal(null)}
                                className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 flex flex-col items-center">
                            <div
                                ref={padContainerRef}
                                className="w-full h-40 bg-slate-50 border-2 border-dashed border-indigo-300 rounded-xl relative overflow-hidden flex items-center justify-center shadow-inner"
                            >
                                <span className="absolute text-[24px] font-extrabold tracking-[0.35em] text-slate-300 select-none pointer-events-none">
                                    교부 받음
                                </span>
                                <SignatureCanvas
                                    ref={receiptCanvas}
                                    canvasProps={{
                                        width: padWidth,
                                        height: 160,
                                        className: 'touch-none cursor-crosshair w-full h-full block relative z-10' }}
                                    backgroundColor="rgba(255, 255, 255, 0)"
                                    penColor="#1e293b"
                                    onBegin={() => setIsPadEmpty(false)}
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    receiptCanvas.current?.clear();
                                    setIsPadEmpty(true);
                                }}
                                className="py-2.5 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-100 cursor-pointer"
                            >
                                다시 쓰기
                            </button>
                            <button
                                type="button"
                                onClick={handleApplyReceiptPad}
                                className="flex-1 py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[13.5px] shadow-sm cursor-pointer"
                            >
                                교부확인 작성 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

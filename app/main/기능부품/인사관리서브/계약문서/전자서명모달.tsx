'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SignatureCanvas from 'react-signature-canvas';
import { getOrdinaryWageTable } from '@/lib/ordinary-wage';
import { jsPDF } from 'jspdf';

type Props = {
    contract: any;
    user: any;
    templateText?: string;
    onClose: () => void;
    onSuccess: (signatureData: string, contractText: string) => void;
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
    const [isSigEmpty, setIsSigEmpty] = useState(true);
    const [company, setCompany] = useState<any>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const [localTemplateText, setLocalTemplateText] = useState<string>('');

    useEffect(() => {
        if (templateText) {
            setLocalTemplateText(templateText);
            return;
        }

        const fetchTemplateAndCompany = async () => {
            if (!contract) return;
            try {
                const targetCompany = contract?.company_name || user?.company;

                const [tplRes, compRes] = await Promise.all([
                    supabase.from('contract_templates')
                        .select('template_content, seal_url')
                        .eq('company_name', targetCompany)
                        .maybeSingle(),
                    supabase.from('companies').select('*').eq('name', targetCompany).maybeSingle()
                ]);

                if (tplRes.data?.template_content) {
                    const template = tplRes.data.template_content;
                    const companyData = compRes.data;
                    setCompany({ ...companyData, seal_url: tplRes.data?.seal_url });

                    const formatDate = (ds: any) => (!ds ? '' : ds.split('T')[0]);
                    const formatWon = (val: any) => (!val ? '0' : Number(val).toLocaleString());
                    const parseBirthFromResident = (rn: string) => {
                        if (!rn || rn.length < 6) return '';
                        const yearPrefix = ['1', '2', '5', '6'].includes(rn.charAt(6)) ? '19' : '20';
                        const yy = rn.substring(0, 2);
                        const mm = rn.substring(2, 4);
                        const dd = rn.substring(4, 6);
                        return `${yearPrefix}${yy}-${mm}-${dd}`;
                    };

                    const vars: Record<string, any> = {
                        staff_name: user?.name || '',
                        company_name: targetCompany || '',
                        company_ceo: companyData?.ceo_name || '',
                        company_business_no: companyData?.business_no || '',
                        business_no: companyData?.business_no || '',
                        company_address: companyData?.address || '',
                        address_company: companyData?.address || '',
                        company_phone: companyData?.phone || '',
                        phone_company: companyData?.phone || '',
                        department: user?.department || '',
                        position: user?.position || '',
                        join_date: formatDate(user?.joined_at || contract?.effective_date),
                        phone: user?.phone || '',
                        address: user?.address || '',
                        birth_date: parseBirthFromResident(user?.resident_no),
                        license_name: user?.license || '',
                        license_no: user?.permissions?.license_no || '',
                        license_date: formatDate(user?.permissions?.license_date || ''),
                        base_salary: formatWon(contract?.base_salary),
                        position_allowance: formatWon(contract?.position_allowance),
                        meal_allowance: formatWon(contract?.meal_allowance),
                        vehicle_allowance: formatWon(contract?.vehicle_allowance),
                        childcare_allowance: formatWon(contract?.childcare_allowance),
                        research_allowance: formatWon(contract?.research_allowance),
                        other_taxfree: formatWon(contract?.other_taxfree),
                        shift_start: contract?.shift_start_time ? String(contract.shift_start_time).slice(0, 5) : '',
                        shift_end: contract?.shift_end_time ? String(contract.shift_end_time).slice(0, 5) : '',
                        break_start: contract?.break_start_time ? String(contract.break_start_time).slice(0, 5) : '',
                        break_end: contract?.break_end_time ? String(contract.break_end_time).slice(0, 5) : '',
                        today: formatDate(new Date().toISOString()),
                    };

                    let result = template;

                    // [수습 기간] 태그 제거 (본문에서 자체 처리)
                    result = result.replace(/\[\s*수습\s*기간\s*\]/g, '');

                    Object.entries(vars).forEach(([key, value]) => {
                        const token = `{{${key}}}`;
                        if (result.includes(token)) {
                            result = result.split(token).join(value || '');
                        }
                    });

                    const companyLineValues: Record<string, string | undefined> = {
                        회사명: vars.company_name,
                        대표자: vars.company_ceo,
                        사업자등록번호: vars.company_business_no,
                        주소: vars.company_address,
                        전화번호: vars.company_phone,
                    };
                    Object.entries(companyLineValues).forEach(([label, value]) => {
                        if (!value) return;
                        const re = new RegExp(`(${label}\\s*:\\s*)([_\\s]*)`, 'g');
                        result = result.replace(re, `$1${value}`);
                    });

                    setLocalTemplateText(result);
                }
            } catch (err) {
                console.warn('Error applying template for modal:', err);
            }
        };

        fetchTemplateAndCompany();
    }, [contract, user, templateText]);

    const allAgreed = REQUIRED_AGREEMENTS.every(item => agreements[item.id]);

    const handleNext = () => {
        if (step === 1) setStep(2);
        else if (step === 2) {
            if (!allAgreed) return alert('모든 필수 항목에 동의해야 합니다.');
            setStep(3);
        } else if (step === 3) {
            if (!agreements['confidentiality']) return alert('비밀유지서약서 내용에 동의해야 합니다.');
            setStep(4);
        }
    };

    const handleClearSignature = () => {
        sigCanvas.current?.clear();
        setIsSigEmpty(true);
    };

    const handleSubmit = async () => {
        if (isSigEmpty || sigCanvas.current?.isEmpty()) {
            return alert('서명을 완료해 주세요.');
        }

        setIsGenerating(true);
        try {
            const signatureData = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
            if (!signatureData) return;

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

            const fullContractHTML = `
                <div class="contract-wrapper">
                    <div class="contract-page">${localTemplateText}</div>
                    ${agreementsSection}
                    ${confidentialitySection}
                </div>
            `;

            // 2. 통합 PDF 저장/인쇄 기능 기동
            const printWindow = window.open('', '_blank');
            if (printWindow) {
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
                printWindow.document.write(`<html><head><title>계약서_통합본_${user?.name}</title><style>${styles}</style></head><body>${fullContractHTML}</body></html>`);
                printWindow.document.close();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 500);
            }

            onSuccess(signatureData, fullContractHTML);
        } catch (error) {
            console.error(error);
            alert("서류 생성 중 오류가 발생했습니다.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[var(--toss-card)] w-full max-w-2xl border-2 border-[var(--toss-border)] radius-toss-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                <div className="p-5 border-b border-[var(--toss-border)] flex items-center justify-between bg-slate-50 shrink-0">
                    <div>
                        <span className="px-2.5 py-1 text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full mb-1 inline-block">전자서명 진행 중</span>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">{contract?.contract_type || '표준근로계약서'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--toss-gray-4)] hover:text-red-500 transition-colors">✕</button>
                </div>

                <div className="flex bg-slate-100 h-1.5 shrink-0">
                    <div className="bg-blue-600 transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }} />
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-[var(--page-bg)]">

                    {step === 1 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center mb-6">
                                <span className="text-4xl block mb-2">📄</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">계약서 내용을 꼼꼼히 확인해 주세요</h3>
                                <p className="text-xs text-[var(--toss-gray-4)] font-bold mt-1">하단으로 끝까지 스크롤하여 모든 내용을 확인해야 합니다.</p>
                            </div>

                            <div className="bg-white p-5 border border-slate-200 max-h-[50vh] overflow-y-auto custom-scrollbar shadow-sm rounded-xl">
                                {(() => {
                                    let raw = localTemplateText;
                                    // ASCII 표 장식 제거
                                    raw = raw.replace(/[┌┬┐├┼┤└┴┘─│]+/g, '');
                                    // 제목 줄 제거
                                    raw = raw.replace(/근\s*로\s*계\s*약\s*서\s*\(\s*월\s*급\s*제\s*\)/, '');
                                    // 기본정보 블록 제거
                                    raw = raw.replace(/\[사용자 기본정보\][\s\S]*?(?=제\d+조|────|$)/m, '');
                                    raw = raw.replace(/\[근로자 기본정보\][\s\S]*?(?=제\d+조|────|$)/m, '');
                                    raw = raw.replace(/\[상기[\s\S]*?체결한다\.\]/, '');

                                    // 조 단위 파싱
                                    const sectionRe = /제(\d+)조\s*\[([^\]]+)\]/g;
                                    const matches: { index: number; full: string; num: string; title: string }[] = [];
                                    let mm;
                                    while ((mm = sectionRe.exec(raw)) !== null) {
                                        matches.push({ index: mm.index, full: mm[0], num: mm[1], title: mm[2] });
                                    }
                                    if (matches.length === 0) return <p className="text-xs text-slate-500 whitespace-pre-wrap">{raw}</p>;

                                    return matches.map((sec, si) => {
                                        const start = sec.index + sec.full.length;
                                        const end = si + 1 < matches.length ? matches[si + 1].index : raw.length;
                                        const body = raw.slice(start, end).replace(/─+/g, '').trim();
                                        const lines = body.split('\n').filter(l => l.trim());

                                        return (
                                            <div key={si} className="mb-5">
                                                <h4 className="text-[12px] font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                                                    <span className="w-1 h-1 bg-blue-600 rounded-full shrink-0" />
                                                    제{sec.num}조 [{sec.title}]
                                                </h4>
                                                <div className="pl-3 border-l-2 border-slate-100 space-y-0.5">
                                                    {lines.map((line, li) => {
                                                        const t = line.trim();
                                                        if (t.startsWith('[') && t.endsWith(']')) {
                                                            return <span key={li} className="inline-block text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded mt-2 mb-1">{t.replace(/[\[\]]/g, '')}</span>;
                                                        }
                                                        if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) {
                                                            return (
                                                                <div key={li} className="flex gap-1.5 mt-1">
                                                                    <span className="text-blue-600 font-black text-[11px] shrink-0">{t[0]}</span>
                                                                    <span className="text-[11px] text-slate-700 leading-[1.75]">{t.slice(1).trim()}</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (t.startsWith('-') || t.startsWith('·')) {
                                                            return (
                                                                <div key={li} className="flex gap-1.5 pl-4 mt-0.5">
                                                                    <span className="text-slate-400 shrink-0">•</span>
                                                                    <span className="text-[10.5px] text-slate-600 leading-[1.75]">{t.replace(/^[-·]\s*/, '')}</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (/^(기본급|식대|직책수당|기타수당)\s+/.test(t)) {
                                                            const parts = t.split(/\s{2,}/);
                                                            return (
                                                                <div key={li} className="flex justify-between py-0.5 border-b border-slate-50">
                                                                    <span className="text-[10.5px] font-semibold text-slate-600">{parts[0]}</span>
                                                                    <span className="text-[10.5px] font-black text-slate-800">{parts[1] || ''}</span>
                                                                </div>
                                                            );
                                                        }
                                                        return <p key={li} className="text-[11px] text-slate-700 leading-[1.75]">{t}</p>;
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center mb-4">
                                <span className="text-3xl block mb-2">✅</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">주요 계약 조항 확인 및 동의</h3>
                            </div>

                            <div className="space-y-2.5">
                                {REQUIRED_AGREEMENTS.map((item) => (
                                    <label
                                        key={item.id}
                                        className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${agreements[item.id]
                                            ? 'bg-blue-50 border-blue-500 shadow-sm'
                                            : 'bg-white border-slate-100 hover:border-slate-200'
                                            }`}
                                    >
                                        <div className="pt-0.5">
                                            <input
                                                type="checkbox"
                                                checked={!!agreements[item.id]}
                                                onChange={(e) => setAgreements({ ...agreements, [item.id]: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <p className={`text-[12px] font-black ${agreements[item.id] ? 'text-blue-700' : 'text-slate-800'}`}>
                                                {item.title}
                                            </p>
                                            <p className="text-[10px] font-medium text-slate-500 mt-0.5 leading-relaxed">
                                                {item.desc}
                                            </p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center mb-4">
                                <span className="text-3xl block mb-2">📜</span>
                                <h2 className="text-lg font-black tracking-widest underline underline-offset-4">비 밀 유 지 서 약 서</h2>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl font-serif text-[11px] leading-[1.8] text-slate-900 overflow-y-auto max-h-[300px] custom-scrollbar">
                                <p className="mb-4 font-bold">본인은 회사의 영업비밀을 보호하고 정당한 권익을 지킬 것을 서약합니다.</p>
                                <div className="space-y-4">
                                    <p><b>1. 비밀유지 범위:</b> 환자정보, 경영 전략, 기술 노하우 등</p>
                                    <p><b>2. 위반 시 조치:</b> 민형사상 책임 및 손해 배상 의무 부담</p>
                                </div>
                            </div>

                            <label className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors">
                                <input type="checkbox" checked={agreements['confidentiality'] || false} onChange={e => setAgreements({ ...agreements, confidentiality: e.target.checked })} className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
                                <span className="text-[12px] font-black text-emerald-800">비밀유지 내용을 이해하였으며 이에 서약합니다.</span>
                            </label>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center mb-4">
                                <span className="text-3xl block mb-2">✍️</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">최종 전자서명</h3>
                                <p className="text-[10px] text-[var(--toss-gray-4)] font-bold mt-1">본인의 성함을 정자로 기재해 주세요.</p>
                            </div>

                            <div className="bg-white border-2 border-[var(--toss-blue)] rounded-2xl p-2 relative shadow-inner overflow-hidden">
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    penColor="#1e293b"
                                    canvasProps={{ className: "w-full h-[200px] cursor-crosshair touch-none" }}
                                    onEnd={() => setIsSigEmpty(false)}
                                />
                                {isSigEmpty && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center flex-col opacity-20 text-slate-400 gap-1">
                                        <span className="text-[10px] font-black tracking-[.2em] uppercase">Sign Here</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-start">
                                <button type="button" onClick={handleClearSignature} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors">
                                    다시 쓰기
                                </button>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-xl text-[10px] font-bold text-blue-600 text-center">
                                이 전자 서명은 인감 날인과 동일한 법적 효력을 가집니다.
                            </div>
                        </div>
                    )}

                </div>

                <div className="p-4 md:p-6 border-t border-[var(--toss-border)] bg-white flex gap-3 shrink-0">
                    {step > 1 && (
                        <button onClick={() => setStep(s => s - 1)} className="px-5 py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-[12px] hover:bg-slate-200">
                            이전
                        </button>
                    )}

                    {step < 4 ? (
                        <button onClick={handleNext} className="flex-1 px-5 py-3.5 rounded-xl bg-[var(--toss-blue)] text-white font-black text-[13px] shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
                            확인 및 다음 단계 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={isSigEmpty || isGenerating} className={`flex-1 px-5 py-3.5 rounded-xl text-white font-black text-[13px] shadow-lg transition-all flex items-center justify-center gap-2 ${isSigEmpty || isGenerating ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'}`}>
                            {isGenerating ? '서류 생성 중...' : '최종 서명 및 저장'}
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}

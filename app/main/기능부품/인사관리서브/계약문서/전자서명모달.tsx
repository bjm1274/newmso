'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SignatureCanvas from 'react-signature-canvas';
import { getOrdinaryWageTable } from '@/lib/ordinary-wage';

type Props = {
    contract: any;
    user: any;
    templateText?: string; // 추가: 부모로부터 넘겨받은 법률 계약서 전문 (변수 치환된 결과물)
    onClose: () => void;
    onSuccess: (signatureData: string) => void;
};

// 필수 동의 항목
const REQUIRED_AGREEMENTS = [
    { id: 'agree_content', title: '근로계약서 내용 확인', desc: '본 근로계약서의 기재사항(근로조건, 임금, 근로시간 등)을 충분히 확인하였고 이에 동의합니다.' },
    { id: 'agree_secrecy', title: '연봉/계약조건 비밀유지', desc: '본인의 급여 및 계약조건에 대해 사내외 타인에게 발설하지 않을 것에 동의합니다.' },
    { id: 'agree_handover', title: '퇴사 시 인수인계 의무', desc: '퇴사 시 최소 30일 전 통보하며, 업무 인수인계를 성실히 이행할 것에 동의합니다.' },
    { id: 'agree_insurance', title: '4대보험 및 세금 공제 동의', desc: '급여 지급 시 관련 법령에 따른 4대보험료 및 제세공과금 원천징수 후 지급받는 것에 동의합니다.' }
];

export default function ContractSignatureModal({ contract, user, templateText, onClose, onSuccess }: Props) {
    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: 내용확인, 2: 동의체크, 3: 전자서명
    const [agreements, setAgreements] = useState<Record<string, boolean>>({});
    const sigCanvas = useRef<SignatureCanvas>(null);
    const [isSigEmpty, setIsSigEmpty] = useState(true);

    const [localTemplateText, setLocalTemplateText] = useState<string>('');

    // 계약서 HTML 컨텐츠 가져오기 (DB에서 템플릿 & 회사정보 가져와서 치환)
    useEffect(() => {
        if (templateText) {
            setLocalTemplateText(templateText);
            return;
        }

        const fetchTemplateAndCompany = async () => {
            if (!contract) return;
            try {
                const targetCompany = contract?.company_name || user?.company;
                const targetType = contract?.contract_type || '표준근로계약서';

                const [tplRes, compRes] = await Promise.all([
                    supabase.from('document_templates')
                        .select('content')
                        .eq('company_name', targetCompany)
                        .eq('title', targetType)
                        .maybeSingle(),
                    supabase.from('companies').select('*').eq('name', targetCompany).maybeSingle()
                ]);

                if (tplRes.data?.content) {
                    const template = tplRes.data.content;
                    const company = compRes.data;

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
                        company_ceo: company?.ceo_name || '',
                        company_business_no: company?.business_no || '',
                        business_no: company?.business_no || '',
                        company_address: company?.address || '',
                        address_company: company?.address || '',
                        company_phone: company?.phone || '',
                        phone_company: company?.phone || '',
                        department: user?.department || '',
                        position: user?.position || '',
                        join_date: formatDate(user?.joined_at || contract?.effective_date),
                        phone: user?.phone || '',
                        address: user?.address || '',
                        birth_date: parseBirthFromResident(user?.resident_no),
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
                    Object.entries(vars).forEach(([key, value]) => {
                        const token = `{{${key}}}`;
                        if (result.includes(token)) {
                            result = result.split(token).join(value || '');
                        }
                    });

                    // 구형 양식 대응 (회사명: ___)
                    const companyLineValues: Record<string, string | undefined> = {
                        회사명: vars.company_name,
                        대표자: vars.company_ceo,
                        대표자명: vars.company_ceo,
                        사업자등록번호: vars.company_business_no,
                        주소: vars.company_address,
                        전화번호: vars.company_phone,
                        '대표 전화번호': vars.company_phone,
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
        }
    };

    const handleClearSignature = () => {
        sigCanvas.current?.clear();
        setIsSigEmpty(true);
    };

    const handleSubmit = () => {
        if (isSigEmpty || sigCanvas.current?.isEmpty()) {
            return alert('서명을 완료해 주세요.');
        }
        const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
        if (dataUrl) {
            onSuccess(dataUrl);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[var(--toss-card)] w-full max-w-2xl border-2 border-[var(--toss-border)] radius-toss-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* 헤더 */}
                <div className="p-5 border-b border-[var(--toss-border)] flex items-center justify-between bg-slate-50 shrink-0">
                    <div>
                        <span className="px-2.5 py-1 text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full mb-1 inline-block">전자서명 진행 중</span>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">{contract?.contract_type || '표준근로계약서'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--toss-gray-4)] hover:text-red-500 transition-colors">✕</button>
                </div>

                {/* 진행 상태 바 */}
                <div className="flex bg-slate-100 h-1.5 shrink-0">
                    <div className="bg-blue-600 transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
                </div>

                {/* 바디 영역 - 스크롤 가능 */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-[var(--page-bg)]">

                    {/* STEP 1: 계약서 내용 확인 */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center mb-6">
                                <span className="text-4xl block mb-2">📄</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">계약서 내용을 꼼꼼히 확인해 주세요</h3>
                                <p className="text-xs text-[var(--toss-gray-4)] font-bold mt-1">하단으로 끝까지 스크롤하여 모든 내용을 확인해야 합니다.</p>
                            </div>

                            {/* 계약서 요약 카드 (모바일 최적화) */}
                            <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                    <span className="text-[11px] font-bold text-slate-500">직책/성명</span>
                                    <span className="text-[14px] font-black text-slate-800">{user?.name} 님</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                    <span className="text-[11px] font-bold text-slate-500">적용일자</span>
                                    <span className="text-[13px] font-bold text-blue-600">{contract?.effective_date || '지정되지 않음'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px] font-bold text-slate-500">기본급</span>
                                    <span className="text-[15px] font-black text-slate-800">{(contract?.base_salary || 0).toLocaleString()}원</span>
                                </div>

                                {/* 비과세 수당 요약 */}
                                <div className="pt-3 border-t border-slate-100 text-xs font-bold text-slate-500 grid grid-cols-2 gap-2">
                                    <span className="text-[10px] text-slate-400">식대</span><span className="text-right">{(contract?.meal_allowance || 0).toLocaleString()}원</span>
                                    <span className="text-[10px] text-slate-400">차량유지비</span><span className="text-right">{(contract?.vehicle_allowance || 0).toLocaleString()}원</span>
                                    <span className="text-[10px] text-slate-400">직급수당</span><span className="text-right">{(contract?.position_allowance || 0).toLocaleString()}원</span>
                                </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                                <span className="text-lg">💡</span>
                                <p className="text-[11px] font-bold text-amber-800 leading-relaxed pt-0.5">최상단 요약본 외에, 실제 법적 구속력을 갖는 하단 상세 근로계약서 전문(통상임금 산출 방식 및 법률 조항)을 반드시 끝까지 읽고 확인해주세요.</p>
                            </div>

                            {/* 통상임금 산출 표 */}
                            {(() => {
                                const breakdown = {
                                    base_salary: contract?.base_salary ?? user?.base_salary,
                                    meal_allowance: contract?.meal_allowance ?? user?.meal_allowance,
                                    vehicle_allowance: contract?.vehicle_allowance ?? user?.vehicle_allowance,
                                    childcare_allowance: contract?.childcare_allowance ?? user?.childcare_allowance,
                                    research_allowance: contract?.research_allowance ?? user?.research_allowance,
                                    other_taxfree: contract?.other_taxfree ?? user?.other_taxfree,
                                    position_allowance: contract?.position_allowance ?? user?.position_allowance,
                                };
                                const { rows, totalMonthly, hourlyWage } = getOrdinaryWageTable(breakdown);
                                if (rows.length === 0) return null;
                                return (
                                    <div className="bg-white p-5 rounded-[16px] border border-[var(--toss-blue)]/20 shadow-sm mt-6">
                                        <h4 className="text-xs font-semibold text-[var(--foreground)] mb-3 tracking-wider">통상임금 산출 (월 소정근로시간 209시간 기준)</h4>
                                        <table className="w-full text-[11px] border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left py-2 font-semibold text-slate-500">항목</th>
                                                    <th className="text-right py-2 font-semibold text-slate-500">금액 (원/월)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map((r, i) => (
                                                    <tr key={i} className="border-b border-slate-100">
                                                        <td className="py-2.5 font-semibold text-[var(--foreground)]">{r.label}</td>
                                                        <td className="py-2.5 text-right font-bold text-[var(--foreground)]">{r.amount.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                                                    <td className="py-3 px-2 text-[var(--foreground)]">월 통상급여 합계</td>
                                                    <td className="py-3 px-2 text-right text-blue-700">{totalMonthly.toLocaleString()}원</td>
                                                </tr>
                                                <tr className="font-semibold bg-blue-50/50">
                                                    <td className="py-3 px-2 text-[var(--foreground)]">시 통상임금 (원/시간)</td>
                                                    <td className="py-3 px-2 text-right text-blue-700">{hourlyWage.toLocaleString()}원</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()}

                            {/* 계약서 상세 조항 (법적 전체문 / 스크롤) */}
                            <div className="bg-[var(--toss-gray-1)] p-6 md:p-8 rounded-[16px] border border-slate-200 text-xs leading-[1.8] text-slate-600 font-medium max-h-[50vh] overflow-y-auto custom-scrollbar font-mono mt-6">
                                <h3 className="text-sm font-bold text-[var(--foreground)] mb-6 text-center underline underline-offset-8">
                                    {(contract?.contract_type || '표준근로계약서')} 전문
                                </h3>
                                <div className="whitespace-pre-wrap">
                                    {templateText || localTemplateText || '계약서 템플릿을 불러오는 중이거나 설정된 템플릿이 없습니다.'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: 필수 항목 동의 (상세 체크리스트) */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center mb-8">
                                <span className="text-4xl block mb-2">✅</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">필수 서약 및 동의</h3>
                                <p className="text-xs text-[var(--toss-gray-4)] font-bold mt-1">전자서명 전 반드시 모든 항목을 확인하고 동의해 주세요.</p>
                            </div>

                            <div className="space-y-3">
                                {REQUIRED_AGREEMENTS.map(item => (
                                    <label key={item.id} className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer ${agreements[item.id] ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                                        <div className="pt-1">
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${agreements[item.id] ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-transparent text-transparent'}`}>
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className={`text-[13px] font-bold mb-1 ${agreements[item.id] ? 'text-blue-900' : 'text-slate-700'}`}>{item.title} <span className="text-red-500 text-[10px] ml-1">*필수</span></h4>
                                            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">{item.desc}</p>
                                        </div>
                                        {/* 숨겨진 체크박스 (접근성 및 상태 연결용) */}
                                        <input type="checkbox" className="sr-only" checked={agreements[item.id] || false} onChange={e => setAgreements({ ...agreements, [item.id]: e.target.checked })} />
                                    </label>
                                ))}
                            </div>

                            <button
                                className={`w-full p-4 rounded-xl text-[12px] font-black transition-all ${allAgreed ? 'bg-slate-800 text-white hover:opacity-90' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                onClick={() => {
                                    if (allAgreed) {
                                        // 모두 동의 해제(초기화) 로직
                                        setAgreements({});
                                    } else {
                                        // 모두 동의 일괄 처리
                                        const allChecked = REQUIRED_AGREEMENTS.reduce((acc, cur) => ({ ...acc, [cur.id]: true }), {});
                                        setAgreements(allChecked);
                                    }
                                }}
                            >
                                {allAgreed ? '↻ 전체 동의 해제' : '✓ 위 항목에 모두 동의합니다'}
                            </button>
                        </div>
                    )}

                    {/* STEP 3: 캔버스 기반 전자서명 */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center mb-6">
                                <span className="text-4xl block mb-2">✍️</span>
                                <h3 className="text-lg font-bold text-[var(--foreground)]">전자서명 진행</h3>
                                <p className="text-[11px] text-[var(--toss-gray-4)] font-bold mt-1">아래 영역에 본인의 정자(이름)로 서명하여 주시기 바랍니다.<br />(이 서명은 실제 친필 서명과 동일한 법적 효력을 갖습니다.)</p>
                            </div>

                            <div className="bg-white border-2 border-[var(--toss-blue)] rounded-2xl p-2 relative shadow-inner overflow-hidden">
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    penColor="#1e293b" // slate-800
                                    canvasProps={{ className: "w-full h-[250px] cursor-crosshair touch-none" }}
                                    onEnd={() => setIsSigEmpty(false)}
                                />

                                {isSigEmpty && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center flex-col opacity-30 text-slate-400 gap-2">
                                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        <span className="text-xs font-black tracking-widest uppercase">Sign Here</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center">
                                <button type="button" onClick={handleClearSignature} className="px-4 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    지우기 (다시 쓰기)
                                </button>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-500 leading-relaxed text-center">
                                위 전자서명은 『전자문서 및 전자거래 기본법』 및 『전자서명법』에 따라<br className="hidden md:block" />
                                실제 서명(기명날인 등)과 동일한 법적 효력을 지님을 확인합니다.
                            </div>
                        </div>
                    )}

                </div>

                {/* 푸터 액션 버튼 */}
                <div className="p-4 md:p-6 border-t border-[var(--toss-border)] bg-white flex gap-3 shrink-0">
                    {step > 1 && (
                        <button onClick={() => setStep(s => s - 1 as any)} className="px-6 py-4 rounded-[12px] bg-slate-100 text-slate-600 font-bold text-[12px] hover:bg-slate-200 transition-colors">
                            이전 단계
                        </button>
                    )}

                    {step < 3 ? (
                        <button onClick={handleNext} className="flex-1 px-6 py-4 rounded-[12px] bg-[var(--toss-blue)] text-white font-black text-[13px] shadow-md hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
                            다음 단계 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={isSigEmpty} className={`flex-1 px-6 py-4 rounded-[12px] text-white font-black text-[13px] shadow-lg transition-all flex items-center justify-center gap-2 ${isSigEmpty ? 'bg-slate-300 cursor-not-allowed opacity-70' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            최종 서명 제출
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

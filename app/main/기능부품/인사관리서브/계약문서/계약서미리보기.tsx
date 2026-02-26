'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getOrdinaryWageTable } from '@/lib/ordinary-wage';

type Props = {
  staff?: any;
  contract?: any;
};

export default function ContractPreview({ staff, contract }: Props) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState<any>(null);
  const [shift, setShift] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      if (!staff) {
        setText('');
        return;
      }
      setLoading(true);
      try {
        const companyName = staff.company || '전체';

        // 근무형태 조회
        let shiftData: any = null;
        const shiftId = contract?.shift_id ?? staff.shift_id;
        if (shiftId) {
          const { data: sData } = await supabase
            .from('work_shifts')
            .select('*')
            .eq('id', shiftId)
            .maybeSingle();
          shiftData = sData;
        }
        setShift(shiftData);

        // 회사 기본정보 조회
        let companyInfo: any = null;
        if (companyName && companyName !== '전체') {
          const { data: companyRow } = await supabase
            .from('companies')
            .select('*')
            .eq('name', companyName)
            .maybeSingle();
          companyInfo = companyRow;
        }

        // 계약서 템플릿 조회
        const { data: tmpl } = await supabase
          .from('contract_templates')
          .select('template_content, seal_url')
          .eq('company_name', companyName)
          .maybeSingle();

        setCompany({ ...companyInfo, seal_url: tmpl?.seal_url });

        let templateText = tmpl?.template_content || '';
        if (!templateText) {
          const { data: fallback } = await supabase
            .from('contract_templates')
            .select('template_content')
            .eq('company_name', '전체')
            .maybeSingle();
          templateText = fallback?.template_content || '';
        }

        setText(fillContractTemplate(templateText, staff, contract, shiftData, companyInfo));
      } catch (e) {
        console.warn('ContractPreview load error', e);
        setText('');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staff?.id, staff?.company, contract?.id]);

  if (!staff) {
    return (
      <div className="bg-white border border-[var(--toss-border)] shadow-sm p-8 flex items-center justify-center h-[800px] text-xs text-[var(--toss-gray-3)]">
        계약 대상자를 왼쪽에서 선택하면 이곳에 근로계약서가 미리보기로 표시됩니다.
      </div>
    );
  }

  // 근로계약서 템플릿 변수 치환 (조직도본문과 동일한 규칙을 축약해 사용)
  function fillContractTemplate(
    template: string,
    user: any,
    contract: any,
    shift: any,
    company: any,
  ) {
    if (!template) return '';

    const formatDate = (value?: string | null) => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}년 ${m}월 ${day}일`;
    };

    const formatWon = (n?: number | null) => {
      if (!n || Number.isNaN(n)) return '';
      try {
        return n.toLocaleString('ko-KR');
      } catch {
        return String(n);
      }
    };

    const parseBirthFromResident = (resident?: string | null) => {
      if (!resident) return '';
      const raw = resident.replace(/[^0-9]/g, '');
      if (raw.length < 7) return '';
      const yy = raw.slice(0, 2);
      const mm = raw.slice(2, 4);
      const dd = raw.slice(4, 6);
      const genderCode = raw[6];
      const century =
        genderCode === '1' || genderCode === '2' || genderCode === '5' || genderCode === '6'
          ? '19'
          : '20';
      const year = `${century}${yy}`;
      return `${year}년 ${mm}월 ${dd}일`;
    };

    const salarySource = contract || user || {};

    const vars: Record<string, string> = {
      employee_name: user?.name || '',
      employee_no: String(user?.employee_no ?? ''),

      company_name: company?.name || user?.company || '',
      company_ceo: company?.ceo_name || '',
      ceo_name: company?.ceo_name || '',
      company_business_no: company?.business_no || '',
      business_no: company?.business_no || '',
      company_address: company?.address || '',
      company_phone: company?.phone || '',

      department: user?.department || '',
      position: user?.position || '',
      join_date: formatDate(user?.joined_at || salarySource?.join_date),
      license_name: user?.license || '',
      license_no: user?.permissions?.license_no || '',
      license_date: formatDate(user?.permissions?.license_date || ''),
      phone: user?.phone || '',
      address: user?.address || '',
      birth_date: parseBirthFromResident(user?.resident_no),

      base_salary: formatWon(salarySource.base_salary),
      position_allowance: formatWon(salarySource.position_allowance),
      meal_allowance: formatWon(salarySource.meal_allowance),
      vehicle_allowance: formatWon(salarySource.vehicle_allowance),
      childcare_allowance: formatWon(salarySource.childcare_allowance),
      research_allowance: formatWon(salarySource.research_allowance),
      other_taxfree: formatWon(salarySource.other_taxfree),

      shift_start: shift?.start_time ? String(shift.start_time).slice(0, 5) : '',
      shift_end: shift?.end_time ? String(shift.end_time).slice(0, 5) : '',
      break_start: shift?.break_start_time ? String(shift.break_start_time).slice(0, 5) : '',
      break_end: shift?.break_end_time ? String(shift.break_end_time).slice(0, 5) : '',

      probation_months: String(contract?.probation_months || '3'),
      probation_percent: String(contract?.probation_percent || '90'),
      payment_day: String(contract?.payment_day || '7'),

      today: formatDate(new Date().toISOString()),
    };

    let result = template;

    // [수습 기간] 또는 [수습기간] 태그 미리 처리
    const probationTag = result.includes('[수습 기간]') ? '[수습 기간]' : result.includes('[수습기간]') ? '[수습기간]' : null;
    if (probationTag) {
      const isProbation = !!contract?.use_probation;
      const probationContent = `
          <div class="my-7 p-4 border border-slate-200 rounded-2xl bg-slate-50/50 font-sans probation-tag-container">
            <div class="flex items-center gap-2 mb-1">
                <span class="w-3 h-3 rounded-full ${isProbation ? 'bg-blue-500' : 'bg-slate-300'}"></span>
                <span class="text-[12px] font-black text-slate-800">수습 기간 적용 여부: ${isProbation ? '적용' : '미적용'}</span>
            </div>
            ${isProbation ? `
                <p class="text-[11px] font-medium text-slate-600 leading-relaxed">
                    - 신규 채용된 '근로자'에 대하여 입사일로부터 <span class="font-black text-blue-600 underline underline-offset-2">${vars.probation_months}개월</span>이 되는 날까지 수습 기간을 둘 수 있다.<br/>
                    - 수습 기간 중 임금은 소정 임금의 <span class="font-black text-blue-600 underline underline-offset-2">${vars.probation_percent}%</span>를 지급하며, 근무 태도나 자질이 부적합하다고 판단될 경우 본 채용을 거절할 수 있다.
                </p>
            ` : ''}
          </div>
        `;
      result = result.split(probationTag).join(probationContent);
    }

    Object.entries(vars).forEach(([key, value]) => {
      const token = `{{${key}}}`;
      if (result.includes(token)) {
        result = result.split(token).join(value || '');
      }
    });

    return result;
  }

  // 서명 이미지는 상태가 '서명완료'인 경우에만 표시
  const sig = contract?.status === '서명완료' ? (contract?.signature_data as string | undefined) : undefined;

  return (
    <div className="bg-[var(--toss-gray-1)] md:p-8 flex flex-col h-[900px] overflow-y-auto rounded-[32px] border border-[var(--toss-border)] relative custom-scrollbar print:bg-white print:p-0 print:border-none print:h-auto print:overflow-visible">
      <div className="flex items-center justify-between px-6 py-4 mb-4 bg-white/50 backdrop-blur-md border-b border-[var(--toss-border)] sticky top-0 z-20 print:hidden">
        <div>
          <span className="text-[10px] font-bold text-[var(--toss-blue)] uppercase tracking-widest">Document Preview</span>
          <h1 className="text-sm font-bold text-[var(--foreground)] mt-0.5">{staff.name} 근로계약서</h1>
        </div>
        <div className="flex items-center gap-3">
          {contract?.status && (
            <span className={`px-3 py-1 text-[11px] font-bold rounded-full border ${contract.status === '서명완료'
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
              : 'bg-orange-50 text-orange-600 border-orange-100'
              }`}>
              {contract.status}
            </span>
          )}
          <button onClick={() => window.print()} className="p-2 rounded-xl bg-white border border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)] transition-colors">
            <span className="text-sm">🖨️</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-12 flex justify-center">
        {/* A4 Paper Container */}
        <div className="w-full max-w-[720px] bg-white shadow-2xl rounded-sm border border-gray-200 min-h-[960px] flex flex-col p-[40px] md:p-[60px] font-serif relative overflow-hidden print:shadow-none print:border-none print:p-0">
          {/* Watermark */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.02] select-none">
            <span className="text-[120px] font-black rotate-[-45deg] text-black">CONFIDENTIAL</span>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <div className="w-8 h-8 border-4 border-[var(--toss-blue)] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-bold">계약서 데이터를 구성 중입니다...</p>
            </div>
          ) : (
            <div className="relative z-10 w-full">
              <h1 className="text-3xl font-black text-center mb-16 tracking-[0.2em] underline underline-offset-[12px] decoration-1 border-slate-900">근 로 계 약 서</h1>

              {/* 정보 섹션: 좌(사용자) / 우(근로자) 세로 리스트 병렬 배치 */}
              <div className="grid grid-cols-2 gap-10 mb-12">
                {/* 사용자(회사) 정보 */}
                <div className="w-full relative">
                  <h3 className="text-[12px] font-black border-b-2 border-slate-800 pb-1 mb-3">[사용자]</h3>
                  <div className="grid grid-cols-12 border-t border-l border-gray-300 w-full text-[11px]">
                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">회사명</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 font-black italic">{company?.name || staff.company}</div>

                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">사업자번호</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 font-bold">{company?.business_no || '-'}</div>

                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">주소</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 leading-tight font-bold">{company?.address || '-'}</div>

                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">연락처</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 font-bold">{company?.phone || '-'}</div>
                  </div>
                </div>

                {/* 근로자 정보 */}
                <div className="w-full">
                  <h3 className="text-[12px] font-black border-b-2 border-slate-800 pb-1 mb-3">[근로자]</h3>
                  <div className="grid grid-cols-12 border-t border-l border-gray-300 w-full text-[11px]">
                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">성명</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 font-black italic">{staff.name}</div>

                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">생년월일</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 font-bold">{staff.resident_no ? staff.resident_no.slice(0, 6) : '-'}</div>

                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">주소</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 leading-tight font-bold">{staff.address || '-'}</div>

                    <div className="col-span-4 bg-gray-50 border-r border-b border-gray-300 p-2 font-bold text-center">연락처</div>
                    <div className="col-span-8 border-r border-b border-gray-300 p-2 font-bold">{staff.phone || '-'}</div>
                  </div>
                </div>
              </div>

              <div className="border-t-2 border-slate-800 pt-10 text-[13px] leading-[1.9] text-slate-900 whitespace-pre-wrap font-serif">
                {(() => {
                  if (!text) return '설정된 계약서 본문이 없습니다.';

                  let textToRender = text;
                  // 0. ASCII 표 및 불필요한 장식 제거
                  textToRender = textToRender.replace(/┌[─┬┐\s\S]*?┘/g, '');
                  textToRender = textToRender.replace(/│/g, '');
                  textToRender = textToRender.replace(/├[─┼┤]*?┤/g, '');
                  textToRender = textToRender.replace(/└[─┴┘]*?┘/g, '');

                  // 1. 태그 분할 (probation-tag-container 정규식 유연하게 고정)
                  const parts = textToRender.split(/(\[근로시간 및 휴게\][\s\S]*?(?=\n\n|\n제|$))|(\[임금 구성항목 예시\][\s\S]*?(?=\n\n|\n제|$))|(<div class="my-7 p-4 border border-slate-200 rounded-2xl bg-slate-50\/50 font-sans probation-tag-container">[\s\S]*?<\/div>)|(\[개인정보 동의\][\s\S]*?(?=\n\n|\n제|$))/);

                  return parts.map((part, idx) => {
                    if (!part) return null;

                    if (part.includes('probation-tag-container')) {
                      return <div key={idx} dangerouslySetInnerHTML={{ __html: part }} />;
                    }

                    if (part.includes('[개인정보 동의]')) {
                      return (
                        <div key={idx} className="my-7 font-sans">
                          <h4 className="text-[13px] font-black text-slate-800 mb-1 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-slate-800 rounded-full"></span>
                            개인정보 수집 및 이용에 대한 동의 (필수)
                          </h4>
                          <table className="w-full border-collapse border border-slate-300 text-[10px]">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="border border-slate-300 p-1.5 w-1/4">수집·이용 목적</th>
                                <th className="border border-slate-300 p-1.5 w-1/2">개인정보 항목</th>
                                <th className="border border-slate-300 p-1.5 w-1/4">보유 및 이용기간</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-slate-300 p-1.5 text-center align-middle text-[10px] leading-relaxed">인적자원관리, 노무관리, 급여지급 등</td>
                                <td className="border border-slate-300 p-1.5 text-center text-[10px] leading-relaxed">성명, 주민번호, 주소, 연락처, 학력, 경력, 자격사항, 급여계좌 등</td>
                                <td className="border border-slate-300 p-1.5 text-center align-middle text-[10px] leading-relaxed">근로관계 유지 기간 (퇴사 후 법정 보존기간까지)</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    }

                    if (part.includes('[근로시간 및 휴게]')) {
                      return (
                        <div key={idx} className="my-7 bg-slate-50 border border-slate-200 p-4 rounded-2xl font-sans relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-2 opacity-10">
                            <span className="text-xl">⏰</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-8 gap-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">근무일</span>
                              <span className="text-[13px] font-black text-slate-800">월요일 ~ 금요일</span>
                            </div>
                            <div className="flex items-center gap-2 border-l border-slate-200 pl-8">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">소정근로시간</span>
                              <div className="flex items-baseline gap-2">
                                <span className="text-[13px] font-black text-blue-600">
                                  {contract?.shift_start_time?.slice(0, 5) || '09:00'} ~ {contract?.shift_end_time?.slice(0, 5) || '18:00'}
                                </span>
                                <span className="text-[10px] font-bold text-blue-400">(월 209시간)</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 border-l border-slate-200 pl-8">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">휴게시간</span>
                              <span className="text-[13px] font-black text-slate-600">
                                {contract?.break_start_time?.slice(0, 5) || '12:00'} ~ {contract?.break_end_time?.slice(0, 5) || '13:00'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (part.includes('[임금 구성항목 예시]')) {
                      const breakdown = {
                        base_salary: (staff?.base_salary || contract?.base_salary || 0),
                        meal_allowance: (staff?.meal_allowance || contract?.meal_allowance || 0),
                        vehicle_allowance: (staff?.vehicle_allowance || contract?.vehicle_allowance || 0),
                        childcare_allowance: (staff?.childcare_allowance || contract?.childcare_allowance || 0),
                        research_allowance: (staff?.research_allowance || contract?.research_allowance || 0),
                        other_taxfree: (staff?.other_taxfree || contract?.other_taxfree || 0),
                        position_allowance: (staff?.position_allowance || contract?.position_allowance || 0),
                      };
                      const { rows, totalMonthly, hourlyWage } = getOrdinaryWageTable(breakdown);

                      return (
                        <div key={idx} className="my-7 bg-gradient-to-br from-white to-slate-50 border border-blue-100 p-4 rounded-2xl shadow-sm relative overflow-hidden font-sans">
                          <h5 className="text-[13px] font-black text-blue-800 mb-2 flex items-center gap-2 relative z-10">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                            월 급여 구성 항목 및 통상임금 산출 (월 209시간 기준)
                          </h5>
                          <div className="space-y-0.5 relative z-10">
                            {rows.map((r, i) => (
                              <div key={i} className="flex justify-between items-center py-0.5 border-b border-blue-50/50">
                                <span className="text-[10px] font-bold text-slate-500">{r.label}</span>
                                <span className="text-[11px] font-black text-slate-700">{r.amount.toLocaleString()}원</span>
                              </div>
                            ))}
                            <div className="mt-4 pt-4 border-t-2 border-slate-300 grid grid-cols-2 gap-4">
                              <div className="bg-blue-600/5 p-3 rounded-xl border border-blue-600/10">
                                <p className="text-[10px] font-bold text-blue-600 uppercase">월 통상급여 합계</p>
                                <p className="text-lg font-black text-blue-700 mt-1">{totalMonthly.toLocaleString()}원</p>
                              </div>
                              <div className="bg-emerald-600/5 p-3 rounded-xl border border-emerald-600/10 text-right">
                                <p className="text-[10px] font-bold text-emerald-600 uppercase">시급 환산 (통상)</p>
                                <p className="text-lg font-black text-emerald-700 mt-1">{hourlyWage.toLocaleString()}원</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return <span key={idx}>{part}</span>;
                  });
                })()}
              </div>

              {/* 하단 서명란 - 날짜 및 자동 날인/서명 */}
              <div className="mt-20 pt-10 border-t border-dotted border-gray-300 flex flex-col items-center">
                <div className="mb-12">
                  <p className="text-[15px] font-bold tracking-[0.3em]">{new Date().getFullYear()}년 {String(new Date().getMonth() + 1).padStart(2, '0')}월 {String(new Date().getDate()).padStart(2, '0')}일</p>
                </div>

                <div className="w-full flex justify-between items-start mt-6">
                  {/* 사업주 (사용자) */}
                  <div className="flex flex-col gap-4 w-1/2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">[사용자]</span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-[13px]">{company?.name || staff.company}</p>
                      <div className="relative inline-block w-fit">
                        {(() => {
                          const isHosp = (company?.name || staff.company || '').match(/병원|의원|정형외과|내과|소아과|치과/);
                          const title = isHosp ? '대표원장' : '대표이사';
                          return (
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-[14px]">{title} {company?.ceo_name || '(인)'}</p>
                            </div>
                          );
                        })()}
                        {company?.seal_url && (
                          <img
                            src={company.seal_url}
                            className="absolute -top-6 -right-12 w-16 h-16 object-contain opacity-90 select-none pointer-events-none"
                            style={{ mixBlendMode: 'multiply' }}
                            alt="직인"
                          />
                        ) || (
                            <div className="absolute -top-4 -right-10 w-12 h-12 border-2 border-red-500/40 rounded-full flex items-center justify-center rotate-12 opacity-50">
                              <span className="text-[10px] text-red-500/60 font-bold">인</span>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 w-1/2 items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">[근로자]</span>
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="flex items-center gap-3 justify-end relative h-10">
                        {sig ? (
                          <>
                            <p className="font-bold text-[14px]">{staff.name} (인)</p>
                            {sig.startsWith('data:image') ? (
                              <img src={sig} alt="signature" className="absolute -top-8 -right-8 h-20 w-auto object-contain mix-blend-multiply" />
                            ) : (
                              <span className="absolute -top-4 -right-4 px-4 py-2 border border-black font-bold rotate-[-2deg] bg-white/50">{sig}</span>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="font-bold text-[14px]">{staff.name} (서명)</p>
                            <div className="absolute -top-2 -right-4 w-28 h-12 border border-dashed border-gray-200 flex items-center justify-center text-[10px] text-gray-300 bg-gray-50/30 rounded-lg">서명 대기</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-20 text-[10px] text-gray-400 text-center w-full border-t border-gray-100 pt-4">
                  본 문서는 SY INC. 인사관리 시스템을 통해 체결된 전자문서입니다.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Props = {
  staff?: any;
  contract?: any;
};

export default function ContractPreview({ staff, contract }: Props) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [shift, setShift] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!staff) {
        setText('');
        return;
      }
      setLoading(true);
      try {
        const companyName = staff.company || '전체';

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

        let companyInfo: any = null;
        if (companyName && companyName !== '전체') {
          const { data: companyRow } = await supabase
            .from('companies')
            .select('*')
            .eq('name', companyName)
            .maybeSingle();
          companyInfo = companyRow;
        }

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
      <div className="bg-white border border-[var(--border)] shadow-sm p-4 flex items-center justify-center h-[800px] text-xs text-[var(--toss-gray-3)]">
        계약 대상자를 왼쪽에서 선택하면 이곳에 근로계약서가 미리보기로 표시됩니다.
      </div>
    );
  }

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
      contract_start: formatDate(contract?.contract_start_date || user?.joined_at || salarySource?.join_date),
      contract_end: contract?.contract_end_date ? formatDate(contract.contract_end_date) : '정년도달시',
      conditions_applied_at: formatDate(contract?.conditions_applied_at || salarySource?.effective_date),
      today: formatDate(new Date().toISOString()),
    };

    let result = template;

    // [수습 기간] 태그 제거 (본문에서 자체적으로 다루므로 별도 태그 불필요)
    result = result.replace(/\[\s*수습\s*기간\s*\]/g, '');

    // 변수 치환
    Object.entries(vars).forEach(([key, value]) => {
      const token = `{{${key}}}`;
      if (result.includes(token)) {
        result = result.split(token).join(value || '');
      }
    });

    return result;
  }

  /** 계약서 텍스트를 조 단위 섹션으로 파싱 */
  function parseContractSections(rawText: string) {
    if (!rawText) return [];

    // 1. ASCII 표 장식 문자 제거
    let cleaned = rawText.replace(/[┌┬┐├┼┤└┴┘─│]+/g, '');
    // 제목 줄 (근 로 계 약 서 (월급제)) 제거 — 헤더에서 별도 렌더링
    cleaned = cleaned.replace(/근\s*로\s*계\s*약\s*서\s*\(\s*월\s*급\s*제\s*\)/, '');
    // [사용자 기본정보], [근로자 기본정보] 블록 제거 — 상단 표에서 별도 렌더링
    cleaned = cleaned.replace(/\[사용자 기본정보\][\s\S]*?(?=제\d+조|────|$)/m, '');
    cleaned = cleaned.replace(/\[근로자 기본정보\][\s\S]*?(?=제\d+조|────|$)/m, '');
    // 하단 동의 문구 추출
    cleaned = cleaned.replace(/\[상기[\s\S]*?체결한다\.\]/, '');

    // 2. 조 단위로 분할
    const sections: { title: string; body: string }[] = [];
    const sectionRegex = /제(\d+)조\s*\[([^\]]+)\]/g;
    const matches: { index: number; fullMatch: string; num: string; title: string }[] = [];

    let m;
    while ((m = sectionRegex.exec(cleaned)) !== null) {
      matches.push({ index: m.index, fullMatch: m[0], num: m[1], title: m[2] });
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].fullMatch.length;
      const end = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
      let body = cleaned.slice(start, end).trim();
      // 구분선 제거
      body = body.replace(/─+/g, '').trim();
      // [임금 구성항목 예시] 같은 서브타이틀 포함
      sections.push({
        title: `제${matches[i].num}조 [${matches[i].title}]`,
        body,
      });
    }

    return sections;
  }

  /** 급여 상세 표 렌더링 (실제 직원 데이터 기반) */
  function renderSalaryTable() {
    const src = contract || staff || {};
    const items = [
      { label: '기본급', amount: Number(src.base_salary || 0), note: '월 고정 지급', taxable: true },
      { label: '직책수당', amount: Number(src.position_allowance || staff?.position_allowance || 0), note: '직책별 차등', taxable: true },
      { label: '식대', amount: Number(src.meal_allowance || staff?.meal_allowance || 0), note: '비과세 (월 20만 한도)', taxable: false },
      { label: '자가운전보조금', amount: Number(src.vehicle_allowance || staff?.vehicle_allowance || 0), note: '비과세 (월 20만 한도)', taxable: false },
      { label: '보육수당', amount: Number(src.childcare_allowance || staff?.childcare_allowance || 0), note: '비과세', taxable: false },
      { label: '연구활동비', amount: Number(src.research_allowance || staff?.research_allowance || 0), note: '비과세 (월 20만 한도)', taxable: false },
      { label: '기타 비과세', amount: Number(src.other_taxfree || staff?.other_taxfree || 0), note: '비과세', taxable: false },
    ].filter(item => item.amount > 0);

    const totalMonthly = items.reduce((sum, i) => sum + i.amount, 0);
    const taxableTotal = items.filter(i => i.taxable).reduce((sum, i) => sum + i.amount, 0);
    const taxFreeTotal = items.filter(i => !i.taxable).reduce((sum, i) => sum + i.amount, 0);
    const hourlyWage = Math.round(taxableTotal / 209);

    return (
      <div className="mt-4 mb-2 bg-[var(--tab-bg)]/80 border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">임금 구성항목</span>
        </div>
        {/* 테이블 헤더 */}
        <div className="grid grid-cols-12 gap-1 pb-1.5 border-b-2 border-[var(--border)] mb-1">
          <span className="col-span-4 text-[10px] font-bold text-[var(--toss-gray-4)]">구성항목</span>
          <span className="col-span-3 text-[10px] font-bold text-[var(--toss-gray-4)] text-right">월 지급액(원)</span>
          <span className="col-span-2 text-[10px] font-bold text-[var(--toss-gray-4)] text-center">과세구분</span>
          <span className="col-span-3 text-[10px] font-bold text-[var(--toss-gray-4)] text-right">비고</span>
        </div>
        {/* 항목 줄 */}
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
            <span className="col-span-4 text-[11px] font-semibold text-[var(--toss-gray-5)]">{item.label}</span>
            <span className="col-span-3 text-[11px] font-black text-[var(--foreground)] text-right">{item.amount.toLocaleString()}</span>
            <span className={`col-span-2 text-[10px] font-bold text-center ${item.taxable ? 'text-orange-600' : 'text-emerald-600'}`}>
              {item.taxable ? '과세' : '비과세'}
            </span>
            <span className="col-span-3 text-[10px] text-[var(--toss-gray-3)] text-right">{item.note}</span>
          </div>
        ))}
        {/* 합계 줄 */}
        <div className="grid grid-cols-12 gap-1 mt-2 pt-2 border-t-2 border-[var(--border)]">
          <span className="col-span-4 text-[11px] font-black text-[var(--foreground)]">월 급여 합계</span>
          <span className="col-span-3 text-[12px] font-black text-blue-700 text-right">{totalMonthly.toLocaleString()}</span>
          <span className="col-span-5 text-[10px] text-[var(--toss-gray-3)] text-right">
            과세 {taxableTotal.toLocaleString()} + 비과세 {taxFreeTotal.toLocaleString()}
          </span>
        </div>
        <div className="grid grid-cols-12 gap-1 mt-1">
          <span className="col-span-4 text-[10px] font-bold text-[var(--toss-gray-4)]">시급 환산 (통상임금)</span>
          <span className="col-span-3 text-[11px] font-black text-emerald-700 text-right">{hourlyWage.toLocaleString()}</span>
          <span className="col-span-5 text-[10px] text-[var(--toss-gray-3)] text-right">= 과세합계 ÷ 209시간</span>
        </div>
      </div>
    );
  }

  /** 섹션 본문을 줄 단위로 렌더링 */
  function renderSectionBody(body: string) {
    // [임금 구성항목 예시] 서브섹션이 있으면 해당 부분을 실제 데이터 기반 표로 대체
    const hasSalarySection = body.includes('임금 구성항목');

    const lines = body.split('\n').filter(l => l.trim());
    const result: React.ReactNode[] = [];
    let skipSalaryLines = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      // [임금 구성항목 예시] 서브헤더를 만나면 실제 데이터 테이블로 대체
      if (hasSalarySection && trimmed.includes('임금 구성항목')) {
        result.push(<React.Fragment key={`salary-${i}`}>{renderSalaryTable()}</React.Fragment>);
        skipSalaryLines = true;
        continue;
      }

      // 급여 데이터 파싱 행들 스킵 (실제 테이블로 이미 대체했으므로)
      if (skipSalaryLines) {
        if (/^(구\s*성\s*항\s*목|기본급|식대|직책수당|기타수당|────)/.test(trimmed) || /금\s*액.*산\s*정/.test(trimmed)) {
          continue;
        }
        // 다음 항(①) 또는 빈 줄에서 스킵 종료
        if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(trimmed) || trimmed.startsWith('제') || !trimmed) {
          skipSalaryLines = false;
        } else {
          continue;
        }
      }

      // [기타 서브헤더]
      if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.includes('임금')) {
        result.push(
          <div key={i} className="mt-5 mb-2">
            <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
              {trimmed.replace(/[\[\]]/g, '')}
            </span>
          </div>
        );
        continue;
      }

      // ① ② 등의 항
      if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(trimmed)) {
        const num = trimmed[0];
        const rest = trimmed.slice(1).trim();
        result.push(
          <div key={i} className="flex gap-2 mt-2">
            <span className="text-blue-600 font-black text-[12px] shrink-0 mt-[1px]">{num}</span>
            <span className="text-[12.5px] text-[var(--toss-gray-5)] leading-[1.85]">{rest}</span>
          </div>
        );
        continue;
      }

      // - 대시 항목
      if (trimmed.startsWith('-') || trimmed.startsWith('·') || trimmed.startsWith('•')) {
        const content = trimmed.replace(/^[-·•]\s*/, '');
        result.push(
          <div key={i} className="flex gap-2 pl-5 mt-1">
            <span className="text-[var(--toss-gray-3)] shrink-0 mt-[2px]">•</span>
            <span className="text-[12px] text-[var(--toss-gray-4)] leading-[1.85]">{content}</span>
          </div>
        );
        continue;
      }

      // 일반 텍스트
      const indent = lines[i].match(/^\s*/)?.[0]?.length || 0;
      result.push(
        <p key={i} className="text-[12.5px] text-[var(--toss-gray-5)] leading-[1.85]" style={indent > 2 ? { paddingLeft: '1.25rem' } : {}}>
          {trimmed}
        </p>
      );
    }

    return result;
  }

  const sig = contract?.status === '서명완료' ? (contract?.signature_data as string | undefined) : undefined;
  const sections = parseContractSections(text);

  return (
    <div className="bg-[var(--muted)] md:p-4 flex flex-col h-[900px] overflow-y-auto rounded-2xl border border-[var(--border)] relative custom-scrollbar print:bg-white print:p-0 print:border-none print:h-auto print:overflow-visible">
      <div className="flex items-center justify-between px-4 py-4 mb-4 bg-white/50 backdrop-blur-md border-b border-[var(--border)] sticky top-0 z-20 print:hidden">
        <div>
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
          <button onClick={() => window.print()} className="p-2 rounded-xl bg-white border border-[var(--border)] hover:bg-[var(--muted)] transition-colors">
            <span className="text-sm">🖨️</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-5 flex justify-center">
        <div className="w-full max-w-[720px] bg-white shadow-sm rounded-sm border border-[var(--border)] min-h-[960px] flex flex-col p-[40px] md:p-[60px] relative overflow-hidden print:shadow-none print:border-none print:p-0">
          {/* Watermark */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.02] select-none">
            <span className="text-[120px] font-black rotate-[-45deg] text-black">CONFIDENTIAL</span>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--toss-gray-3)] gap-3">
              <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-bold">계약서 데이터를 구성 중입니다...</p>
            </div>
          ) : (
            <div className="relative z-10 w-full">
              {/* 계약서 제목 */}
              <h1 className="text-[26px] font-black text-center mb-14 tracking-[0.2em] text-[var(--foreground)]" style={{ fontFamily: 'serif' }}>
                근 로 계 약 서
              </h1>

              {/* 상단 정보 테이블: 사용자 / 근로자 */}
              <div className="grid grid-cols-2 gap-3 mb-10">
                {/* 사용자(회사) 정보 */}
                <div className="w-full">
                  <h3 className="text-[11px] font-black text-[var(--foreground)] border-b-2 border-slate-800 pb-1 mb-0">「사용자」</h3>
                  <div className="grid grid-cols-12 border-l border-[var(--border)] text-[10.5px]">
                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">회사명</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-black text-[var(--foreground)]">{(company?.name as string) || staff.company}</div>

                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">사업자번호</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-semibold text-[var(--toss-gray-5)]">{(company?.business_no as string) || '-'}</div>

                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">주소</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-semibold text-[var(--toss-gray-5)] leading-tight">{(company?.address as string) || '-'}</div>

                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">연락처</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-semibold text-[var(--toss-gray-5)]">{(company?.phone as string) || '-'}</div>
                  </div>
                </div>

                {/* 근로자 정보 */}
                <div className="w-full">
                  <h3 className="text-[11px] font-black text-[var(--foreground)] border-b-2 border-slate-800 pb-1 mb-0">「근로자」</h3>
                  <div className="grid grid-cols-12 border-l border-[var(--border)] text-[10.5px]">
                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">성명</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-black text-[var(--foreground)]">{staff.name}</div>

                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">생년월일</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-semibold text-[var(--toss-gray-5)]">{staff.resident_no ? staff.resident_no.slice(0, 6) : '-'}</div>

                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">주소</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-semibold text-[var(--toss-gray-5)] leading-tight">{staff.address || '-'}</div>

                    <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center text-[var(--toss-gray-4)]">연락처</div>
                    <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-semibold text-[var(--toss-gray-5)]">{staff.phone || '-'}</div>
                  </div>
                </div>
              </div>

              {/* 구분선 */}
              <div className="border-t-2 border-slate-800 mb-4" />

              {/* 계약 조항 섹션들 */}
              <div className="space-y-4">
                {sections.length > 0 ? sections.map((section, idx) => (
                  <div key={idx}>
                    <h4 className="text-[13px] font-black text-[var(--foreground)] mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-600 rounded-full shrink-0" />
                      {section.title}
                    </h4>
                    <div className="pl-4 border-l-2 border-[var(--border-subtle)]">
                      {renderSectionBody(section.body)}
                    </div>
                  </div>
                )) : (
                  <p className="text-[13px] text-[var(--toss-gray-4)]">설정된 계약서 본문이 없습니다.</p>
                )}
              </div>

              {/* 동의 문구 */}
              <div className="mt-10 py-4 text-center">
                <p className="text-[12px] font-bold text-[var(--toss-gray-4)] leading-relaxed">
                  「상기 내용을 충분히 이해하고 이에 동의하여 근로계약을 체결한다.」
                </p>
              </div>

              {/* 하단 서명란 */}
              <div className="mt-12 pt-8 border-t border-dotted border-[var(--border)] flex flex-col items-center">
                <div className="mb-10">
                  <p className="text-[14px] font-bold tracking-[0.3em] text-[var(--foreground)]">
                    {new Date().getFullYear()}년 {String(new Date().getMonth() + 1).padStart(2, '0')}월 {String(new Date().getDate()).padStart(2, '0')}일
                  </p>
                </div>

                <div className="w-full flex justify-between items-start mt-4">
                  {/* 사업주 (사용자) */}
                  <div className="flex flex-col gap-3 w-1/2">
                    <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">「사용자」</span>
                    <div className="space-y-1">
                      <p className="font-bold text-[13px] text-[var(--foreground)]">{(company?.name as string) || staff.company}</p>
                      <div className="relative inline-block w-fit">
                        {(() => {
                          const isHosp = ((company?.name as string) || staff.company || '').match(/병원|의원|정형외과|내과|소아과|치과/);
                          const title = isHosp ? '대표원장' : '대표이사';
                          return <p className="font-bold text-[13px] text-[var(--foreground)]">{title} {(company?.ceo_name as string) || '(인)'}</p>;
                        })()}
                        {company?.seal_url ? (
                          <img
                            src={company.seal_url as string}
                            className="absolute -top-6 -right-12 w-16 h-16 object-contain opacity-90 select-none pointer-events-none"
                            style={{ mixBlendMode: 'multiply' }}
                            alt="직인"
                          />
                        ) : (
                          <div className="absolute -top-4 -right-10 w-12 h-12 border-2 border-red-500/40 rounded-full flex items-center justify-center rotate-12 opacity-50">
                            <span className="text-[10px] text-red-500/60 font-bold">인</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 w-1/2 items-end">
                    <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">「근로자」</span>
                    <div className="space-y-1 text-right">
                      <div className="flex items-center gap-3 justify-end relative h-10">
                        {sig ? (
                          <>
                            <p className="font-bold text-[13px] text-[var(--foreground)]">{staff.name} (인)</p>
                            {sig.startsWith('data:image') ? (
                              <img src={sig} alt="signature" className="absolute -top-8 -right-8 h-20 w-auto object-contain mix-blend-multiply" />
                            ) : (
                              <span className="absolute -top-4 -right-4 px-4 py-2 border border-black font-bold rotate-[-2deg] bg-white/50">{sig}</span>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="font-bold text-[13px] text-[var(--foreground)]">{staff.name} (서명)</p>
                            <div className="absolute -top-2 -right-4 w-24 h-10 border border-dashed border-[var(--border)] flex items-center justify-center text-[9px] text-[var(--toss-gray-3)] bg-[var(--tab-bg)]/30 rounded-lg">서명 대기</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-16 text-[9px] text-[var(--toss-gray-3)] text-center w-full border-t border-[var(--border-subtle)] pt-3 print:hidden">
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

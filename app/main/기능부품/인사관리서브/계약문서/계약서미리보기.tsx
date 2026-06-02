'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
} from '@/lib/payroll-working-hours';
import {
  hasInlineContractReceiptSection,
  upgradeLegacyContractTemplate,
} from '@/lib/contract-template-defaults';
import { fillEmploymentContractTemplate } from '@/lib/contract-template-render';
import { stripContractClosingLines } from '@/lib/contract-template-closing';
import {
  getShiftBandGroupRows,
  getWeeklyRotationShiftIds,
  isShiftBandGroupRow,
  orderShiftsByIds,
  withWeeklyRotationShifts,
} from '@/lib/contract-shift-rotation';
import ContractStandardPreview from './계약서표준미리보기';
import ConfidentialityPledge from './비밀유지서약서';

type Props = {
  staff?: any;
  contract?: any;
  templateOverride?: string;
  sealUrlOverride?: string | null;
  showToolbar?: boolean;
};

export default function ContractPreview({
  staff,
  contract,
  templateOverride,
  sealUrlOverride,
  showToolbar = true,
}: Props) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [shift, setShift] = useState<Record<string, unknown> | null>(null);
  const [templateSource, setTemplateSource] = useState<string | null>(null);
  const hasTemplateOverride = templateOverride !== undefined;

  useEffect(() => {
    const load = async () => {
      if (!staff) {
        setText('');
        setTemplateSource(null);
        setCompany(null);
        setShift(null);
        return;
      }
      setLoading(true);
      try {
        const companyName = staff.company || '전체';

        let shiftData: any = null;
        const shiftIds = getWeeklyRotationShiftIds(staff, contract?.shift_id ?? staff.shift_id);
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

        let tmpl: { template_content?: string | null; seal_url?: string | null } | null = null;
        if (companyName) {
          const { data } = await supabase
            .from('contract_templates')
            .select('template_content, seal_url')
            .eq('company_name', companyName)
            .maybeSingle();
          tmpl = data;
        }

        let resolvedSealUrl: string | null | undefined =
          sealUrlOverride !== undefined ? sealUrlOverride : tmpl?.seal_url;

        if (!resolvedSealUrl && companyName && companyName !== '전체') {
          const { data: fallbackTmpl } = await supabase
            .from('contract_templates')
            .select('seal_url')
            .eq('company_name', '전체')
            .maybeSingle();
          resolvedSealUrl = fallbackTmpl?.seal_url ?? undefined;
        }

        setCompany({ ...companyInfo, seal_url: resolvedSealUrl ?? (companyInfo as any)?.seal_url });

        let templateText = '';
        if (!hasTemplateOverride) {
          templateText = tmpl?.template_content || '';
          if (!templateText) {
            const { data: fallback } = await supabase
              .from('contract_templates')
              .select('template_content')
              .eq('company_name', '전체')
              .maybeSingle();
            templateText = fallback?.template_content || '';
          }
        }
        setTemplateSource(templateText);
      } catch (e) {
        console.warn('ContractPreview load error', e);
        setText('');
        setTemplateSource(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staff?.id, staff?.company, staff?.shift_id, contract?.id, contract?.shift_id, hasTemplateOverride, sealUrlOverride]);

  useEffect(() => {
    if (!staff) {
      setText('');
      return;
    }

    if (!hasTemplateOverride && templateSource === null) {
      return;
    }

    const nextTemplate = hasTemplateOverride ? templateOverride || '' : templateSource;
    if (hasTemplateOverride && !(nextTemplate ?? '').trim()) {
      setText('');
      return;
    }

    setText(
      fillEmploymentContractTemplate(
        upgradeLegacyContractTemplate(nextTemplate),
        staff,
        contract,
        shift,
        company,
      ),
    );
  }, [staff, contract, shift, company, templateSource, templateOverride, hasTemplateOverride]);

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
    return fillEmploymentContractTemplate(template, user, contract, shift, company);
  }

  /** 계약서 텍스트를 조 단위 섹션으로 파싱 */
  function parseContractSections(rawText: string) {
    if (!rawText) return [];

    // 마지막 마무리 블록(회사/근로자/서명/교부 확인 등)은 하단의 구조화된 박스에서
    // 따로 렌더링하므로 본문 파싱에서 제외한다.
    const { mainText } = stripContractClosingLines(rawText);
    const base = mainText || rawText;

    // 1. ASCII 표 장식 문자 제거
    let cleaned = base.replace(/[┌┬┐├┼┤└┴┘─│]+/g, '');
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
    const wph = resolveWeeklyWorkingHours(src, resolveWeeklyWorkingHours(staff, 40));
    const monthlyWorkHours = getMonthlyWorkingHours(wph);
    const hourlyWage = calculateHourlyRateFromMonthlySalary(totalMonthly, wph);

    return (
      <div className="mt-4 mb-2 bg-[var(--tab-bg)]/80 border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-black text-blue-700 bg-blue-500/10 px-2.5 py-1 rounded-md">임금 구성항목</span>
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
          <span className="col-span-5 text-[10px] text-[var(--toss-gray-3)] text-right">= 월 급여 합계 ÷ {monthlyWorkHours}시간 (주{wph}h 기준)</span>
        </div>
      </div>
    );
  }

  /** 섹션 본문을 줄 단위로 렌더링 */
  function renderSectionBody(body: string) {
    const hasSalarySection = body.includes('임금 구성항목');

    const lines = body.split('\n');
    const result: React.ReactNode[] = [];
    let skipSalaryLines = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      // [임금 구성항목] 서브헤더 → 실제 데이터 테이블로 대체
      if (hasSalarySection && trimmed.includes('임금 구성항목')) {
        result.push(<React.Fragment key={`salary-${i}`}>{renderSalaryTable()}</React.Fragment>);
        skipSalaryLines = true;
        continue;
      }

      // 급여 raw 데이터 행 스킵
      if (skipSalaryLines) {
        if (/^(구\s*성\s*항\s*목|기본급|식대|직책수당|기타수당|────|자가운전|보육|연구)/.test(trimmed) || /금\s*액.*산\s*정/.test(trimmed)) {
          continue;
        }
        if (/^[1-9]\./.test(trimmed) || /^[①-⑩가-하]/.test(trimmed) || trimmed.startsWith('제')) {
          skipSalaryLines = false;
        } else {
          continue;
        }
      }

      // 서명란: "사용자: ___(인/서명)" 패턴
      if (/사용자\s*[:：].*\(인\/서명\).*근로자\s*[:：].*\(인\/서명\)/.test(trimmed)) {
        result.push(
          <div key={i} className="mt-4 mb-2 flex items-center gap-6 py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg">
            {[
              { label: '사용자', accentClass: 'text-slate-600', borderClass: 'border-slate-400' },
              { label: '근로자', accentClass: 'text-blue-700', borderClass: 'border-blue-400' },
            ].map(({ label, accentClass, borderClass }) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <span className={`text-[10.5px] font-black shrink-0 ${accentClass}`}>{label}</span>
                <div className={`flex-1 border-b-2 ${borderClass} min-w-[80px]`} />
                <span className="text-[10px] text-slate-400 shrink-0">(인/서명)</span>
              </div>
            ))}
          </div>
        );
        continue;
      }

      // 체크박스 항목: □ 로 시작하는 줄
      if (trimmed.startsWith('□')) {
        const parts = trimmed.split(/□/).filter(Boolean);
        result.push(
          <div key={i} className="flex items-center gap-3 mt-2 pl-1">
            {parts.map((part, pi) => (
              <label key={pi} className="flex items-center gap-1.5 cursor-pointer select-none">
                <span className="w-3.5 h-3.5 border-2 border-slate-400 rounded-sm inline-block shrink-0" />
                <span className="text-[11.5px] text-slate-600">{part.trim()}</span>
              </label>
            ))}
          </div>
        );
        continue;
      }

      // [서브헤더] — 임금 제외
      if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.includes('임금')) {
        result.push(
          <div key={i} className="mt-4 mb-1.5">
            <span className="text-[11px] font-black text-blue-700 bg-blue-500/10 px-2.5 py-0.5 rounded-md">
              {trimmed.replace(/[\[\]]/g, '')}
            </span>
          </div>
        );
        continue;
      }

      // 숫자 항목: "1." "2." 등
      if (/^[0-9]+\./.test(trimmed)) {
        const dotIdx = trimmed.indexOf('.');
        const num = trimmed.slice(0, dotIdx + 1);
        const rest = trimmed.slice(dotIdx + 1).trim();
        result.push(
          <div key={i} className="flex gap-2 mt-1.5">
            <span className="text-slate-500 font-bold text-[12px] shrink-0 min-w-[18px]">{num}</span>
            <span className="text-[12.5px] text-slate-700 leading-[1.85]">{rest}</span>
          </div>
        );
        continue;
      }

      // ① ② 등의 항
      if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(trimmed)) {
        const num = trimmed[0];
        const rest = trimmed.slice(1).trim();
        result.push(
          <div key={i} className="flex gap-2 mt-1.5">
            <span className="text-blue-600 font-black text-[12px] shrink-0 mt-[1px]">{num}</span>
            <span className="text-[12.5px] text-slate-700 leading-[1.85]">{rest}</span>
          </div>
        );
        continue;
      }

      // 가) 나) 다) 등 소항목
      if (/^[가나다라마바사아자차카타파하]\)/.test(trimmed)) {
        result.push(
          <div key={i} className="flex gap-2 pl-5 mt-1">
            <span className="text-slate-500 font-bold text-[11.5px] shrink-0">{trimmed.slice(0, 2)}</span>
            <span className="text-[11.5px] text-slate-600 leading-[1.85]">{trimmed.slice(2).trim()}</span>
          </div>
        );
        continue;
      }

      // 1) 2) 3) 등 세부항목
      if (/^[0-9]+\)/.test(trimmed)) {
        result.push(
          <div key={i} className="flex gap-2 pl-8 mt-0.5">
            <span className="text-slate-400 text-[11px] shrink-0">{trimmed.slice(0, trimmed.indexOf(')') + 1)}</span>
            <span className="text-[11px] text-slate-500 leading-[1.8]">{trimmed.slice(trimmed.indexOf(')') + 1).trim()}</span>
          </div>
        );
        continue;
      }

      // - 대시 항목
      if (trimmed.startsWith('-') || trimmed.startsWith('·') || trimmed.startsWith('•')) {
        const content = trimmed.replace(/^[-·•]\s*/, '');
        result.push(
          <div key={i} className="flex gap-2 pl-5 mt-1">
            <span className="text-slate-400 shrink-0 mt-[2px]">•</span>
            <span className="text-[12px] text-slate-600 leading-[1.85]">{content}</span>
          </div>
        );
        continue;
      }

      // 일반 텍스트
      result.push(
        <p key={i} className="text-[12.5px] text-slate-700 leading-[1.85] mt-1">
          {trimmed}
        </p>
      );
    }

    return result;
  }

  const sig = contract?.status === '서명완료' ? (contract?.signature_data as string | undefined) : undefined;
  const sections = parseContractSections(text);
  const hasInlineClosingSection = hasInlineContractReceiptSection(text);

  const companyName = (company?.name as string) || staff.company || '';
  const isHospital = companyName.match(/병원|의원|정형외과|내과|소아과|치과/);
  const ceoTitle = isHospital ? '대표원장' : '대표이사';
  const contractDateText = contract?.requested_at
    ? `${new Date(contract.requested_at as string).getFullYear()}년 ${String(new Date(contract.requested_at as string).getMonth() + 1).padStart(2, '0')}월 ${String(new Date(contract.requested_at as string).getDate()).padStart(2, '0')}일`
    : `${new Date().getFullYear()}년        월        일`;

  return (
    <div className="flex flex-col h-[900px] overflow-y-auto rounded-2xl border border-[var(--border)] relative custom-scrollbar bg-slate-100 print:bg-white print:border-none print:h-auto print:overflow-visible">
      {/* 상단 툴바 */}
      {showToolbar && (
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[13px] font-bold text-slate-800">{staff.name}</span>
            <span className="text-[11px] text-slate-400">근로계약서</span>
          </div>
          <div className="flex items-center gap-2">
            {contract?.status && (
              <span className={`px-2.5 py-1 text-[10px] font-black rounded-full ${
                contract.status === '서명완료'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {contract.status}
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              <span>🖨️</span> 인쇄
            </button>
          </div>
        </div>
      )}

      {/* A4 용지 */}
      <div className="flex-1 p-6 flex justify-center">
        <div data-print-root className="w-full max-w-[700px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.10)] min-h-[980px] flex flex-col p-[16px] print:p-0 print:shadow-none print:max-w-full">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold">계약서 구성 중...</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 px-[40px] py-[36px] border-2 border-[#1e2a4a] rounded-[3px] shadow-[inset_0_0_0_3px_#fff,inset_0_0_0_5px_#c2a14d] print:border-0 print:rounded-none print:shadow-none print:px-0 print:py-0">
              <ContractStandardPreview
                templateText={text}
                closingData={{
                  companyName,
                  companyBusinessNo: (company?.business_no as string) || undefined,
                  companyAddress: (company?.address as string) || undefined,
                  companyPhone: (company?.phone as string) || undefined,
                  companyCeo: (company?.ceo_name as string) || undefined,
                  sealUrl: (company?.seal_url as string) || undefined,
                  employeeName: staff.name,
                  employeeAddress: staff.address || undefined,
                  employeePhone: staff.phone || undefined,
                  contractDate: contractDateText,
                  signatureDataUrl: sig,
                }}
              />

              <ConfidentialityPledge
                companyName={companyName}
                employeeName={staff.name}
                contractDate={contractDateText}
                signatureDataUrl={sig}
              />

              {/* 하단 여백 + 문서 식별 */}
              <div className="mt-8 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between print:hidden">
                <span className="text-[9px] text-[var(--toss-gray-3)] font-medium">본 문서는 전자인사관리 시스템을 통해 작성된 전자계약서입니다.</span>
                {contract?.id ? <span className="text-[9px] text-[var(--toss-gray-3)] font-mono">ID: {contract.id}</span> : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const VARIABLES: { key: string; desc: string; category: string }[] = [
  { key: '{{employee_name}}', desc: '직원 성명', category: '근로자' },
  { key: '{{employee_no}}', desc: '사번', category: '근로자' },
  { key: '{{department}}', desc: '부서', category: '근로자' },
  { key: '{{position}}', desc: '직위/직책', category: '근로자' },
  { key: '{{birth_date}}', desc: '생년월일', category: '근로자' },
  { key: '{{resident_no}}', desc: '주민등록번호', category: '근로자' },
  { key: '{{address}}', desc: '주소', category: '근로자' },
  { key: '{{phone}}', desc: '연락처', category: '근로자' },
  { key: '{{company_name}}', desc: '회사명', category: '사업자' },
  { key: '{{company_ceo}}', desc: '대표자명', category: '사업자' },
  { key: '{{company_business_no}}', desc: '사업자등록번호', category: '사업자' },
  { key: '{{company_address}}', desc: '회사 주소', category: '사업자' },
  { key: '{{company_phone}}', desc: '회사 연락처', category: '사업자' },
  { key: '{{join_date}}', desc: '입사일', category: '계약' },
  { key: '{{contract_start}}', desc: '계약 시작일', category: '계약' },
  { key: '{{contract_end}}', desc: '계약 종료일', category: '계약' },
  { key: '{{conditions_applied_at}}', desc: '근로조건 적용일', category: '계약' },
  { key: '{{probation_months}}', desc: '수습 기간(개월)', category: '계약' },
  { key: '{{contract_type}}', desc: '고용형태(정규직/계약직)', category: '계약' },
  { key: '{{today}}', desc: '오늘 날짜', category: '계약' },
  { key: '{{base_salary}}', desc: '기본급 (원)', category: '임금' },
  { key: '{{position_allowance}}', desc: '직책수당', category: '임금' },
  { key: '{{meal_allowance}}', desc: '식대', category: '임금' },
  { key: '{{vehicle_allowance}}', desc: '자가운전보조금', category: '임금' },
  { key: '{{childcare_allowance}}', desc: '보육수당', category: '임금' },
  { key: '{{research_allowance}}', desc: '연구활동비', category: '임금' },
  { key: '{{other_taxfree}}', desc: '기타 비과세', category: '임금' },
  { key: '{{total_monthly}}', desc: '월 급여 합계', category: '임금' },
  { key: '{{annual_salary}}', desc: '연봉', category: '임금' },
  { key: '{{hourly_wage}}', desc: '통상임금 시급', category: '임금' },
  { key: '{{working_hours_per_week}}', desc: '주당 근로시간', category: '근무' },
  { key: '{{working_days_per_week}}', desc: '주당 근무일수', category: '근무' },
  { key: '{{shift_start}}', desc: '출근 시간', category: '근무' },
  { key: '{{shift_end}}', desc: '퇴근 시간', category: '근무' },
  { key: '{{break_start}}', desc: '휴게 시작', category: '근무' },
  { key: '{{break_end}}', desc: '휴게 종료', category: '근무' },
  { key: '{{payment_day}}', desc: '급여 지급일', category: '근무' },
];

const CATEGORY_COLORS: Record<string, string> = {
  근로자: 'bg-blue-50 text-blue-700 border-blue-200',
  사업자: 'bg-violet-50 text-violet-700 border-violet-200',
  계약: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  임금: 'bg-orange-50 text-orange-700 border-orange-200',
  근무: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const DEFAULT_TEMPLATE = `제1조 [목적]
사용자 {{company_name}}(이하 "사용자"라 한다)과 근로자 {{employee_name}}(이하 "근로자"라 한다)는 아래 조건으로 근로계약을 체결한다.

제2조 [근로 기간]
① 근로 계약 기간: {{contract_start}} ~ {{contract_end}}
② 수습 기간: 입사일로부터 {{probation_months}}개월 (수습 기간 중 급여는 본봉의 90% 적용)
③ 수습 기간 종료 후 근로조건 적용일: {{conditions_applied_at}}

제3조 [근무 장소 및 업무]
① 근무 장소: {{company_address}}
② 담당 업무: {{department}} {{position}}

제4조 [근무 시간]
① 소정 근로시간: 주 {{working_hours_per_week}}시간, 주 {{working_days_per_week}}일 근무
② 근무 시간: {{shift_start}} ~ {{shift_end}}
③ 휴게 시간: {{break_start}} ~ {{break_end}} (근무 시간 중)
④ 휴일: 매주 토요일·일요일, 공휴일 및 회사가 지정한 날

제5조 [임금]
① 임금 구성은 아래와 같다.

[임금 구성항목 예시]
구성항목  금액  산정기준
기본급  {{base_salary}}원  월 고정 지급
직책수당  {{position_allowance}}원  직책별 차등 지급
식대  {{meal_allowance}}원  비과세 (월 200,000원 한도)
────

② 월 급여 합계: {{total_monthly}}원
③ 연봉 합계: {{annual_salary}}원
④ 통상임금 시급: {{hourly_wage}}원 (통상임금 산정기준시간 기준)
⑤ 급여 지급일: 매월 {{payment_day}}일 (휴일인 경우 전 영업일 지급)
⑥ 급여 지급 방법: 근로자 명의 계좌 이체

제6조 [연차유급휴가]
① 근로기준법 제60조에 따라 1년간 80% 이상 출근 시 15일의 유급휴가를 부여한다.
② 최초 1년 미만 근무자에게는 매월 1일의 유급휴가를 부여한다.
③ 미사용 연차는 연차수당으로 보상한다.

제7조 [사회보험]
① 사용자는 관계법령에 따라 4대 보험(국민연금, 건강보험, 고용보험, 산재보험)에 가입한다.
② 보험료 중 근로자 부담분은 급여에서 공제한다.

제8조 [취업규칙]
① 이 계약서에 명시되지 않은 사항은 취업규칙 및 근로기준법을 따른다.
② 근로자는 회사의 취업규칙을 준수하여야 한다.`;

interface TemplateEditorProps {
  selectedCo?: string;
}

export default function ContractTemplateEditor({ selectedCo }: TemplateEditorProps) {
  const [companies, setCompanies] = useState<string[]>([]);
  const [targetCompany, setTargetCompany] = useState<string>('전체');
  const [templateContent, setTemplateContent] = useState('');
  const [sealUrl, setSealUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeVarCategory, setActiveVarCategory] = useState<string>('전체');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.from('companies').select('name').then(({ data }) => {
      if (data) setCompanies(['전체', ...data.map((c: any) => c.name)]);
    });
  }, []);

  useEffect(() => {
    if (selectedCo && selectedCo !== '전체') setTargetCompany(selectedCo);
  }, [selectedCo]);

  useEffect(() => { loadTemplate(); }, [targetCompany]);

  const loadTemplate = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contract_templates')
      .select('template_content, seal_url')
      .eq('company_name', targetCompany)
      .maybeSingle();
    if (data?.template_content) {
      setTemplateContent(data.template_content);
      setSealUrl(data.seal_url || '');
    } else {
      setTemplateContent(DEFAULT_TEMPLATE);
      setSealUrl('');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('contract_templates')
      .upsert(
        { company_name: targetCompany, template_content: templateContent, seal_url: sealUrl, updated_at: new Date().toISOString() },
        { onConflict: 'company_name' }
      );
    if (error) toast('저장에 실패했습니다: ' + error.message, 'error');
    else toast(`'${targetCompany}' 계약서 양식이 저장되었습니다.`, 'success');
    setSaving(false);
  };

  const insertVariable = (varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = templateContent.slice(0, start);
    const after = templateContent.slice(end);
    const updated = before + varKey + after;
    setTemplateContent(updated);
    // 커서를 변수 끝으로 이동
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varKey.length, start + varKey.length);
    }, 0);
  };

  const categories = ['전체', ...Array.from(new Set(VARIABLES.map(v => v.category)))];
  const filteredVars = activeVarCategory === '전체' ? VARIABLES : VARIABLES.filter(v => v.category === activeVarCategory);

  // 에디터에서 {{변수}} 를 하이라이트 표시하기 위해 미리보기 생성
  // XSS 방지: HTML 특수문자를 먼저 이스케이프 후 변수만 하이라이트
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const highlightedPreview = escapeHtml(templateContent).replace(
    /\{\{([^}]+)\}\}/g,
    (_, key) => `<mark class="bg-blue-100 text-blue-800 px-0.5 rounded text-[11px] font-semibold not-italic">{{${key}}}</mark>`
  );

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 툴바 */}
      <div className="px-4 py-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">양식 대상</span>
          <select
            value={targetCompany}
            onChange={e => setTargetCompany(e.target.value)}
            className="px-3 py-1.5 bg-[var(--muted)] rounded-lg text-xs font-bold outline-none border border-[var(--border)] appearance-none"
          >
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">직인 이미지 URL</span>
          <input
            type="text"
            value={sealUrl}
            onChange={e => setSealUrl(e.target.value)}
            placeholder="https://... (선택사항)"
            className="w-52 px-3 py-1.5 bg-[var(--muted)] rounded-lg text-xs outline-none border border-[var(--border)]"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={loadTemplate}
            className="px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] bg-[var(--muted)] border border-[var(--border)] rounded-lg hover:bg-[var(--tab-bg)] transition-colors"
          >
            초기화
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-[11px] font-bold bg-[var(--foreground)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* 좌측: 에디터 패널 */}
        <div className="w-1/2 flex flex-col border-r border-[var(--border)] min-h-0">
          {/* 에디터 상단: 변수 삽입 팔레트 */}
          <div className="p-3 bg-[var(--tab-bg)]/60 border-b border-[var(--border)] space-y-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-[var(--toss-gray-4)] uppercase tracking-wider">변수 삽입</span>
              <div className="flex gap-1 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveVarCategory(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${activeVarCategory === cat ? 'bg-[var(--foreground)] text-white' : 'bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] border border-[var(--border)]'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
              {filteredVars.map(v => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  title={v.desc}
                  className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold hover:opacity-80 transition-all ${CATEGORY_COLORS[v.category] || 'bg-gray-50 text-gray-700 border-gray-200'}`}
                >
                  {v.key} <span className="opacity-60 font-sans not-italic">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* textarea */}
          <div className="flex-1 relative min-h-0">
            {loading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                <div className="w-6 h-6 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={templateContent}
              onChange={e => setTemplateContent(e.target.value)}
              className="w-full h-full resize-none p-4 font-mono text-[12px] leading-[1.8] bg-[#1e1e2e] text-[#cdd6f4] outline-none custom-scrollbar"
              placeholder="계약서 본문을 입력하세요..."
              spellCheck={false}
            />
          </div>
        </div>

        {/* 우측: 미리보기 */}
        <div className="w-1/2 flex flex-col min-h-0 bg-[var(--page-bg)]">
          <div className="px-4 py-2.5 bg-[var(--card)] border-b border-[var(--border)] shrink-0 flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">미리보기 — <span className="text-[var(--accent)]">파란색 태그</span>가 실제 데이터로 치환됩니다</span>
            <span className="text-[10px] text-[var(--toss-gray-3)] font-medium">{templateContent.length.toLocaleString()}자</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            <div className="bg-white shadow-md border border-slate-200 rounded-sm min-h-[900px] p-[48px] max-w-[680px] mx-auto">
              {/* 제목 */}
              <div className="text-center mb-10 pb-6 border-b-2 border-slate-800">
                <h1 className="text-[22px] font-black tracking-[0.25em]" style={{ fontFamily: 'Georgia, serif' }}>
                  근 로 계 약 서
                </h1>
                <p className="text-[11px] text-slate-400 mt-1 font-medium">{targetCompany === '전체' ? '기본 양식' : targetCompany}</p>
              </div>

              {/* 미리보기 본문 */}
              <div
                className="text-[12.5px] leading-[1.95] text-slate-700 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: highlightedPreview }}
              />

              {/* 서명란 예시 */}
              <div className="mt-12 pt-6 border-t border-slate-200">
                <p className="text-center text-[11px] text-slate-500 font-semibold mb-8">
                  「상기 내용을 충분히 이해하고 이에 동의하여 본 근로계약을 체결합니다.」
                </p>
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">사 용 자</p>
                    <p className="text-[13px] font-bold text-slate-700">{targetCompany === '전체' ? '회사명' : targetCompany}</p>
                    <p className="text-[13px] font-bold text-slate-700">대표이사 ___________  (인)</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">근 로 자</p>
                    <p className="text-[13px] font-bold text-slate-700">성명 ___________  (서명)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  근로자: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  사업자: 'bg-violet-50 text-violet-700 border-violet-200',
  계약: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  임금: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  근무: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const DEFAULT_TEMPLATE = `제1조 [담당업무 및 근무장소]
1. 근로자는 사업장 및 사용자가 지정한 장소에서 근무한다.
2. 근무장소: {{company_name}} 내 지정 장소
3. 담당업무: {{department}} / {{position}}
4. 사용자는 업무의 필요성에 의하여 근로자의 근무장소 및 부서 또는 종사업무를 변경할 수 있다.

제2조 [근무기간]
1. 근로기간: {{contract_start}} ~ {{contract_end}}
2. 근로조건 적용일: {{conditions_applied_at}}
3. 수습기간: 입사일로부터 {{probation_months}}개월간 수습기간을 두며, 수습기간 중 임금은 본봉의 90%를 적용한다.
4. 수습기간 종료 후 업무능력 및 근무태도에 따라 정규직 전환 여부를 결정한다.

제3조 [수습기간]
1. 근로자의 입사일부터 {{probation_months}}개월 동안 수습기간을 둘 수 있다.
2. 수습기간 중 사용자는 근로자의 업무능력, 근무태도 등을 평가하며, 수습기간 만료 후 정규직 전환 여부를 결정한다.
3. 수습기간 중 근로계약을 해지할 경우 사용자는 근로자에게 사전 통보하여야 한다.

   사용자: ___________(인/서명)    근로자: ___________(인/서명)

제4조 [근무시간 및 휴게]
1. 소정 근로시간: 주 {{working_hours_per_week}}시간, 주 {{working_days_per_week}}일 근무
2. 근무시간: {{shift_start}} ~ {{shift_end}}
3. 휴게시간: {{break_start}} ~ {{break_end}} (근무시간 중 부여)
4. 휴일: 매주 토요일·일요일, 법정공휴일 및 회사가 지정한 날
5. 정규 업무시간 외 근무가 필요한 경우 사용자와 근로자 간 사전 합의 후 실시한다.

   사용자: ___________(인/서명)    근로자: ___________(인/서명)

제5조 [임금 및 구성항목]
1. 임금 구성은 아래와 같다.

[임금 구성항목 예시]
구성항목  금액  산정기준
기본급  {{base_salary}}원  월 고정 지급
────

2. 월 급여 합계: {{total_monthly}}원
3. 연봉 합계: {{annual_salary}}원
4. 통상임금 시급: {{hourly_wage}}원 (월 {{monthly_work_hours}}시간 기준)
5. 급여 지급일: 매월 {{payment_day}}일 이내 지급한다. (휴일인 경우 전 영업일 지급)
6. 급여 지급 방법: 근로자 명의 통장으로 계좌이체로 지급한다.
   가) 연장근무수당: 통상시급의 1.5배
   나) 야간근로수당: 오후 22:00 ~ 오전 06:00 사이 근무수당은 통상시급의 0.5배 가산
   다) 휴일근로수당: 통상시급의 1.5배 (8시간 초과분 2.0배)
   라) 임금 조정은 매년 1회 이상 이루어지며 최저임금보다 낮아질 수 없다.

제6조 [휴일 및 휴가]
1. 주휴일: 매주 1회 이상 유급휴일을 부여하되, 취업규칙에 정한 날로 한다.
2. 연차유급휴가: 근로기준법 제60조에 따라 1년간 80% 이상 출근 시 15일의 유급휴가를 부여한다.
3. 최초 1년 미만 근무자에게는 1개월 개근 시 1일의 유급휴가를 부여한다.
4. 미사용 연차는 연차수당으로 보상한다.

   □ 유급휴일 확인    □ 연차 확인    □ 기타 휴가 확인

   사용자: ___________(인/서명)    근로자: ___________(인/서명)

제7조 [퇴직금]
1. 근로자는 1년 이상 근무 시 퇴직금을 청구할 수 있다. (근로자퇴직급여보장법에 의거)
2. 사용자는 근로자퇴직급여보장법에 따라 퇴직급여제도를 설정하고 이를 성실히 이행한다.
3. 퇴직금은 계속 근로기간 1년에 대하여 30일분의 평균임금을 기준으로 산정한다.
4. 사용자는 근로자에게 적합한 근로환경을 제공하여야 한다.

제8조 [근로계약 해지 사유]
1. 근로자가 1개월 전 사전 서면으로 통보하여 퇴직하게 되는 경우
2. 업무상 부상을 입은 후 완치된 경우 (발병일과 관계없음)
3. 정당한 사유 없이 무단결근 등 취업규칙을 위반한 경우
4. 허위 이력서 등 부정한 방법으로 채용된 사실이 확인된 경우
5. 기타 근로기준법에서 정한 해고 사유에 해당하는 경우
6. 위 각 호에 해당하지 않는 경우 사용자는 30일 전 서면 통보하거나 30일분의 통상임금을 해고예고수당으로 지급한다.

제9조 [손해배상]
1. 근로자가 고의·과실로 회사에 손해를 끼친 경우 사용자는 손해배상을 청구할 수 있다.
2. 근로자가 중대한 과실로 인해 손해를 발생시킨 경우 산재보험 처리 여부를 불문하고 이에 대한 책임을 부담하여야 한다.
3. 손해 및 과실 책임에 따른 배상 범위는 관련 법령에 따른다.

제10조 [재산보호 및 보험]
1. 사용자는 관계법령에 따라 국민연금, 건강보험, 고용보험, 산업재해보상보험에 가입한다.
2. 보험료 중 근로자 부담분은 급여에서 공제한다.
3. 연장근무수당, 이직수당, 기타수당은 관계법령 및 취업규칙에 따라 지급한다.
4. 사용자와 근로자는 각자의 의무를 성실히 이행하여야 한다.

제11조 [기타근무조건]
1. 근로조건이 변경될 경우에는 사용자와 근로자 간 합의를 거쳐 계약서의 내용을 변경할 수 있다.
2. 이 계약서에 명시되지 않은 사항은 취업규칙 및 근로기준법에 따른다.
3. 근로자는 재직 중 및 퇴직 후 회사의 영업비밀, 고객정보 등을 제3자에게 누설하여서는 아니 된다.

제12조 [분쟁의 해결]
1. 이 근로계약에 대한 분쟁은 취업규칙, 근로기준법, 노동위원회에 의해 처리된다.
2. 사용자와 근로자는 근로계약서를 상호 확인하고 성실히 이행할 것을 약속한다.

제13조 [계약의 효력]
1. 본 계약서는 {{today}}부터 효력을 발생하며, 사용자와 근로자 각 1부씩 보관한다.
2. 이 계약서 이외에 해당 업무분야에 관한 약속과 근무수칙은 이 계약에 포함된다.
3. 본 계약서에 정하지 않은 사항에 대해서는 근로기준법 및 기타 노동 관계법령이 정하는 바에 따른다.`;

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
    (_, key) => `<mark class="bg-blue-500/20 text-blue-800 px-0.5 rounded text-[11px] font-semibold not-italic">{{${key}}}</mark>`
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
                  className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold hover:opacity-80 transition-all ${CATEGORY_COLORS[v.category] || 'bg-[var(--muted)] text-gray-700 border-gray-200'}`}
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
              <div className="text-center mb-6 pb-4 border-b-2 border-slate-800">
                <h1 className="text-[22px] font-black tracking-[0.25em]" style={{ fontFamily: '"Noto Serif KR", Georgia, serif' }}>
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
              <div className="mt-7 pt-4 border-t border-slate-200">
                <p className="text-center text-[11px] text-slate-500 font-semibold mb-5">
                  상기 근로계약의 내용을 충분히 이해하고 이에 동의하여 본 계약을 체결합니다.
                </p>
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest">사 용 자</p>
                    <p className="text-[13px] font-bold text-slate-700">{targetCompany === '전체' ? '회사명' : targetCompany}</p>
                    <p className="text-[13px] font-bold text-slate-700">대표이사 ___________  (인)</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest">근 로 자</p>
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

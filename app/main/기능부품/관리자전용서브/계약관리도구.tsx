'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// COMPANIES 상수는 이제 DB에서 동적으로 관리됩니다.

const DEFAULT_CONTRACT_TEMPLATE = `제1조 [계약의 목적]
본 계약은 사용자와 근로자 간의 근로조건을 명확히 함으로써 상호 신뢰와 협력을 바탕으로 업무를 수행함을 목적으로 한다.

제2조 [담당업무 및 근무장소]
① (근무장소) 근로자의 근무장소는 {{company_name}} 내 지정된 장소로 한다. 단, 사용자는 업무상 필요 시 근로자와 협의하여 근무장소를 변경할 수 있다.
② (담당업무) 근로자의 주된 업무는 사용자가 지정한 직무로 하며, 경영상 필요에 따라 부수적인 업무를 수행하거나 직무를 변경할 수 있다.

제3조 [근로계약기간 및 수습]
① (근계기간) {{join_date}}부터 기간의 정함이 없는 근로계약을 체결한 것으로 한다. (또는 별도로 정한 종료일까지로 한다.)
② (수습기간) 신규 입사 시 입사일로부터 3개월간을 수습기간으로 둘 수 있으며, 수습기간 중 근무태도, 업무수행능력, 자질, 건강상태 등을 종합적으로 평가하여 채용 부적격자로 판정될 경우 본 채용을 거부할 수 있다.

제4조 [근로시간 및 휴게]
① (근로시간) 근로자의 소정근로시간은 주 40시간을 원칙으로 하며, 상세 시간은 다음과 같다.
   - 시업시각: {{shift_start}} / 종업시각: {{shift_end}}
② (휴게시간) 휴게시간은 중식 또는 휴식을 위해 {{break_start}} ~ {{break_end}}까지 제공하며, 업무 특성 및 운영상 필요한 경우 근로자와 합의하여 휴게시간을 분할하거나 변경하여 부여할 수 있다.
③ (연장근로) 사용자와 근로자는 필요한 경우 관련 법령이 정하는 범위 내에서 연장·야간·휴일근로를 실시하는 것에 합의한다.

제5조 [임금 및 구성항목]
① (월급여) 근로자의 임금은 월급제로 하며 구성 항목은 다음과 같다.
   - 기본급: 금 {{base_salary}}원
   - 식대: 금 {{meal_allowance}}원
   - 직책수당: 금 {{position_allowance}}원
   - 기타수당(비과세 등): 금 {{other_taxfree}}원
② (지급일) 임금은 매월 1일부터 말일까지 산정하여 익월 지정일에 근로자의 명의로 된 계좌로 지급한다. (지급일이 휴일인 경우 전일 또는 익영업일)
③ (일할계산) 중도 입·퇴사 시 해당 월의 근무일수에 따라 일할 계산하여 지급한다.

제6조 [휴일 및 휴가]
① (유급휴일) 주 1회 유급 주휴일, 근로자의 날, 기타 관련 법령에서 정한 공휴일을 유급휴일로 한다.
② (연차유급휴가) 근로기준법에서 정하는 바에 따라 연차유급휴가를 부여하며, 근로자는 이를 자유롭게 사용한다.

제7조 [사직 및 해고]
① (사직) 근로자가 퇴직하고자 할 때에는 업무 공백 최소화를 위하여 최소 30일 이전에 사직서를 제출하고, 퇴직일까지 성실히 근무하며 후임자에게 업무 인수인계를 명확히 완료하여야 한다.
② (해고) 사용자는 근로자가 제 규정을 위반하거나 사회통념상 근로관계를 지속할 수 없는 중대한 사유가 발생한 경우 관련 절차에 따라 계약을 해지할 수 있다.

제8조 [비밀유지 및 손해배상]
① (비밀유지) 근로자는 재직 중은 물론 퇴직 후에도 업무상 알게 된 회사의 경영·기술·고객 정보 등 비밀을 제3자에게 누설하거나 부당하게 이용하지 않는다.
② (손해배상) 근로자의 고의 또는 중대한 과실로 인하여 사용자에게 재산상 손해를 입힌 경우, 근로자는 이를 배상할 책임이 있다.

제9조 [기타 및 준용]
① 근로자는 산업안전보건법 등 관련 법령에 따라 회사가 실시하는 정기 건강검진을 성실히 수검하여야 한다. (미수검으로 인한 과태료 발생 및 불이익은 근로자가 부담한다.)
② 본 계약서에 명시되지 않은 사항은 취업규칙 및 근로기준법 등 관련 법령과 일반적인 상관례에 따르기로 한다.`;

export default function ContractManager() {
  const [selectedCo, setSelectedCo] = useState('박철홍정형외과');
  const [companies, setCompanies] = useState<any[]>([]);
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sealUrl, setSealUrl] = useState<string | null>(null);
  const [uploadingSeal, setUploadingSeal] = useState(false);

  useEffect(() => {
    supabase.from('companies').select('*').order('name').then(({ data }) => {
      if (data) setCompanies(data);
    });
  }, []);

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('contract_templates')
        .select('template_content, seal_url')
        .eq('company_name', selectedCo)
        .single();
      if (data?.template_content) {
        setTemplate(data.template_content);
        setSealUrl(data?.seal_url || null);
      } else {
        setSealUrl(data?.seal_url || null);
        const { data: fallback } = await supabase
          .from('contract_templates')
          .select('template_content')
          .eq('company_name', '전체')
          .single();
        setTemplate(fallback?.template_content || DEFAULT_CONTRACT_TEMPLATE);
      }
      setLoading(false);
    };
    fetchTemplate();
  }, [selectedCo]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('contract_templates').upsert(
      {
        company_name: selectedCo,
        template_content: template,
        seal_url: sealUrl,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_name', ignoreDuplicates: false }
    );
    setSaving(false);
    if (error) toast('저장 중 오류가 발생했습니다.', 'error');
    else toast(`${selectedCo} 계약서 표준 양식이 저장되었습니다. 인사관리에서 발송하는 계약서에 적용됩니다.`, 'success');
  };

  return (
    <div className="flex min-h-[calc(100dvh-180px)] flex-col overflow-x-hidden overflow-y-auto animate-in fade-in duration-500">
      {/* 상단 액션바: 회사 선택 및 저장 */}
      <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex max-w-full overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-1 no-scrollbar xl:max-w-[70%]">
          {companies.map(co => (
            <button
              key={co.id}
              onClick={() => setSelectedCo(co.name)}
              className={`px-5 py-1.5 text-[12px] font-bold rounded-[var(--radius-md)] transition-all whitespace-nowrap ${selectedCo === co.name
                ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
                }`}
            >
              {co.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <button
            onClick={() => {
              if (window.confirm('현재 본문 내용을 지우고 표준 근로계약서 양식으로 초기화할까요?')) {
                setTemplate(DEFAULT_CONTRACT_TEMPLATE);
              }
            }}
            className="px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-bold hover:bg-red-50 hover:text-red-500 transition-colors border border-[var(--border)]"
          >
            기본 양식 로드
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-1.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-[12px] font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? '저장 중...' : '설정 저장하기'}
          </button>
        </div>
      </div>

      {/* 메인 Split View */}
      <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:overflow-hidden">
        {/* Left: Editor Pane (45%) */}
        <div className="custom-scrollbar flex w-full flex-col gap-4 overflow-visible xl:w-[45%] xl:overflow-y-auto xl:pr-2">
          {/* 본문 에디터 카드 */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                <span className="w-1 h-4 bg-[var(--accent)] rounded-full"></span>
                계약 조항 편집
              </h3>
              <p className="text-[10px] text-[var(--toss-gray-3)] font-semibold">자동 연동 정보는 미리보기에서 확인</p>
            </div>

            <textarea
              className="w-full h-[400px] p-5 bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl text-[13px] leading-relaxed outline-none focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 transition-all custom-scrollbar font-mono"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              placeholder="제1조 [담당업무]부터 내용을 입력하세요."
            />

            <div className="mt-4">
              <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider mb-2">활성 데이터 토큰 (클릭하여 복사)</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '{{employee_name}}', '{{employee_no}}', '{{join_date}}',
                  '{{shift_start}}', '{{shift_end}}', '{{base_salary}}',
                  '{{meal_allowance}}', '{{position_allowance}}'
                ].map(tkn => (
                  <button
                    key={tkn}
                    onClick={() => {
                      navigator.clipboard.writeText(tkn);
                      toast(`${tkn} 토큰이 복사되었습니다.`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[var(--muted)] border border-[var(--border)] font-mono text-[10px] text-[var(--toss-gray-4)] hover:border-[var(--accent)]/30 hover:bg-[var(--card)] transition-all"
                  >
                    {tkn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 직인 관리 카드 */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm mb-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-red-400 rounded-full"></span>
              사업자 직인 관리
            </h3>
            <div className="flex items-center gap-4">
              <label className="w-24 h-24 border-2 border-dashed border-[var(--border)] flex flex-col items-center justify-center bg-[var(--muted)] rounded-2xl group hover:border-[var(--accent)]/30 transition-all cursor-pointer relative overflow-hidden shrink-0">
                {sealUrl ? (
                  <img src={sealUrl} alt="직인" className="w-full h-full object-contain p-2" />
                ) : (
                  <span className="text-2xl opacity-20">印</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingSeal(true);
                    try {
                      const ext = file.name.split('.').pop() || 'png';
                      const safeFolder = selectedCo.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'company';
                      const fileName = `seals/${safeFolder}_${Date.now()}.${ext}`;
                      const { error: upErr } = await supabase.storage.from('company-seals').upload(fileName, file);
                      if (upErr) throw upErr;
                      const { data: urlData } = supabase.storage.from('company-seals').getPublicUrl(fileName);
                      setSealUrl(urlData.publicUrl);
                    } catch (err) {
                      toast('직인 업로드에 실패했습니다. (Storage 설정을 확인하세요)', 'error');
                    } finally {
                      setUploadingSeal(false);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              <div className="flex-1 space-y-1">
                <p className="text-[11px] font-bold text-[var(--foreground)]">공식 직인 이미지 (PNG 권장)</p>
                <p className="text-[10px] text-[var(--toss-gray-3)] font-semibold leading-relaxed">
                  배경이 투명한 정방형 이미지를 권장합니다.<br />
                  업로드 시 즉시 우측 미리보기에 반영됩니다.
                </p>
                {uploadingSeal && <p className="text-[10px] text-[var(--accent)] font-bold animate-pulse">업로드 중...</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-[640px] flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--muted)] xl:min-h-0">
          <div className="px-4 py-4 border-b border-[var(--border)] flex items-center justify-end bg-[var(--card)]/50 backdrop-blur-md">
            <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">A4 규격 실시간 랜더링</span>
          </div>

          <div className="custom-scrollbar flex flex-1 justify-center overflow-y-auto p-4 md:p-5">
            {/* 고해상도 미리보기 페이퍼 */}
            <div className="w-full max-w-[640px] bg-[var(--card)] shadow-sm rounded-sm border border-[var(--border)] min-h-[900px] flex flex-col p-[50px] font-serif transition-transform duration-500 scale-[0.98] hover:scale-100 origin-top">
              {/* 미리보기 헤더: 자동 연동 정보 모사 */}
              <div className="relative border-b-2 border-slate-800 pb-10 mb-10">
                <h1 className="text-3xl font-black text-center mb-12 tracking-[0.2em] underline underline-offset-8 decoration-1">근 로 계 약 서</h1>

                <div className="grid grid-cols-2 gap-3">
                  {/* 왼쪽: 회사 정보 */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-[var(--foreground)] border-b-2 border-slate-900 pb-1 flex items-center gap-1">
                      [사용자]
                    </p>
                    <div className="grid grid-cols-12 border-t border-l border-[var(--border)] text-[10px]">
                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">회사명</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 font-bold">{selectedCo}</div>

                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">사업자번호</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 text-[var(--toss-gray-3)] italic">자동 연동</div>

                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">주소</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 text-[var(--toss-gray-3)] italic">자동 연동</div>

                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">연락처</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 text-[var(--toss-gray-3)] italic">자동 연동</div>
                    </div>
                  </div>

                  {/* 오른쪽: 근로자 정보 */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-[var(--foreground)] border-b-2 border-slate-900 pb-1 flex items-center gap-1">
                      [근로자]
                    </p>
                    <div className="grid grid-cols-12 border-t border-l border-[var(--border)] text-[10px]">
                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">성명</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 text-[var(--toss-gray-3)] italic">근로자 성명</div>

                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">생년월일</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 text-[var(--toss-gray-3)] italic">0000.00.00</div>

                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">주소</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 text-[var(--toss-gray-3)] italic">자동 연동</div>

                      <div className="col-span-4 bg-[var(--tab-bg)] border-r border-b border-[var(--border)] p-2 font-bold text-center">연락처</div>
                      <div className="col-span-8 border-r border-b border-[var(--border)] p-2 text-[var(--toss-gray-3)] italic">자동 연동</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 미리보기 본문: 에디터 내용 반영 */}
              <div className="flex-1 text-[13px] leading-[1.8] text-[var(--foreground)] whitespace-pre-wrap font-serif">
                {template || (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                    <span className="text-4xl mb-4">⌨️</span>
                    <p className="font-sans font-bold">에디터에 내용을 입력하세요</p>
                  </div>
                )}
              </div>

              {/* 미리보기 하단: 서명란 */}
              <div className="mt-16 pt-8 border-t border-dotted border-[var(--border)] flex justify-between items-end shrink-0">
                <p className="text-[11px] text-[var(--toss-gray-3)]">전자 서명 시 상기 내용은 법적 효력을 가집니다.</p>
                <div className="text-right">
                  <p className="text-[12px] font-bold mb-4">{new Date().getFullYear()}년 {new Date().getMonth() + 1}월 {new Date().getDate()}일</p>
                  <p className="text-[13px] font-bold">{selectedCo} 대표이사 (인)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

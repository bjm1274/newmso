'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const COMPANIES = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'];

const DEFAULT_CONTRACT_TEMPLATE = `근 로 계 약 서 ( 월 급 제 )

[사용자 기본정보]
회사명 : {{company_name}}
대표자 : {{company_ceo}}           전화번호 : {{company_phone}}
주소   : {{company_address}}
사업자등록번호 : {{business_no}}

[근로자 기본정보]
성명   : {{employee_name}} (사번 {{employee_no}})   생년월일 : {{birth_date}}
주소   : {{address}}
입사일 : {{join_date}}      연락처 : {{phone}}

────────────────────────────────────────────────────
제1조 [담당업무 및 근무장소]
① 근무장소: 사업장 및 사용자가 지정한 장소
② 종사업무: 사용자가 지정한 업무
③ 사용자는 업무상 필요에 따라 근로자의 근무장소·부서 또는 종사업무를 변경할 수 있다.

────────────────────────────────────────────────────
제2조 [근로계약기간]
① 근로계약기간: 입사일로부터 정년 도달 시 또는 별도로 정한 기간의 만료일까지로 한다.
② 근로조건 적용기간: 본 계약서에 명시된 근로조건 변경 시까지로 한다.
③ 근로계약기간 만료 시 근로관계는 종료되며, 사용자가 필요한 경우 재계약할 수 있다.
④ 정년은 관련 법령 및 회사 규정에서 정하는 바에 따른다.
⑤ 계약기간 중 근로자가 계약을 해지하고자 할 때에는 원칙적으로 1개월 이전에 사직서를 제출하여
   업무 인수인계가 원활히 이루어지도록 한다.

────────────────────────────────────────────────────
제3조 [수습기간]
① 신규채용된 근로자에 대하여는 입사일로부터 일정 기간 수습기간을 둘 수 있다.
② 사용자는 수습기간 중 근무태도·업무능력·건강상태 등을 고려하여 본 채용을 거부할 수 있다.

────────────────────────────────────────────────────
제4조 [근로시간 및 휴게]
① 근로시간 및 휴게시간은 아래 표와 같다.

┌────────┬────────┬────────┬──────────────┬────────┐
│   구 분   │  시   업  │  종   업  │   휴 게 시 간   │  비 고  │
├────────┼────────┼────────┼──────────────┼────────┤
│ 월 ~ 금  │  {{shift_start}}  │  {{shift_end}}  │  {{break_start}} ~ {{break_end}}  │          │
└────────┴────────┴────────┴──────────────┴────────┘

② 상기 휴게시간은 원칙적으로 그 시간을 사용하되, 업무량이 많은 경우 업무량이 적은 시간대로
   이동하여 사용할 수 있다.
③ 사용자는 경영상 필요와 계절의 변화 등에 따라 근로시간·휴게시간을 변경할 수 있으며,
   근로자는 이에 따라 자연발생되는 연장·야간·휴일근로를 하는 것에 동의할 수 있다.

────────────────────────────────────────────────────
제5조 [임금 및 구성항목]
① 월급여, 통상시급 및 각종 수당의 구성·금액은 별도의 급여 산정표 및 회사의 급여 규정에 따른다.
② 임금산정기간: 매월 1일부터 말일까지, 임금지급일: 익월 ○일(휴일인 경우 다음 영업일)로 한다.
③ 임금은 근로소득세, 4대보험료 등 제세공과금을 공제한 후 근로자가 지정한 계좌로 지급한다.
④ 중도 입·퇴사 및 휴직 시 월급여는 해당 월의 일수를 기준으로 일할계산하여 지급한다.
⑤ 약정시간을 초과하거나 미달한 근로에 대한 정산은 근로기준법 및 회사 규정에 따른다.
⑥ 수습기간 중 임금은 관련 법령이 정하는 범위에서 산정한다.

[임금 구성항목 예시]
구 성 항 목        금 액(원)        산 정 근 거
────────────────────────────────
기본급             {{base_salary}}      __________________
식대               {{meal_allowance}}      __________________
직책수당           {{position_allowance}}      __________________
기타수당           {{other_taxfree}}      __________________

────────────────────────────────────────────────────
제6조 [휴일 및 휴가]
① 주휴일(주 1회), 근로자의 날, 기타 취업규칙에서 정한 날을 유급휴일로 한다.
② 법정공휴일 및 연차유급휴가는 근로기준법과 취업규칙에서 정한 바에 따른다.
③ 사용자는 근로자대표와의 합의에 따라 법정공휴일 또는 연차유급휴가일을 특정 근로일로
   대체하거나 갈음하여 휴무시킬 수 있다.

────────────────────────────────────────────────────
제7조 [퇴직금]
퇴직금은 「근로자퇴직급여 보장법」 및 회사의 퇴직급여 규정에 따른다.

────────────────────────────────────────────────────
제8조 [근로계약 해지 사유]
① 근로자가 1개월 전 사직서를 제출하고 후임자에게 인수인계를 완료한 경우
② 채용 관련 서류의 위조·변조 또는 허위사실이 확인된 경우
③ 업무수행능력이 현저히 부족하거나 근무태도가 불량한 경우
④ 무단결근·지각·조퇴 등이 빈번하여 회사 질서를 문란하게 한 경우
⑤ 기타 취업규칙에서 정한 해고사유 또는 사회통념상 근로관계를 계속할 수 없는 중대한 사유가
   발생한 경우

────────────────────────────────────────────────────
제9조 [손해배상]
다음 각 호에 해당하는 경우에는 근로자는 사용자에게 손해를 배상하여야 한다.
① 근로자가 고의 또는 과실로 사용자에게 손해를 끼친 경우
② 근로자가 재직 중 또는 퇴직 후라도 회사 및 업무상 관련자의 기밀·정보를 누설한 경우
③ 근로자가 회사 재산을 무단 사용·반출하거나 회사의 정당한 지시를 위반하여 손해를 끼친 경우

────────────────────────────────────────────────────
제10조 [개인정보의 수집·이용에 대한 동의]
① 정보의 수집·이용 목적: 인사·노무관리, 노동법률 자문, 세무·4대보험 업무, 정부지원금 신청 등
② 수집되는 개인정보의 항목, 보유·이용기간 및 열람·정정·동의철회 등에 관한 사항은 별도의
   개인정보 처리방침에 따른다.
③ 근로자는 개인정보 수집·이용에 대한 동의를 거부할 수 있으나, 이 경우 법령 및 회사 규정에
   따른 일부 서비스 제공에 제한이 있을 수 있다.

────────────────────────────────────────────────────
제11조 [기타 근로조건]
① 계약기간 중 승진·보직변경 등 신분 변동이나 기타 사유로 근로조건이 변경되는 경우에는 별도의
   계약 또는 부속 합의를 통해 변경된 조건을 명시한다.
② 근로자는 회사가 업무상 제공한 물품·장비 등을 퇴사 시 반환하여야 하며, 반환하지 않을 경우
   관련 규정에 따라 실비를 변상하여야 한다.

────────────────────────────────────────────────────
제12조 [준용 및 해석]
① 본 계약서에 명시되지 않은 사항은 취업규칙 및 근로기준법 등 관계 법령을 따른다.
② 본 계약서의 해석에 관하여 이견이 있는 경우 사용자와 근로자는 상호 협의하며, 협의가
   원만하지 않을 때에는 관계 법령과 회사 규정을 기준으로 한다.

────────────────────────────────────────────────────
제13조 [교부 및 보관]
① 본 계약서는 2부 작성하여 사용자와 근로자가 각 1부씩 보관하며, 전자문서로 교부된 경우에도
   동일한 효력을 가진다.
② 근로자는 본 계약서를 교부받았음을 확인하며, 계약 내용에 대하여 충분히 설명을 듣고
   이해하였음을 확인한다.

[상기 내용을 충분히 이해하고 이에 동의하여 근로계약을 체결한다.]`;

export default function ContractManager() {
  const [selectedCo, setSelectedCo] = useState('박철홍정형외과');
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sealUrl, setSealUrl] = useState<string | null>(null);
  const [uploadingSeal, setUploadingSeal] = useState(false);

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
    if (error) alert('저장 중 오류가 발생했습니다.');
    else alert(`${selectedCo} 계약서 표준 양식이 저장되었습니다. 인사관리에서 발송하는 계약서에 적용됩니다.`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* 회사 선택 탭 */}
      <div className="flex gap-1 border-b border-gray-100 pb-4">
        {COMPANIES.filter(c => c !== '전체').map(co => (
          <button key={co} onClick={() => setSelectedCo(co)} 
            className={`px-6 py-2 text-[10px] font-black border ${selectedCo === co ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white text-gray-400 border-gray-100'}`}>
            {co}
          </button>
        ))}
      </div>

      {/* 9:3 비율로 계약서 편집 / 직인 관리 배치 */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* 왼쪽: 계약서 표준 틀 편집기 */}
        <div className="col-span-9 space-y-4">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl text-white p-4 flex items-center justify-between shadow-md">
            <div>
              <p className="text-[10px] font-black tracking-[0.18em] uppercase opacity-70">Contract Template</p>
              <p className="mt-1 text-sm md:text-base font-semibold">
                {selectedCo} 표준 근로계약서 틀
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('현재 내용을 지우고 기본 표준 근로계약서 틀로 다시 불러올까요?')) {
                  setTemplate(DEFAULT_CONTRACT_TEMPLATE);
                }
              }}
              className="px-3 py-1.5 rounded-full bg-white/10 border border-white/30 text-[10px] font-bold hover:bg-white/20 transition-all"
            >
              표준 틀로 되돌리기
            </button>
          </div>

          {loading ? (
            <div className="w-full h-[520px] flex items-center justify-center bg-gray-50 rounded-2xl border border-gray-100">
              로딩 중...
            </div>
          ) : (
            <>
              {/* 편집기 + 토큰 안내 */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-8">
                  <label className="text-[11px] font-semibold text-gray-600 mb-1.5 block">
                    계약서 본문
                    <span className="ml-2 text-[10px] text-gray-400">
                      {'{{...}} 형태의 토큰은 직원/급여/근무형태 데이터로 자동 채워집니다.'}
                    </span>
                  </label>
                  <textarea
                    className="w-full h-[320px] p-5 bg-white border border-gray-200 rounded-2xl text-[13px] leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-inner custom-scrollbar font-mono"
                    value={template}
                    onChange={e => setTemplate(e.target.value)}
                    placeholder="계약서 본문을 입력하세요. 인사관리 → 계약에서 직원에게 발송 시 이 양식이 사용됩니다."
                  />
                </div>
                <div className="col-span-4">
                  <div className="h-full rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-3 text-[11px] text-gray-600 flex flex-col gap-2">
                    <p className="font-bold text-gray-700 text-xs mb-1">사용 가능한 자동입력 토큰</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        '{{company_name}}',
                        '{{employee_name}}',
                        '{{employee_no}}',
                        '{{address}}',
                        '{{join_date}}',
                        '{{shift_start}}',
                        '{{shift_end}}',
                        '{{break_start}}',
                        '{{break_end}}',
                        '{{base_salary}}',
                        '{{meal_allowance}}',
                        '{{position_allowance}}',
                        '{{other_taxfree}}',
                      ].map((tkn) => (
                        <span
                          key={tkn}
                          className="px-2 py-0.5 rounded-full bg-white border border-gray-200 font-mono text-[10px] text-gray-700"
                        >
                          {tkn}
                        </span>
                      ))}
                    </div>
                    <p className="mt-auto text-[10px] text-gray-400">
                      위 토큰들은 조직도·급여·근무형태에 등록된 데이터를 기준으로 전자서명 화면에서 자동 채워집니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 미리보기: 실제 근로자 서명 화면과 동일한 레이아웃 */}
              <div className="mt-5">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.18em] mb-2 flex items-center gap-2">
                  <span className="w-1 h-3 bg-gray-400" />
                  실시간 미리보기 (근로자 서명 화면)
                </p>
                <div className="w-full bg-slate-100 rounded-2xl border border-slate-200 py-6 px-3">
                  <div className="max-w-[760px] mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                    <div className="px-6 md:px-8 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500">전자 근로계약서</p>
                        <h3 className="mt-1 text-base md:text-lg font-bold text-slate-900">
                          표준 근로계약서
                        </h3>
                      </div>
                      {sealUrl && (
                        <div className="flex flex-col items-center text-[10px] text-slate-500">
                          <span className="mb-1">사업자 직인</span>
                          <img
                            src={sealUrl}
                            alt="사업자 직인"
                            className="h-14 w-14 object-contain opacity-90 drop-shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                    <div className="px-6 md:px-8 py-5 max-h-[260px] overflow-y-auto custom-scrollbar text-[12px] leading-relaxed text-slate-700">
                    <div className="whitespace-pre-wrap font-mono text-[12px]">
                        {template || '여기에 입력한 계약서 본문이 근로자 서명 화면에 그대로 표시됩니다.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 오른쪽: 소형 직인 관리 카드 */}
        <div className="col-span-3 space-y-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">사업자 공식 직인</p>
            <label className="aspect-square w-full border-2 border-dashed border-gray-100 flex flex-col items-center justify-center bg-gray-50 group hover:border-red-100 transition-all cursor-pointer relative overflow-hidden">
              {sealUrl ? (
                <>
                  <img src={sealUrl} alt="사업자 직인" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-black text-white">
                    변경하려면 클릭
                  </div>
                </>
              ) : (
                <>
                  <span className="text-4xl opacity-10 font-serif text-red-600 mb-2">印</span>
                  <span className="text-[9px] font-black text-gray-400">파일 선택</span>
                </>
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
                    // Supabase Storage object key는 ASCII만 허용하므로 회사명은 안전한 슬러그로 변환
                    const safeFolder =
                      selectedCo === '박철홍정형외과'
                        ? 'pch_ortho'
                        : selectedCo === '수연의원'
                        ? 'suyeon_clinic'
                        : selectedCo === 'SY INC.'
                        ? 'sy_inc'
                        : selectedCo.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'company';
                    const fileName = `${safeFolder}/seal_${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from('company-seals').upload(fileName, file, { upsert: true });
                    if (upErr) {
                      console.error('seal upload error', upErr);
                      alert(`직인 파일 업로드에 실패했습니다.\n(${upErr.message || 'Supabase Storage 설정을 확인해주세요.'})`);
                    } else {
                      const { data: urlData } = supabase.storage.from('company-seals').getPublicUrl(fileName);
                      setSealUrl(urlData.publicUrl);
                      alert('사업자 직인이 등록되었습니다. 저장 버튼을 눌러 계약서에 적용하세요.');
                    }
                  } catch (err) {
                    alert('직인 업로드 중 오류가 발생했습니다.');
                  } finally {
                    setUploadingSeal(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <p className="text-[9px] text-gray-400 font-bold leading-tight bg-gray-50 p-3 border border-gray-100">
                * PNG(투명배경) 권장<br/>
                * Supabase Storage의 <code>company-seals</code> 버킷에 저장됩니다.<br/>
                * 저장 시 모든 사원 계약서에 적용
            </p>
            {uploadingSeal && (
              <p className="text-[9px] text-blue-500 font-bold">직인 업로드 중...</p>
            )}
          </div>
          
          <button onClick={handleSave} disabled={saving || loading} className="w-full py-5 bg-[#3182F6] text-white text-xs font-semibold shadow-xl hover:bg-[#1B64DA] transition-all disabled:opacity-50">
            {saving ? '저장 중...' : `${selectedCo} 양식 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}
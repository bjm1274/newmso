'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const COMPANIES = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'];

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
        setTemplate(
          fallback?.template_content ||
            '근 로 계 약 서 ( 월 급 제 )\n\n' +
              '"사용자"(이하 "사용자"라 한다)와(과) "근로자"(이하 "근로자"라 한다)는 다음과 같이 근로계약을 체결하고 상호 성실히 준수할 것을 확약한다.\n\n' +
              '제1조 [담당업무 및 근무장소]\n' +
              '① 근무장소: 사업장 및 사용자가 지정한 장소\n' +
              '② 종사업무: 사용자가 지정한 업무\n' +
              '③ 사용자는 업무상 필요에 따라 근로자의 근무장소·부서 또는 종사업무를 변경할 수 있다.\n\n' +
              '제2조 [근로계약기간]\n' +
              '① 근로계약기간: 입사일로부터 정년 도달 시 또는 별도로 정한 기간의 만료일까지로 한다.\n' +
              '② 근로조건 적용기간: 본 계약서에 명시된 근로조건 변경 시까지로 한다.\n' +
              '③ 근로계약기간 만료 시 근로관계는 종료되며, 사용자가 필요한 경우 재계약할 수 있다.\n' +
              '④ 정년은 관련 법령 및 회사 규정에서 정하는 바에 따른다.\n' +
              '⑤ 계약기간 중 근로자가 계약을 해지하고자 할 때에는 원칙적으로 1개월 이전에 사직서를 제출하여 업무 인수인계가 원활히 이루어지도록 한다.\n\n' +
              '제3조 [수습기간]\n' +
              '① 신규채용된 근로자에 대하여는 입사일로부터 일정 기간 수습기간을 둘 수 있다.\n' +
              '② 사용자는 수습기간 중 근무태도·업무능력·건강상태 등을 고려하여 본 채용을 거부할 수 있다.\n\n' +
              '제4조 [근로시간 및 휴게]\n' +
              '① 근로시간 및 휴게시간은 회사의 근무형태(근무표)에 따른다.\n' +
              '② 사용자는 경영상 필요와 계절의 변화 등에 따라 근로시간·휴게시간을 변경할 수 있으며,\n' +
              '   근로자는 이에 따라 자연발생되는 연장·야간·휴일근로를 하는 것에 동의할 수 있다.\n\n' +
              '제5조 [임금 및 구성항목]\n' +
              '① 월급여, 통상시급 및 각종 수당의 구성·금액은 별도의 급여 산정표 및 회사의 급여 규정에 따른다.\n' +
              '② 임금산정기간: 매월 1일부터 말일까지, 임금지급일: 익월 ○일(휴일인 경우 다음 영업일)로 한다.\n' +
              '③ 임금은 근로소득세, 4대보험료 등 제세공과금을 공제한 후 근로자가 지정한 계좌로 지급한다.\n' +
              '④ 중도 입·퇴사 및 휴직 시 월급여는 해당 월의 일수를 기준으로 일할계산하여 지급한다.\n' +
              '⑤ 약정시간을 초과하거나 미달한 근로에 대한 정산은 근로기준법 및 회사 규정에 따른다.\n' +
              '⑥ 수습기간 중 임금은 관련 법령이 정하는 범위에서 산정한다.\n\n' +
              '제6조 [휴일 및 휴가]\n' +
              '① 주휴일(주 1회), 근로자의 날, 기타 취업규칙에서 정한 날을 유급휴일로 한다.\n' +
              '② 법정공휴일 및 연차유급휴가는 근로기준법과 취업규칙에서 정한 바에 따른다.\n' +
              '③ 사용자는 근로자대표와의 합의에 따라 법정공휴일 또는 연차유급휴가일을 특정 근로일로 대체하거나 갈음하여 휴무시킬 수 있다.\n\n' +
              '제7조 [퇴직금]\n' +
              '퇴직금은 「근로자퇴직급여 보장법」 및 회사의 퇴직급여 규정에 따른다.\n\n' +
              '제8조 [근로계약 해지 사유]\n' +
              '① 근로자가 1개월 전 사직서를 제출하고 후임자에게 인수인계를 완료한 경우\n' +
              '② 채용 관련 서류의 위조·변조 또는 허위사실이 확인된 경우\n' +
              '③ 업무수행능력이 현저히 부족하거나 근무태도가 불량한 경우\n' +
              '④ 무단결근·지각·조퇴 등이 빈번하여 회사 질서를 문란하게 한 경우\n' +
              '⑤ 기타 취업규칙에서 정한 해고사유 또는 사회통념상 근로관계를 계속할 수 없는 중대한 사유가 발생한 경우\n\n' +
              '제9조 [손해배상]\n' +
              '다음 각 호에 해당하는 경우에는 근로자는 사용자에게 손해를 배상하여야 한다.\n' +
              '① 근로자가 고의 또는 과실로 사용자에게 손해를 끼친 경우\n' +
              '② 근로자가 재직 중 또는 퇴직 후라도 회사 및 업무상 관련자의 기밀·정보를 누설한 경우\n' +
              '③ 근로자가 회사 재산을 무단 사용·반출하거나 회사의 정당한 지시를 위반하여 손해를 끼친 경우\n\n' +
              '제10조 [개인정보의 수집·이용에 대한 동의]\n' +
              '① 정보의 수집·이용 목적: 인사·노무관리, 노동법률 자문, 세무·4대보험 업무, 정부지원금 신청 등\n' +
              '② 수집되는 개인정보의 항목, 보유·이용기간 및 열람·정정·동의철회 등에 관한 사항은 별도의 개인정보 처리방침에 따른다.\n' +
              '③ 근로자는 개인정보 수집·이용에 대한 동의를 거부할 수 있으나, 이 경우 법령 및 회사 규정에 따른 일부 서비스 제공에 제한이 있을 수 있다.\n\n' +
              '제11조 [기타 근로조건]\n' +
              '① 계약기간 중 승진·보직변경 등 신분 변동이나 기타 사유로 근로조건이 변경되는 경우에는 별도의 계약 또는 부속 합의를 통해 변경된 조건을 명시한다.\n' +
              '② 근로자는 회사가 업무상 제공한 물품·장비 등을 퇴사 시 반환하여야 하며, 반환하지 않을 경우 관련 규정에 따라 실비를 변상하여야 한다.\n\n' +
              '제12조 [준용 및 해석]\n' +
              '① 본 계약서에 명시되지 않은 사항은 취업규칙 및 근로기준법 등 관계 법령을 따른다.\n' +
              '② 본 계약서의 해석에 관하여 이견이 있는 경우 사용자와 근로자는 상호 협의하며, 협의가 원만하지 않을 때에는 관계 법령과 회사 규정을 기준으로 한다.\n\n' +
              '제13조 [교부 및 보관]\n' +
              '① 본 계약서는 2부 작성하여 사용자와 근로자가 각 1부씩 보관하며, 전자문서로 교부된 경우에도 동일한 효력을 가진다.\n' +
              '② 근로자는 본 계약서를 교부받았음을 확인하며, 계약 내용에 대하여 충분히 설명을 듣고 이해하였음을 확인한다.\n\n' +
              '[상기 내용을 충분히 이해하고 이에 동의하여 근로계약을 체결한다.]'
        );
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
      <div className="flex gap-1 border-b border-gray-100 pb-4">
        {COMPANIES.filter(c => c !== '전체').map(co => (
          <button key={co} onClick={() => setSelectedCo(co)} 
            className={`px-6 py-2 text-[10px] font-black border ${selectedCo === co ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white text-gray-400 border-gray-100'}`}>
            {co}
          </button>
        ))}
      </div>

      {/* [변경] 9:3 비율로 계약서 창은 크게, 직인은 작게 배치 */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* 왼쪽: 대형 계약서 편집기 (전체 75%) */}
        <div className="col-span-9 space-y-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1 h-3 bg-blue-600"></span> 계약서 표준 양식 편집기
          </p>
          {loading ? (
            <div className="w-full h-[650px] flex items-center justify-center bg-gray-50 rounded-xl border border-gray-100">로딩 중...</div>
          ) : (
            <>
              <textarea 
                className="w-full h-[350px] p-6 bg-white border border-gray-100 text-sm font-medium leading-relaxed outline-none focus:border-blue-600 shadow-inner custom-scrollbar" 
                value={template} 
                onChange={e => setTemplate(e.target.value)} 
                placeholder="계약서 본문을 입력하세요. 인사관리 → 계약에서 직원에게 발송 시 이 양식이 사용됩니다."
              />
              <div className="mt-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <span className="w-1 h-3 bg-gray-400"></span> 실시간 미리보기 (근로자 서명 화면과 동일)
                </p>
                <div className="bg-[#F2F4F6] border border-[#E5E8EB] rounded-[16px] overflow-hidden shadow-inner">
                  <div className="p-6 md:p-8 text-xs leading-relaxed text-[#4E5968] font-medium max-h-[320px] overflow-y-auto custom-scrollbar">
                    <h3 className="text-sm font-bold text-[#191F28] mb-4 text-center underline underline-offset-8">표준 근로계약서</h3>
                    <div className="whitespace-pre-wrap">
                      {template || '여기에 입력한 계약서 본문이 근로자 서명 화면에 그대로 표시됩니다.'}
                    </div>
                    {sealUrl && (
                      <div className="mt-6 pt-4 border-t border-[#E5E8EB] flex justify-end">
                        <img src={sealUrl} alt="사업자 직인" className="h-14 w-14 object-contain opacity-90" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 오른쪽: 소형 직인 관리 (전체 25%) */}
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
                    const fileName = `${selectedCo.replace(/\s+/g, '_')}/seal_${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from('company-seals').upload(fileName, file, { upsert: true });
                    if (upErr) {
                      alert('직인 파일 업로드에 실패했습니다. Supabase Storage 설정을 확인해주세요.');
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
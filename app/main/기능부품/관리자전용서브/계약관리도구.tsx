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
      if (data?.template_content) setTemplate(data.template_content);
      setSealUrl(data?.seal_url || null);
      else {
        const { data: fallback } = await supabase
          .from('contract_templates')
          .select('template_content')
          .eq('company_name', '전체')
          .single();
        setTemplate(
          fallback?.template_content ||
            '근 로 계 약 서 (월급제)\n\n' +
              '사용자와 근로자는 다음과 같이 근로계약을 체결하고 상호 성실히 준수할 것을 확약한다.\n\n' +
              '제1조 [담당업무 및 근무장소]\n' +
              '1. 근무장소: 사업장 및 사용자가 지정한 장소\n' +
              '2. 종사업무: 사용자가 지정한 업무\n' +
              '3. 사용자는 업무상 필요에 따라 근로자의 근무장소·부서 또는 종사업무를 변경할 수 있다.\n\n' +
              '제2조 [근로계약기간]\n' +
              '1. 근로계약기간: 입사일로부터 정년 도달 시 또는 별도 정한 기간의 만료일까지로 한다.\n' +
              '2. 근로조건 적용기간: 본 계약서에 명시된 근로조건 변경 시까지로 한다.\n' +
              '3. 근로계약기간 만료 시 근로관계는 종료되며, 사용자가 필요한 경우 재계약할 수 있다.\n\n' +
              '제3조 [수습기간]\n' +
              '1. 신규채용된 근로자에 대하여 입사일로부터 최대 3개월의 수습기간을 둘 수 있다.\n' +
              '2. 사용자는 수습기간 중 근무태도·업무능력·건강상태 등을 고려하여 본 채용을 거부할 수 있다.\n\n' +
              '제4조 [근로시간 및 휴게]\n' +
              '1. 근로시간 및 휴게시간은 회사의 근무형태(근무표)에 따른다.\n' +
              '   (예: 월~금 08:30~18:00, 휴게 12:30~14:00)\n' +
              '2. 사용자는 경영상 필요와 계절의 변화 등에 따라 근로시간·휴게시간을 변경할 수 있으며,\n' +
              '   근로자는 이에 따라 자연발생되는 연장·야간·휴일근로를 하는 것에 동의할 수 있다.\n\n' +
              '제5조 [임금 및 구성항목]\n' +
              '1. 월급여 및 통상임금은 별도의 급여·통상임금 산출표(기본급, 식대, 직책수당 등)를 기준으로 한다.\n' +
              '2. 임금산정기간: 매월 1일부터 말일까지, 임금지급일: 익월 7일(휴일 시 다음 영업일)로 한다.\n' +
              '3. 임금은 근로소득세, 4대보험료 등 제세공과금을 공제한 후 근로자가 지정한 계좌로 이체 지급한다.\n' +
              '4. 중도 입·퇴사 및 휴직 시 월급여는 해당 월의 일수를 기준으로 일할계산하여 지급한다.\n' +
              '5. 지각·조퇴·외출·결근 등으로 약정시간 미만 근로한 경우에는 관련 규정 및 근로기준법에 따라 감액 정산한다.\n\n' +
              '제6조 [휴일 및 휴가]\n' +
              '1. 주휴일(주 1회), 근로자의 날, 기타 취업규칙에서 정한 날을 유급휴일로 한다.\n' +
              '2. 법정공휴일 및 연차유급휴가는 근로기준법과 취업규칙에서 정한 바에 따른다.\n\n' +
              '제7조 [퇴직금]\n' +
              '퇴직금은 「근로자퇴직급여 보장법」 및 회사의 퇴직급여 규정에 따른다.\n\n' +
              '제8조 [근로계약 해지 사유]\n' +
              '1. 근로자가 1개월 전 사직서를 제출하고 후임자에게 인수인계를 완료한 경우\n' +
              '2. 채용 관련 서류의 위조·변조 또는 허위사실이 확인된 경우\n' +
              '3. 업무수행능력이 현저히 부족하거나 근무태도가 불량한 경우\n' +
              '4. 무단결근·지각·조퇴 등이 빈번하여 회사 질서를 문란하게 한 경우\n' +
              '5. 기타 취업규칙에서 정한 해고사유에 해당하는 경우\n\n' +
              '제9조 [손해배상]\n' +
              '근로자가 고의 또는 중대한 과실로 회사에 손해를 입힌 경우, 회사는 관련 법령 및 취업규칙에 따라\n' +
              '손해배상을 청구할 수 있다.\n\n' +
              '제10조 [개인정보의 수집·이용]\n' +
              '1. 수집·이용 목적: 인사·노무관리, 세무·4대보험 신고, 정부지원금 신청 등\n' +
              '2. 수집 항목: 성명, 주민등록번호, 주소, 연락처, 가족사항, 학력·경력 등 근로계약 이행에 필요한 정보\n' +
              '3. 보유·이용기간: 근로관계 존속 기간 및 관련 법령이 정한 기간\n\n' +
              '제11조 [기타 근로조건]\n' +
              '1. 승진·보직변경 등 신분 변동으로 근로조건이 변경되는 경우 계약을 갱신할 수 있다.\n' +
              '2. 퇴사 시 회사가 제공한 물품·장비 등을 반환하여야 하며, 미반환 시 실비 변상에 동의할 수 있다.\n\n' +
              '제12조 [준용 및 해석]\n' +
              '1. 본 계약서에 명시되지 않은 사항은 취업규칙 및 관계법령을 따른다.\n' +
              '2. 해석상 이견이 있는 경우 사용자와 근로자가 상호 협의하며, 협의가 원만하지 않을 때에는 관련 법령과\n' +
              '   회사의 취업규칙을 기준으로 한다.\n\n' +
              '제13조 [교부 및 보관]\n' +
              '본 계약서는 2부 작성하여 사용자와 근로자가 각 1부씩 보관하며, 전자문서로 교부된 경우에도 동일한\n' +
              '효력을 가진다.\n\n' +
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
            <textarea 
              className="w-full h-[650px] p-10 bg-white border border-gray-100 text-sm font-medium leading-relaxed outline-none focus:border-blue-600 shadow-inner custom-scrollbar" 
              value={template} 
              onChange={e => setTemplate(e.target.value)} 
              placeholder="계약서 본문을 입력하세요. 인사관리 → 계약에서 직원에게 발송 시 이 양식이 사용됩니다."
            />
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
                    const fileName = `${selectedCo.replace(/\\s+/g, '_')}/seal_${Date.now()}.${ext}`;
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
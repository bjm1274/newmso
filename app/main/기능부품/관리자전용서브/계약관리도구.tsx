'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const COMPANIES = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'];

export default function ContractManager() {
  const [selectedCo, setSelectedCo] = useState('박철홍정형외과');
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true);
      const { data } = await supabase.from('contract_templates').select('template_content').eq('company_name', selectedCo).single();
      if (data?.template_content) setTemplate(data.template_content);
      else {
        const { data: fallback } = await supabase.from('contract_templates').select('template_content').eq('company_name', '전체').single();
        setTemplate(fallback?.template_content || '[근로계약서 표준안]\n\n제1조(계약의 목적)\n본 계약은 근로기준법에 따라 사용자와 근로자 간의 근로조건을 정함을 목적으로 한다.\n\n제2조(근로계약기간)\n입사일로부터 정함이 없는 기간\n\n제3조(근무장소)\n소속 병원 내 지정 장소\n\n제4조(업무내용)\n채용 시 결정된 직무 및 부수 업무\n\n제5조(소정근로시간)\n주 40시간 (운영 스케줄에 따름)\n\n제6조(임금)\n연봉계약서 및 급여 규정에 따름\n\n[상기 내용을 확인하였으며 이에 동의합니다]');
      }
      setLoading(false);
    };
    fetchTemplate();
  }, [selectedCo]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('contract_templates').upsert(
      { company_name: selectedCo, template_content: template, updated_at: new Date().toISOString() },
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
            <div className="aspect-square w-full border-2 border-dashed border-gray-100 flex flex-col items-center justify-center bg-gray-50 group hover:border-red-100 transition-all cursor-pointer">
              <span className="text-4xl opacity-10 font-serif text-red-600 mb-2">印</span>
              <span className="text-[9px] font-black text-gray-400">파일 선택</span>
            </div>
            <p className="text-[9px] text-gray-400 font-bold leading-tight bg-gray-50 p-3 border border-gray-100">
                * PNG(투명배경) 권장<br/>
                * 저장 시 모든 사원 계약서에 적용
            </p>
          </div>
          
          <button onClick={handleSave} disabled={saving || loading} className="w-full py-5 bg-[#3182F6] text-white text-xs font-semibold shadow-xl hover:bg-[#1B64DA] transition-all disabled:opacity-50">
            {saving ? '저장 중...' : `${selectedCo} 양식 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}
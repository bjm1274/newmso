'use client';
import { useState } from 'react';

export default function ContractManager() {
  const [selectedCo, setSelectedCo] = useState('박철홍정형외과');
  const [template, setTemplate] = useState(`[${selectedCo}] 근로계약서 표준안\n\n제1조(계약의 목적)...`);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex gap-1 border-b border-gray-100 pb-4">
        {["박철홍정형외과", "SY(법인)", "수연의원"].map(co => (
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
          <textarea 
            className="w-full h-[650px] p-10 bg-white border border-gray-100 text-sm font-medium leading-relaxed outline-none focus:border-blue-600 shadow-inner custom-scrollbar" 
            value={template} 
            onChange={e => setTemplate(e.target.value)} 
          />
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
          
          <button className="w-full py-5 bg-blue-600 text-white text-xs font-black shadow-xl hover:bg-blue-700 transition-all">
            {selectedCo} 설정 저장
          </button>
        </div>
      </div>
    </div>
  );
}
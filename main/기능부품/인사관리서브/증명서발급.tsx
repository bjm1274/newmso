'use client';
import { useState } from 'react';

export default function CertificateGenerator({ staffs }: any) {
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [certType, setCertType] = useState('재직증명서');

  const handleIssue = () => {
    if (!selectedStaff) return alert("발급 대상을 선택해주세요.");
    alert(`${selectedStaff.name}님의 ${certType}가 발급되었습니다. (PDF 다운로드 시작)`);
  };

  return (
    <div className="bg-[#F8FAFC] p-4 md:p-10 space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">디지털 증명서 발급 센터</h2>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">Digital Certificate Issuance Hub</p>
        </div>
        <div className="flex gap-2">
          <button className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-black rounded-xl shadow-sm hover:bg-gray-50 transition-all">발급 이력 조회</button>
          <button className="px-5 py-2.5 bg-gray-900 text-white text-[11px] font-black rounded-xl shadow-lg hover:scale-[0.98] transition-all">직인 설정</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* 설정 패널 */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">1. 발급 대상 직원</label>
              <select 
                onChange={(e) => setSelectedStaff(staffs.find((s:any) => s.id === e.target.value))}
                className="w-full p-5 bg-gray-50 rounded-2xl text-sm font-black border-none outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="">직원 선택...</option>
                {staffs.map((s:any) => <option key={s.id} value={s.id}>{s.name} ({s.department} / {s.position})</option>)}
              </select>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">2. 증명서 종류</label>
              <div className="grid grid-cols-1 gap-3">
                {['재직증명서', '경력증명서', '퇴직증명서', '원천징수영수증'].map(t => (
                  <button 
                    key={t} 
                    onClick={() => setCertType(t)}
                    className={`p-5 rounded-2xl text-xs font-black border-2 text-left transition-all flex justify-between items-center ${certType === t ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-50 text-gray-400 hover:border-gray-100 bg-gray-50/50'}`}
                  >
                    {t}
                    {certType === t && <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>}
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={handleIssue}
              className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-sm shadow-xl shadow-blue-100 hover:scale-[0.98] transition-all"
            >
              ⚡ 증명서 즉시 발급
            </button>
          </div>

          <div className="bg-orange-50 p-6 rounded-[2rem] border border-orange-100">
            <p className="text-[10px] font-black text-orange-800 uppercase mb-2">💡 발급 안내</p>
            <p className="text-[10px] text-orange-700 font-bold leading-relaxed">
              발급된 증명서는 고유 번호가 부여되며, 위변조 방지를 위한 디지털 직인이 자동으로 포함됩니다.
            </p>
          </div>
        </div>

        {/* 미리보기 패널 */}
        <div className="lg:col-span-8 bg-white rounded-[3rem] p-8 md:p-16 border border-gray-100 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden min-h-[800px]">
          <div className="absolute top-8 right-8 bg-gray-900 text-white px-4 py-1.5 text-[10px] font-black rounded-full tracking-widest">PREVIEW</div>
          
          {selectedStaff ? (
            <div className="w-full max-w-[600px] bg-white shadow-2xl p-12 md:p-20 space-y-12 text-center border border-gray-100 relative animate-in zoom-in-95 duration-500">
              {/* 워터마크 */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                <p className="text-9xl font-black -rotate-45">SY INC.</p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black text-gray-400 tracking-[0.5em]">제 2026-0001 호</p>
                <h4 className="text-4xl font-black tracking-[0.3em] text-gray-900 border-b-4 border-gray-900 pb-4 inline-block">{certType}</h4>
              </div>

              <div className="text-left space-y-8 pt-10">
                <div className="grid grid-cols-1 gap-6">
                  <div className="flex border-b border-gray-100 pb-2">
                    <span className="w-24 text-[11px] font-black text-gray-400 uppercase">성 명</span>
                    <span className="text-sm font-black text-gray-800">{selectedStaff.name}</span>
                  </div>
                  <div className="flex border-b border-gray-100 pb-2">
                    <span className="w-24 text-[11px] font-black text-gray-400 uppercase">소 속</span>
                    <span className="text-sm font-black text-gray-800">{selectedStaff.company} / {selectedStaff.department}</span>
                  </div>
                  <div className="flex border-b border-gray-100 pb-2">
                    <span className="w-24 text-[11px] font-black text-gray-400 uppercase">직 위</span>
                    <span className="text-sm font-black text-gray-800">{selectedStaff.position}</span>
                  </div>
                  <div className="flex border-b border-gray-100 pb-2">
                    <span className="w-24 text-[11px] font-black text-gray-400 uppercase">재직기간</span>
                    <span className="text-sm font-black text-gray-800">2023.01.01 ~ 현재</span>
                  </div>
                  <div className="flex border-b border-gray-100 pb-2">
                    <span className="w-24 text-[11px] font-black text-gray-400 uppercase">용 도</span>
                    <span className="text-sm font-black text-gray-800">금융기관 제출용</span>
                  </div>
                </div>

                <div className="pt-24 text-center space-y-10">
                  <p className="text-sm font-black text-gray-800 tracking-widest">위와 같이 재직 중임을 증명함.</p>
                  <p className="text-xs font-bold text-gray-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  
                  <div className="relative inline-block pt-10">
                    <p className="text-2xl font-black tracking-tighter text-gray-900 italic">SY INC. 대표이사 박철홍</p>
                    {/* 디지털 직인 */}
                    <div className="absolute -right-12 -top-2 w-20 h-20 border-4 border-red-600/80 rounded-full flex items-center justify-center rotate-12 opacity-80">
                      <div className="text-[10px] font-black text-red-600/80 text-center leading-tight">
                        SY INC.<br/>대표이사<br/>박철홍
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6 opacity-20">
              <p className="text-8xl">📄</p>
              <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Select Target to Preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

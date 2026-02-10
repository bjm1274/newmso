'use client';
import { useState } from 'react';

export default function InterimSettlement({ staffs = [], selectedCo }: any) {
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('퇴사');

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const calculateSettlement = (staff: any) => {
    const base = staff.base || 0;
    const date = new Date(settlementDate);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const workedDays = date.getDate();
    
    const proRatedBase = Math.floor((base / lastDay) * workedDays);
    const meal = Math.floor(((staff.meal || 200000) / lastDay) * workedDays);
    
    return {
      proRatedBase,
      meal,
      total: proRatedBase + meal,
      workedDays,
      lastDay
    };
  };

  const result = selectedStaff ? calculateSettlement(selectedStaff) : null;

  return (
    <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-xl animate-in fade-in duration-500">
      <div className="mb-8 border-b border-gray-50 pb-6">
        <h3 className="text-xl font-black text-gray-900 tracking-tighter italic">급여 중간정산 엔진</h3>
        <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">Interim Payroll Settlement</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">정산 대상자 선택</label>
            <select 
              onChange={(e) => setSelectedStaff(filtered.find((s: any) => s.id === parseInt(e.target.value)))}
              className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100"
            >
              <option value="">직원을 선택하세요</option>
              {filtered.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.position})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">정산 기준일</label>
              <input 
                type="date" 
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">정산 사유</label>
              <select 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100"
              >
                <option value="퇴사">중도 퇴사</option>
                <option value="휴직">휴직 시작</option>
                <option value="기타">기타 사유</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-blue-50/50 p-8 rounded-[2rem] border border-blue-100 flex flex-col justify-center">
          {result ? (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">정산 총액 (세전)</p>
                  <p className="text-3xl font-black text-blue-600 tracking-tighter">{result.total.toLocaleString()}원</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">근무 일수</p>
                  <p className="text-lg font-black text-gray-700">{result.workedDays} / {result.lastDay}일</p>
                </div>
              </div>
              <div className="space-y-2 pt-4 border-t border-blue-100">
                <div className="flex justify-between text-xs font-bold text-gray-600">
                  <span>기본급 (일할)</span>
                  <span>{result.proRatedBase.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-gray-600">
                  <span>식대 (일할)</span>
                  <span>{result.meal.toLocaleString()}원</span>
                </div>
              </div>
              <button className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg shadow-blue-100 hover:scale-[0.98] transition-all">정산 내역 확정 및 전송</button>
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-xs font-black text-blue-300">정산 대상을 선택하면<br/>실시간 계산 결과가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

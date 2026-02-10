'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AttendanceMain({ staffs, selectedCo }: any) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'calendar'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      // 실제 운영 시에는 DB에서 해당 월/일의 데이터를 가져옴
      // const { data } = await supabase.from('attendance').select('*')...
      setAttendanceData([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonth, selectedDate, selectedCo]);

  // 월별 일수 계산
  const getDaysInMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(selectedMonth);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD] animate-in fade-in duration-500">
      <header className="p-8 border-b border-gray-100 bg-white shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">
              전문 근태 통합 관리 <span className="text-sm text-blue-600 ml-2">[{selectedCo}]</span>
            </h2>
            <div className="flex gap-2 mt-4">
              {[
                { id: 'daily', label: '일별 현황' },
                { id: 'monthly', label: '월별 대장' },
                { id: 'calendar', label: '근태 달력' }
              ].map(mode => (
                <button 
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  className={`px-6 py-2.5 rounded-xl text-[11px] font-black transition-all ${
                    viewMode === mode.id 
                      ? 'bg-gray-900 text-white shadow-xl' 
                      : 'bg-white text-gray-400 border border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
            {viewMode === 'daily' ? (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-gray-400 uppercase">Date</span>
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-gray-400 uppercase">Month</span>
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-auto custom-scrollbar bg-gray-50/20">
        {viewMode === 'daily' && (
          <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-[10px] font-black text-gray-400 border-b border-gray-100 uppercase">
                <tr>
                  <th className="px-8 py-5">직원 정보</th>
                  <th className="px-8 py-5">출근 시간</th>
                  <th className="px-8 py-5">퇴근 시간</th>
                  <th className="px-8 py-5">근무 시간</th>
                  <th className="px-8 py-5">상태</th>
                  <th className="px-8 py-5 text-right">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-blue-50/30 transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="font-black text-gray-900">{s.name}</span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase">{s.department} / {s.position}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 font-mono font-bold text-blue-600">08:52:14</td>
                    <td className="px-8 py-5 font-mono font-bold text-gray-400">18:05:33</td>
                    <td className="px-8 py-5 font-black text-gray-700">9시간 13분</td>
                    <td className="px-8 py-5">
                      <span className="px-3 py-1 bg-green-100 text-green-600 text-[9px] font-black rounded-full">정상</span>
                    </td>
                    <td className="px-8 py-5 text-right text-gray-300 text-[10px]">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'monthly' && (
          <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="bg-gray-50 text-[9px] font-black text-gray-400 border-b border-gray-100 uppercase">
                  <tr>
                    <th className="px-6 py-4 sticky left-0 bg-gray-50 z-10 border-r">성명</th>
                    {daysArray.map(d => (
                      <th key={d} className="px-3 py-4 text-center border-r min-w-[45px]">{d}</th>
                    ))}
                    <th className="px-6 py-4 text-center bg-blue-50 text-blue-600">출근일수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((s: any) => (
                    <tr key={s.id} className="hover:bg-gray-25 transition-all">
                      <td className="px-6 py-4 sticky left-0 bg-white z-10 border-r font-black text-xs text-gray-900">{s.name}</td>
                      {daysArray.map(d => (
                        <td key={d} className="px-3 py-4 text-center border-r text-[10px] font-bold text-gray-400">
                          {d % 7 === 0 || d % 7 === 6 ? <span className="text-red-300">휴</span> : '출'}
                        </td>
                      ))}
                      <td className="px-6 py-4 text-center bg-blue-50/30 font-black text-blue-600 text-xs">22일</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-xl">
            <div className="grid grid-cols-7 gap-4">
              {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase pb-4">{day}</div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => {
                const day = i - 1; // 데모용 날짜 오프셋
                return (
                  <div key={i} className={`min-h-[120px] p-4 border border-gray-50 rounded-2xl transition-all hover:shadow-lg ${day > 0 && day <= 28 ? 'bg-white' : 'bg-gray-50/50 opacity-30'}`}>
                    {day > 0 && day <= 28 && (
                      <>
                        <span className="text-xs font-black text-gray-900">{day}</span>
                        <div className="mt-3 space-y-1">
                          <div className="px-2 py-1 bg-blue-50 text-blue-600 text-[8px] font-black rounded-lg flex justify-between">
                            <span>출근</span>
                            <span>{filtered.length}명</span>
                          </div>
                          <div className="px-2 py-1 bg-orange-50 text-orange-600 text-[8px] font-black rounded-lg flex justify-between">
                            <span>연차</span>
                            <span>2명</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

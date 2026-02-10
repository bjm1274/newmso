'use client';
import { useState } from 'react';

export default function MonthlyCalendar({ calendarData, targetMonth, onCellClick, onBulkNormal }: any) {
  // [상태] 현재 보고 있는 주차 (기본 1주차)
  const [activeWeek, setActiveWeek] = useState(1);

  // 1. 해당 월의 마지막 날짜 계산 (30일인지 31일인지)
  const lastDay = new Date(Number(targetMonth.split('-')[0]), Number(targetMonth.split('-')[1]), 0).getDate();
  
  // 2. 주차별 날짜 범위 계산 함수 (7일 단위)
  const getWeekRange = (week: number) => {
    const start = (week - 1) * 7 + 1;
    let end = week * 7;
    if (end > lastDay) end = lastDay; // 31일이 넘어가면 마지막 날짜로 고정
    return { start, end };
  };

  // 3. 현재 주차에 해당하는 날짜 배열 생성
  const { start: startDay, end: endDay } = getWeekRange(activeWeek);
  const daysArray = Array.from({ length: endDay - startDay + 1 }, (_, i) => startDay + i);

  // 4. 총 필요한 주차 수 (28일=4주, 31일=5주)
  const totalWeeks = Math.ceil(lastDay / 7);

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 상단 컨트롤러: 주차 선택 버튼 */}
      <div className="p-5 border-b bg-gray-50 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-6">
            <h3 className="font-black text-gray-800 text-lg">🗓️ {targetMonth} 월간 근태 현황</h3>
            <div className="flex p-1.5 bg-gray-200 rounded-2xl gap-1 shadow-inner">
                {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => {
                    const range = getWeekRange(week);
                    return (
                        <button 
                            key={week}
                            onClick={() => setActiveWeek(week)}
                            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex flex-col items-center
                                ${activeWeek === week ? 'bg-white shadow-md text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <span>{week}주차</span>
                            <span className="text-[9px] opacity-60">{range.start}~{range.end}일</span>
                        </button>
                    );
                })}
            </div>
        </div>
        <div className="text-[11px] text-gray-400 font-bold bg-white px-3 py-1.5 rounded-full border shadow-sm">
            💡 31일까지 있는 달은 자동으로 5주차가 생성됩니다.
        </div>
      </div>

      {/* 7일 단위 근태 테이블 */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="w-32 p-4 border-b border-r font-black text-gray-400 text-[10px] uppercase tracking-tighter">직원명</th>
              {daysArray.map(d => (
                <th key={d} className="p-3 border-b text-center">
                    <span className="text-[10px] text-gray-400 font-bold block mb-0.5">{targetMonth}</span>
                    <span className="text-base font-black text-gray-800">{d}일</span>
                </th>
              ))}
              {/* 7일이 안되는 마지막 주차(5주차)의 경우 빈 칸을 채워 레이아웃 유지 */}
              {daysArray.length < 7 && Array.from({ length: 7 - daysArray.length }).map((_, i) => (
                <th key={`empty-${i}`} className="p-3 border-b bg-gray-25/30"></th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {calendarData.map((row: any) => (
              <tr key={row.staff.id} className="hover:bg-blue-50/10 transition-colors group">
                <td 
                  className="p-4 font-black border-r text-center text-sm cursor-pointer group-hover:text-blue-600 transition-colors bg-white sticky left-0 z-10"
                  onClick={() => onBulkNormal(row.staff)}
                >
                  {row.staff.name}
                </td>
                
                {/* 현재 주차 날짜 데이터 출력 */}
                {row.days.filter((d: any) => {
                    const dayNum = parseInt(d.date.split('-')[2]);
                    return dayNum >= startDay && dayNum <= endDay;
                }).map((d: any, i: number) => {
                  let statusStyle = "bg-white text-gray-200 border-gray-100";
                  if (d.status === '정상') statusStyle = "bg-green-50 text-green-700 border-green-200";
                  else if (d.status === '지각') statusStyle = "bg-red-50 text-red-600 border-red-200";
                  else if (d.status?.includes('휴가')) statusStyle = "bg-purple-50 text-purple-600 border-purple-200";

                  return (
                    <td key={i} className="p-2 h-28">
                      <div 
                        onClick={(e) => onCellClick(e, d, row.staff)}
                        className={`w-full h-full rounded-[1.5rem] border flex flex-col items-center justify-center cursor-pointer hover:shadow-lg transition-all p-2 ${statusStyle}`}
                      >
                        {d.status !== 'none' ? (
                          <>
                            <div className="text-xs font-black mb-2">{d.status}</div>
                            <div className="text-[10px] font-mono font-bold opacity-60 leading-tight text-center">
                                {d.check_in?.slice(11, 16) || '--:--'}<br/>
                                ~ {d.check_out?.slice(11, 16) || '--:--'}
                            </div>
                          </>
                        ) : <span className="text-xs opacity-20 font-black">-</span>}
                      </div>
                    </td>
                  );
                })}
                
                {/* 5주차 빈 칸 보정 */}
                {daysArray.length < 7 && Array.from({ length: 7 - daysArray.length }).map((_, i) => (
                  <td key={`empty-td-${i}`} className="p-2 bg-gray-50/10"></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
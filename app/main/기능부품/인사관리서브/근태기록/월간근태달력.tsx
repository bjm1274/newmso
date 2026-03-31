'use client';
import { useState } from 'react';

export default function MonthlyCalendar({ calendarData, targetMonth, onCellClick, onBulkNormal }: Record<string, unknown>) {
  // [상태] 현재 보고 있는 주차 (기본 1주차)
  const [activeWeek, setActiveWeek] = useState(1);

  const _targetMonth = (targetMonth as string) ?? '';
  const _calendarData = (calendarData as Record<string, unknown>[]) ?? [];
  const _onBulkNormal = onBulkNormal as (staff: unknown) => void;
  const _onCellClick = onCellClick as (e: unknown, d: unknown, staff: unknown) => void;

  // 1. 해당 월의 마지막 날짜 계산 (30일인지 31일인지)
  const lastDay = new Date(Number(_targetMonth.split('-')[0]), Number(_targetMonth.split('-')[1]), 0).getDate();
  
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
    <div className="flex flex-col h-full bg-[var(--card)] relative">
      {/* 상단 컨트롤러: 주차 선택 버튼 */}
      <div className="p-4 border-b bg-[var(--muted)] flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
            <h3 className="font-semibold text-[var(--foreground)] text-lg">🗓️ {_targetMonth} 월간 근태 현황</h3>
            <div className="flex p-1.5 bg-[var(--toss-gray-2)] rounded-[var(--radius-md)] gap-1 shadow-inner">
                {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => {
                    const range = getWeekRange(week);
                    return (
                        <button 
                            key={week}
                            onClick={() => setActiveWeek(week)}
                            className={`px-5 py-2 rounded-[var(--radius-lg)] text-sm font-bold transition-all flex flex-col items-center
                                ${activeWeek === week ? 'bg-[var(--card)] shadow-md text-[var(--accent)]' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
                        >
                            <span>{week}주차</span>
                            <span className="text-[11px] opacity-60">{range.start}~{range.end}일</span>
                        </button>
                    );
                })}
            </div>
        </div>
        <div className="text-[11px] text-[var(--toss-gray-3)] font-bold bg-[var(--card)] px-3 py-1.5 rounded-[var(--radius-md)] border shadow-sm">
            💡 31일까지 있는 달은 자동으로 5주차가 생성됩니다.
        </div>
      </div>

      {/* 7일 단위 근태 테이블 */}
      <div className="flex-1 overflow-auto bg-[var(--card)]">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-[var(--muted)]/50">
              <th className="w-32 p-4 border-b border-r font-semibold text-[var(--toss-gray-3)] text-[11px] uppercase tracking-tight">직원명</th>
              {daysArray.map(d => (
                <th key={d} className="p-3 border-b text-center">
                    <span className="text-[11px] text-[var(--toss-gray-3)] font-bold block mb-0.5">{_targetMonth}</span>
                    <span className="text-base font-semibold text-[var(--foreground)]">{d}일</span>
                </th>
              ))}
              {/* 7일이 안되는 마지막 주차(5주차)의 경우 빈 칸을 채워 레이아웃 유지 */}
              {daysArray.length < 7 && Array.from({ length: 7 - daysArray.length }).map((_, i) => (
                <th key={`empty-${i}`} className="p-3 border-b bg-gray-25/30"></th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {_calendarData.map((row: any) => (
              <tr key={row.staff.id} className="hover:bg-blue-500/10/10 transition-colors group">
                <td
                  className="p-4 font-semibold border-r text-center text-sm cursor-pointer group-hover:text-[var(--accent)] transition-colors bg-[var(--card)] sticky left-0 z-10"
                  onClick={() => _onBulkNormal(row.staff)}
                >
                  {row.staff.name}
                </td>
                
                {/* 현재 주차 날짜 데이터 출력 */}
                {row.days.filter((d: any) => {
                    const dayNum = parseInt(d.date.split('-')[2]);
                    return dayNum >= startDay && dayNum <= endDay;
                }).map((d: any, i: number) => {
                  let statusStyle = "bg-[var(--card)] text-[var(--toss-gray-3)] border-[var(--border)]";
                  if (d.status === '정상') statusStyle = "bg-green-500/10 text-green-700 border-green-500/20";
                  else if (d.status === '지각') statusStyle = "bg-red-500/10 text-red-600 border-red-500/20";
                  else if (d.status?.includes('휴가')) statusStyle = "bg-purple-500/10 text-purple-600 border-purple-500/20";

                  return (
                    <td key={i} className="p-2 h-28">
                      <div 
                        onClick={(e) => _onCellClick(e, d, row.staff)}
                        className={`w-full h-full rounded-[var(--radius-lg)] border flex flex-col items-center justify-center cursor-pointer hover:shadow-sm transition-all p-2 ${statusStyle}`}
                      >
                        {d.status !== 'none' ? (
                          <>
                            <div className="text-xs font-semibold mb-2">{d.status}</div>
                            <div className="text-[11px] font-mono font-bold opacity-60 leading-tight text-center">
                                {d.check_in?.slice(11, 16) || '--:--'}<br/>
                                ~ {d.check_out?.slice(11, 16) || '--:--'}
                            </div>
                          </>
                        ) : <span className="text-xs opacity-20 font-semibold">-</span>}
                      </div>
                    </td>
                  );
                })}
                
                {/* 5주차 빈 칸 보정 */}
                {daysArray.length < 7 && Array.from({ length: 7 - daysArray.length }).map((_, i) => (
                  <td key={`empty-td-${i}`} className="p-2 bg-[var(--muted)]/10"></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
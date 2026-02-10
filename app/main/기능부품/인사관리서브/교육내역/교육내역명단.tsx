'use client';

export default function EducationList({ selectedCo, staffs, notifications = [] }: any) {
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
  
  // 교육 항목 리스트
  const eduItems = ["성희롱예방", "개인정보보호", "장애인인식개선", "괴롭힘방지", "아동학대신고", "노인학대신고"];

  return (
    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
        <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">직원별 교육 이수 내역 (2026년)</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-[9px] font-bold text-gray-400">이수완료</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-[9px] font-bold text-gray-400">미이수</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
            <span className="text-[9px] font-bold text-gray-400">기한임박</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-white text-[9px] font-black text-gray-300 border-b border-gray-100 uppercase">
            <tr>
              <th className="p-4 sticky left-0 bg-white z-10 w-32 border-r border-gray-50">성명 / 소속</th>
              {eduItems.map(item => (
                <th key={item} className="p-4 text-center">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((s: any) => {
              const staffNotis = notifications.filter((n: any) => n.id === s.id);
              return (
                <tr key={s.id} className="hover:bg-gray-25 transition-colors">
                  <td className="p-4 sticky left-0 bg-white z-10 border-r border-gray-50">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-gray-800">{s.name}</span>
                      <span className="text-[9px] text-gray-300 font-bold">{s.company}</span>
                    </div>
                  </td>
                  {eduItems.map((item, idx) => {
                    const isUrgent = staffNotis.some((n: any) => n.education === item);
                    const isCompleted = idx < 3; // 시뮬레이션용 로직

                    return (
                      <td key={idx} className="p-4 text-center">
                        {isUrgent ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="px-2 py-1 text-[9px] font-black border bg-orange-50 text-orange-600 border-orange-100 animate-pulse">
                              기한임박
                            </span>
                            <span className="text-[8px] font-bold text-orange-400">7일 남음</span>
                          </div>
                        ) : (
                          <span className={`px-2 py-1 text-[9px] font-black border ${isCompleted ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                            {isCompleted ? '이수완료' : '미이수'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

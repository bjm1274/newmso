'use client';

type EduItem = { name: string; category: 'hospital' | 'company' | 'common' };

export default function EducationList({ selectedCo, staffs, notifications = [] }: any) {
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
  
  // 법정 의무 교육 전체 목록 (병원 / 일반사업장 / 공통)
  const eduItems: EduItem[] = [
    // 공통 (일반 회사)
    { name: '성희롱예방', category: 'common' },
    { name: '개인정보보호', category: 'common' },
    { name: '직장 내 장애인 인식개선', category: 'company' },
    { name: '직장 내 괴롭힘 방지', category: 'company' },
    { name: '산업안전보건(일반)', category: 'company' },
    // 병원·의료기관 추가 의무
    { name: '감염관리 교육', category: 'hospital' },
    { name: '환자안전·의료사고 예방', category: 'hospital' },
    { name: '의료법·의료윤리 교육', category: 'hospital' },
    { name: '마약류 취급자 교육(해당자)', category: 'hospital' },
    // 신고 의무
    { name: '아동학대신고', category: 'hospital' },
    { name: '노인학대신고', category: 'hospital' },
  ];

  return (
    <div className="bg-white border border-[var(--toss-border)] shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-50 bg-[var(--toss-gray-1)]/50 flex justify-between items-center">
        <h3 className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">직원별 교육 이수 내역 (2026년)</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">이수완료</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">미이수</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">기한임박</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-white text-[11px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase">
            <tr>
              <th className="p-4 sticky left-0 bg-white z-10 w-32 border-r border-gray-50">성명 / 소속</th>
              {eduItems.map(item => (
                <th key={item.name} className="p-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span>{item.name}</span>
                    <span className="text-[8px] font-bold text-[var(--toss-gray-3)]">
                      {item.category === 'hospital'
                        ? '병원'
                        : item.category === 'company'
                        ? '일반'
                        : '공통'}
                    </span>
                  </div>
                </th>
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
                      <span className="text-xs font-semibold text-[var(--foreground)]">{s.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">{s.company}</span>
                    </div>
                  </td>
                  {eduItems.map((item, idx) => {
                    const isUrgent = staffNotis.some((n: any) => n.education === item.name);
                    const isCompleted = idx < 3; // 시뮬레이션용 로직

                    return (
                      <td key={idx} className="p-4 text-center">
                        {isUrgent ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="px-2 py-1 text-[11px] font-semibold border bg-orange-50 text-orange-600 border-orange-100 animate-pulse">
                              기한임박
                            </span>
                            <span className="text-[8px] font-bold text-orange-400">7일 남음</span>
                          </div>
                        ) : (
                          <span className={`px-2 py-1 text-[11px] font-semibold border ${isCompleted ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
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

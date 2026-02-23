'use client';

interface EducationStatusProps {
  selectedCo: string;
  urgentCount?: number;
}

export default function EducationStatus({ selectedCo, urgentCount = 0 }: EducationStatusProps) {
  // 사업자별 가상 데이터 (실제 운영 시 DB 연동)
  const stats = {
    totalRate: selectedCo === 'SY(법인)' ? 85 : 72,
    pendingCount: selectedCo === '수연의원' ? 5 : 12,
    urgentItems: ["아동학대신고", "노인학대신고"]
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. 평균 이수율 */}
      <div className="bg-white border border-[var(--toss-border)] p-6 shadow-sm flex flex-col justify-between">
        <div>
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-1 tracking-widest">평균 이수율</p>
          <h4 className="text-2xl font-semibold text-[var(--foreground)]">{selectedCo}</h4>
        </div>
        <div className="mt-4 flex items-end gap-2">
          <span className="text-4xl font-semibold text-[var(--toss-blue)]">{stats.totalRate}%</span>
          <div className="flex-1 h-2 bg-[var(--toss-gray-1)] mb-2">
            <div 
              className="h-full bg-[var(--toss-blue)] transition-all duration-1000" 
              style={{ width: `${stats.totalRate}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* 2. 미이수 인원 현황 (자동 알림 연동) */}
      <div className={`bg-white border p-6 shadow-sm transition-all ${urgentCount > 0 ? 'border-red-200 bg-red-50/30' : 'border-[var(--toss-border)]'}`}>
        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-1 tracking-widest">미이수 인원</p>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="text-4xl font-semibold text-red-500">{stats.pendingCount}<span className="text-sm text-[var(--toss-gray-3)] ml-1">명</span></p>
            {urgentCount > 0 && (
              <p className="text-[11px] font-semibold text-red-600 mt-2 animate-bounce">⚠️ 기한 임박 {urgentCount}명</p>
            )}
          </div>
          <button className="text-[11px] font-semibold text-[var(--toss-blue)] border border-blue-100 px-3 py-1.5 bg-white hover:bg-blue-50 transition-all shadow-sm">
            전체 명단 확인
          </button>
        </div>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-4 italic">* 법정 의무 교육 미이수 시 과태료 리스크</p>
      </div>

      {/* 3. 집중 관리 항목 (병원 필수 교육) */}
      <div className="bg-[#232933] p-6 shadow-xl flex flex-col">
        <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase mb-4 tracking-widest">집중 관리 교육</p>
        <div className="flex flex-wrap gap-2">
          {stats.urgentItems.map(item => (
            <span key={item} className="px-2 py-1 bg-white/10 text-white text-[11px] font-semibold border border-white/10">
              {item}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-auto pt-4 border-t border-white/5">
          의료진 및 행정직 필수 이수 항목
        </p>
      </div>
    </div>
  );
}

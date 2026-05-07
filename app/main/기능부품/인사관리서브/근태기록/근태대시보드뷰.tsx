'use client';

export type AttendanceStats = {
  total: number;
  present: number;
  late: number;
  earlyLeave: number;
  absent: number;
  rate: number;
  atRiskStaff: Record<string, unknown>[];
};

export type AttendanceDashboardViewProps = {
  stats: AttendanceStats;
  selectedMonth: string;
};

export default function AttendanceDashboardView({ stats, selectedMonth }: AttendanceDashboardViewProps) {
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* AI Attendance Alert Widget */}
      {stats.atRiskStaff && stats.atRiskStaff.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-[var(--radius-lg)] p-4 shadow-sm flex items-start gap-4">
          <div className="text-4xl">🚨</div>
          <div className="flex-1">
            <h4 className="text-sm font-black text-rose-800 flex items-center gap-2">
              근태 경고 알림
              <span className="px-2 py-0.5 bg-rose-200 text-rose-700 rounded-[var(--radius-md)] text-[10px] animate-pulse">주의 요망</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {stats.atRiskStaff.map((risk: any, idx: number) => (
                <div key={idx} className="bg-[var(--card)] border border-rose-200 px-3 py-2 rounded-[var(--radius-lg)] text-xs flex items-center gap-3">
                  <span className="font-bold text-[var(--foreground)]">{risk.name} <span className="text-[10px] text-[var(--toss-gray-3)] font-medium">({risk.dept})</span></span>
                  <div className="flex gap-2">
                    {risk.lates > 0 && <span className="text-orange-600 font-bold">지각 {risk.lates}회</span>}
                    {risk.absents > 0 && <span className="text-rose-600 font-bold">결근 {risk.absents}회</span>}
                  </div>
                  <button className="ml-2 px-2 py-1 bg-rose-500 text-white text-[10px] rounded hover:bg-rose-600 font-bold">
                    면담 요청
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <h3 className="text-lg font-bold text-foreground mb-4 mt-5">근태 요약 <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{selectedMonth} 기준</span></h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
          <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">🎯</div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">출근율</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl md:text-5xl font-black text-blue-600">{stats.rate}</p>
            <span className="text-xl font-bold text-blue-600/50 mb-1">%</span>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-[var(--success-light)] transition-colors">
          <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">✅</div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">정상 출근</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl md:text-5xl font-black text-[var(--success)]">{stats.present}</p>
            <span className="text-xl font-bold text-[var(--success)]/50 mb-1">건</span>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-orange-300 transition-colors">
          <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">⏰</div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">지각</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl md:text-5xl font-black text-orange-500">{stats.late}</p>
            <span className="text-xl font-bold text-orange-500/50 mb-1">건</span>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 md:p-4 shadow-sm relative overflow-hidden group hover:border-rose-300 transition-colors">
          <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 group-hover:scale-110 transition-transform">🏃‍♂️</div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2">조퇴 / 결근</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl md:text-5xl font-black text-rose-500">{stats.earlyLeave + stats.absent}</p>
            <span className="text-xl font-bold text-rose-500/50 mb-1">건</span>
          </div>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">근무 상태 지표</h3>
          <span className="text-xs font-bold text-[var(--toss-gray-3)] bg-[var(--tab-bg)] px-3 py-1 rounded-[var(--radius-md)]">총 {stats.total}건</span>
        </div>
        <div className="space-y-4">
          {[
            { label: '정상 출근', count: stats.present, color: 'bg-[var(--success)]', bg: 'bg-[var(--success-light)]' },
            { label: '지각', count: stats.late, color: 'bg-orange-500', bg: 'bg-orange-500/10' },
            { label: '조퇴', count: stats.earlyLeave, color: 'bg-amber-500', bg: 'bg-amber-50' },
            { label: '결근', count: stats.absent, color: 'bg-rose-500', bg: 'bg-rose-50' }
          ].map(stat => {
            const percent = stats.total ? Math.round((stat.count / stats.total) * 100) : 0;
            return (
              <div key={stat.label} className="group cursor-default">
                <div className="flex justify-between items-end mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stat.color}`}></span>
                    <span className="text-sm font-bold text-[var(--toss-gray-4)]">{stat.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">{stat.count}건</span>
                    <span className="text-lg font-black text-foreground w-12 text-right">{percent}%</span>
                  </div>
                </div>
                <div className="h-4 bg-[var(--tab-bg)] rounded-full overflow-hidden relative">
                  <div
                    className={`h-full ${stat.color} transition-all duration-1000 ease-out`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

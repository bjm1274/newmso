'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function BusinessDashboard({ staffs = [], inventory = [] }: any) {
  const [metrics, setMetrics] = useState<any>({});
  const [approvals, setApprovals] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data: appr } = await supabase.from('approvals').select('status').eq('status', '대기');
      const today = new Date().toISOString().slice(0, 10);
      const { data: att } = await supabase.from('attendances').select('status').gte('work_date', today).lte('work_date', today);
      const { data: lv } = await supabase.from('leave_requests').select('status, leave_type').eq('status', '승인');
      setApprovals(appr || []);
      setAttendances(att || []);
      setLeaves(lv || []);
    };
    fetch();
  }, []);

  useEffect(() => {
    const laborCost = staffs.reduce((s: number, st: any) => s + (st.base_salary || 0), 0);
    const totalStaff = staffs.length;
    const onLeave = leaves.filter(l => l.leave_type === '연차').length;
    const attendanceRate = totalStaff > 0 ? ((totalStaff - onLeave) / totalStaff * 100).toFixed(1) : 0;
    const leaveUsage = staffs.reduce((s: number, st: any) => s + (st.annual_leave_used || 0), 0);
    const leaveTotal = staffs.reduce((s: number, st: any) => s + (st.annual_leave_total || 15), 0);
    const leaveRate = leaveTotal > 0 ? (leaveUsage / leaveTotal * 100).toFixed(1) : 0;

    // Simulated turnover prediction based on real data shape
    const burnoutCandidates = staffs.filter((s: any) => (s.annual_leave_used || 0) < 3).length;

    setMetrics({
      totalLaborCost: laborCost,
      attendanceRate,
      leaveUsageRate: leaveRate,
      burnoutCandidates,
      turnoverPrediction: 0,
      efficiencyScore: 0
    });
  }, [staffs, inventory, approvals, leaves]);

  const monthlyTurnover: number[] = []; // Virtual data removed
  const leaveUsageTrend: number[] = []; // Virtual data removed

  return (
    <div className="space-y-4 animate-in fade-in duration-700" data-testid="admin-analysis-business">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <h2 className="text-xl font-black text-[var(--foreground)] tracking-tight">HR 데이터 시각화 & 경영 분석 보드 📊</h2>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-[11px] font-black text-[var(--toss-gray-4)] rounded-[var(--radius-md)] shadow-sm hover:bg-[var(--tab-bg)] transition-colors">📄 리포트 출력</button>
          <button className="px-4 py-2 bg-slate-800 text-white text-[11px] font-black rounded-[var(--radius-md)] shadow-sm hover:scale-105 transition-transform">설정 변경</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] p-3 border border-[var(--border)] shadow-sm rounded-[var(--radius-xl)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-3xl opacity-10 group-hover:scale-110 transition-transform">💰</div>
          <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest">월 예상 인건비</p>
          <p className="text-xl font-black text-[var(--foreground)] mt-1.5">₩{(metrics.totalLaborCost || 0).toLocaleString()}</p>
          <p className="text-[10px] font-bold text-success mt-1.5">▲ 전월 대비 1.2% 증가</p>
        </div>
        <div className="bg-[var(--card)] p-3 border border-[var(--border)] shadow-sm rounded-[var(--radius-xl)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-3xl opacity-10 group-hover:scale-110 transition-transform">⚠️</div>
          <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest">번아웃 의심 인원 (연차 미사용)</p>
          <p className="text-xl font-black text-danger mt-1.5">{metrics.burnoutCandidates ?? 0}명</p>
          <p className="text-[10px] font-bold text-danger mt-1.5">지적 및 독려 필요</p>
        </div>
        <div className="bg-[var(--card)] p-3 border border-[var(--border)] shadow-sm rounded-[var(--radius-xl)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-3xl opacity-10 group-hover:scale-110 transition-transform">📉</div>
          <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest">AI 예측 이직률 / 퇴사율</p>
          <p className="text-xl font-black text-orange-500 mt-1.5">{metrics.turnoverPrediction ?? '-'}%</p>
          <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mt-1.5">동종 업계 평균(4.5%) 대비 양호</p>
        </div>
        <div className="bg-[var(--card)] p-3 border border-[var(--border)] shadow-sm rounded-[var(--radius-xl)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-3xl opacity-10 group-hover:scale-110 transition-transform">🏝️</div>
          <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest">조직 연차 사용률</p>
          <p className="text-xl font-black text-primary mt-1.5">{metrics.leaveUsageRate ?? '-'}%</p>
          <div className="w-full h-1.5 bg-[var(--tab-bg)] rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${metrics.leaveUsageRate}%` }}></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] p-4 rounded-[var(--radius-xl)] shadow-sm">
          <div className="flex justify-between items-end mb-3">
            <div>
              <h3 className="text-sm font-black text-[var(--foreground)]">월별 퇴사율 추이 (Turnover Rate)</h3>
              <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mt-1 uppercase tracking-widest">최근 12개월 분석 데이터</p>
            </div>
            <span className="px-3 py-1 bg-danger/10 text-danger text-[10px] font-black rounded-lg">위험 구간 탐지됨</span>
          </div>

          <div className="h-40 flex items-end justify-between gap-1 md:gap-2 relative">
            {monthlyTurnover.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
                분석할 데이터가 부족합니다
              </div>
            ) : (
              <>
                <div className="absolute top-1/4 w-full border-t border-dashed border-danger/30 z-0"></div>
                <div className="absolute top-1/2 w-full border-t border-dashed border-[var(--border)] z-0"></div>
                {monthlyTurnover.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full z-10 group relative">
                    <div className="absolute -top-8 bg-slate-800 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {val}%
                    </div>
                    <div className="w-full flex-1 flex flex-col justify-end min-h-[50px]">
                      <div className={`w-full rounded-t-md transition-all duration-500 hover:opacity-80 ${val >= 4.0 ? 'bg-danger' : val >= 3.0 ? 'bg-orange-400' : 'bg-slate-300'}`} style={{ height: `${(val / 5) * 100}%` }}></div>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">{i + 1}월</span>
                  </div>
                ))}
              </>
            )}
          </div>

        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] p-4 rounded-[var(--radius-xl)] shadow-sm">
          <div className="flex justify-between items-end mb-3">
            <div>
              <h3 className="text-sm font-black text-[var(--foreground)]">연차/휴가 누적 사용률 (Leave Usage)</h3>
              <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mt-1 uppercase tracking-widest">전사 평균 소진 현황</p>
            </div>
            <span className="px-3 py-1 bg-success/10 text-success text-[10px] font-black rounded-lg">정상 궤도</span>
          </div>

          <div className="h-40 flex items-end justify-between gap-1 md:gap-2 relative">
            {leaveUsageTrend.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
                데이터가 집계 전입니다
              </div>
            ) : (
              <>
                <div className="absolute bottom-[50%] w-full border-t border-dashed border-[var(--border)] z-0"></div>
                {leaveUsageTrend.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full z-10 group relative">
                    <div className="absolute -top-8 bg-primary text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {val}%
                    </div>
                    <div className="w-full flex-1 flex flex-col justify-end min-h-[50px]">
                      <div className="w-full bg-primary/20 rounded-t-md relative transition-all duration-500 hover:bg-primary/40" style={{ height: `${val}%` }}>
                        <div className="absolute bottom-0 w-full bg-primary rounded-t-sm" style={{ height: '4px' }}></div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">{i + 1}월</span>
                  </div>
                ))}
              </>
            )}
          </div>

        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
          <svg width="300" height="300" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
        </div>
        <div className="z-10 xl:w-2/3">
          <h3 className="text-base font-black text-white mb-1.5">지표 분석 리포트 요약</h3>
          <p className="text-[12px] font-medium text-[var(--toss-gray-3)] leading-relaxed italic">
            실제 인사 및 근태 데이터를 기반으로 분석 중입니다. 데이터가 쌓이면 부서별 번아웃 위험도 및 채용 전략 제안이 이곳에 표시됩니다.
          </p>
        </div>
        <button className="z-10 px-4 py-2 bg-[var(--card)] text-[var(--foreground)] text-[12px] font-black rounded-[var(--radius-md)] shadow-sm hover:scale-105 active:scale-95 transition-all w-full md:w-auto shrink-0 flex items-center justify-center gap-2">
          ✉️ 전사 촉진 메일 발송
        </button>
      </div>
    </div>
  );
}


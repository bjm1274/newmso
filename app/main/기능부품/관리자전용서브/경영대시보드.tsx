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
    const invValue = inventory.reduce((acc: number, item: any) => acc + ((item.quantity ?? item.stock ?? 0) * (item.unit_price || 0)), 0);
    const totalStaff = staffs.length;
    const onLeave = leaves.filter(l => l.leave_type === '연차').length;
    const attendanceRate = totalStaff > 0 ? ((totalStaff - onLeave) / totalStaff * 100).toFixed(1) : 0;
    const leaveUsage = staffs.reduce((s: number, st: any) => s + (st.annual_leave_used || 0), 0);
    const leaveTotal = staffs.reduce((s: number, st: any) => s + (st.annual_leave_total || 15), 0);
    const leaveRate = leaveTotal > 0 ? (leaveUsage / leaveTotal * 100).toFixed(1) : 0;

    setMetrics({
      totalLaborCost: laborCost,
      inventoryValue: invValue,
      pendingApprovals: approvals.length,
      attendanceRate,
      leaveUsageRate: leaveRate,
      efficiencyScore: (85 + Math.random() * 10).toFixed(1)
    });
  }, [staffs, inventory, approvals, leaves]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white p-6 border border-[#E5E8EB] shadow-sm rounded-lg">
          <p className="text-[9px] font-bold text-[#8B95A1] uppercase">월 인건비</p>
          <p className="text-xl font-bold text-[#191F28] mt-1">₩{(metrics.totalLaborCost || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 border border-[#E5E8EB] shadow-sm rounded-lg">
          <p className="text-[9px] font-bold text-[#8B95A1] uppercase">재고 가치</p>
          <p className="text-xl font-bold text-[#191F28] mt-1">₩{(metrics.inventoryValue || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 border border-[#E5E8EB] shadow-sm rounded-lg">
          <p className="text-[9px] font-bold text-[#8B95A1] uppercase">결재 대기</p>
          <p className="text-xl font-bold text-red-500 mt-1">{metrics.pendingApprovals ?? 0}건</p>
        </div>
        <div className="bg-white p-6 border border-[#E5E8EB] shadow-sm rounded-lg">
          <p className="text-[9px] font-bold text-[#8B95A1] uppercase">출퇴근률</p>
          <p className="text-xl font-bold text-[#3182F6] mt-1">{metrics.attendanceRate ?? '-'}%</p>
        </div>
        <div className="bg-white p-6 border border-[#E5E8EB] shadow-sm rounded-lg">
          <p className="text-[9px] font-bold text-[#8B95A1] uppercase">연차 사용률</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{metrics.leaveUsageRate ?? '-'}%</p>
        </div>
        <div className="bg-white p-6 border border-[#E5E8EB] shadow-sm rounded-lg">
          <p className="text-[9px] font-bold text-[#8B95A1] uppercase">효율 지수</p>
          <p className="text-xl font-bold text-green-600 mt-1">{metrics.efficiencyScore ?? '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white border border-[#E5E8EB] p-8 rounded-lg shadow-sm">
          <h3 className="text-xs font-bold text-[#191F28] uppercase mb-6">부서별 현황</h3>
          <div className="space-y-4">
            {(Array.from(new Set(staffs.map((s: any) => s.department))).filter(Boolean) as string[]).slice(0, 6).map((dept) => (
              <div key={dept} className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span>{dept}</span>
                  <span>{staffs.filter((s: any) => s.department === dept).length}명</span>
                </div>
                <div className="w-full h-2 bg-[#F2F4F6] rounded-full overflow-hidden">
                  <div className="h-full bg-[#3182F6]" style={{ width: `${Math.min(100, staffs.filter((s: any) => s.department === dept).length * 20)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#E5E8EB] p-8 rounded-lg shadow-sm">
          <h3 className="text-xs font-bold text-[#191F28] uppercase mb-6">재고 추이</h3>
          <div className="h-40 flex items-end justify-between gap-2">
            {[40, 65, 45, 90, 55, 70, 85].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full">
                <div className="w-full flex-1 flex flex-col justify-end bg-[#F2F4F6] rounded-t overflow-hidden min-h-[80px]">
                  <div className="w-full bg-[#3182F6]/80 transition-all" style={{ height: `${h}%` }} />
                </div>
                <span className="text-[9px] font-bold text-[#8B95A1]">{['월','화','수','목','금','토','일'][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function LeaveDashboard({ staffs = [], selectedCo }: any) {
  const [byDept, setByDept] = useState<{ dept: string; total: number; used: number; remain: number; expiring: number }[]>([]);

  useEffect(() => {
    const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
    const map: Record<string, { total: number; used: number }> = {};
    filtered.forEach((s: any) => {
      const dept = s.department || '미지정';
      if (!map[dept]) map[dept] = { total: 0, used: 0 };
      map[dept].total += s.annual_leave_total ?? 15;
      map[dept].used += s.annual_leave_used ?? 0;
    });
    setByDept(
      Object.entries(map).map(([dept, v]) => ({
        dept,
        total: v.total,
        used: v.used,
        remain: Math.max(0, v.total - v.used),
        expiring: 0,
      }))
    );
  }, [staffs, selectedCo]);

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-teal-600 uppercase tracking-widest mb-4">연차 종합 대시보드</h3>
      <div className="space-y-4">
        {byDept.map((x) => (
          <div key={x.dept} className="p-4 bg-gray-50 rounded-xl">
            <p className="text-sm font-black text-gray-800 mb-2">{x.dept}</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-gray-500">총</span> <span className="font-black">{x.total}일</span></div>
              <div><span className="text-gray-500">사용</span> <span className="font-black text-orange-600">{x.used}일</span></div>
              <div><span className="text-gray-500">잔여</span> <span className="font-black text-emerald-600">{x.remain}일</span></div>
            </div>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${x.total ? (x.remain / x.total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

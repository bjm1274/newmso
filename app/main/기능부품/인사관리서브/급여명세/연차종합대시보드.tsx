'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type DeptStat = { dept: string; total: number; used: number; remain: number; expiring: number };

export default function LeaveDashboard({ staffs = [], selectedCo, currentUser }: any) {
  const [byDept, setByDept] = useState<DeptStat[]>([]);

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

  const [viewMode, setViewMode] = useState<'dept' | 'personal'>('dept');

  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo)),
    [staffs, selectedCo]
  );

  const personalList = useMemo(() => {
    // 팀장/관리자는 팀 전체, 일반 직원은 본인만 기본 표시
    const isManager = ['팀장', '실장', '부장', '원장', '병원장', '대표이사'].includes(currentUser?.position || '');
    if (isManager && currentUser?.department) {
      return filteredStaffs.filter((s: any) => s.department === currentUser.department);
    }
    if (currentUser?.id) {
      return filteredStaffs.filter((s: any) => s.id === currentUser.id);
    }
    return filteredStaffs;
  }, [filteredStaffs, currentUser]);

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-black text-teal-600 uppercase tracking-widest">연차 종합 대시보드</h3>
        <div className="flex gap-1 bg-gray-100 rounded-full p-1">
          <button
            type="button"
            onClick={() => setViewMode('dept')}
            className={`px-3 py-1 rounded-full text-[10px] font-black ${
              viewMode === 'dept' ? 'bg-teal-600 text-white' : 'text-gray-500'
            }`}
          >
            팀별
          </button>
          <button
            type="button"
            onClick={() => setViewMode('personal')}
            className={`px-3 py-1 rounded-full text-[10px] font-black ${
              viewMode === 'personal' ? 'bg-teal-600 text-white' : 'text-gray-500'
            }`}
          >
            개인별
          </button>
        </div>
      </div>

      {viewMode === 'dept' ? (
        <div className="space-y-4">
          {byDept.map((x) => (
            <div key={x.dept} className="p-4 bg-gray-50 rounded-xl">
              <p className="text-sm font-black text-gray-800 mb-2">{x.dept}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">총</span>{' '}
                  <span className="font-black">{x.total}일</span>
                </div>
                <div>
                  <span className="text-gray-500">사용</span>{' '}
                  <span className="font-black text-orange-600">{x.used}일</span>
                </div>
                <div>
                  <span className="text-gray-500">잔여</span>{' '}
                  <span className="font-black text-emerald-600">{x.remain}일</span>
                </div>
              </div>
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${x.total ? (x.remain / x.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
          {personalList.map((s: any) => {
            const total = s.annual_leave_total ?? 15;
            const used = s.annual_leave_used ?? 0;
            const remain = Math.max(0, total - used);
            return (
              <div
                key={s.id}
                className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-black text-gray-800">
                    {s.name}{' '}
                    <span className="text-[10px] text-gray-400">
                      ({s.department || '미지정'})
                    </span>
                  </p>
                  <p className="text-[10px] text-gray-400">
                    총 {total}일 · 사용 {used}일 · 잔여{' '}
                    <span className="font-black text-emerald-600">{remain}일</span>
                  </p>
                </div>
                <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${total ? (remain / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

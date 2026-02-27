'use client';
import { useState } from 'react';
import PayrollExport from './급여대장내보내기';
import WeeklyHoursMonitor from './주52시간모니터링';
import SeveranceLeaveDashboard from './예상퇴직금연차대시보드';
import LeaveDashboard from './연차종합대시보드';
import LaborCostTrend from './인건비추이분석';
import DeptSalaryDistribution from './부서별급여분포';
import TurnoverDashboard from './이직률근속률대시보드';

export default function HRDashboardIntegrated({ staffs = [], selectedCo, checkedIds, yearMonth }: any) {
  const [ym, setYm] = useState(yearMonth || new Date().toISOString().slice(0, 7));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap gap-3 items-center">
        <h2 className="text-lg font-bold text-[var(--foreground)]">인사/급여 통합 대시보드</h2>
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <PayrollExport staffs={staffs} checkedIds={checkedIds} selectedCo={selectedCo} yearMonth={ym} />
        <WeeklyHoursMonitor selectedCo={selectedCo} yearMonth={ym} />
        <TurnoverDashboard staffs={staffs} />
        <SeveranceLeaveDashboard staffs={staffs} />
        <LeaveDashboard staffs={staffs} selectedCo={selectedCo} currentUser={typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem('erp_user') || '{}'); } catch { return null; } })() : null} />
        <DeptSalaryDistribution staffs={staffs} selectedCo={selectedCo} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LaborCostTrend selectedCo={selectedCo} />
      </div>
    </div>
  );
}

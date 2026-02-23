'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SalaryDetail from './급여명세/급여상세';
import PayrollTable from './급여명세/급여대장표';
import PayrollMonthlySummary from './급여명세/급여대장월별요약';
import LaborCostSimulation from './인력예측/인건비예측';
import CompliancePanel from './급여명세/노무준수패널';
import InterimSettlement from './급여명세/중간정산';
import YearEndSettlement from './급여명세/연말정산';
import SalarySettlement from './급여명세/급여정산';
import SeveranceCalculator from './급여명세/퇴직금계산기';
import PayrollEmailSender from './급여명세/급여명세서발송';
import TaxFreeSettingsPanel from './급여명세/비과세항목설정';
import LegalStandardsPanel from './급여명세/법정기준패널';
import PayrollExport from './급여명세/급여대장내보내기';
import WeeklyHoursMonitor from './급여명세/주52시간모니터링';
import HRDashboardIntegrated from './급여명세/인사대시보드통합';
import SeveranceLeaveDashboard from './급여명세/예상퇴직금연차대시보드';
import LeaveDashboard from './급여명세/연차종합대시보드';
import SalaryChangeHistory from './급여명세/급여변경이력';
import OnboardingChecklist from './급여명세/입퇴사온보딩';
import AuditLogDetail from './급여명세/감사로그상세';
import PayrollLockPanel from './급여명세/급여월마감잠금';
import ShiftPatternManager from './급여명세/교대제스케줄관리';
import NotificationTemplatesPanel from './급여명세/알림템플릿관리';
import PayrollSlipPDF from './급여명세/급여명세서PDF';
import TaxInsuranceRatesPanel from './급여명세/세율보험요율관리';

type Staff = {
  id: number;
  name: string;
  company?: string;
  position?: string;
  base?: number;
};

export default function PayrollMain({ staffs = [], selectedCo, onRefresh }: any) {
  const [activeTab, setActiveTab] = useState('대장');
  const [selectedStaffId, setSelectedStaffId] = useState(1);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [yearMonth, setYearMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  
  const filtered: Staff[] = selectedCo === '전체' ? staffs : staffs.filter((s: Staff) => s.company === selectedCo);
  const current = filtered.find((s) => s.id === selectedStaffId) || filtered[0];

  // 선택된 월·회사에 대한 급여 정산 결과 불러오기
  useEffect(() => {
    (async () => {
      if (!filtered.length) {
        setPayrollRecords([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('payroll_records')
          .select('*')
          .eq('year_month', yearMonth)
          .not('record_type', 'eq', 'interim');
        if (error) {
          console.warn('payroll_records 조회 실패:', error.message);
          setPayrollRecords([]);
        } else {
          setPayrollRecords(data || []);
        }
      } catch (e) {
        console.warn('payroll_records 조회 중 예외:', e);
        setPayrollRecords([]);
      }
    })();
  }, [yearMonth, filtered.map(s => s.id).join(',')]);

  const currentRecord = current
    ? payrollRecords.find((r: any) => String(r.staff_id) === String(current.id))
    : null;

  const [y, m] = (yearMonth || '').split('-');
  const periodLabel = y && m ? `${y}년 ${Number(m)}월` : '';

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 bg-[#f8fafc]">
      <header className="shrink-0 bg-white border-b border-gray-200">
        <div className="px-6 md:px-8 pt-5 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{periodLabel || '급여'} 급여</h1>
              <p className="text-xs text-gray-500 mt-0.5">[{selectedCo}]</p>
            </div>
            {activeTab === '대장' && (
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <span>기간</span>
                <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 px-3 border border-gray-300 rounded-md text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </label>
            )}
          </div>
          {activeTab === '대장' && (
            <span className="text-xs text-gray-500 hidden md:inline">우측 패널에서 대장 내보내기</span>
          )}
        </div>
        <nav className="flex gap-0.5 p-1 bg-[#eef2f7] rounded-lg overflow-x-auto no-scrollbar w-full md:w-fit mt-2">
          {['대장', '대시보드', '급여정산', '중간정산', '연말정산', '퇴직금', '설정'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`min-h-[44px] touch-manipulation px-4 py-2 text-xs font-medium whitespace-nowrap rounded-md transition-all ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'}`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar">
        {filtered.length > 0 ? (
          <>
            {activeTab === '대장' && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                  {current && <SalaryDetail staff={current} record={currentRecord || null} />}
                  <PayrollTable staffs={filtered} payrollRecords={payrollRecords} yearMonth={yearMonth} checkedIds={checkedIds} setCheckedIds={setCheckedIds} onSelect={setSelectedStaffId} />
                </div>
                <aside className="space-y-4">
                  <PayrollExport staffs={filtered} checkedIds={checkedIds} selectedCo={selectedCo} yearMonth={yearMonth} />
                  <PayrollMonthlySummary selectedCo={selectedCo} />
                  <WeeklyHoursMonitor selectedCo={selectedCo} />
                  <LaborCostSimulation staffs={filtered} selectedCo={selectedCo} />
                  <CompliancePanel staffs={filtered.filter((s: Staff) => checkedIds.includes(s.id))} companyName={selectedCo} />
                  {current && <BenefitSummary staff={current} />}
                  {current && <SalarySimulationSummary staff={current} />}
                  {current && <PayrollSlipPDF staff={current} record={currentRecord ?? null} yearMonth={yearMonth} />}
                  {current && <SalaryChangeHistory staffId={String(current.id)} staffName={current.name} />}
                </aside>
              </div>
            )}
            {activeTab === '급여정산' && <SalarySettlement staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />}
            {activeTab === '중간정산' && <InterimSettlement staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />}
            {activeTab === '연말정산' && <YearEndSettlement staffs={staffs} selectedCo={selectedCo} />}
            {activeTab === '퇴직금' && <div className="flex gap-6 flex-wrap"><SeveranceCalculator /><PayrollEmailSender staffs={filtered} yearMonth={new Date().toISOString().slice(0, 7)} /><SeveranceLeaveDashboard staffs={filtered} /></div>}
            {activeTab === '대시보드' && <HRDashboardIntegrated staffs={filtered} selectedCo={selectedCo} checkedIds={checkedIds} />}
            {activeTab === '설정' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <TaxFreeSettingsPanel companyName={selectedCo} />
                <LegalStandardsPanel />
                <div className="space-y-6">
                  <PayrollLockPanel yearMonth={yearMonth} companyName={selectedCo} />
                  <TaxInsuranceRatesPanel companyName={selectedCo} />
                  <ShiftPatternManager selectedCo={selectedCo} />
                  <NotificationTemplatesPanel companyName={selectedCo} />
                  <AuditLogDetail targetType="payroll" limit={20} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center bg-white border border-dashed border-gray-200 rounded-[2rem] p-20">
            <p className="text-sm font-medium text-gray-500">
              &quot;{selectedCo}&quot; 소속 인원이 없습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// 복리후생 요약 (DEMO)
function BenefitSummary({ staff }: { staff: Staff }) {
  const base = staff.base ?? 3_000_000;
  const welfare = Math.round(base * 0.05);
  const pension = Math.round(base * 0.045);
  const health = Math.round(base * 0.03545);

  return (
    <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">복리후생 · 4대보험 (DEMO)</h3>
      <div className="space-y-1.5 text-xs font-medium text-gray-600">
        <div className="flex justify-between"><span>복리후생 예산</span><span className="text-blue-600">{welfare.toLocaleString()}원/월</span></div>
        <div className="flex justify-between"><span>국민연금 회사부담</span><span className="text-red-600">-{pension.toLocaleString()}원</span></div>
        <div className="flex justify-between"><span>건강보험 회사부담</span><span className="text-red-600">-{health.toLocaleString()}원</span></div>
      </div>
      <p className="mt-2 text-[10px] text-gray-400">* Supabase 연동 후 자동 반영 예정</p>
    </div>
  );
}

// 급여 시뮬레이션 (DEMO)
function SalarySimulationSummary({ staff }: { staff: Staff }) {
  const base = staff.base ?? 3_000_000;
  const scenarios = [
    { name: '기준안', total: base },
    { name: '인상안 A (+5%)', total: Math.round(base * 1.05) },
    { name: '인상안 B (+10%)', total: Math.round(base * 1.1) },
  ];

  return (
    <div className="border border-gray-200 p-4 bg-[#f8fafc] rounded-lg shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">급여 시뮬레이션 (DEMO)</h3>
      <div className="space-y-1.5 text-xs font-medium text-gray-700">
        {scenarios.map((s) => (
          <div key={s.name} className="flex justify-between">
            <span>{s.name}</span>
            <span className="text-blue-600">{s.total.toLocaleString()}원</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-gray-500">* 시나리오 저장/비교 연동 예정</p>
    </div>
  );
}

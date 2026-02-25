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
import IntegratedHRSettings from './인사통합설정';

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
    <div className="flex flex-col h-full animate-in fade-in duration-500 app-page">
      <header className="shrink-0 app-header">
        <div className="px-6 md:px-8 pt-5 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <h1 className="page-header-title text-lg font-bold">{periodLabel || '급여'} 급여</h1>
              <p className="page-header-caption text-xs mt-0.5">[{selectedCo}]</p>
            </div>
            {activeTab === '대장' && (
              <label className="flex items-center gap-2 text-sm text-[var(--toss-gray-4)]">
                <span>기간</span>
                <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] font-medium focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-[var(--toss-blue)]" />
              </label>
            )}
          </div>
          {activeTab === '대장' && (
            <span className="caption hidden md:inline">우측 패널에서 대장 내보내기</span>
          )}
        </div>
        <nav className="flex gap-0.5 p-1 app-tab-bar overflow-x-auto no-scrollbar w-full md:w-fit mt-2">
          {['대시보드', '급여 정산 (Run Payroll)', '급여대장', '연말/퇴직 정산', '통합 설정'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`min-h-[44px] touch-manipulation px-4 py-2 text-xs font-bold whitespace-nowrap rounded-md transition-all ${activeTab === tab ? 'bg-[var(--toss-card)] text-[var(--toss-blue)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'}`}
            >
              {tab === '급여 정산 (Run Payroll)' ? '🚀 ' : ''}{tab}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar">
        {filtered.length > 0 ? (
          <>
            {activeTab === '대시보드' && <HRDashboardIntegrated staffs={filtered} selectedCo={selectedCo} checkedIds={checkedIds} />}

            {activeTab === '급여 정산 (Run Payroll)' && (
              <RunPayrollWizard staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />
            )}

            {activeTab === '급여대장' && (
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

            {activeTab === '연말/퇴직 정산' && (
              <div className="space-y-8">
                <div className="p-4 bg-[var(--toss-gray-1)] rounded-xl border border-[var(--toss-border)]">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">연말/퇴직 통합 정산 센터</h2>
                  <p className="text-sm text-[var(--toss-gray-3)]">복잡한 연말정산과 퇴직금(퇴직소득세) 정산을 한 곳에서 처리합니다.</p>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                  <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm">
                    <h3 className="text-base font-bold text-[var(--toss-blue)] mb-4">연말정산 처리</h3>
                    <YearEndSettlement staffs={staffs} selectedCo={selectedCo} />
                  </div>
                  <div className="space-y-6">
                    <div className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm">
                      <h3 className="text-base font-bold text-red-500 mb-4">퇴직금 정산 처리</h3>
                      <SeveranceCalculator />
                    </div>
                    <SeveranceLeaveDashboard staffs={filtered} />
                    <PayrollEmailSender staffs={filtered} yearMonth={new Date().toISOString().slice(0, 7)} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === '통합 설정' && (
              <IntegratedHRSettings companyName={selectedCo} />
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center bg-[var(--toss-card)] border border-dashed border-[var(--toss-border)] rounded-[16px] p-20">
            <p className="text-sm font-medium text-[var(--toss-gray-3)]">
              &quot;{selectedCo}&quot; 소속 인원이 없습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// 🚀 RUN PAYROLL 마법사 컴포넌트
function RunPayrollWizard({ staffs, selectedCo, onRefresh }: any) {
  const [mode, setMode] = useState<'select' | 'regular' | 'interim'>('select');

  if (mode === 'regular') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={() => setMode('select')} className="px-4 py-2 bg-[var(--toss-gray-1)] text-[var(--foreground)] text-xs font-bold rounded-full hover:bg-[var(--toss-gray-2)] transition-colors">
          ← 마법사 홈으로 돌아가기
        </button>
        <SalarySettlement staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />
      </div>
    );
  }

  if (mode === 'interim') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={() => setMode('select')} className="px-4 py-2 bg-[var(--toss-gray-1)] text-[var(--foreground)] text-xs font-bold rounded-full hover:bg-[var(--toss-gray-2)] transition-colors">
          ← 마법사 홈으로 돌아가기
        </button>
        <InterimSettlement staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 min-h-[60vh] animate-in zoom-in-95 duration-500">
      <div className="bg-white/80 dark:bg-black/20 backdrop-blur-3xl p-10 rounded-[32px] border border-[var(--toss-border)] shadow-2xl text-center max-w-3xl w-full">
        <h2 className="text-3xl md:text-4xl font-extrabold text-[var(--foreground)] tracking-tight mb-4">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--toss-blue)] to-purple-500">RUN PAYROLL</span> 마법사
        </h2>
        <p className="text-[var(--toss-gray-4)] font-medium mb-12">시스템이 근태와 세법을 자동 계산합니다. 어떤 정산을 진행하시겠습니까?</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setMode('regular')}
            className="group flex flex-col items-start p-8 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[24px] hover:border-[var(--toss-blue)] hover:shadow-lg transition-all text-left"
          >
            <div className="w-12 h-12 bg-blue-50 text-[var(--toss-blue)] rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-inner group-hover:scale-110 transition-transform">📅</div>
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">정규 급여 정산</h3>
            <p className="text-xs text-[var(--toss-gray-3)] leading-relaxed">매월 정기적으로 지급되는 일반 급여를 정산합니다. 결근/지각 자동 차감 및 4대보험이 재계산됩니다.</p>
          </button>

          <button
            onClick={() => setMode('interim')}
            className="group flex flex-col items-start p-8 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[24px] hover:border-amber-500 hover:shadow-lg transition-all text-left"
          >
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-inner group-hover:scale-110 transition-transform">👋</div>
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">중도 퇴사자 정산</h3>
            <p className="text-xs text-[var(--toss-gray-3)] leading-relaxed">월중 퇴사한 직원의 급여를 근무일수에 비례하여 일할 계산(Prorated) 처리합니다.</p>
          </button>
        </div>
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
    <div className="app-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">복리후생 · 4대보험 (DEMO)</h3>
      <div className="space-y-1.5 text-xs font-medium text-[var(--toss-gray-4)]">
        <div className="flex justify-between"><span>복리후생 예산</span><span className="text-[var(--toss-blue)]">{welfare.toLocaleString()}원/월</span></div>
        <div className="flex justify-between"><span>국민연금 회사부담</span><span className="text-red-600">-{pension.toLocaleString()}원</span></div>
        <div className="flex justify-between"><span>건강보험 회사부담</span><span className="text-red-600">-{health.toLocaleString()}원</span></div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">* Supabase 연동 후 자동 반영 예정</p>
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
    <div className="app-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">급여 시뮬레이션 (DEMO)</h3>
      <div className="space-y-1.5 text-xs font-medium text-[var(--foreground)]">
        {scenarios.map((s) => (
          <div key={s.name} className="flex justify-between">
            <span>{s.name}</span>
            <span className="text-[var(--toss-blue)]">{s.total.toLocaleString()}원</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">* 시나리오 저장/비교 연동 예정</p>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SalaryDetail from './급여명세/급여상세';
import PayrollTable from './급여명세/급여대장표';
import PayrollMonthlySummary from './급여명세/급여대장월별요약';
import LaborCostSimulation from './인력예측/인건비예측';
import InterimSettlement from './급여명세/중간정산';
import YearEndSettlement from './급여명세/연말정산';
import SalarySettlement from './급여명세/급여정산';
import SeveranceCalculator from './급여명세/퇴직금계산기';
import PayrollEmailSender from './급여명세/급여명세서발송';
import TaxFreeSettingsPanel from './급여명세/비과세항목설정';
import LegalStandardsPanel from './급여명세/법정기준패널';
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
import TaxInsuranceRatesPanel from './급여명세/세율보험요율관리';
import IntegratedHRSettings from './인사통합설정';
import SalarySimulator from './급여명세/급여시뮬레이터';
import InsuranceEDI from './급여명세/4대보험EDI';
import RetirementPensionManager from './급여명세/퇴직연금관리';
import WagePeakCalculator from './급여명세/임금피크제';
import MinWageChecker from './급여명세/최저임금체크';
import OrdinaryWageCalculator from './급여명세/통상임금계산기';
import TaxFreeLimitChecker from './급여명세/비과세한도체크';
import TotalLaborCostForecast from './급여명세/총인건비예측';
import GrossNetComparison from './급여명세/세전세후비교';
import UnpaidAllowanceAlert from './급여명세/미지급수당알림';
import PayrollAdvancedCenter from './급여명세/급여고도화센터';
import UnpaidAbsenceDeduction from './급여명세/무급결근차감';

type Staff = {
  id: number;
  name: string;
  company?: string;
  position?: string;
  base?: number;
};

export default function PayrollMain({ staffs = [], selectedCo, onRefresh }: any) {
  const [activeTab, setActiveTab] = useState('대시보드');
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

  const tabs = [
    { id: '대시보드', label: '대시보드', icon: '📊' },
    { id: '급여정산', label: '급여정산', icon: '⚖️' },
    { id: '급여대장', label: '급여대장', icon: '📋' },
    { id: '연말퇴직정산', label: '연말퇴직정산', icon: '🗓️' },
    { id: '통합설정', label: '통합설정', icon: '⚙️' },
    { id: '급여시뮬레이터', label: '급여 시뮬레이터', icon: '🧮' },
    { id: '4대보험EDI', label: '4대보험 EDI', icon: '🏛️' },
    { id: '퇴직연금', label: '퇴직연금', icon: '💼' },
    { id: '임금피크제', label: '임금피크제', icon: '📉' },
    { id: '최저임금', label: '최저임금 체크', icon: '⚠️' },
    { id: '통상임금', label: '통상임금 계산기', icon: '🧮' },
    { id: '비과세체크', label: '비과세 한도 체크', icon: '⚠️' },
    { id: '총인건비예측', label: '총인건비 예측', icon: '📈' },
    { id: '세전세후', label: '세전/세후 비교', icon: '💹' },
    { id: '미지급수당', label: '미지급 수당 알림', icon: '🔔' },
    { id: '급여고도화', label: '급여 고도화', icon: '🧩' },
    { id: '무급결근차감', label: '무급 결근 차감', icon: '📉' },
  ];

  return (
    <div
      className="flex flex-col h-full animate-in fade-in duration-500 app-page"
      data-testid="payroll-view"
    >
      {/* 🚀 Header: Reordered and group context with tabs */}
      <header className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 bg-[var(--toss-card)] border-b border-[var(--toss-border)] gap-6 shadow-sm">
        <div className="flex flex-col gap-1 shrink-0">
          <h1 className="text-xl md:text-2xl font-bold text-[var(--foreground)] tracking-tight">급여 관리 시스템</h1>
          <p className="text-xs font-bold text-[var(--toss-blue)] uppercase tracking-wider">Payroll & Tax Management</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-[var(--toss-gray-1)] p-1.5 rounded-[22px] border border-[var(--toss-border)]">
          {/* Calendar Picker moved here */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-[18px] shadow-sm ring-1 ring-black/5">
            <span className="text-sm">📅</span>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-bold text-[var(--foreground)] cursor-pointer"
            />
          </div>

          <div className="h-6 w-[1px] bg-[var(--toss-border)] mx-1" />

          {/* Navigation Tabs next to Calendar */}
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== '급여정산') setSelectedStaffId(null as any);
                }}
                className={`px-5 py-2.5 rounded-[18px] text-[11px] md:text-xs font-bold transition-all flex items-center gap-2 ${activeTab === tab.id
                  ? 'bg-[var(--toss-blue)] text-white shadow-md scale-[1.02]'
                  : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-white/50'
                  }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <div className="px-5 py-2.5 bg-[var(--toss-blue-light)]/50 rounded-[18px] border border-[var(--toss-blue)]/10">
            <p className="text-[10px] font-bold text-[var(--toss-blue)]/60 text-center leading-tight">선택된 사업체</p>
            <p className="text-sm font-bold text-[var(--toss-blue)] leading-tight">{selectedCo}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar">
        {filtered.length > 0 ? (
          <>
            {activeTab === '대시보드' && <HRDashboardIntegrated staffs={filtered} selectedCo={selectedCo} checkedIds={checkedIds} yearMonth={yearMonth} />}

            {activeTab === '급여정산' && (
              <RunPayrollWizard staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />
            )}

            {activeTab === '급여대장' && (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
                <div className="xl:col-span-1 h-fit max-h-[800px] sticky top-4">
                  <PayrollTable
                    staffs={filtered}
                    payrollRecords={payrollRecords}
                    yearMonth={yearMonth}
                    checkedIds={checkedIds}
                    setCheckedIds={setCheckedIds}
                    onSelect={setSelectedStaffId}
                    onSendAll={async () => {
                      const records = payrollRecords.filter(r => r.year_month === yearMonth);
                      if (records.length === 0) return alert("해당 월에 정산 완료된 레코드가 없습니다.");
                      if (confirm(`${records.length}명의 직원에게 급여명세서 알림을 발송하시겠습니까?`)) {
                        alert(`${records.length}건의 알림 발송이 예약되었습니다.`);
                      }
                    }}
                  />
                </div>
                <div className="xl:col-span-3 space-y-6">
                  {current && <SalaryDetail staff={current} record={currentRecord || null} />}
                  <aside className="grid grid-cols-1 gap-4">
                    {current && <SalaryChangeHistory staffId={String(current.id)} staffName={current.name} />}
                  </aside>
                </div>
              </div>
            )}

            {activeTab === '연말퇴직정산' && (
              <div className="space-y-8">
                <div className="p-4 bg-[var(--toss-gray-1)] rounded-xl border border-[var(--toss-border)]">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">연말/퇴직 통합 정산 센터</h2>
                  <p className="text-sm text-[var(--toss-gray-3)]">복잡한 연말정산과 퇴직금(퇴직소득세) 정산을 한 곳에서 처리합니다.</p>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 items-start">
                  <div className="xl:col-span-3 bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm">
                    <h3 className="text-base font-bold text-[var(--toss-blue)] mb-4">연말정산 처리</h3>
                    <YearEndSettlement staffs={staffs} selectedCo={selectedCo} />
                  </div>
                  <div className="xl:col-span-2 space-y-6">
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

            {activeTab === '통합설정' && (
              <IntegratedHRSettings companyName={selectedCo} />
            )}
            {activeTab === '급여시뮬레이터' && (
              <div className="p-4 md:p-6">
                <div className="mb-5">
                  <h2 className="text-base font-bold text-[var(--foreground)]">급여 실시간 시뮬레이터</h2>
                  <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">기본급·수당을 입력하면 공제 항목과 실수령액을 즉시 계산합니다.</p>
                </div>
                <SalarySimulator />
              </div>
            )}
            {activeTab === '4대보험EDI' && <InsuranceEDI staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '퇴직연금' && <RetirementPensionManager staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '임금피크제' && <WagePeakCalculator staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '최저임금' && <MinWageChecker staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '통상임금' && <OrdinaryWageCalculator staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '비과세체크' && <TaxFreeLimitChecker staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '총인건비예측' && <TotalLaborCostForecast staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '세전세후' && <GrossNetComparison staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '미지급수당' && <UnpaidAllowanceAlert staffs={filtered} selectedCo={selectedCo} user={null} />}
            {activeTab === '급여고도화' && (
              <PayrollAdvancedCenter
                staffs={staffs}
                selectedCo={selectedCo}
                yearMonth={yearMonth}
                payrollRecords={payrollRecords}
                onRefresh={onRefresh}
              />
            )}
            {activeTab === '무급결근차감' && <UnpaidAbsenceDeduction staffs={filtered} selectedCo={selectedCo} user={null} />}
          </>
        ) : (
          <div className="h-full flex items-center justify-center bg-[var(--toss-card)] border border-dashed border-[var(--toss-border)] rounded-[24px] p-20">
            <div className="text-center">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-sm font-bold text-[var(--toss-gray-4)]">
                &quot;{selectedCo}&quot; 소속 인원이 없습니다.
              </p>
              <p className="text-xs text-[var(--toss-gray-3)] mt-2">직원 명부에서 사업체를 확인해 주세요.</p>
            </div>
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

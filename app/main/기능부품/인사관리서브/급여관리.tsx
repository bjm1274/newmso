'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { hasOfficialMonthlyIncomeTaxTable } from '@/lib/use-tax-insurance-rates';
import type { StaffMember } from '@/types';
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
  id: string | number;
  name: string;
  company?: string;
  position?: string;
  department?: string;
  employee_no?: string;
  join_date?: string;
  joined_at?: string;
  base_salary?: number;
  base?: number;
  permissions?: Record<string, unknown>;
};

type PayrollMainProps = {
  staffs?: Staff[];
  selectedCo?: string;
  onRefresh?: () => void;
};

export default function PayrollMain({ staffs = [], selectedCo, onRefresh }: PayrollMainProps) {
  const [activeTab, setActiveTab] = useState('대시보드');
  const [selectedStaffId, setSelectedStaffId] = useState<string | number | null>(null);
  const [checkedIds, setCheckedIds] = useState<(string | number)[]>([]);
  const [yearMonth, setYearMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [payrollAudit, setPayrollAudit] = useState<{ orphanCount: number; officialBracketConfigured: boolean } | null>(null);

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

  useEffect(() => {
    (async () => {
      const staffIdSet = new Set(filtered.map((staff: Staff) => String(staff.id)));
      const orphanCount = payrollRecords.filter((row: any) => !staffIdSet.has(String(row.staff_id))).length;
      const targetYear = parseInt((yearMonth || '').slice(0, 4), 10);
      let officialBracketConfigured = false;

      if (Number.isFinite(targetYear)) {
        const { data } = await supabase
          .from('tax_insurance_rates')
          .select('income_tax_bracket')
          .eq('effective_year', targetYear)
          .eq('company_name', selectedCo && selectedCo !== '전체' ? selectedCo : '전체')
          .maybeSingle();
        officialBracketConfigured = hasOfficialMonthlyIncomeTaxTable(data?.income_tax_bracket);
      }

      setPayrollAudit({ orphanCount, officialBracketConfigured });
    })();
  }, [filtered, payrollRecords, yearMonth]);

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
      <header className="sticky top-0 z-30 flex flex-col justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:items-center md:p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 bg-[var(--muted)] p-1.5 rounded-2xl border border-[var(--border)]">
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm ring-1 ring-black/5">
            <span className="text-sm">📅</span>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-bold text-[var(--foreground)] cursor-pointer"
            />
          </div>

          <div className="h-6 w-[1px] bg-[var(--border)] mx-1" />

          <nav className="no-scrollbar overflow-x-auto flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                data-testid={`payroll-tab-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== '급여정산') setSelectedStaffId(null as any);
                }}
                className={`px-4 py-2.5 rounded-[var(--radius-md)] text-[12px] font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id
                  ? 'bg-[var(--accent)] text-white shadow-sm scale-[1.02]'
                  : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--card)]/50'
                  }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <div className="px-4 py-2 bg-[var(--toss-blue-light)]/50 rounded-[var(--radius-md)] border border-[var(--accent)]/10">
            <p className="text-[11px] font-bold text-[var(--accent)]/60 text-center leading-tight">선택된 사업체</p>
            <p className="text-sm font-bold text-[var(--accent)] leading-tight">{selectedCo as string}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4">
        {filtered.length > 0 ? (
          <>
            {payrollAudit && (!payrollAudit.officialBracketConfigured || payrollAudit.orphanCount > 0) && (
              <div className="mb-4 rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">급여 점검 필요</p>
                {!payrollAudit.officialBracketConfigured && (
                  <p className="mt-1">해당 연도 소득세 세율표가 공식 확인 상태가 아니라 급여 확정이 제한됩니다.</p>
                )}
                {payrollAudit.orphanCount > 0 && (
                  <p className="mt-1">현재 월 급여 레코드 중 직원 마스터와 연결되지 않은 항목이 {payrollAudit.orphanCount}건 있습니다.</p>
                )}
              </div>
            )}
            {activeTab === '대시보드' && <HRDashboardIntegrated staffs={filtered} selectedCo={selectedCo} checkedIds={checkedIds} yearMonth={yearMonth} />}

            {activeTab === '급여정산' && (
              <RunPayrollWizard staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />
            )}

            {activeTab === '급여대장' && (
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
                      if (records.length === 0) return toast("해당 월에 정산 완료된 레코드가 없습니다.", 'success');
                      if (confirm(`${records.length}명의 직원에게 급여명세서 알림을 발송하시겠습니까?`)) {
                        toast(`${records.length}건의 알림 발송이 예약되었습니다.`, 'success');
                      }
                    }}
                  />
                </div>
                <div className="xl:col-span-3 space-y-4">
                  {current && <SalaryDetail staff={current as any} record={currentRecord || null} />}
                  <aside className="grid grid-cols-1 gap-4">
                    {current && <SalaryChangeHistory staffId={String(current.id)} staffName={current.name} />}
                  </aside>
                </div>
              </div>
            )}

            {activeTab === '연말퇴직정산' && (
              <div className="space-y-5">
                <div className="p-4 bg-[var(--muted)] rounded-xl border border-[var(--border)]">
                  <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">연말/퇴직 통합 정산 센터</h2>
                </div>
                <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-5">
                  <div className="xl:col-span-3 bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
                    <h3 className="text-base font-bold text-[var(--accent)] mb-4">연말정산 처리</h3>
                    <YearEndSettlement staffs={staffs} selectedCo={selectedCo} />
                  </div>
                  <div className="xl:col-span-2 space-y-4">
                    <div className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
                      <h3 className="text-base font-bold text-red-500 mb-4">퇴직금 정산 처리</h3>
                      <SeveranceCalculator />
                    </div>
                    <SeveranceLeaveDashboard staffs={filtered} />
                    <PayrollEmailSender staffs={filtered} yearMonth={yearMonth} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === '통합설정' && (
              <IntegratedHRSettings companyName={selectedCo ?? ''} />
            )}
            {activeTab === '급여시뮬레이터' && (
              <div className="p-4">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-[var(--foreground)]">급여 실시간 시뮬레이터</h2>
                </div>
                <SalarySimulator />
              </div>
            )}
            {activeTab === '4대보험EDI' && <InsuranceEDI staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '퇴직연금' && <RetirementPensionManager staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '임금피크제' && <WagePeakCalculator staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '최저임금' && <MinWageChecker staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '통상임금' && <OrdinaryWageCalculator staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '비과세체크' && <TaxFreeLimitChecker staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '총인건비예측' && <TotalLaborCostForecast staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '세전세후' && <GrossNetComparison staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '미지급수당' && <UnpaidAllowanceAlert staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
            {activeTab === '급여고도화' && (
              <PayrollAdvancedCenter
                staffs={staffs as StaffMember[]}
                selectedCo={selectedCo}
                yearMonth={yearMonth}
                payrollRecords={payrollRecords}
                onRefresh={onRefresh}
              />
            )}
            {activeTab === '무급결근차감' && <UnpaidAbsenceDeduction staffs={filtered as any[]} selectedCo={selectedCo ?? ''} user={null} />}
          </>
        ) : (
          <div className="h-full flex items-center justify-center bg-[var(--card)] border border-dashed border-[var(--border)] rounded-[var(--radius-xl)] p-5">
            <div className="text-center">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-sm font-bold text-[var(--toss-gray-4)]">
                &quot;{selectedCo ?? ''}&quot; 소속 인원이 없습니다.
              </p>
              <p className="text-xs text-[var(--toss-gray-3)] mt-2">직원 명부에서 사업체를 확인해 주세요.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunPayrollWizard({ staffs, selectedCo, onRefresh }: { staffs?: Staff[]; selectedCo?: string; onRefresh?: () => void }) {
  const [mode, setMode] = useState<'select' | 'regular' | 'interim'>('select');

  if (mode === 'regular') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={() => setMode('select')} className="px-4 py-2 bg-[var(--muted)] text-[var(--foreground)] text-xs font-bold rounded-[var(--radius-md)] hover:bg-[var(--toss-gray-2)] transition-colors">
          ← 마법사 홈으로 돌아가기
        </button>
        <SalarySettlement staffs={staffs as any} selectedCo={selectedCo ?? ''} onRefresh={onRefresh} />
      </div>
    );
  }

  if (mode === 'interim') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={() => setMode('select')} className="px-4 py-2 bg-[var(--muted)] text-[var(--foreground)] text-xs font-bold rounded-[var(--radius-md)] hover:bg-[var(--toss-gray-2)] transition-colors">
          ← 마법사 홈으로 돌아가기
        </button>
        <InterimSettlement staffs={staffs as any} selectedCo={selectedCo} onRefresh={onRefresh} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 min-h-[60vh] animate-in zoom-in-95 duration-500" data-testid="run-payroll-wizard">
      <div className="bg-[var(--card)] backdrop-blur-3xl p-4 rounded-2xl border border-[var(--border)] shadow-sm text-center max-w-3xl w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            data-testid="run-payroll-regular-button"
            onClick={() => setMode('regular')}
            className="group flex flex-col items-start p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] hover:border-[var(--accent)] hover:shadow-sm transition-all text-left"
          >
            <div className="w-12 h-12 bg-blue-500/10 text-[var(--accent)] rounded-[var(--radius-xl)] flex items-center justify-center text-2xl mb-4 shadow-inner group-hover:scale-110 transition-transform">📅</div>
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">정규 급여 정산</h3>
            <p className="text-xs text-[var(--toss-gray-3)] leading-relaxed">매월 정기적으로 지급되는 일반 급여를 정산합니다. 결근/지각 자동 차감 및 4대보험이 재계산됩니다.</p>
          </button>

          <button
            data-testid="run-payroll-interim-button"
            onClick={() => setMode('interim')}
            className="group flex flex-col items-start p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] hover:border-amber-500 hover:shadow-sm transition-all text-left"
          >
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-[var(--radius-xl)] flex items-center justify-center text-2xl mb-4 shadow-inner group-hover:scale-110 transition-transform">👋</div>
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
        <div className="flex justify-between"><span>복리후생 예산</span><span className="text-[var(--accent)]">{welfare.toLocaleString()}원/월</span></div>
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
            <span className="text-[var(--accent)]">{s.total.toLocaleString()}원</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">* 시나리오 저장/비교 연동 예정</p>
    </div>
  );
}

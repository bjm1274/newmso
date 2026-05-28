'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PayrollDashboard from './PayrollDashboard';
import { PAYROLL_MODULES } from './payroll-data';
import type { PayrollModuleId, PayrollModuleMeta } from './payroll-types';
import { PayrollProvider, usePayroll } from './payroll-context';

import ModSettlement  from './modules/ModSettlement';
import ModLedger      from './modules/ModLedger';
import ModSimulator   from './modules/ModSimulator';
import ModRetirement  from './modules/ModRetirement';
import ModPension     from './modules/ModPension';
import ModInsurance   from './modules/ModInsurance';
import ModWithholding from './modules/ModWithholding';
import ModWagePeak    from './modules/ModWagePeak';
import ModMinWage     from './modules/ModMinWage';
import ModTaxFree     from './modules/ModTaxFree';
import ModOrdinary    from './modules/ModOrdinary';
import ModUnpaid      from './modules/ModUnpaid';
import ModAbsence     from './modules/ModAbsence';

/**
 * 급여 워크센터 — 메인 엔트리.
 *
 * - Provider가 supabase 데이터를 1회 fetch (yearMonth/selectedCo 변경 시 재호출).
 * - 13 모듈은 useContext로 데이터 공유 — 모듈 전환에 fetch 안 일어남 (JM2).
 *
 * JM: 200줄 이내 메인 라우터.
 * JM6: 백버튼 aria-label 명시.
 */

const MODULE_COMPONENTS: Record<PayrollModuleId, () => React.JSX.Element> = {
  settlement:  ModSettlement,
  ledger:      ModLedger,
  simulator:   ModSimulator,
  retirement:  ModRetirement,
  pension:     ModPension,
  insurance:   ModInsurance,
  withholding: ModWithholding,
  wagePeak:    ModWagePeak,
  minWage:     ModMinWage,
  taxFree:     ModTaxFree,
  ordinary:    ModOrdinary,
  unpaid:      ModUnpaid,
  absence:     ModAbsence,
};

function moduleTone(meta: PayrollModuleMeta | undefined): string {
  if (!meta?.tone) return 'bg-[var(--accent-light)] text-[var(--accent)]';
  if (meta.tone === 'danger') return 'bg-[var(--danger-light)] text-[var(--danger)]';
  if (meta.tone === 'warn')   return 'bg-[var(--warning-light)] text-[var(--warning)]';
  return 'bg-[var(--accent-light)] text-[var(--accent)]';
}

export default function PayrollWorkcenter({
  selectedCo,
  user,
  initialModule,
}: {
  selectedCo?: string;
  user?: any;
  initialModule?: string | null;
} = {}) {
  return (
    <PayrollProvider selectedCo={selectedCo}>
      <PayrollWorkcenterInner initialModule={initialModule} />
    </PayrollProvider>
  );
}

function PayrollWorkcenterInner({ initialModule }: { initialModule?: string | null }) {
  const [current, setCurrent] = useState<PayrollModuleId | null>(() => {
    if (initialModule === '원천징수파일') return 'withholding';
    return null;
  });

  useEffect(() => {
    if (initialModule === '원천징수파일') {
      setCurrent('withholding');
      return;
    }
    try {
      const savedSub = window.localStorage.getItem('erp_last_subview');
      if (savedSub === '원천징수파일') {
        setCurrent('withholding');
      }
    } catch {
      // ignore
    }
  }, [initialModule]);
  const { yearMonth, setYearMonth, loading } = usePayroll();

  const handlePick = useCallback((id: PayrollModuleId) => {
    setCurrent(id);
  }, []);

  const handleBack = useCallback(() => {
    setCurrent(null);
  }, []);

  const currentMeta = useMemo<PayrollModuleMeta | undefined>(
    () => (current ? PAYROLL_MODULES.find((m) => m.id === current) : undefined),
    [current],
  );

  // ── 대시보드 ───────────────────────────────────────────
  if (!current) {
    return (
      <div className="app-page p-4" data-testid="payroll-view">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-extrabold text-[var(--foreground)]">급여 워크센터</h1>
            <p className="text-[12px] text-[var(--toss-gray-4)] mt-0.5">
              정산·대장·시뮬레이터부터 4대보험·원천징수까지 13개 모듈을 한 곳에서 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-4)]" htmlFor="payroll-ym">
              정산 월
            </label>
            <input
              id="payroll-ym"
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="text-[12px] px-2 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] font-bold text-[var(--foreground)]"
            />
            {loading && (
              <span className="text-[10px] text-[var(--toss-gray-3)]" aria-live="polite">
                불러오는 중…
              </span>
            )}
          </div>
        </header>
        <PayrollDashboard onPick={handlePick} />
      </div>
    );
  }

  // ── 모듈 상세 ─────────────────────────────────────────
  const Module = MODULE_COMPONENTS[current];

  return (
    <div className="app-page p-4" data-testid="payroll-view">
      <header className="mb-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label="급여 워크센터 대시보드로 돌아가기"
          className="
            inline-flex items-center gap-1
            text-[11px] font-semibold
            px-2 py-1 rounded-[var(--radius-sm)]
            text-[var(--toss-gray-4)]
            hover:bg-[var(--muted)] hover:text-[var(--foreground)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
          "
        >
          ← 급여 워크센터 대시보드
        </button>
      </header>

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-extrabold text-[var(--foreground)]">
            {currentMeta?.name ?? '모듈'}
          </h1>
          {currentMeta?.desc && (
            <p className="text-[12px] text-[var(--toss-gray-4)] mt-0.5">{currentMeta.desc}</p>
          )}
        </div>
        {currentMeta?.badge && (
          <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-[var(--radius-sm)] ${moduleTone(currentMeta)}`}>
            {currentMeta.badge}
          </span>
        )}
      </div>

      <Module />
    </div>
  );
}

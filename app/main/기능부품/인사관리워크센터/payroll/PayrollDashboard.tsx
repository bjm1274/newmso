'use client';

import { useCallback, useMemo } from 'react';
import PayrollModuleCard from './PayrollModuleCard';
import { PAYROLL_MODULES } from './payroll-data';
import type { PayrollModuleId, SettlementStepState } from './payroll-types';
import { usePayroll, usePayrollData } from './payroll-context';
import { calculateKpis, detectAlerts } from './payroll-kpi';

/**
 * 급여 워크센터 — 대시보드 (한 화면이 13장 대체).
 *
 * 1. 다크 hero — 정산 5단계 + 총 지급액 + CTA
 * 2. 8 KPI grid (실데이터)
 * 3. 점검 5건 (자동 감지) + 13 모듈 그리드
 *
 * JM2: KPI/alerts useMemo (records 변경 시만 재계산)
 */

interface Props {
  onPick: (id: PayrollModuleId) => void;
}

function stepStateClass(state: SettlementStepState): string {
  if (state === 'done') return 'bg-[var(--success)] text-white';
  if (state === 'on')   return 'bg-[var(--accent)] text-white ring-2 ring-[var(--accent-light)]';
  return 'bg-[var(--zinc-700)] text-[var(--zinc-300)]';
}

function alertToneClass(tone: 'danger' | 'warn' | 'info'): string {
  if (tone === 'danger') return 'border-l-4 border-[var(--danger)] bg-[var(--danger-light)]';
  if (tone === 'warn')   return 'border-l-4 border-[var(--warning)] bg-[var(--warning-light)]';
  return 'border-l-4 border-[var(--accent)] bg-[var(--accent-light)]';
}

function alertTagClass(tone: 'danger' | 'warn' | 'info'): string {
  if (tone === 'danger') return 'bg-[var(--danger)] text-white';
  if (tone === 'warn')   return 'bg-[var(--warning)] text-white';
  return 'bg-[var(--accent)] text-white';
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}년 ${parseInt(m || '0', 10)}월`;
}

function deriveSettlementSteps(
  cur: number,
  prev: number,
): {
  steps: { id: number; label: string; date: string; state: SettlementStepState }[];
  done: number;
} {
  const month = new Date();
  const ym = `${month.getMonth() + 1}`;
  // record 가 있으면 1·2 단계 done, 결재/지급/원천징수는 보수적으로 추정
  const hasRecord = cur > 0;
  const fullyPaid = cur > 0 && Math.abs(cur - prev) / Math.max(prev, 1) < 0.5;
  const steps: { id: number; label: string; date: string; state: SettlementStepState }[] = [
    { id: 1, label: '근태 마감',     date: `${ym}/3`,  state: hasRecord ? 'done' : 'on' },
    { id: 2, label: '수당·공제',     date: `${ym}/7`,  state: hasRecord ? 'done' : 'pending' },
    { id: 3, label: '결재 상신',     date: `${ym}/10`, state: hasRecord ? (fullyPaid ? 'done' : 'on') : 'pending' },
    { id: 4, label: '지급 처리',     date: `예정 ${ym}/15`, state: fullyPaid ? 'done' : (hasRecord ? 'on' : 'pending') },
    { id: 5, label: '원천징수 신고', date: `예정 ${ym}/20`, state: 'pending' },
  ];
  const done = steps.filter((s) => s.state === 'done').length;
  return { steps, done };
}

export default function PayrollDashboard({ onPick }: Props) {
  const data = usePayrollData();
  const { loading } = usePayroll();

  const kpis = useMemo(() => calculateKpis(data), [data]);
  const alerts = useMemo(() => detectAlerts(data), [data]);
  const { steps, done } = useMemo(
    () => deriveSettlementSteps(kpis.netPaySum, kpis.prevNetPaySum),
    [kpis.netPaySum, kpis.prevNetPaySum],
  );

  const grossSum = kpis.baseSalarySum + kpis.allowanceSum;
  const diffPct = useMemo(() => {
    if (kpis.prevBaseSalarySum <= 0) return null;
    const d = ((grossSum - (kpis.prevBaseSalarySum + 0)) / kpis.prevBaseSalarySum) * 100;
    return d;
  }, [grossSum, kpis.prevBaseSalarySum]);

  const handlePick = useCallback((id: PayrollModuleId) => onPick(id), [onPick]);

  const kpiItems = useMemo(
    () => [
      { key: 'target', label: '정산 대상자', value: kpis.headcount.toLocaleString(), unit: '명', sub: `상시 ${kpis.regularCount} · 시급 ${kpis.hourlyCount}`, iconColor: '#3B82F6' },
      { key: 'base',   label: '기본급 합계', value: kpis.baseSalarySum.toLocaleString(), unit: '원', sub: diffPct !== null ? `전월 대비 ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%` : '전월 데이터 없음', iconColor: '#10B981' },
      { key: 'allow',  label: '수당 합계',   value: kpis.allowanceSum.toLocaleString(), unit: '원', sub: '식대·야간·연장·상여 등', iconColor: '#8B5CF6' },
      { key: 'deduct', label: '공제 합계',   value: kpis.deductionSum.toLocaleString(), unit: '원', sub: '4대보험·소득세·지방세', iconColor: '#EF4444' },
      { key: 'net',    label: '실수령 합계', value: kpis.netPaySum.toLocaleString(),    unit: '원', sub: `${formatMonthLabel(data.yearMonth)} 기준`, iconColor: '#F59E0B' },
      { key: 'insure', label: '4대보험 신고', value: kpis.insurancePayDate, unit: '예정', sub: '국민·건강·고용·산재', iconColor: '#EC4899' },
      { key: 'with',   label: '원천징수 신고', value: kpis.withholdingPayDate, unit: '예정', sub: '간이세액 적용', iconColor: '#06B6D4' },
      { key: 'reserve', label: '퇴직금 충당', value: kpis.pensionReserveSum.toLocaleString(), unit: '원', sub: '월 평균 임금 / 12', iconColor: '#7C3AED' },
    ],
    [kpis, diffPct, data.yearMonth],
  );

  const monthLabel = formatMonthLabel(data.yearMonth);
  const totalLabel = grossSum.toLocaleString();

  return (
    <div className="flex flex-col gap-4">
      {/* error chips (JM3 inline) */}
      {data.errors.length > 0 && (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-light)] p-3 text-[12px]">
          <b className="text-[var(--warning)]">데이터 일부 로드 실패:</b>{' '}
          {data.errors.map((e) => `${e.source}(${e.message})`).join(', ')}
        </div>
      )}

      {/* ── 1. 다크 hero ─────────────────────────── */}
      <section
        className="
          rounded-[var(--radius-lg)] overflow-hidden
          bg-[var(--zinc-900)] text-white
          grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4
          p-5
        "
      >
        <div>
          <div className="text-[11px] text-[var(--zinc-400)] font-medium">
            이번 달 정산 · {monthLabel}
          </div>
          <div className="mt-1 text-[20px] font-extrabold">
            정산 중 <span className="ml-1 text-[14px] font-semibold text-[var(--zinc-300)]">{done}/5 단계</span>
          </div>
          <ol className="mt-4 flex flex-wrap gap-2">
            {steps.map((step) => (
              <li
                key={step.id}
                className="
                  flex items-center gap-2
                  px-2.5 py-1.5 rounded-[var(--radius-md)]
                  bg-[var(--zinc-800)]
                "
                aria-current={step.state === 'on' ? 'step' : undefined}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${stepStateClass(step.state)}`}>
                  {step.state === 'done' ? '✓' : step.id}
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold">{step.label}</span>
                  <span className="text-[10px] text-[var(--zinc-400)]">{step.date}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-2 lg:min-w-[240px]">
          <div className="text-[11px] text-[var(--zinc-400)]">이번 달 총 지급 예정</div>
          <div className="text-[26px] font-extrabold tabular-nums">
            {totalLabel}
            <span className="ml-1 text-[14px] font-semibold text-[var(--zinc-300)]">원</span>
          </div>
          <div className="text-[11px] text-[var(--zinc-400)]">
            {kpis.headcount}명{diffPct !== null && (
              <>
                {' '}· 전월 대비{' '}
                <span className={`font-bold ${diffPct >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => handlePick('settlement')}
            className="
              mt-1 px-3.5 py-2
              rounded-[var(--radius-md)]
              bg-[var(--accent)] hover:bg-[var(--accent-hover)]
              text-white text-[12px] font-bold
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
            "
          >
            정산 시작 →
          </button>
        </div>
      </section>

      {/* ── 2. 8 KPI grid ────────────────────────── */}
      <section
        aria-label="급여 KPI"
        className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5"
      >
        {kpiItems.map((kpi) => (
          <div key={kpi.key} className="app-card p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: kpi.iconColor }}
                aria-hidden="true"
              />
              <span className="text-[11px] text-[var(--toss-gray-4)]">{kpi.label}</span>
            </div>
            <div className="text-[18px] font-extrabold tabular-nums text-[var(--foreground)]">
              {kpi.value}
              {kpi.unit && <span className="ml-1 text-[11px] font-medium text-[var(--toss-gray-4)]">{kpi.unit}</span>}
            </div>
            {kpi.sub && <div className="text-[10px] text-[var(--toss-gray-3)]">{kpi.sub}</div>}
          </div>
        ))}
      </section>

      {/* ── 3. 점검 + 13 모듈 그리드 ──────────── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="app-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">
              점검 필요 · {alerts.length}건
            </h3>
            {loading && <span className="text-[10px] text-[var(--toss-gray-3)]">동기화 중…</span>}
          </div>
          {alerts.length === 0 ? (
            <p className="text-[12px] text-[var(--toss-gray-3)] py-6 text-center">
              점검 필요 항목이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {alerts.map((a) => (
                <li
                  key={a.tag}
                  className={`flex flex-wrap items-center gap-2 p-2.5 rounded-[var(--radius-md)] ${alertToneClass(a.tone)}`}
                >
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] ${alertTagClass(a.tone)}`}>
                    {a.tag}
                  </span>
                  <span className="text-[12px] text-[var(--foreground)] flex-1 min-w-0">
                    {a.body}
                    {a.amount && (
                      <span className="ml-1 font-bold text-[var(--danger)] tabular-nums">{a.amount}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePick(a.targetModule)}
                    className="
                      text-[11px] font-semibold px-2 py-1
                      rounded-[var(--radius-sm)]
                      bg-[var(--card)] border border-[var(--border)]
                      hover:bg-[var(--muted)]
                    "
                  >
                    {a.actionLabel}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="app-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">통합된 13개 모듈</h3>
            <span className="text-[10px] text-[var(--toss-gray-4)]">클릭하여 상세 진입</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PAYROLL_MODULES.map((meta) => (
              <PayrollModuleCard key={meta.id} meta={meta} onPick={handlePick} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { usePayroll, usePayrollData } from '../payroll-context';
import { calculateKpis } from '../payroll-kpi';
import type { StaffMember } from '@/types';
import { toast } from '@/lib/toast';

type SalarySettlementProps = {
  staffs: StaffMember[];
  selectedCo: string;
  onRefresh?: () => void;
  initialStep?: number;
};

const LegacySalarySettlement = dynamic<SalarySettlementProps>(
  () => import('../../../인사관리서브/급여명세/급여정산'),
  { ssr: false, loading: () => <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">급여정산 로드 중…</div> },
);

/**
 * #1 급여 정산 — 5단계 워크플로 (근태 마감 → 수당·공제 → 결재 → 지급 → 원천징수)
 * JM6: <ol> + aria-current="step", 액션 버튼 disabled aria 명시
 */

type StepState = 'done' | 'on' | 'pending';

interface StepDef {
  id: number;
  label: string;
  body: string;
  state: StepState;
  actionLabel: string;
  date: string;
}

function stepBoxClass(state: StepState): string {
  if (state === 'done') return 'bg-[var(--success-light)] border-[var(--success)]';
  if (state === 'on')   return 'bg-[var(--accent-light)] border-[var(--accent)]';
  return 'bg-[var(--card)] border-[var(--border)]';
}

function stepBadgeClass(state: StepState): string {
  if (state === 'done') return 'bg-[var(--success)] text-white';
  if (state === 'on')   return 'bg-[var(--accent)] text-white';
  return 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
}

export default function ModSettlement() {
  const data = usePayrollData();
  const { selectedCo, reload } = usePayroll();
  const kpis = useMemo(() => calculateKpis(data), [data]);
  const [advancing, setAdvancing] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [initialStep, setInitialStep] = useState(1);

  const hasRecord = data.records.length > 0;
  const allConfirmed =
    hasRecord && data.records.every((r) => r.status === '확정' || r.status === 'CONFIRMED');
  const [y, m] = data.yearMonth.split('-');
  const isLocked = data.isLocked;
  const payrollDay = data.payrollDay ?? 15;

  const steps: StepDef[] = [
    {
      id: 1,
      label: '근태 마감',
      body: `${y}년 ${m}월 근로시간 확정 · 지각·조퇴 반영. 총 ${kpis.headcount}명 대상.`,
      state: hasRecord ? 'done' : 'on',
      actionLabel: '근태 워크센터 열기',
      date: `${m}/3`,
    },
    {
      id: 2,
      label: '수당·공제 산정',
      body: `초과·야간·휴일 수당 + 4대보험·소득세 자동 산정. 수당 합계 ${kpis.allowanceSum.toLocaleString()}원.`,
      state: hasRecord ? 'done' : 'pending',
      actionLabel: '시뮬레이션',
      date: `${m}/7`,
    },
    {
      id: 3,
      label: '결재 상신',
      body: `정산 ${data.records.length}건을 결재 상신합니다. 검토자/전결자 지정 필요.`,
      state: allConfirmed ? 'done' : hasRecord ? 'on' : 'pending',
      actionLabel: '결재 상신',
      date: `${m}/10`,
    },
    {
      id: 4,
      label: '지급 처리',
      body: `은행 이체 파일(.txt) 생성 · 총 ${kpis.netPaySum.toLocaleString()}원 지급.`,
      state: allConfirmed ? 'on' : 'pending',
      actionLabel: '이체 파일 다운로드',
      date: `예정 ${m}/${payrollDay}`,
    },
    {
      id: 5,
      label: '원천징수 신고',
      body: '국세청 제출 파일 생성 · 지방세 포함 · 간이세액 적용.',
      state: allConfirmed ? 'on' : 'pending',
      actionLabel: '신고 파일 생성',
      date: `예정 ${m}/20`,
    },
  ];

  const doneCount = steps.filter((s) => s.state === 'done').length;

  const downloadTransferFile = () => {
    const confirmedRecords = data.records.filter(r => (r.status === '확정' || r.status === 'CONFIRMED') && r.net_pay > 0);
    if (confirmedRecords.length === 0) {
      toast('확정된 급여 내역이 없습니다. 먼저 급여 정산을 완료하여 확정해 주세요.', 'warning');
      return;
    }

    let fileContent = '은행명\t계좌번호\t예금주\t이체금액\r\n';
    confirmedRecords.forEach(record => {
      const staff = data.staffs.find(s => String(s.id) === String(record.staff_id));
      const bankName = (staff?.bank_name || '미지정').trim();
      const bankAccount = (staff?.bank_account || '미지정').trim();
      const name = (staff?.name || '미지정').trim();
      const amount = record.net_pay;
      fileContent += `${bankName}\t${bankAccount}\t${name}\t${amount}\r\n`;
    });

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `급여이체내역_${data.yearMonth}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('급여 이체 파일 다운로드가 시작되었습니다.', 'success');
  };

  const handleAdvance = () => {
    if (isLocked) return;
    setInitialStep(1);
    setAdvancing(true);
    setShowLegacy(true);
    setTimeout(() => setAdvancing(false), 300);
  };

  const handleStepAction = (stepId: number) => {
    if (stepId === 1) {
      window.dispatchEvent(new CustomEvent('hr-menu-change', { detail: 'attend' }));
    } else if (stepId === 2 || stepId === 3) {
      setInitialStep(2);
      setShowLegacy(true);
    } else if (stepId === 4) {
      downloadTransferFile();
    } else if (stepId === 5) {
      window.dispatchEvent(new CustomEvent('payroll-module-change', { detail: 'withholding' }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {isLocked && (
        <div className="bg-[var(--warning-light)] border border-[var(--warning)] text-[var(--warning-dark)] px-3 py-2.5 rounded-[var(--radius-md)] text-[12.5px] font-semibold flex items-center gap-2">
          <span>⚠️</span>
          <span>해당 월의 급여 정산이 마감(잠금)되어 데이터를 수정하거나 추가적인 정산 단계를 진행할 수 없습니다.</span>
        </div>
      )}
      {showLegacy && (
        <div className="app-card overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
            <h3 className="section-title">급여 정산 실행</h3>
            <button
              type="button"
              onClick={() => setShowLegacy(false)}
              className="text-[11px] font-semibold px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--muted)]"
            >
              닫기
            </button>
          </div>
          <div className="p-3">
            <LegacySalarySettlement
              staffs={data.staffs}
              selectedCo={selectedCo}
              onRefresh={reload}
              initialStep={initialStep}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정산 진행 단계</div>
          <div className="text-[20px] font-extrabold">{doneCount}<span className="text-[12px] font-medium ml-0.5">/5</span></div>
          <div className="text-[10px] text-[var(--warning)]">지급 예정 {m}/{payrollDay}</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정산 대상자</div>
          <div className="text-[20px] font-extrabold">{kpis.headcount}<span className="text-[12px] font-medium ml-1">명</span></div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">상시 {kpis.regularCount} · 시급 {kpis.hourlyCount}</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">레코드 생성</div>
          <div className="text-[20px] font-extrabold">{data.records.length}<span className="text-[12px] font-medium ml-1">건</span></div>
          <div className="text-[10px] text-[var(--success)]">{Math.max(0, kpis.headcount - data.records.length)}명 누락</div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">총 지급 예정액</div>
          <div className="text-[20px] font-extrabold tabular-nums">{(kpis.netPaySum / 1_000_000).toFixed(1)}<span className="text-[12px] font-medium ml-1">M원</span></div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">전월 비교 KPI 참조</div>
        </div>
      </div>

      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">정산 5단계 워크플로</h3>
          <button
            type="button"
            data-testid="mod-settlement-start-button"
            disabled={advancing || doneCount >= 5 || isLocked}
            onClick={handleAdvance}
            aria-disabled={advancing || doneCount >= 5 || isLocked}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {advancing ? '진행 중…' : doneCount >= 5 ? '정산 완료' : '다음 단계 시작'}
          </button>
        </div>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => (
            <li
              key={step.id}
              aria-current={step.state === 'on' ? 'step' : undefined}
              className={`flex items-start gap-3 p-3 rounded-[var(--radius-md)] border ${stepBoxClass(step.state)}`}
            >
              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-extrabold ${stepBadgeClass(step.state)}`}>
                {step.state === 'done' ? '✓' : step.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-[13px] font-bold">
                    {step.id}. {step.label}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--toss-gray-4)]">{step.date}</span>
                </div>
                <div className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">{step.body}</div>
              </div>
              {step.state !== 'pending' && (
                <button
                  type="button"
                  onClick={() => handleStepAction(step.id)}
                  disabled={isLocked && step.id !== 1 && step.id !== 4}
                  className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {step.actionLabel}
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

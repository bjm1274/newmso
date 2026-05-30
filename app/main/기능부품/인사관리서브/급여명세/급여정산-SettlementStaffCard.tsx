'use client';
// 급여정산 2단계: 직원별 수당·공제 입력 카드 (순수 추출 — 인라인 JSX → props)
import type { StaffMember } from '@/types';
import type { SettlementEntry } from './급여정산-types';
import { TenMinuteUnitAmountField } from './급여정산-TenMinuteUnitAmountField';

interface SalaryCalcResult {
  taxable: number;
  taxfree: number;
  total: number;
  deduction: number;
  deductionDetail: Record<string, unknown>;
  attendance_deduction: number;
  net: number;
}

export function SettlementStaffCard({
  staff,
  data,
  res,
  hourlyRate,
  getAdvanceAdjustedNet,
  onUpdate,
}: {
  staff: StaffMember;
  data: SettlementEntry;
  res: SalaryCalcResult;
  hourlyRate: number;
  getAdvanceAdjustedNet: (netAmount: number, advancePay: number) => number;
  onUpdate: (id: string, field: string, value: any) => void;
}) {
  const s = staff;
  const advancePay = Number(data?.advance_pay) || 0;
  const hasAdvanceDeduction = advancePay > 0;
  const deductionTotal = Math.round(Number(res?.deduction || 0));
  const deductionDetail = (res?.deductionDetail || {}) as Record<string, unknown>;
  const deductionBreakdownItems = [
    { label: '국민연금', value: Number(deductionDetail.national_pension || 0) },
    { label: '건강보험', value: Number(deductionDetail.health_insurance || 0) },
    { label: '장기요양', value: Number(deductionDetail.long_term_care || 0) },
    { label: '고용보험', value: Number(deductionDetail.employment_insurance || 0) },
    { label: '소득세', value: Number(deductionDetail.income_tax || 0) },
    { label: '지방소득세', value: Number(deductionDetail.local_tax || 0) },
    { label: '기타 공제', value: Number(deductionDetail.custom_deduction || 0) },
  ].filter((item) => item.value > 0);
  const expectedNet = getAdvanceAdjustedNet(Number(res?.net || 0), advancePay);
  return (
    <div key={s.id} data-testid={`salary-settlement-card-${s.id}`} className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm space-y-4 hover:border-[var(--accent)] transition-all">
      <div className="flex flex-col gap-3 border-b border-[var(--muted)] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--toss-blue-light)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">{s.name[0]}</div>
          <div>
            <p className="text-sm font-bold text-[var(--foreground)] leading-none">{s.name}</p>
            {data.saved_status && (
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  data.saved_status === '확정'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {data.saved_status}
              </span>
            )}
            <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">{s.company} · {s.department}</p>
          </div>
          {hasAdvanceDeduction && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">선지급 차감</span>}
        </div>
        <div className="grid w-full grid-cols-2 gap-5 text-right sm:w-auto">
          <div>
            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">공제 합계</p>
            <p data-testid={`salary-settlement-total-deduction-${s.id}`} className="text-base font-black text-red-600">₩ {deductionTotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">합계 예상 실지급액</p>
            <p data-testid={`salary-settlement-expected-net-${s.id}`} className="text-lg font-black text-[var(--accent)]">₩ {expectedNet.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {(data.salary_change_proration || []).length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
          <span>급여 변동 일할 계산: </span>
          {(data.salary_change_proration || [])
            .slice(0, 3)
            .map((item) => `${item.label} ${item.effective_dates.join(', ')} · ₩${item.amount.toLocaleString()}`)
            .join(' / ')}
          {(data.salary_change_proration || []).length > 3
            ? ` 외 ${(data.salary_change_proration || []).length - 3}건`
            : ''}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">과세·기본급</label>
          <input type="text" value={Number(data.base_salary).toLocaleString()} readOnly className="w-full h-8 px-3 bg-[var(--muted)] border-none rounded-lg text-xs font-bold text-[var(--toss-gray-4)]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--accent)] ml-1">수당 합계(고정포함)</label>
          <input type="text" value={Number(data.extra_allowance).toLocaleString()} onChange={(e) => onUpdate(s.id, 'extra_allowance', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-[var(--border)] rounded-lg text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20 outline-none" />
        </div>
        <TenMinuteUnitAmountField
          label="야간/당직 (비과세)"
          value={Number(data.night_duty_allowance) || 0}
          hourlyRate={hourlyRate}
          onChange={(nextValue) => onUpdate(s.id, 'night_duty_allowance', nextValue)}
          dataTestId={`salary-settlement-night-duty-${s.id}`}
          labelClassName="text-[var(--toss-gray-4)]"
          inputClassName="text-[var(--foreground)]"
        />
        <TenMinuteUnitAmountField
          label="연장/상여"
          value={Number(data.overtime_pay) + Number(data.bonus)}
          hourlyRate={hourlyRate}
          onChange={(nextValue) => onUpdate(s.id, 'overtime_pay', nextValue)}
          dataTestId={`salary-settlement-overtime-total-${s.id}`}
          labelClassName="text-[var(--toss-gray-4)]"
          inputClassName="text-[var(--foreground)]"
          allowManualAmountInput
        />
        <TenMinuteUnitAmountField
          label="근태/기타차감"
          value={Number(data.attendance_deduction) || 0}
          hourlyRate={hourlyRate}
          onChange={(nextValue) => onUpdate(s.id, 'attendance_deduction', nextValue)}
          dataTestId={`salary-settlement-attendance-deduction-${s.id}`}
          labelClassName="text-orange-600"
          inputClassName="text-orange-700"
        />
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-amber-600 ml-1">선지급(차감)</label>
          <input data-testid={`salary-settlement-advance-pay-${s.id}`} type="text" value={Number(data.advance_pay).toLocaleString()} onChange={(e) => onUpdate(s.id, 'advance_pay', parseInt(e.target.value.replace(/,/g, '')) || 0)} className="w-full h-8 px-3 border border-amber-200 bg-amber-50/30 rounded-lg text-xs font-bold text-amber-700 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-emerald-700 ml-1">부양가족/인적공제</label>
          <input
            data-testid={`salary-settlement-dependent-count-${s.id}`}
            type="number"
            min={0}
            max={10}
            value={Number(data.dependent_count) || 0}
            onChange={(e) => onUpdate(s.id, 'dependent_count', Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-full h-8 px-3 border border-emerald-200 bg-emerald-50/30 rounded-lg text-xs font-bold text-emerald-700 outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-emerald-700 ml-1">8~20세 자녀수</label>
          <input
            data-testid={`salary-settlement-child-count-${s.id}`}
            type="number"
            min={0}
            max={Number(data.dependent_count) || 0}
            value={Number(data.child_count_8_20) || 0}
            onChange={(e) => onUpdate(s.id, 'child_count_8_20', e.target.value)}
            className="w-full h-8 px-3 border border-emerald-200 bg-emerald-50/30 rounded-lg text-xs font-bold text-emerald-700 outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-sky-700 ml-1">원천징수 비율</label>
          <select
            data-testid={`salary-settlement-withholding-rate-${s.id}`}
            value={Number(data.withholding_rate_percent) || 80}
            onChange={(e) => onUpdate(s.id, 'withholding_rate_percent', parseInt(e.target.value, 10) || 80)}
            className="w-full h-8 px-3 border border-sky-200 bg-sky-50/30 rounded-lg text-xs font-bold text-sky-700 outline-none"
          >
            <option value={80}>80%</option>
            <option value={100}>100%</option>
            <option value={120}>120%</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-orange-600 ml-1">기타 추가차감</label>
          <input
            data-testid={`salary-settlement-custom-deduction-${s.id}`}
            type="text"
            value={Number(data.custom_deduction).toLocaleString()}
            onChange={(e) => onUpdate(s.id, 'custom_deduction', parseInt(e.target.value.replace(/,/g, '')) || 0)}
            className="w-full h-8 px-3 border border-orange-500/20 bg-orange-500/10/30 rounded-lg text-xs font-bold text-orange-700 outline-none"
          />
        </div>
        <div className="col-span-2 flex items-center justify-between bg-[var(--muted)] px-4 py-2 rounded-xl mt-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">과세: ₩{res.taxable.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">비과세: ₩{res.taxfree.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-red-600 uppercase">공제합계: ₩{deductionTotal.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">자동 근태차감: ₩{Number(data.attendance_deduction || 0).toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            {data.attendance_deduction > 0 && (
              <button onClick={() => onUpdate(s.id, 'attendance_deduction', 0)} className="text-[9px] font-bold text-emerald-600 bg-[var(--card)] px-2 py-0.5 rounded shadow-sm border border-emerald-100">근태차감 면제</button>
            )}
          </div>
        </div>
        <div className="col-span-2 lg:col-span-4 rounded-xl border border-red-100 bg-red-50/50 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-[10px] font-black text-red-700 uppercase">공제 내역</span>
            {deductionBreakdownItems.length > 0 ? (
              deductionBreakdownItems.map((item) => (
                <span key={item.label} className="text-[10px] font-bold text-red-700">
                  {item.label} ₩{item.value.toLocaleString()}
                </span>
              ))
            ) : (
              <span className="text-[10px] font-bold text-red-700">공제 없음</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

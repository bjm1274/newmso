'use client';
// 급여정산 2단계: 직원별 수당·공제 입력 카드
// - 수당/비과세/연장·상여를 개별 항목으로 세분화하여 편집(요청 #2)
// - 선지급·기타추가차감·원천징수비율 입력은 제거(요청 #3·#4 — 원천징수는 회사 급여기준으로 이동)
// - 박스를 절반 크기(컴팩트)로 축소해 한 화면 가독성 극대화(요청 #5)
import { useState, useEffect } from 'react';
import type { StaffMember } from '@/types';
import type { SettlementEntry, TaxableAllowanceBreakdown } from './급여정산-types';
import { TenMinuteUnitAmountField } from './급여정산-TenMinuteUnitAmountField';
// 가산 배수는 lib/payroll-allowance-hours.ts 가 정본이다.
// 예전에는 이 화면이 1.5 를 직접 박아 두어 SSOT(야간 0.5)와 갈렸고,
// 같은 야간 8시간이 화면에서는 144,000원, 마스터 입력에서는 48,000원이 됐다.
import { ALLOWANCE_MULTIPLIERS } from '@/lib/payroll-allowance-hours';

interface SalaryCalcResult {
  taxable: number;
  taxfree: number;
  total: number;
  deduction: number;
  deductionDetail: Record<string, unknown>;
  attendance_deduction: number;
  net: number;
}

// 과세 수당(통상임금 산입) — taxable_allowance_breakdown 내 항목
const TAXABLE_FIELDS: { key: keyof TaxableAllowanceBreakdown; label: string }[] = [
  { key: 'position_allowance', label: '직책수당' },
  { key: 'annual_leave_pay', label: '연차수당' },
  { key: 'manual_extra_allowance', label: '기타과세' },
];

// 비과세 항목 — SettlementEntry 최상위 필드
const TAXFREE_FIELDS: { key: keyof SettlementEntry; label: string }[] = [
  { key: 'meal_allowance', label: '식대' },
  { key: 'vehicle_allowance', label: '자가운전' },
  { key: 'childcare_allowance', label: '보육수당' },
  { key: 'research_allowance', label: '연구비' },
  { key: 'other_taxfree', label: '기타비과세' },
];

type FieldTone = 'default' | 'taxfree' | 'deduction' | 'base';

const INPUT_TONE: Record<FieldTone, string> = {
  default: 'border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
  taxfree: 'border border-emerald-200 bg-emerald-50/30 text-emerald-700',
  deduction: 'border border-orange-300 bg-orange-50/40 text-orange-700',
  base: 'border-none bg-[var(--muted)] text-[var(--toss-gray-4)]' };

const LABEL_TONE: Record<FieldTone, string> = {
  default: 'text-[var(--toss-gray-4)]',
  taxfree: 'text-emerald-700',
  deduction: 'text-orange-600',
  base: 'text-[var(--toss-gray-4)]' };

// 절반 크기 컴팩트 금액 입력 (h-7 · 11px)
function CompactAmountField({
  label,
  value,
  onChange,
  tone = 'default',
  testId,
  readOnly = false }: {
  label: string;
  value: number | '';
  onChange?: (value: number | '') => void;
  tone?: FieldTone;
  testId?: string;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(
    value === '' || value === undefined || value === null ? '' : Number(value || 0).toLocaleString(),
  );

  useEffect(() => {
    const current = parseInt(text.replace(/,/g, ''), 10) || 0;
    const target = Number(value) || 0;
    if (current !== target) {
      setText(value === '' || value === undefined || value === null ? '' : Number(value || 0).toLocaleString());
    }
  }, [value]);

  return (
    <div className="space-y-0.5">
      <label className={`block text-[9px] font-bold ml-0.5 ${LABEL_TONE[tone]}`}>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        data-testid={testId}
        value={text}
        readOnly={readOnly || !onChange}
        onChange={
          readOnly || !onChange
            ? undefined
            : (e) => {
                const raw = e.target.value;
                setText(raw);
                const numeric = raw.replace(/[^\d]/g, '');
                onChange(numeric === '' ? '' : parseInt(numeric, 10) || 0);
              }
        }
        className={`w-full h-7 px-2 rounded-md text-[11px] font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/20 ${INPUT_TONE[tone]}`}
      />
    </div>
  );
}

export function SettlementStaffCard({
  staff,
  data,
  res,
  hourlyRate,
  getAdvanceAdjustedNet,
  onUpdate }: {
  staff: StaffMember;
  data: SettlementEntry;
  res: SalaryCalcResult;
  hourlyRate: number;
  getAdvanceAdjustedNet: (netAmount: number, advancePay: number) => number;
  onUpdate: (id: string, field: string, value: any) => void;
}) {
  const s = staff;
  const breakdown = (data.taxable_allowance_breakdown || {}) as Partial<TaxableAllowanceBreakdown>;
  const taxfreeData = data as unknown as Record<string, number | ''>;

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
  ].filter((item) => item.value > 0);
  const expectedNet = getAdvanceAdjustedNet(Number(res?.net || 0), advancePay);

  return (
    <div key={s.id} data-testid={`salary-settlement-card-${s.id}`} className="p-3.5 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm space-y-3 hover:border-[var(--accent)] transition-all">
      {/* 헤더 */}
      <div className="flex flex-col gap-2 border-b border-[var(--muted)] pb-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[var(--toss-blue-light)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">{s.name[0]}</div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-[var(--foreground)] leading-none">{s.name}</p>
              {data.saved_status && (
                <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold ${data.saved_status === '확정' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {data.saved_status}
                </span>
              )}
              {hasAdvanceDeduction && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">선지급 차감</span>}
            </div>
            <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">{s.company} · {s.department} · 통상시급 ₩{Math.round(hourlyRate).toLocaleString()}</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-4 text-right sm:w-auto">
          <div>
            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">공제 합계</p>
            <p data-testid={`salary-settlement-total-deduction-${s.id}`} className="text-sm font-black text-red-600">₩ {deductionTotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">합계 예상 실지급액</p>
            <p data-testid={`salary-settlement-expected-net-${s.id}`} className="text-base font-black text-[var(--accent)]">₩ {expectedNet.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {(data.salary_change_proration || []).length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-800">
          <div className="flex items-center gap-1.5">
            <span>급여 변동 일할: </span>
            <span>
              {(data.salary_change_proration || [])
                .slice(0, 3)
                .map((item) => `${item.label} ${item.effective_dates.join(', ')} · ₩${item.amount.toLocaleString()}`)
                .join(' / ')}
              {(data.salary_change_proration || []).length > 3 ? ` 외 ${(data.salary_change_proration || []).length - 3}건` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onUpdate(s.id, '__reset_base_salary_from_master', null)}
            className="px-2 py-0.5 rounded bg-white text-sky-700 border border-sky-300 text-[10px] font-bold shadow-xs hover:bg-sky-100 transition-colors"
          >
            일할 해제 (마스터 ₩{(s.base_salary || 0).toLocaleString()} 복원)
          </button>
        </div>
      )}

      {/* ── 과세: 기본급 + 과세수당(통상임금 산입) ── */}
      <div className="space-y-1">
        <p className="text-[9px] font-black text-[var(--toss-gray-3)] uppercase tracking-wide ml-0.5">과세 · 기본급</p>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <CompactAmountField
            label="기본급"
            value={Number(data.base_salary || 0)}
            tone="default"
            onChange={(v) => onUpdate(s.id, 'base_salary', v)}
            testId={`salary-settlement-base-${s.id}`}
          />
          {TAXABLE_FIELDS.map((f) => (
            <CompactAmountField
              key={f.key}
              label={f.label}
              value={Number(breakdown[f.key] || 0)}
              onChange={(v) => onUpdate(s.id, `taxable_allowance_breakdown.${f.key}`, v)}
              testId={`salary-settlement-taxable-${f.key}-${s.id}`}
            />
          ))}
          <TenMinuteUnitAmountField
            label="고정연장"
            value={Number(breakdown.overtime_allowance) || 0}
            hourlyRate={hourlyRate}
            onChange={(nextValue) => onUpdate(s.id, 'taxable_allowance_breakdown.overtime_allowance', nextValue)}
            dataTestId={`salary-settlement-taxable-overtime_allowance-${s.id}`}
            labelClassName="text-[var(--toss-gray-4)]"
            inputClassName="text-[var(--foreground)]"
            allowManualAmountInput
            multiplier={ALLOWANCE_MULTIPLIERS.overtime_allowance}
          />
          <TenMinuteUnitAmountField
            label="고정야간"
            value={Number(breakdown.night_work_allowance) || 0}
            hourlyRate={hourlyRate}
            onChange={(nextValue) => onUpdate(s.id, 'taxable_allowance_breakdown.night_work_allowance', nextValue)}
            dataTestId={`salary-settlement-taxable-night_work_allowance-${s.id}`}
            labelClassName="text-[var(--toss-gray-4)]"
            inputClassName="text-[var(--foreground)]"
            allowManualAmountInput
            multiplier={ALLOWANCE_MULTIPLIERS.night_work_allowance}
          />
          <TenMinuteUnitAmountField
            label="휴일수당"
            value={Number(breakdown.holiday_work_allowance) || 0}
            hourlyRate={hourlyRate}
            onChange={(nextValue) => onUpdate(s.id, 'taxable_allowance_breakdown.holiday_work_allowance', nextValue)}
            dataTestId={`salary-settlement-taxable-holiday_work_allowance-${s.id}`}
            labelClassName="text-[var(--toss-gray-4)]"
            inputClassName="text-[var(--foreground)]"
            allowManualAmountInput
            multiplier={ALLOWANCE_MULTIPLIERS.holiday_work_allowance}
          />
        </div>
      </div>

      {/* ── 비과세 항목 ── */}
      <div className="space-y-1">
        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wide ml-0.5">비과세 항목</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {TAXFREE_FIELDS.map((f) => (
            <CompactAmountField
              key={f.key}
              label={f.label}
              tone="taxfree"
              value={Number(taxfreeData[f.key] || 0)}
              onChange={(v) => onUpdate(s.id, f.key, v)}
              testId={`salary-settlement-taxfree-${f.key}-${s.id}`}
            />
          ))}
          <TenMinuteUnitAmountField
            label="야간/당직 (비과세)"
            value={Number(data.night_duty_allowance) || 0}
            hourlyRate={hourlyRate}
            onChange={(nextValue) => onUpdate(s.id, 'night_duty_allowance', nextValue)}
            dataTestId={`salary-settlement-night-duty-${s.id}`}
            labelClassName="text-emerald-700"
            inputClassName="text-emerald-800"
            allowManualAmountInput
          />
        </div>
      </div>

      {/* ── 변동(연장 실적·상여) · 공제 · 인적공제 ── */}
      <div className="space-y-1">
        <p className="text-[9px] font-black text-[var(--toss-gray-3)] uppercase tracking-wide ml-0.5">변동 · 공제</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <TenMinuteUnitAmountField
            label="연장근무수당"
            value={Number(data.overtime_pay) || 0}
            hourlyRate={hourlyRate}
            onChange={(nextValue) => onUpdate(s.id, 'overtime_pay', nextValue)}
            dataTestId={`salary-settlement-overtime-pay-${s.id}`}
            labelClassName="text-[var(--toss-gray-4)]"
            inputClassName="text-[var(--foreground)]"
            allowManualAmountInput
            multiplier={ALLOWANCE_MULTIPLIERS.overtime_allowance}
          />
          <CompactAmountField
            label="상여금"
            value={data.bonus === '' ? '' : Number(data.bonus || 0)}
            onChange={(v) => onUpdate(s.id, 'bonus', v)}
            testId={`salary-settlement-bonus-${s.id}`}
          />
          <TenMinuteUnitAmountField
            label="근태/기타차감"
            value={Number(data.attendance_deduction) || 0}
            hourlyRate={hourlyRate}
            onChange={(nextValue) => onUpdate(s.id, 'attendance_deduction', nextValue)}
            dataTestId={`salary-settlement-attendance-deduction-${s.id}`}
            labelClassName="text-orange-600"
            inputClassName="text-orange-700"
            allowManualAmountInput
          />
          <div className="space-y-0.5">
            <label className="block text-[9px] font-bold ml-0.5 text-sky-700">원천징수 비율</label>
            <select
              data-testid={`salary-settlement-withholding-rate-${s.id}`}
              value={Number(data.withholding_rate_percent) || 100}
              onChange={(e) => onUpdate(s.id, 'withholding_rate_percent', parseInt(e.target.value, 10) || 100)}
              className="w-full h-7 px-2 rounded-md border border-sky-200 bg-sky-50/30 text-[11px] font-bold text-sky-700 outline-none"
            >
              <option value={80}>80%</option>
              <option value={100}>100%</option>
              <option value={120}>120%</option>
            </select>
          </div>
          <div className="space-y-0.5">
            <label className="block text-[9px] font-bold ml-0.5 text-emerald-700">부양가족</label>
            <input
              data-testid={`salary-settlement-dependent-count-${s.id}`}
              type="number"
              min={0}
              max={10}
              value={data.dependent_count === '' ? '' : Number(data.dependent_count || 0)}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate(s.id, 'dependent_count', val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
              }}
              className="w-full h-7 px-2 rounded-md border border-emerald-200 bg-emerald-50/30 text-[11px] font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <div className="space-y-0.5">
            <label className="block text-[9px] font-bold ml-0.5 text-emerald-700">8~20세 자녀</label>
            <input
              data-testid={`salary-settlement-child-count-${s.id}`}
              type="number"
              min={0}
              max={data.dependent_count === '' ? 0 : Number(data.dependent_count) || 0}
              value={data.child_count_8_20 === '' ? '' : Number(data.child_count_8_20 || 0)}
              onChange={(e) => onUpdate(s.id, 'child_count_8_20', e.target.value)}
              className="w-full h-7 px-2 rounded-md border border-emerald-200 bg-emerald-50/30 text-[11px] font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
        </div>
      </div>

      {/* 합계 요약 + 근태차감 면제 */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--muted)] px-3 py-1.5 rounded-lg">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">과세 ₩{res.taxable.toLocaleString()}</span>
          <span className="text-[10px] font-bold text-emerald-600">비과세 ₩{res.taxfree.toLocaleString()}</span>
          <span className="text-[10px] font-bold text-red-600">공제합계 ₩{deductionTotal.toLocaleString()}</span>
          <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">근태차감 ₩{Number(data.attendance_deduction || 0).toLocaleString()}</span>
        </div>
        {Number(data.attendance_deduction || 0) > 0 && (
          <button onClick={() => onUpdate(s.id, 'attendance_deduction', 0)} className="text-[9px] font-bold text-emerald-600 bg-[var(--card)] px-2 py-0.5 rounded shadow-sm border border-emerald-100">근태차감 면제</button>
        )}
      </div>

      {/* 출퇴근 자동 분석 추천 */}
      {((data.auto_overtime_minutes || 0) > 0 || (data.auto_holiday_hours || 0) > 0 || (data.auto_night_minutes || 0) > 0) && (
        <div data-testid={`salary-settlement-recommendation-${s.id}`} className="rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-1.5 text-[11px] font-bold text-sky-800 space-y-1">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-sky-700">
            <span>⏱️ 자동 분석</span>
            {Number(data.auto_overtime_minutes || 0) > 0 && (
              <span>연장 {Math.floor((data.auto_overtime_minutes || 0) / 60)}h {(data.auto_overtime_minutes || 0) % 60}m (₩{(data.auto_overtime_pay || 0).toLocaleString()})</span>
            )}
            {Number(data.auto_holiday_hours || 0) > 0 && (
              <span>휴일 {data.auto_holiday_hours}h (₩{(data.auto_holiday_pay || 0).toLocaleString()} - 휴일수당에 자동 반영)</span>
            )}
            {Number(data.auto_night_minutes || 0) > 0 && (
              <span>야간 {Math.floor((data.auto_night_minutes || 0) / 60)}h {(data.auto_night_minutes || 0) % 60}m (₩{(data.auto_night_pay || 0).toLocaleString()})</span>
            )}
            <span>· 추천(연장+야간) <span className="font-extrabold text-blue-600">₩{((data.auto_overtime_pay || 0) + (data.auto_night_pay || 0)).toLocaleString()}</span></span>
          </div>
          {Number(data.overtime_pay || 0) !== ((data.auto_overtime_pay || 0) + (data.auto_night_pay || 0)) && (
            <button
              type="button"
              onClick={() => onUpdate(s.id, 'overtime_pay', (data.auto_overtime_pay || 0) + (data.auto_night_pay || 0))}
              className="text-[9px] font-bold bg-sky-600 text-white px-2 py-0.5 rounded shadow-sm hover:opacity-90 transition-all"
            >
              추천액 연장근로(실적)에 적용
            </button>
          )}
        </div>
      )}

      {/* 공제 내역 */}
      <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
  );
}

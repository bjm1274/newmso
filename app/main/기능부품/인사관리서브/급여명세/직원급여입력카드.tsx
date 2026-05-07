'use client';

import type { SettlementEntry } from './settlement-types';

interface SalaryCalcResult {
  taxable: number;
  taxfree: number;
  total: number;
  deduction: number;
  deductionDetail: Record<string, unknown>;
  attendance_deduction: number;
  net: number;
}

interface Props {
  staffId: string;
  staffName: string;
  staffCompany?: string | null;
  staffDepartment?: string | null;
  data: SettlementEntry;
  res: SalaryCalcResult;
  expectedNet: number;
  onUpdate: (id: string, field: string, value: unknown) => void;
}

export default function 직원급여입력카드({
  staffId,
  staffName,
  staffCompany,
  staffDepartment,
  data,
  res,
  expectedNet,
  onUpdate,
}: Props) {
  const hasAdvanceDeduction = (data.advance_pay || 0) > 0;

  return (
    <div
      key={staffId}
      data-testid={`salary-settlement-card-${staffId}`}
      className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm space-y-4 hover:border-[var(--accent)] transition-all"
    >
      {/* 헤더 */}
      <div className="flex justify-between items-center border-b border-[var(--muted)] pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--toss-blue-light)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">
            {staffName[0]}
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--foreground)] leading-none">{staffName}</p>
            {data.saved_status && (
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  data.saved_status === '확정'
                    ? 'bg-[var(--success-light)] text-[var(--success)]'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {data.saved_status}
              </span>
            )}
            <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">
              {staffCompany} · {staffDepartment}
            </p>
          </div>
          {hasAdvanceDeduction && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
              선지급 차감
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[var(--toss-gray-3)] font-bold">합계 예상 실지급액</p>
          <p
            data-testid={`salary-settlement-expected-net-${staffId}`}
            className="text-lg font-black text-[var(--accent)]"
          >
            ₩ {expectedNet.toLocaleString()}
          </p>
        </div>
      </div>

      {/* 입력 그리드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
        {/* 과세·기본급 (읽기전용) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">과세·기본급</label>
          <input
            type="text"
            value={Number(data.base_salary).toLocaleString()}
            readOnly
            className="w-full h-8 px-3 bg-[var(--muted)] border-none rounded-lg text-xs font-bold text-[var(--toss-gray-4)]"
          />
        </div>

        {/* 수당 합계(고정포함) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--accent)] ml-1">수당 합계(고정포함)</label>
          <input
            type="text"
            value={Number(data.extra_allowance).toLocaleString()}
            onChange={(e) =>
              onUpdate(staffId, 'extra_allowance', parseInt(e.target.value.replace(/,/g, '')) || 0)
            }
            className="w-full h-8 px-3 border border-[var(--border)] rounded-lg text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20 outline-none"
          />
        </div>

        {/* 야간/당직 (비과세) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">야간/당직 (비과세)</label>
          <input
            type="text"
            value={Number(data.night_duty_allowance).toLocaleString()}
            onChange={(e) =>
              onUpdate(staffId, 'night_duty_allowance', parseInt(e.target.value.replace(/,/g, '')) || 0)
            }
            className="w-full h-8 px-3 border border-[var(--border)] rounded-lg text-xs font-bold outline-none"
          />
        </div>

        {/* 연장/상여 */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">연장/상여</label>
          <input
            type="text"
            value={(Number(data.overtime_pay) + Number(data.bonus)).toLocaleString()}
            onChange={(e) =>
              onUpdate(staffId, 'overtime_pay', parseInt(e.target.value.replace(/,/g, '')) || 0)
            }
            className="w-full h-8 px-3 border border-[var(--border)] rounded-lg text-xs font-bold outline-none"
          />
        </div>

        {/* 근태/기타차감 (읽기전용) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-orange-600 ml-1">근태/기타차감</label>
          <input
            type="text"
            value={Number(data.attendance_deduction).toLocaleString()}
            readOnly
            className="w-full h-8 px-3 border border-orange-500/20 bg-orange-500/10/30 rounded-lg text-xs font-bold text-orange-700 outline-none"
          />
        </div>

        {/* 선지급(차감) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-amber-600 ml-1">선지급(차감)</label>
          <input
            data-testid={`salary-settlement-advance-pay-${staffId}`}
            type="text"
            value={Number(data.advance_pay).toLocaleString()}
            onChange={(e) =>
              onUpdate(staffId, 'advance_pay', parseInt(e.target.value.replace(/,/g, '')) || 0)
            }
            className="w-full h-8 px-3 border border-amber-200 bg-amber-50/30 rounded-lg text-xs font-bold text-amber-700 outline-none"
          />
        </div>

        {/* 부양가족/인적공제 */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--success)] ml-1">부양가족/인적공제</label>
          <input
            data-testid={`salary-settlement-dependent-count-${staffId}`}
            type="number"
            min={0}
            max={10}
            value={Number(data.dependent_count) || 0}
            onChange={(e) =>
              onUpdate(staffId, 'dependent_count', Math.max(0, parseInt(e.target.value, 10) || 0))
            }
            className="w-full h-8 px-3 border border-[var(--success-light)] bg-[var(--success-light)]/30 rounded-lg text-xs font-bold text-[var(--success)] outline-none"
          />
        </div>

        {/* 8~20세 자녀수 */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[var(--success)] ml-1">8~20세 자녀수</label>
          <input
            data-testid={`salary-settlement-child-count-${staffId}`}
            type="number"
            min={0}
            max={Number(data.dependent_count) || 0}
            value={Number(data.child_count_8_20) || 0}
            onChange={(e) => onUpdate(staffId, 'child_count_8_20', e.target.value)}
            className="w-full h-8 px-3 border border-[var(--success-light)] bg-[var(--success-light)]/30 rounded-lg text-xs font-bold text-[var(--success)] outline-none"
          />
        </div>

        {/* 원천징수 비율 */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-sky-700 ml-1">원천징수 비율</label>
          <select
            data-testid={`salary-settlement-withholding-rate-${staffId}`}
            value={Number(data.withholding_rate_percent) || 100}
            onChange={(e) =>
              onUpdate(staffId, 'withholding_rate_percent', parseInt(e.target.value, 10) || 100)
            }
            className="w-full h-8 px-3 border border-sky-200 bg-sky-50/30 rounded-lg text-xs font-bold text-sky-700 outline-none"
          >
            <option value={80}>80%</option>
            <option value={100}>100%</option>
            <option value={120}>120%</option>
          </select>
        </div>

        {/* 과세/비과세 요약 + 근태차감 면제 버튼 */}
        <div className="col-span-2 flex items-center justify-between bg-[var(--muted)] px-4 py-2 rounded-[var(--radius-lg)] mt-1">
          <div className="flex gap-4">
            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">
              과세: ₩{res.taxable.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">
              비과세: ₩{res.taxfree.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">
              자동 근태차감: ₩{Number(data.attendance_deduction || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex gap-2">
            {data.attendance_deduction > 0 && (
              <button
                onClick={() => onUpdate(staffId, 'attendance_deduction', 0)}
                className="text-[9px] font-bold text-[var(--success)] bg-[var(--card)] px-2 py-0.5 rounded shadow-sm border border-[var(--success-light)]"
              >
                근태차감 면제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

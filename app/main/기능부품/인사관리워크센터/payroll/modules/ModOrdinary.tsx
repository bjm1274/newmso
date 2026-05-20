'use client';

import { useMemo, useState } from 'react';
import { usePayrollData } from '../payroll-context';
import { ORDINARY_WAGE_INCLUDED_KEYS, ORDINARY_WAGE_EXCLUDED_KEYS } from '../payroll-policy';

/**
 * #11 통상임금 계산기 — 시간당 통상임금 + 수당 계산식
 *
 * 통상임금:
 *   포함: 기본급, 직책수당, 정기 식대(고정), 정기 자가운전(고정)
 *   제외: 초과/야간/휴일 수당, 정기상여(판례 변경 가능), 보너스
 *
 * 계산:
 *   시간당 통상임금 = 통상임금 월 합계 / 209h
 *   연장 1h = 시간당 × 1.5
 *   야간 1h = 시간당 × 1.5
 *   휴일 1h = 시간당 × 1.5
 *
 * JM6: 입력 label 연결, 결과 영역 aria-live
 */

function parseNumber(v: string): number {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export default function ModOrdinary() {
  const data = usePayrollData();

  const [staffId, setStaffId] = useState<string>('');
  const [base, setBase] = useState<string>('3,800,000');
  const [positionAllowance, setPositionAllowance] = useState<string>('100,000');
  const [mealAllowance, setMealAllowance] = useState<string>('200,000');
  const [vehicleAllowance, setVehicleAllowance] = useState<string>('0');

  const monthlyHours = data.policy.monthlyStandardHours;

  const ordinarySum =
    parseNumber(base) +
    parseNumber(positionAllowance) +
    parseNumber(mealAllowance) +
    parseNumber(vehicleAllowance);

  const hourly = useMemo(() => Math.floor(ordinarySum / Math.max(1, monthlyHours)), [ordinarySum, monthlyHours]);

  const overtime1h = Math.floor(hourly * 1.5);
  const night1h = Math.floor(hourly * 1.5);
  const holiday1h = Math.floor(hourly * 1.5);

  const handlePickStaff = (id: string) => {
    setStaffId(id);
    const s = data.staffs.find((st) => String(st.id) === id);
    if (s?.salary) setBase(s.salary.toLocaleString());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <form
          className="app-card p-4 flex flex-col gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <h3 className="section-title">통상임금 산입 항목</h3>

          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            대상 직원 (선택 시 기본급 자동)
            <select
              value={staffId}
              onChange={(e) => handlePickStaff(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
            >
              <option value="">— 직접 입력 —</option>
              {data.staffs.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} · {s.department ?? '-'}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            기본급 (원)
            <input
              type="text"
              inputMode="numeric"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            직책수당 (원)
            <input
              type="text"
              inputMode="numeric"
              value={positionAllowance}
              onChange={(e) => setPositionAllowance(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            정기 식대 (원)
            <input
              type="text"
              inputMode="numeric"
              value={mealAllowance}
              onChange={(e) => setMealAllowance(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            정기 자가운전보조비 (원)
            <input
              type="text"
              inputMode="numeric"
              value={vehicleAllowance}
              onChange={(e) => setVehicleAllowance(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-right tabular-nums"
            />
          </label>

          <div className="text-[10px] text-[var(--toss-gray-3)] mt-1 leading-relaxed">
            <b>포함:</b> {ORDINARY_WAGE_INCLUDED_KEYS.join(', ')}<br />
            <b>제외:</b> {ORDINARY_WAGE_EXCLUDED_KEYS.join(', ')}
          </div>
        </form>

        <div className="app-card p-4" aria-live="polite">
          <h3 className="section-title">계산 결과</h3>
          <div className="mt-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-light)]">
            <div className="text-[11px] text-[var(--toss-gray-4)]">시간당 통상임금</div>
            <div className="text-[28px] font-extrabold tabular-nums text-[var(--accent)]">
              {hourly.toLocaleString()}<span className="ml-1 text-[14px] font-bold">원</span>
            </div>
            <div className="text-[11px] text-[var(--toss-gray-4)]">
              월 통상임금 {ordinarySum.toLocaleString()}원 / {monthlyHours}h
            </div>
          </div>

          <ul className="mt-3 flex flex-col gap-1.5">
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">연장근로 1h (1.5배)</span>
              <b className="tabular-nums">{overtime1h.toLocaleString()}원</b>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">야간근로 1h (1.5배)</span>
              <b className="tabular-nums">{night1h.toLocaleString()}원</b>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">휴일근로 1h (1.5배)</span>
              <b className="tabular-nums">{holiday1h.toLocaleString()}원</b>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span className="text-[12px] text-[var(--toss-gray-4)]">연차수당 1일 (8h)</span>
              <b className="tabular-nums">{(hourly * 8).toLocaleString()}원</b>
            </li>
          </ul>
        </div>
      </div>

      <div className="app-card p-4 border-l-4 border-[var(--warning)] bg-[var(--warning-light)]">
        <h4 className="text-[12px] font-bold text-[var(--warning)]">통상임금 산입 룰</h4>
        <p className="text-[11px] text-[var(--toss-gray-4)] mt-1 leading-relaxed">
          정기상여는 2024년 대법원 판례 변경(2024다394541)으로 통상임금 산입 여부 재검토 권장.
          본 계산기는 보수적으로 정기상여를 제외하며, 회사 정책에 따라 조정 필요.
        </p>
      </div>
    </div>
  );
}

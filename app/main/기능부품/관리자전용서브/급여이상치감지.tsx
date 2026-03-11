'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const THRESHOLD = 20;

type StaffLike = {
  id?: string | number;
  name?: string;
  department?: string;
  position?: string;
  employee_no?: string | number;
  employeeNo?: string | number;
  staff_number?: string | number;
  emp_no?: string | number;
};

type PayrollRow = {
  staff_id: string;
  net_pay: number;
  total_deduction?: number;
  base_salary?: number;
  bonus?: number;
  extra_allowance?: number;
};

type AnomalyRow = {
  staffId: string;
  staff?: StaffLike;
  type: '급여누락' | '신규지급' | '급여급증' | '급여급감';
  current: number;
  previous: number;
  diff: number;
  pct: number;
  severity: 'critical' | 'warning' | 'info';
};

export default function SalaryAnomalyDetector({ staffs = [] }: { staffs: StaffLike[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [allData, setAllData] = useState<AnomalyRow[]>([]);
  const [threshold, setThreshold] = useState(THRESHOLD);

  const getMonthLabel = (value: string) => {
    const [year, month] = value.split('-');
    return `${year}년 ${Number(month)}월`;
  };

  const getPreviousMonth = (value: string) => {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const getStaffIdentifier = (staff: StaffLike | undefined, staffId: string) =>
    String(
      staff?.employee_no ||
      staff?.employeeNo ||
      staff?.staff_number ||
      staff?.emp_no ||
      staffId
    );

  const getStaffLabel = (staff: StaffLike | undefined, staffId: string) =>
    staff?.name
      ? `${staff.name} · ID ${getStaffIdentifier(staff, staffId)}`
      : `직원 ID ${getStaffIdentifier(staff, staffId)}`;

  const getStaffMeta = (staff: StaffLike | undefined) =>
    [staff?.department, staff?.position].filter(Boolean).join(' · ');

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const previousMonth = getPreviousMonth(currentMonth);

      const { data: currentRows } = await supabase
        .from('payroll_records')
        .select('staff_id, net_pay, total_deduction, base_salary, bonus, extra_allowance')
        .eq('year_month', currentMonth);

      const { data: previousRows } = await supabase
        .from('payroll_records')
        .select('staff_id, net_pay, total_deduction, base_salary, bonus, extra_allowance')
        .eq('year_month', previousMonth);

      const currentMap: Record<string, PayrollRow> = {};
      (currentRows || []).forEach((row: PayrollRow) => {
        currentMap[row.staff_id] = row;
      });

      const previousMap: Record<string, PayrollRow> = {};
      (previousRows || []).forEach((row: PayrollRow) => {
        previousMap[row.staff_id] = row;
      });

      const results: AnomalyRow[] = [];
      const allIds = new Set([...Object.keys(currentMap), ...Object.keys(previousMap)]);

      allIds.forEach((staffId) => {
        const current = currentMap[staffId];
        const previous = previousMap[staffId];
        const staff = staffs.find((item) => String(item.id) === String(staffId));

        if (!current && previous) {
          results.push({
            staffId,
            staff,
            type: '급여누락',
            current: 0,
            previous: previous.net_pay,
            diff: -previous.net_pay,
            pct: -100,
            severity: 'critical',
          });
          return;
        }

        if (current && !previous) {
          results.push({
            staffId,
            staff,
            type: '신규지급',
            current: current.net_pay,
            previous: 0,
            diff: current.net_pay,
            pct: 100,
            severity: 'info',
          });
          return;
        }

        if (!current || !previous) return;

        const diff = current.net_pay - previous.net_pay;
        const pct = previous.net_pay > 0 ? (diff / previous.net_pay) * 100 : 0;

        if (Math.abs(pct) >= threshold) {
          results.push({
            staffId,
            staff,
            type: pct > 0 ? '급여급증' : '급여급감',
            current: current.net_pay,
            previous: previous.net_pay,
            diff,
            pct,
            severity: Math.abs(pct) >= 50 ? 'critical' : 'warning',
          });
        }
      });

      results.sort((left, right) => Math.abs(right.pct) - Math.abs(left.pct));
      setAllData(results);
      setAnomalies(results.filter((item) => item.type !== '신규지급'));
    } catch (error) {
      console.error('이상치 분석 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, staffs, threshold]);

  useEffect(() => {
    analyze();
  }, [analyze]);

  const formatAmount = (value: number) => value?.toLocaleString('ko-KR') || '0';
  const severityColor = (severity: AnomalyRow['severity']) =>
    ({
      critical: 'bg-red-50 text-red-600 border-red-200',
      warning: 'bg-orange-50 text-orange-600 border-orange-200',
      info: 'bg-blue-50 text-blue-600 border-blue-200',
    })[severity];

  const criticalCount = anomalies.filter((item) => item.severity === 'critical').length;
  const warningCount = anomalies.filter((item) => item.severity === 'warning').length;
  const newPayments = allData.filter((item) => item.type === '신규지급');

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base font-bold text-[var(--foreground)]">급여 이상치 자동 감지</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="month"
            value={currentMonth}
            onChange={(event) => setCurrentMonth(event.target.value)}
            className="rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-card)] px-3 py-2 text-sm font-bold outline-none"
          />
          <button
            onClick={analyze}
            disabled={loading}
            className="rounded-[10px] bg-[var(--toss-blue)] px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '분석 중...' : '재분석'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4">
        <span className="shrink-0 text-xs font-semibold text-[var(--toss-gray-4)]">감지 임계값</span>
        <input
          type="range"
          min={5}
          max={50}
          step={5}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          className="flex-1"
        />
        <span className="w-12 text-right text-sm font-bold text-[var(--toss-blue)]">±{threshold}%</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            label: '분석 기간',
            value: `${getMonthLabel(getPreviousMonth(currentMonth))} → ${getMonthLabel(currentMonth)}`,
          },
          {
            label: '이상탐지',
            value: `${anomalies.length}건`,
            color: anomalies.length > 0 ? 'text-orange-500' : 'text-emerald-600',
          },
          {
            label: '심각 (±50%+)',
            value: `${criticalCount}건`,
            color: criticalCount > 0 ? 'text-red-600' : 'text-[var(--toss-gray-3)]',
          },
          {
            label: '주의 (±20%+)',
            value: `${warningCount}건`,
            color: warningCount > 0 ? 'text-orange-500' : 'text-[var(--toss-gray-3)]',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm"
          >
            <p className="mb-1 text-[10px] font-bold uppercase text-[var(--toss-gray-3)]">{card.label}</p>
            <p className={`text-sm font-bold ${card.color || 'text-[var(--foreground)]'}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm font-bold text-[var(--toss-gray-3)]">분석 중...</div>
      ) : anomalies.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-3 text-3xl">✅</p>
          <p className="text-sm font-bold text-[var(--foreground)]">이상치가 감지되지 않았습니다.</p>
          <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
            전월 대비 ±{threshold}% 이상 변동된 급여가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {anomalies.map((item, index) => (
            <div key={index} className={`rounded-[14px] border p-4 ${severityColor(item.severity)}`}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      item.severity === 'critical' ? 'bg-red-500' : 'bg-orange-400'
                    } animate-pulse`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{getStaffLabel(item.staff, item.staffId)}</span>
                      {getStaffMeta(item.staff) ? (
                        <span className="text-[10px] font-semibold">{getStaffMeta(item.staff)}</span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          item.type === '급여급증'
                            ? 'bg-green-100 text-green-700'
                            : item.type === '급여누락'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {item.type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs opacity-80">
                      전월: {formatAmount(item.previous)}원 → 금월: {formatAmount(item.current)}원
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-bold ${item.diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {item.diff >= 0 ? '+' : ''}
                    {formatAmount(item.diff)}원
                  </p>
                  <p className={`text-xs font-bold ${item.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ({item.pct >= 0 ? '+' : ''}
                    {item.pct.toFixed(1)}%)
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {newPayments.length > 0 ? (
        <div className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4">
          <p className="mb-2 text-xs font-bold text-[var(--toss-gray-4)]">
            ℹ️ 신규 급여 지급 직원 ({newPayments.length}명) - 전월 미지급으로 비교 제외
          </p>
          <div className="flex flex-wrap gap-2">
            {newPayments.map((item, index) => (
              <span
                key={index}
                className="rounded-full border border-[var(--toss-border)] bg-[var(--toss-card)] px-3 py-1 text-xs font-semibold"
              >
                {getStaffLabel(item.staff, item.staffId)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

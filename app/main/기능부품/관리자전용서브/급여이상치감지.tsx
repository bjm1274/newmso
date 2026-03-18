'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const DEFAULT_THRESHOLD = 20;

type StaffLike = {
  id?: string | number | null;
  staff_id?: string | number | null;
  name?: string | null;
  department?: string | null;
  position?: string | null;
  employee_no?: string | number | null;
  employeeNo?: string | number | null;
  staff_number?: string | number | null;
  emp_no?: string | number | null;
  [key: string]: unknown;
};

type PayrollRow = {
  staff_id: string;
  net_pay: number | null;
};

type AnomalyType = '급여누락' | '신규지급' | '급여급증' | '급여급감';
type Severity = 'critical' | 'warning' | 'info';

type AnomalyRow = {
  staffId: string;
  staff?: StaffLike;
  type: AnomalyType;
  current: number;
  previous: number;
  diff: number;
  pct: number;
  severity: Severity;
};

function toMonthValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getPreviousMonth(value: string) {
  const [yearText, monthText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) {
    return value;
  }

  const prev = new Date(year, month - 2, 1);
  return toMonthValue(prev);
}

function getMonthLabel(value: string) {
  const [yearText, monthText] = value.split('-');
  const month = Number(monthText);
  if (!yearText || !month) {
    return value;
  }
  return `${yearText}년 ${month}월`;
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString()}원`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function addLookupEntry(map: Map<string, StaffLike>, key: unknown, staff: StaffLike) {
  if (key === null || key === undefined) return;
  const normalized = String(key).trim();
  if (!normalized) return;
  map.set(normalized, staff);
}

export default function SalaryAnomalyDetector({ staffs = [] as StaffLike[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => toMonthValue(new Date()));
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [loading, setLoading] = useState(false);
  const [allData, setAllData] = useState<AnomalyRow[]>([]);
  const [historicalStaffNames, setHistoricalStaffNames] = useState<Record<string, string>>({});

  const staffLookup = useMemo(() => {
    const lookup = new Map<string, StaffLike>();

    for (const staff of staffs) {
      if (!staff) continue;
      addLookupEntry(lookup, staff.id, staff);
      addLookupEntry(lookup, staff.staff_id, staff);
      addLookupEntry(lookup, staff.employee_no, staff);
      addLookupEntry(lookup, staff.employeeNo, staff);
      addLookupEntry(lookup, staff.staff_number, staff);
      addLookupEntry(lookup, staff.emp_no, staff);
    }

    return lookup;
  }, [staffs]);

  const getStaffIdentifier = useCallback((staff?: StaffLike, staffId?: string) => {
    if (!staff) {
      return staffId ?? '';
    }

    const candidates = [
      staff.employee_no,
      staff.employeeNo,
      staff.staff_number,
      staff.emp_no,
      staff.id,
      staff.staff_id,
      staffId,
    ];

    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined) continue;
      const normalized = String(candidate).trim();
      if (normalized) {
        return normalized;
      }
    }

    return staffId ?? '';
  }, []);

  const getStaffLabel = useCallback(
    (staff: StaffLike | undefined, staffId: string) => {
      const identifier = getStaffIdentifier(staff, staffId);

      if (staff?.name) {
        return identifier && identifier !== staff.name ? `${staff.name} · ${identifier}` : staff.name;
      }

      const historicalName = historicalStaffNames[staffId];
      if (historicalName) {
        return `${historicalName} · 이전 급여기록`;
      }

      if (isUuidLike(staffId)) {
        return '연결 끊긴 직원';
      }

      return identifier ? `직원 ID ${identifier}` : '직원 정보 없음';
    },
    [getStaffIdentifier, historicalStaffNames],
  );

  const getStaffMeta = useCallback((staff?: StaffLike) => {
    if (!staff) return '';

    const parts = [staff.department, staff.position]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean);

    const employeeNo = staff.employee_no ?? staff.employeeNo ?? staff.staff_number ?? staff.emp_no;
    if (employeeNo !== null && employeeNo !== undefined && String(employeeNo).trim()) {
      parts.push(`사번 ${String(employeeNo).trim()}`);
    }

    return parts.join(' · ');
  }, []);

  const analyze = useCallback(async () => {
    const previousMonth = getPreviousMonth(currentMonth);
    setLoading(true);

    try {
      const [currentResult, previousResult] = await Promise.all([
        supabase.from('payroll_records').select('staff_id, net_pay').eq('year_month', currentMonth),
        supabase.from('payroll_records').select('staff_id, net_pay').eq('year_month', previousMonth),
      ]);

      if (currentResult.error) throw currentResult.error;
      if (previousResult.error) throw previousResult.error;

      const currentRows = (currentResult.data ?? []) as PayrollRow[];
      const previousRows = (previousResult.data ?? []) as PayrollRow[];

      const currentMap = new Map<string, PayrollRow>();
      const previousMap = new Map<string, PayrollRow>();

      for (const row of currentRows) {
        if (!row?.staff_id) continue;
        currentMap.set(String(row.staff_id), row);
      }

      for (const row of previousRows) {
        if (!row?.staff_id) continue;
        previousMap.set(String(row.staff_id), row);
      }

      const staffIds = new Set<string>([
        ...Array.from(currentMap.keys()),
        ...Array.from(previousMap.keys()),
      ]);

      const nextRows: AnomalyRow[] = [];

      for (const staffId of staffIds) {
        const currentAmount = Number(currentMap.get(staffId)?.net_pay ?? 0);
        const previousAmount = Number(previousMap.get(staffId)?.net_pay ?? 0);
        const diff = currentAmount - previousAmount;
        const pct =
          previousAmount === 0
            ? currentAmount > 0
              ? 100
              : 0
            : (diff / previousAmount) * 100;

        let type: AnomalyType | null = null;
        let severity: Severity = 'info';

        if (previousAmount > 0 && currentAmount === 0) {
          type = '급여누락';
          severity = 'critical';
        } else if (previousAmount === 0 && currentAmount > 0) {
          type = '신규지급';
          severity = 'info';
        } else if (Math.abs(pct) >= threshold) {
          type = pct > 0 ? '급여급증' : '급여급감';
          severity = Math.abs(pct) >= 50 ? 'critical' : 'warning';
        }

        if (!type) continue;

        const staff = staffLookup.get(staffId);
        nextRows.push({
          staffId,
          staff,
          type,
          current: currentAmount,
          previous: previousAmount,
          diff,
          pct,
          severity,
        });
      }

      nextRows.sort((a, b) => {
        const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
        const severityGap = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityGap !== 0) return severityGap;
        return Math.abs(b.diff) - Math.abs(a.diff);
      });

      setAllData(nextRows);
    } catch (error) {
      console.error('급여 이상치 분석 실패:', error);
      setAllData([]);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, staffLookup, threshold]);

  useEffect(() => {
    void analyze();
  }, [analyze]);

  useEffect(() => {
    const unresolvedIds = Array.from(
      new Set(
        allData
          .filter((item) => !item.staff?.name && isUuidLike(item.staffId))
          .map((item) => item.staffId),
      ),
    );

    if (unresolvedIds.length === 0) {
      setHistoricalStaffNames({});
      return;
    }

    let cancelled = false;

    const fetchHistoricalNames = async () => {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('user_id, user_name, created_at')
          .in('user_id', unresolvedIds)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const nextMap: Record<string, string> = {};

        for (const row of data ?? []) {
          const userId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
          const userName = typeof row.user_name === 'string' ? row.user_name.trim() : '';
          if (!userId || !userName || nextMap[userId]) continue;
          nextMap[userId] = userName;
        }

        if (!cancelled) {
          setHistoricalStaffNames(nextMap);
        }
      } catch (error) {
        console.warn('급여 이력용 직원명 보조 조회 실패:', error);
        if (!cancelled) {
          setHistoricalStaffNames({});
        }
      }
    };

    void fetchHistoricalNames();

    return () => {
      cancelled = true;
    };
  }, [allData]);

  const visibleAnomalies = useMemo(
    () => allData.filter((item) => item.type !== '신규지급'),
    [allData],
  );

  const newPayments = useMemo(
    () => allData.filter((item) => item.type === '신규지급'),
    [allData],
  );

  const criticalCount = useMemo(
    () => visibleAnomalies.filter((item) => item.severity === 'critical').length,
    [visibleAnomalies],
  );

  const warningCount = useMemo(
    () => visibleAnomalies.filter((item) => item.severity === 'warning').length,
    [visibleAnomalies],
  );

  const previousMonth = getPreviousMonth(currentMonth);

  return (
    <div className="space-y-4" data-testid="salary-anomaly-detector">
      <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-black text-[var(--foreground)]">급여 이상치 자동 감지</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={currentMonth}
              onChange={(event) => setCurrentMonth(event.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={loading}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? '분석 중...' : '재분석'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-semibold text-[var(--toss-gray-3)]">
            <span>감지 임계값</span>
            <span className="text-[var(--accent)]">{threshold}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs font-bold text-[var(--toss-gray-3)]">분석기간</div>
          <div className="mt-2 text-lg font-black text-[var(--foreground)]">
            {getMonthLabel(previousMonth)} → {getMonthLabel(currentMonth)}
          </div>
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs font-bold text-[var(--toss-gray-3)]">이상탐지</div>
          <div className="mt-2 text-lg font-black text-[var(--foreground)]">{visibleAnomalies.length}건</div>
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs font-bold text-[var(--toss-gray-3)]">심각 (+50%+)</div>
          <div className="mt-2 text-lg font-black text-danger">{criticalCount}건</div>
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs font-bold text-[var(--toss-gray-3)]">주의 (+20%+)</div>
          <div className="mt-2 text-lg font-black text-orange-500">{warningCount}건</div>
        </div>
      </div>

      {visibleAnomalies.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-12 text-center text-sm font-semibold text-[var(--toss-gray-3)] shadow-sm">
          이상치가 감지되지 않았습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleAnomalies.map((item) => {
            const historicalName = historicalStaffNames[item.staffId];
            const showRawStaffId = !item.staff?.name && !historicalName && isUuidLike(item.staffId);
            const meta = getStaffMeta(item.staff);
            const accentClass =
              item.severity === 'critical'
                ? 'border-red-200 bg-red-50'
                : item.severity === 'warning'
                  ? 'border-orange-200 bg-orange-50'
                  : 'border-blue-200 bg-blue-50';
            const amountClass =
              item.diff >= 0 ? 'text-blue-600' : 'text-red-600';

            return (
              <div
                key={`${item.staffId}-${item.type}`}
                className={`rounded-[var(--radius-xl)] border p-4 shadow-sm ${accentClass}`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-black text-[var(--foreground)]">
                        {getStaffLabel(item.staff, item.staffId)}
                      </span>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold text-[var(--toss-gray-4)]">
                        {item.type}
                      </span>
                    </div>
                    {meta ? (
                      <div className="mt-1 text-sm font-semibold text-[var(--toss-gray-4)]">{meta}</div>
                    ) : null}
                    {showRawStaffId ? (
                      <div className="mt-1 text-xs font-mono text-[var(--toss-gray-3)]">
                        원본 staff_id: {item.staffId}
                      </div>
                    ) : null}
                    <div className="mt-2 text-sm text-[var(--toss-gray-4)]">
                      전월: {formatCurrency(item.previous)} → 금월: {formatCurrency(item.current)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-3xl font-black ${amountClass}`}>{formatCurrency(item.diff)}</div>
                    <div className={`mt-1 text-sm font-bold ${amountClass}`}>{formatPercent(item.pct)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {newPayments.length > 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="mb-3 text-base font-black text-[var(--foreground)]">신규 지급 직원</div>
          <div className="space-y-2">
            {newPayments.map((item) => (
              <div
                key={`${item.staffId}-${item.type}`}
                className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-blue-100 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-bold text-[var(--foreground)]">{getStaffLabel(item.staff, item.staffId)}</div>
                  {getStaffMeta(item.staff) ? (
                    <div className="text-sm text-[var(--toss-gray-4)]">{getStaffMeta(item.staff)}</div>
                  ) : null}
                </div>
                <div className="text-right text-sm font-bold text-blue-700">
                  금월 지급 {formatCurrency(item.current)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

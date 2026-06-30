'use client';
import { useState, useEffect, useMemo } from 'react';
import { getKoreanMonthString } from '@/lib/seoul-time';
import { db } from '@/lib/db-client';
import { TAX_FREE_LEGAL_LIMITS, NIGHT_DUTY_TAX_FREE_LIMIT } from '@/lib/tax-free-limits';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

interface StaffRecord {
  id: string | number;
  name: string;
  company?: string;
}

interface TaxFreeKey {
  meal: number;
  car: number;
  research: number;
  childcare: number;
  night: number;
  overseas: number;
}

interface TaxFreeRow {
  id: string | number;
  name: string;
  exceeded: boolean;
  meal: number;
  car: number;
  research: number;
  childcare: number;
  night: number;
  overseas: number;
}

type TaxFreeItemKey = keyof TaxFreeKey;

// 비과세 한도 SSOT: 정본 lib/tax-free-limits 의 법정 한도를 사용한다.
// childcare(출산·보육수당)는 2024년 개정으로 월 20만원이며 정본 TAX_FREE_LEGAL_LIMITS.childcare가
// 커버한다 (과거 10만원 하드코딩 → SSOT 200,000으로 정정, N-5).
// night(야간근로수당 24만원)·overseas(국외근로소득 100만원)는 정본 미커버 항목이라 값 유지.
const TAX_FREE_LIMITS: Record<TaxFreeItemKey, { label: string; limit: number }> = {
  meal: { label: '식대', limit: TAX_FREE_LEGAL_LIMITS.meal.limit },
  car: { label: '자가운전보조금', limit: TAX_FREE_LEGAL_LIMITS.vehicle.limit },
  research: { label: '연구활동비', limit: TAX_FREE_LEGAL_LIMITS.research.limit },
  childcare: { label: '출산·보육수당', limit: TAX_FREE_LEGAL_LIMITS.childcare.limit },
  night: { label: '야간근로수당(생산직)', limit: NIGHT_DUTY_TAX_FREE_LIMIT },
  overseas: { label: '국외근로소득(비파견)', limit: 1000000 } };

const TAX_FREE_KEYS = Object.keys(TAX_FREE_LIMITS) as TaxFreeItemKey[];

const fmt = (n: number) => n.toLocaleString('ko-KR');

interface Props {
  staffs: StaffRecord[];
  selectedCo: string;
  user?: unknown;
}

export default function TaxFreeLimitChecker({ staffs, selectedCo }: Props) {
  const [yearMonth, setYearMonth] = useState(getKoreanMonthString());
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyExceeded, setOnlyExceeded] = useState(false);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s) => s.company === selectedCo);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      try {
        const staffIds = filtered.map((s) => s.id);
        if (staffIds.length === 0) { setRecords([]); setLoading(false); return; }
        const { data, error } = await db
          .from('payroll_records')
          .select('*')
          .eq('year_month', yearMonth)
          .in('staff_id', staffIds);
        if (error) throw error;
        setRecords(data ?? []);
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  // filtered는 참조가 매 렌더마다 바뀌므로 의존성에서 제외하고 원본 deps만 사용
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth, selectedCo]);

  // payroll_records의 실제 비과세 수당 컬럼에서 직접 읽는다.
  // (과거 meta_data 컬럼은 payroll_records에 존재하지 않아 항상 0이 되어 점검이 무력화됐음 — N-3)
  const getAmounts = (record: Record<string, unknown>): TaxFreeKey => {
    const num = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return {
      meal: num(record.meal_allowance),
      car: num(record.vehicle_allowance),
      research: num(record.research_allowance),
      childcare: num(record.childcare_allowance),
      night: num(record.night_duty_allowance),
      // payroll_records에 국외근로소득 전용 컬럼이 없어 현재는 미추적(0).
      overseas: 0 };
  };

  const rows: TaxFreeRow[] = filtered.map((staff) => {
    const record = records.find((r) => String(r.staff_id) === String(staff.id));
    const amounts = record ? getAmounts(record) : { meal: 0, car: 0, research: 0, childcare: 0, night: 0, overseas: 0 };
    const exceeded = TAX_FREE_KEYS.some((key) => amounts[key] > TAX_FREE_LIMITS[key].limit);
    return { id: staff.id, name: staff.name, exceeded, ...amounts };
  });

  const displayRows = onlyExceeded ? rows.filter((r) => r.exceeded) : rows;

  const columns = useMemo((): Column<TaxFreeRow>[] => [
    { key: 'name', label: '직원명', primary: true },
    ...TAX_FREE_KEYS.map((key): Column<TaxFreeRow> => ({
      key,
      label: TAX_FREE_LIMITS[key].label,
      align: 'right',
      render: (row) => {
        const val = row[key];
        const over = val > TAX_FREE_LIMITS[key].limit;
        return (
          <div className={over ? 'text-red-600 font-bold' : undefined}>
            <div>{fmt(val)}</div>
            {over && (
              <div className="text-[9px] text-red-500">
                초과 {fmt(val - TAX_FREE_LIMITS[key].limit)}원
              </div>
            )}
          </div>
        );
      } })),
  ], []);

  return (
    <div className="p-4 md:p-4 space-y-5 max-w-5xl mx-auto">

      <div className="flex flex-wrap gap-3 items-center">
        <div>
          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">급여 연월</label>
          <input
            type="month"
            value={yearMonth}
            onChange={e => setYearMonth(e.target.value)}
            className="p-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input
            type="checkbox"
            checked={onlyExceeded}
            onChange={e => setOnlyExceeded(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs font-bold text-[var(--toss-gray-4)]">초과자만 보기</span>
        </label>
      </div>

      {/* 비과세 한도 안내 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Object.entries(TAX_FREE_LIMITS).map(([key, { label, limit }]) => (
          <div key={key} className="p-2.5 bg-[var(--muted)] rounded-[var(--radius-md)]">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">{label}</p>
            <p className="text-xs font-bold text-[var(--foreground)]">월 {fmt(limit)}원</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-5 text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <ResponsiveTable<TaxFreeRow>
            columns={columns}
            rows={displayRows}
            keyField="id"
            emptyMessage="데이터가 없습니다."
          />
        </div>
      )}
    </div>
  );
}

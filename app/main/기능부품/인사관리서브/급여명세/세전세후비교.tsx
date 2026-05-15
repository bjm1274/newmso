'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPayrollGrossPay } from '@/lib/payroll-records';
import { calculateEmployeeInsuranceDeductions } from '@/lib/payroll-insurance-rates';
import { supabase } from '@/lib/supabase';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

type ComparisonRow = {
  id: string;
  staff: any;
  gross: number;
  deduction: number;
  net: number;
  deductionRate: string;
  breakdown: {
    pension: number;
    health: number;
    ltcare: number;
    employment: number;
    incomeTax: number;
    localTax: number;
  };
};

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('ko-KR');
}

export default function GrossNetComparison({ staffs, selectedCo }: Props) {
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? staffs : staffs.filter((staff: any) => staff.company === selectedCo)),
    [selectedCo, staffs]
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const staffIds = filteredStaffs.map((staff: any) => staff.id);
        if (!staffIds.length) {
          setRecords([]);
          return;
        }

        const { data, error } = await supabase
          .from('payroll_records')
          .select('*')
          .eq('year_month', yearMonth)
          .in('staff_id', staffIds);

        if (error) throw error;
        setRecords(data || []);
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filteredStaffs, yearMonth]);

  const rows = useMemo<ComparisonRow[]>(() => {
    return filteredStaffs.map((staff: any) => {
      const record = records.find((row: any) => String(row.staff_id) === String(staff.id));
      const gross = getPayrollGrossPay(record);
      const deduction = Number(record?.total_deduction || 0);
      const net = Number(record?.net_pay || Math.max(0, gross - deduction));
      const deductionRate = gross > 0 ? ((deduction / gross) * 100).toFixed(1) : '0.0';
      const meta = record?.meta_data || {};
      const insuranceFallback = calculateEmployeeInsuranceDeductions(gross);

      return {
        id: String(staff?.id ?? ''),
        staff,
        gross,
        deduction,
        net,
        deductionRate,
        breakdown: {
          pension: Number(meta.pension ?? meta.national_pension ?? meta.국민연금 ?? insuranceFallback.nationalPension),
          health: Number(
            meta.health_insurance ?? meta.healthInsurance ?? meta.건강보험 ?? insuranceFallback.healthInsurance
          ),
          ltcare: Number(
            meta.long_term_care ?? meta.longTermCare ?? meta.장기요양 ?? insuranceFallback.longTermCare
          ),
          employment: Number(
            meta.employment_insurance ??
              meta.employmentInsurance ??
              meta.고용보험 ??
              insuranceFallback.employmentInsurance
          ),
          incomeTax: Number(meta.income_tax ?? meta.incomeTax ?? meta.소득세 ?? 0),
          localTax: Number(meta.local_income_tax ?? meta.localTax ?? meta.지방소득세 ?? 0),
        },
      };
    });
  }, [filteredStaffs, records]);

  const totals = useMemo(() => {
    const totalGross = rows.reduce((sum, row) => sum + row.gross, 0);
    const totalDeduction = rows.reduce((sum, row) => sum + row.deduction, 0);
    const totalNet = rows.reduce((sum, row) => sum + row.net, 0);
    const totalRate = totalGross > 0 ? ((totalDeduction / totalGross) * 100).toFixed(1) : '0.0';
    return { totalGross, totalDeduction, totalNet, totalRate };
  }, [rows]);

  const buckets = useMemo(() => {
    const nextBuckets: Record<string, number> = {};
    rows.forEach((row) => {
      if (row.net <= 0) return;
      const bucket = `${Math.floor(row.net / 1_000_000)}백만`;
      nextBuckets[bucket] = (nextBuckets[bucket] || 0) + 1;
    });
    return nextBuckets;
  }, [rows]);

  const maxBucket = Math.max(...Object.values(buckets), 1);

  const columns = useMemo((): Column<ComparisonRow>[] => [
    {
      key: 'name',
      label: '직원명',
      primary: true,
      render: (row) => <span className="font-bold">{row.staff?.name ?? '—'}</span>,
    },
    {
      key: 'gross',
      label: '총급여',
      align: 'right',
      render: (row) => formatNumber(row.gross),
    },
    {
      key: 'pension',
      label: '국민연금',
      align: 'right',
      render: (row) => (
        <span className="text-[var(--toss-gray-4)]">{formatNumber(row.breakdown.pension)}</span>
      ),
    },
    {
      key: 'health',
      label: '건강보험',
      align: 'right',
      render: (row) => (
        <span className="text-[var(--toss-gray-4)]">{formatNumber(row.breakdown.health)}</span>
      ),
    },
    {
      key: 'ltcare',
      label: '장기요양보험',
      align: 'right',
      render: (row) => (
        <span className="text-[var(--toss-gray-4)]">{formatNumber(row.breakdown.ltcare)}</span>
      ),
    },
    {
      key: 'employment',
      label: '고용보험',
      align: 'right',
      render: (row) => (
        <span className="text-[var(--toss-gray-4)]">{formatNumber(row.breakdown.employment)}</span>
      ),
    },
    {
      key: 'incomeTax',
      label: '소득세',
      align: 'right',
      render: (row) => (
        <span className="text-[var(--toss-gray-4)]">{formatNumber(row.breakdown.incomeTax)}</span>
      ),
    },
    {
      key: 'deduction',
      label: '총공제',
      align: 'right',
      render: (row) => (
        <span className="font-bold text-red-600">{formatNumber(row.deduction)}</span>
      ),
    },
    {
      key: 'net',
      label: '실수령액',
      align: 'right',
      render: (row) => (
        <span className="font-bold text-[var(--accent)]">{formatNumber(row.net)}</span>
      ),
    },
    {
      key: 'deductionRate',
      label: '공제율',
      align: 'right',
      render: (row) => `${row.deductionRate}%`,
    },
  ], []);

  const handleCsvDownload = () => {
    const header = ['직원명', '총급여', '총공제', '실수령액', '공제율'];
    const body = rows.map((row) => [
      row.staff.name,
      row.gross,
      row.deduction,
      row.net,
      `${row.deductionRate}%`,
    ]);
    const csv = [header, ...body].map((row) => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `세전세후비교_${yearMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2 text-sm font-bold"
          />
          <button
            onClick={handleCsvDownload}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중입니다...</div>
      ) : (
        <>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)]">
            <ResponsiveTable<ComparisonRow>
              columns={columns}
              rows={rows}
              keyField="id"
              emptyMessage="데이터가 없습니다."
            />
          </div>

          {rows.length > 0 && (
            <div className="rounded-[var(--radius-md)] border-2 border-[var(--accent)] bg-[var(--accent)]/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                <span className="text-[var(--accent)]">전체 합계</span>
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    <span className="text-[var(--toss-gray-4)]">총급여 </span>
                    {formatNumber(totals.totalGross)}
                  </span>
                  <span>
                    <span className="text-[var(--toss-gray-4)]">총공제 </span>
                    <span className="text-red-600">{formatNumber(totals.totalDeduction)}</span>
                  </span>
                  <span>
                    <span className="text-[var(--toss-gray-4)]">실수령액 </span>
                    <span className="text-[var(--accent)]">{formatNumber(totals.totalNet)}</span>
                  </span>
                  <span>
                    <span className="text-[var(--toss-gray-4)]">공제율 </span>
                    {totals.totalRate}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {Object.keys(buckets).length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
              <h3 className="mb-3 text-sm font-bold text-[var(--foreground)]">실수령액 구간별 직원 수</h3>
              <div className="space-y-2">
                {Object.entries(buckets)
                  .sort()
                  .map(([label, count]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-xs font-bold text-[var(--toss-gray-4)]">{label}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all"
                          style={{ width: `${(count / maxBucket) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-bold text-[var(--toss-gray-4)]">{count}명</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

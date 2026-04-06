'use client';

import { useEffect, useMemo, useState } from 'react';
import { filterNonInterimPayrollRecords, getPayrollGrossPay } from '@/lib/payroll-records';
import {
  calculateEmployeeInsuranceDeductions,
  calculateIndustrialAccidentInsurance,
  EMPLOYEE_INSURANCE_RATES_2026,
  getIndustrialAccidentInsuranceInfo,
} from '@/lib/payroll-insurance-rates';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string;
  name: string;
  position: string;
  base: number;
  nps: number;
  hi: number;
  lci: number;
  ei: number;
  wc: number;
  employeeTotal: number;
  employerOnlyTotal: number;
};

type PayrollRecordRow = {
  staff_id: string | number;
  year_month?: string | null;
  record_type?: string | null;
  status?: string | null;
  gross_pay?: number | null;
  total_taxable?: number | null;
  total_taxfree?: number | null;
  base_salary?: number | null;
};

function isFinalizedPayrollRecord(record: PayrollRecordRow | null | undefined) {
  const status = String(record?.status ?? '').trim().toLowerCase();
  return status === '확정' || status === 'finalized' || status === 'confirmed';
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

export default function InsuranceEDI({
  staffs = [],
  selectedCo,
  user,
}: {
  staffs: any[];
  selectedCo: string;
  user: any;
}) {
  const [yearMonth, setYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selectedCompanyLabel = selectedCo || user?.company || '전체';
  const filteredStaffs = useMemo(
    () => (!selectedCo || selectedCo === '전체' ? staffs : staffs.filter((staff) => staff.company === selectedCo)),
    [selectedCo, staffs]
  );

  const industrialAccidentInfo = useMemo(
    () => getIndustrialAccidentInsuranceInfo(selectedCompanyLabel),
    [selectedCompanyLabel]
  );

  useEffect(() => {
    let cancelled = false;

    const loadFinalizedPayrollRows = async () => {
      if (filteredStaffs.length === 0) {
        setRows([]);
        return;
      }

      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('payroll_records')
          .select('staff_id, year_month, record_type, status, gross_pay, total_taxable, total_taxfree, base_salary')
          .eq('year_month', yearMonth);

        if (error) throw error;

        const filteredStaffIdSet = new Set(filteredStaffs.map((staff) => String(staff.id)));
        const finalizedRecordByStaffId = new Map<string, PayrollRecordRow>();

        for (const record of filterNonInterimPayrollRecords(((data || []) as unknown) as PayrollRecordRow[])) {
          const staffId = String(record.staff_id ?? '');
          if (!filteredStaffIdSet.has(staffId)) continue;
          if (!isFinalizedPayrollRecord(record)) continue;
          finalizedRecordByStaffId.set(staffId, record);
        }

        const computedRows: Row[] = filteredStaffs.flatMap((staff) => {
          const record = finalizedRecordByStaffId.get(String(staff.id));
          if (!record) return [];

          const payrollBase = getPayrollGrossPay(record);
          const base = Math.max(
            payrollBase,
            Number(record.base_salary ?? 0),
            Number(staff.base_salary ?? staff.base ?? 0)
          );
          const employeeInsurance = calculateEmployeeInsuranceDeductions(base);
          const industrialAccident = calculateIndustrialAccidentInsurance(base, selectedCompanyLabel);

          return [
            {
              id: String(staff.id),
              name: String(staff.name || ''),
              position: String(staff.position || ''),
              base,
              nps: employeeInsurance.nationalPension,
              hi: employeeInsurance.healthInsurance,
              lci: employeeInsurance.longTermCare,
              ei: employeeInsurance.employmentInsurance,
              wc: industrialAccident.employerAmount,
              employeeTotal: employeeInsurance.total,
              employerOnlyTotal: industrialAccident.employerAmount,
            },
          ];
        });

        if (!cancelled) setRows(computedRows);
      } catch (error) {
        console.warn('payroll_records finalized insurance EDI load failed:', error);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFinalizedPayrollRows();

    return () => {
      cancelled = true;
    };
  }, [filteredStaffs, selectedCompanyLabel, yearMonth]);

  const totalRow = rows.reduce(
    (accumulator, row) => ({
      nps: accumulator.nps + row.nps,
      hi: accumulator.hi + row.hi,
      lci: accumulator.lci + row.lci,
      ei: accumulator.ei + row.ei,
      wc: accumulator.wc + row.wc,
      employeeTotal: accumulator.employeeTotal + row.employeeTotal,
      employerOnlyTotal: accumulator.employerOnlyTotal + row.employerOnlyTotal,
    }),
    { nps: 0, hi: 0, lci: 0, ei: 0, wc: 0, employeeTotal: 0, employerOnlyTotal: 0 }
  );

  const generateEDI = () => {
    setGenerating(true);

    const lines: string[] = [];
    lines.push(`[4대보험 EDI 파일 - ${yearMonth}]`);
    lines.push(`생성일시: ${new Date().toLocaleString('ko-KR')}`);
    lines.push(`사업체: ${selectedCompanyLabel}`);
    lines.push(`산재보험 업종: ${industrialAccidentInfo.industryLabel}`);
    lines.push(`급여확정 대상: ${rows.length}명`);
    lines.push('');
    lines.push('번호,성명,직위,보험기준금액,국민연금,건강보험,장기요양보험,고용보험,산재보험(사업주),근로자부담합계,사업주부담합계');

    rows.forEach((row, index) => {
      lines.push(
        [
          index + 1,
          row.name,
          row.position,
          row.base,
          row.nps,
          row.hi,
          row.lci,
          row.ei,
          row.wc,
          row.employeeTotal,
          row.employerOnlyTotal,
        ].join(',')
      );
    });

    lines.push('');
    lines.push(
      ['합계', '', '', '', totalRow.nps, totalRow.hi, totalRow.lci, totalRow.ei, totalRow.wc, totalRow.employeeTotal, totalRow.employerOnlyTotal].join(',')
    );

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `4대보험EDI_${yearMonth}_${selectedCompanyLabel}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setGenerating(false);
  };

  const rateCards = [
    {
      id: 'NPS',
      label: '국민연금',
      rate: EMPLOYEE_INSURANCE_RATES_2026.nationalPension,
      desc: '근로자 부담 4.75%',
    },
    {
      id: 'HI',
      label: '건강보험',
      rate: EMPLOYEE_INSURANCE_RATES_2026.healthInsurance,
      desc: '근로자 부담 3.595%',
    },
    {
      id: 'LCI',
      label: '장기요양보험',
      rate: EMPLOYEE_INSURANCE_RATES_2026.longTermCare,
      desc: '근로자 부담 0.4724%',
    },
    {
      id: 'EI',
      label: '고용보험',
      rate: EMPLOYEE_INSURANCE_RATES_2026.employmentInsurance,
      desc: '근로자 부담 0.9%',
    },
    {
      id: 'WCI',
      label: '산재보험',
      rate: industrialAccidentInfo.employerRate,
      desc: `${industrialAccidentInfo.industryLabel} · 사업주 부담`,
    },
  ] as const;

  return (
    <div className="space-y-5 p-4 md:p-4" data-testid="insurance-edi-view">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">4대보험 EDI 파일 자동 생성</h2>
          <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
            해당 월 급여가 확정된 직원만 포함합니다. 산재보험은 회사 업종 기준 사업주 부담으로 표시합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            onChange={(event) => setYearMonth(event.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold outline-none"
          />
          <button
            onClick={generateEDI}
            disabled={generating || rows.length === 0}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            CSV 다운로드
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="text-xs font-medium text-[var(--toss-gray-4)]">
          기준 회사: <span className="font-bold text-[var(--foreground)]">{selectedCompanyLabel}</span>
        </div>
        <div
          className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-sm font-bold text-[var(--accent)]"
          data-testid="insurance-edi-count"
        >
          {rows.length}명
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {rateCards.map((type) => (
          <div
            key={type.id}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <p className="text-xs font-bold text-[var(--foreground)]">{type.label}</p>
            <p className="mt-0.5 text-lg font-bold text-[var(--accent)]">{formatPercent(type.rate)}</p>
            <p className="mt-0.5 text-[9px] text-[var(--toss-gray-3)]">{type.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          { label: '국민연금 합계', value: totalRow.nps, color: 'text-blue-600' },
          { label: '건강보험 합계', value: totalRow.hi, color: 'text-green-600' },
          { label: '장기요양 합계', value: totalRow.lci, color: 'text-teal-600' },
          { label: '고용보험 합계', value: totalRow.ei, color: 'text-orange-600' },
          { label: '산재보험 합계', value: totalRow.wc, color: 'text-rose-600' },
          { label: '근로자 부담 합계', value: totalRow.employeeTotal, color: 'text-[var(--accent)]' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 text-center"
          >
            <p className={`text-base font-bold ${card.color}`}>{card.value.toLocaleString()}</p>
            <p className="mt-0.5 text-[9px] text-[var(--toss-gray-3)]">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: '980px' }}>
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/60">
              <tr>
                {[
                  '성명',
                  '직위',
                  '보험기준금액',
                  '국민연금',
                  '건강보험',
                  '장기요양',
                  '고용보험',
                  '산재보험(사업주)',
                  '근로자 부담',
                  '사업주 부담',
                ].map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-3 py-3 text-[10px] font-semibold text-[var(--toss-gray-3)]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-[var(--toss-gray-3)]">
                    불러오는 중입니다...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-[var(--toss-gray-3)]">
                    확정된 급여 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    data-testid={`insurance-edi-row-${row.id}`}
                    className="border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-[var(--foreground)]">
                      {row.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--toss-gray-3)]">
                      {row.position || '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-[var(--foreground)]">
                      {row.base.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">{row.nps.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">{row.hi.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">{row.lci.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">{row.ei.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-rose-600">{row.wc.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-bold text-[var(--accent)]">
                      {row.employeeTotal.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-bold text-rose-600">
                      {row.employerOnlyTotal.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

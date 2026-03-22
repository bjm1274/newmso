'use client';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type TaxRow = {
  staff_id: string;
  staff_name: string;
  total_salary: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  pension: number;
  income_tax: number;
  local_tax: number;
  total_deduction: number;
  net_pay: number;
};

function isMissingSchemaError(error: any) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  return code.startsWith('PGRST') || message.includes('schema cache') || message.includes('Could not find the table');
}

export default function TaxAutoReport({ selectedCo = '전체' }: Record<string, unknown>) {
  const [taxData, setTaxData] = useState<TaxRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [reportStatus, setReportStatus] = useState('미신고');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const staffQuery = supabase.from('staff_members').select('id, name, company');
        const { data: staffRows, error: staffError } =
          selectedCo && selectedCo !== '전체'
            ? await staffQuery.eq('company', selectedCo)
            : await staffQuery;

        if (staffError) throw staffError;

        const staffIds = (staffRows || []).map((staff: any) => staff.id);
        if (!staffIds.length) {
          if (active) {
            setTaxData([]);
            setReportStatus('미신고');
          }
          return;
        }

        const { data: payrollRows, error: payrollError } = await supabase
          .from('payroll_records')
          .select('staff_id, gross_pay, total_deduction, net_pay, deduction_detail, year_month, record_type')
          .in('staff_id', staffIds)
          .gte('year_month', `${selectedYear}-01`)
          .lte('year_month', `${selectedYear}-12`)
          .neq('record_type', 'yearend');

        if (payrollError) throw payrollError;

        const byStaff = new Map<string, TaxRow>();
        const staffMap = new Map((staffRows || []).map((staff: any) => [String(staff.id), staff]));

        for (const row of payrollRows || []) {
          const staff = staffMap.get(String(row.staff_id));
          if (!staff) continue;

          const current =
            byStaff.get(String(row.staff_id)) ||
            {
              staff_id: String(row.staff_id),
              staff_name: staff.name,
              total_salary: 0,
              health_insurance: 0,
              long_term_care: 0,
              employment_insurance: 0,
              pension: 0,
              income_tax: 0,
              local_tax: 0,
              total_deduction: 0,
              net_pay: 0,
            };

          const detail = row.deduction_detail || {};
          current.total_salary += Number(row.gross_pay || 0);
          current.health_insurance += Number(detail.health_insurance || 0);
          current.long_term_care += Number(detail.long_term_care || 0);
          current.employment_insurance += Number(detail.employment_insurance || 0);
          current.pension += Number(detail.national_pension || 0);
          current.income_tax += Number(detail.income_tax || 0);
          current.local_tax += Number(detail.local_tax || 0);
          current.total_deduction += Number(row.total_deduction || 0);
          current.net_pay += Number(row.net_pay || 0);

          byStaff.set(String(row.staff_id), current);
        }

        const nextTaxData = Array.from(byStaff.values()).sort((left, right) => left.staff_name.localeCompare(right.staff_name));

        let nextStatus = '미신고';
        const { data: reportRows, error: reportError } = await supabase
          .from('tax_reports')
          .select('id, status')
          .eq('year', selectedYear)
          .eq('company_name', selectedCo);

        if (reportError && !isMissingSchemaError(reportError)) throw reportError;
        if (reportError && isMissingSchemaError(reportError)) {
          nextStatus = '저장소 미설정';
        } else if ((reportRows || []).length > 0) {
          nextStatus = '신고완료';
        }

        if (active) {
          setTaxData(nextTaxData);
          setReportStatus(nextStatus);
        }
      } catch (error: unknown) {
        console.error('tax auto report load failed:', error);
        if (active) {
          setTaxData([]);
          setReportStatus('조회 실패');
          setErrorMessage((error as Error)?.message || '세금 신고 데이터를 불러오지 못했습니다.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedYear, selectedCo]);

  const reportRows = useMemo(
    () =>
      taxData.map((item) => ({
        직원명: item.staff_name,
        연간총급여: item.total_salary,
        국민연금: item.pension,
        건강보험: item.health_insurance,
        장기요양: item.long_term_care,
        고용보험: item.employment_insurance,
        소득세: item.income_tax,
        지방소득세: item.local_tax,
        총공제액: item.total_deduction,
        실수령액: item.net_pay,
      })),
    [taxData]
  );

  const submitTaxReport = async () => {
    if (!taxData.length) {
      toast('신고할 급여 데이터가 없습니다.');
      return;
    }

    const payload = {
      year: selectedYear,
      company_name: selectedCo,
      report_type: 'payroll_withholding',
      report_date: new Date().toISOString(),
      data: reportRows,
      status: '신고완료',
    };

    const { error } = await supabase.from('tax_reports').insert([payload]);

    if (error) {
      console.error('tax auto report submit failed:', error);
      if (isMissingSchemaError(error)) {
        setReportStatus('저장소 미설정');
        toast('tax_reports 저장소가 설정되지 않아 자동신고 결과를 저장할 수 없습니다. CSV를 내려받아 별도 신고해 주세요.', 'success');
        return;
      }
      toast(`세금 신고 저장 중 오류가 발생했습니다: ${error.message}`, 'error');
      return;
    }

    setReportStatus('신고완료');
    toast('세금 자동신고 데이터를 저장했습니다.', 'success');
  };

  const downloadTaxReport = () => {
    const csv = [
      ['직원명', '연간총급여', '국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세', '총공제액', '실수령액'].join(','),
      ...reportRows.map((row) => Object.values(row).join(',')),
    ].join('\n');

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `세금자동신고_${selectedCo}_${selectedYear}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4" data-testid="payroll-tax-auto-report">
      <div className="flex gap-4 items-center">
        <label className="text-sm font-medium text-[var(--foreground)]">신고 연도</label>
        <select
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
          className="h-9 px-3 border border-[var(--border)] rounded-md text-sm font-medium focus:outline-none focus:border-[var(--accent)]"
        >
          {[2024, 2025, 2026].map((year) => (
            <option key={year} value={year.toString()}>
              {year}년
            </option>
          ))}
        </select>
        <span
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
            reportStatus === '신고완료'
              ? 'bg-emerald-100 text-emerald-700'
              : reportStatus === '저장소 미설정'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-[var(--page-bg)] text-[var(--toss-gray-4)]'
          }`}
        >
          {reportStatus}
        </span>
      </div>

      {errorMessage && (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 급여</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            ₩{taxData.reduce((sum, item) => sum + item.total_salary, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 세금·보험</p>
          <p className="text-lg font-semibold text-red-600">
            ₩{taxData.reduce((sum, item) => sum + item.total_deduction, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">신고 대상</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">{taxData.length}명</p>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-md)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--tab-bg)] flex justify-between items-center">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">세금 자동신고 현황</h3>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="tax-auto-report-download-button"
              onClick={downloadTaxReport}
              disabled={!taxData.length}
              className="px-3 py-2 bg-[var(--foreground)] text-white rounded-[var(--radius-md)] text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              CSV 다운로드
            </button>
            <button
              type="button"
              data-testid="tax-auto-report-submit-button"
              onClick={submitTaxReport}
              disabled={!taxData.length || loading || reportStatus === '신고완료'}
              className="px-3 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {reportStatus === '신고완료' ? '신고완료' : loading ? '불러오는 중...' : '신고 저장'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--tab-bg)] border-b border-[var(--border)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-[var(--foreground)] text-xs">직원명</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">연간총급여</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">건강보험</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">장기요양</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">고용보험</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">국민연금</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">소득세</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">지방소득세</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">총공제</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">실수령액</th>
              </tr>
            </thead>
            <tbody>
              {taxData.map((item) => (
                <tr key={item.staff_id} className="border-b border-[var(--border)] hover:bg-[var(--page-bg)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--foreground)] text-xs">{item.staff_name}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-[var(--foreground)] text-xs">₩{item.total_salary.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">₩{item.health_insurance.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">₩{item.long_term_care.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">₩{item.employment_insurance.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">₩{item.pension.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-red-600 text-xs">₩{item.income_tax.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-red-600 text-xs">₩{item.local_tax.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-red-600 text-xs">₩{item.total_deduction.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 text-xs">₩{item.net_pay.toLocaleString()}</td>
                </tr>
              ))}
              {!taxData.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-xs font-medium text-[var(--toss-gray-3)]">
                    {loading ? '급여 데이터를 불러오는 중입니다.' : '해당 연도에 확정된 급여 레코드가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export default function PayrollExport({ checkedIds = [], selectedCo, yearMonth: initialYm }: Record<string, unknown>) {
  const _checkedIds = (checkedIds as string[]) ?? [];
  const [yearMonth, setYearMonth] = useState((initialYm as string) || new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setYearMonth((initialYm as string) || new Date().toISOString().slice(0, 7));
  }, [initialYm]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setErrorMessage('');

      // FK join 대신 별도 쿼리로 조회 (PostgREST 관계 캐시 오류 방지)
      const { data: prData, error } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('year_month', yearMonth)
        .neq('record_type', 'interim');

      if (!active) return;

      if (error) {
        console.error('payroll export load failed:', error);
        setRecords([]);
        setErrorMessage(`급여대장을 불러오지 못했습니다: ${error.message}`);
        setLoading(false);
        return;
      }

      let list = prData || [];
      // staff_members 별도 조회 후 병합
      if (list.length > 0) {
        const staffIds = [...new Set(list.map((r: any) => r.staff_id))];
        const { data: staffData } = await supabase
          .from('staff_members')
          .select('id, name, company, department, bank_account, employee_no')
          .in('id', staffIds);
        const staffMap = Object.fromEntries((staffData || []).map((s: any) => [String(s.id), s]));
        list = list.map((r: any) => ({ ...r, staff_members: staffMap[String(r.staff_id)] || null }));
      }
      if (selectedCo && selectedCo !== '전체') {
        list = list.filter((record: any) => record.staff_members?.company === selectedCo);
      }
      if (_checkedIds.length > 0) {
        const idSet = new Set(_checkedIds.map((id: string) => String(id)));
        list = list.filter((record: any) => idSet.has(String(record.staff_id)));
      }

      setRecords(list);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [yearMonth, selectedCo, _checkedIds.join(',')]);

  const exportExcel = () => {
    const rows = records.map((record: any) => ({
      사번: record.staff_members?.employee_no || '',
      성명: record.staff_members?.name || '',
      부서: record.staff_members?.department || '',
      기본급: record.base_salary || 0,
      식대: record.meal_allowance || 0,
      차량: record.vehicle_allowance || 0,
      보육: record.childcare_allowance || 0,
      연구: record.research_allowance || 0,
      기타수당: (record.extra_allowance || 0) + (record.overtime_pay || 0) + (record.bonus || 0),
      과세총액: record.total_taxable || 0,
      비과세총액: record.total_taxfree || 0,
      공제합계: record.total_deduction || 0,
      실지급액: record.net_pay || 0,
      선지급: record.advance_pay || 0,
      정산상태: record.status || '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '급여대장');
    XLSX.writeFile(workbook, `급여대장_${yearMonth}.xlsx`);
  };

  const exportSAM = () => {
    const header = '데이터구분,거래일자,입금대상코드,입금계좌번호,입금예정금액,입금자명,입금통장메모,예금주주민번호';
    const rows = records
      .filter((record: any) => Number(record.net_pay) > 0 && record.staff_members?.bank_account)
      .map((record: any) => {
        const account = record.staff_members?.bank_account || '';
        const name = record.staff_members?.name || '';
        const amount = Number(record.net_pay) || 0;
        return `20,${(yearMonth as string).replace('-', '')}25,110,${account},${amount},${name},${yearMonth} 급여,`;
      });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `이체_SAM_${yearMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm">
      <div className="pb-2 border-b border-[var(--border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">급여대장 내보내기</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">엑셀 및 은행 이체 CSV를 내려받습니다.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="month"
          value={yearMonth as string}
          onChange={(event) => setYearMonth(event.target.value)}
          className="h-9 px-3 border border-[var(--border)] rounded-md text-sm font-medium flex-1"
        />
        <span className="text-xs text-[var(--toss-gray-3)] shrink-0">({records.length}건)</span>
      </div>

      {errorMessage && (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="payroll-export-excel-button"
          onClick={exportExcel}
          disabled={loading || records.length === 0}
          className="flex-1 py-2.5 bg-[var(--accent)] text-white text-xs font-medium rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
        >
          엑셀
        </button>
        <button
          type="button"
          data-testid="payroll-export-bank-button"
          onClick={exportSAM}
          disabled={loading || records.length === 0}
          className="flex-1 py-2.5 bg-[var(--foreground)] text-white text-xs font-medium rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
        >
          이체 CSV
        </button>
      </div>
    </div>
  );
}

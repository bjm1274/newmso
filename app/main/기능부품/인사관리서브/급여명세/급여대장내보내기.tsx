'use client';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export default function PayrollExport({ staffs = [], checkedIds = [], selectedCo, yearMonth: initialYm }: any) {
  const [yearMonth, setYearMonth] = useState(initialYm || new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setYearMonth(initialYm || new Date().toISOString().slice(0, 7));
  }, [initialYm]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('payroll_records')
        .select('*, staff_members(name, company, department, bank_name, bank_account, employee_no)')
        .eq('year_month', yearMonth)
        .not('record_type', 'eq', 'interim');
      let list = data || [];
      if (selectedCo && selectedCo !== '전체') {
        list = list.filter((r: any) => r.staff_members?.company === selectedCo);
      }
      if (checkedIds.length > 0) {
        const idSet = new Set(checkedIds.map((id: any) => String(id)));
        list = list.filter((r: any) => idSet.has(String(r.staff_id)));
      }
      setRecords(list);
      setLoading(false);
    })();
  }, [yearMonth, selectedCo, checkedIds.join(',')]);

  const exportExcel = () => {
    const rows = records.map((r: any) => ({
      사번: r.staff_members?.employee_no || '',
      성명: r.staff_members?.name || '',
      부서: r.staff_members?.department || '',
      기본급: r.base_salary || 0,
      식대: r.meal_allowance || 0,
      차량: r.vehicle_allowance || 0,
      보육: r.childcare_allowance || 0,
      연구: r.research_allowance || 0,
      기타수당: (r.extra_allowance || 0) + (r.overtime_pay || 0) + (r.bonus || 0),
      과세총액: r.total_taxable || 0,
      비과세총액: r.total_taxfree || 0,
      공제합계: r.total_deduction || 0,
      실지급액: r.net_pay || 0,
      선지급: r.advance_pay || 0,
      정산상태: r.status || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '급여대장');
    XLSX.writeFile(wb, `급여대장_${yearMonth}.xlsx`);
  };

  const exportSAM = () => {
    const header = '데이터구분,거래일자,입금은행코드,입금계좌번호,입금예정금액,입금자명,입금통장메모,예금주주민번호';
    const rows = records
      .filter((r: any) => r.net_pay > 0 && (r.staff_members?.bank_account || r.bank_account))
      .map((r: any) => {
        const acc = r.staff_members?.bank_account || r.bank_account || '';
        const name = r.staff_members?.name || '';
        const amt = r.net_pay || 0;
        return `20,${yearMonth.replace('-', '')}25,110,${acc},${amt},${name},${yearMonth}급여,`;
      });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `이체_SAM_${yearMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-[var(--toss-card)] rounded-lg border border-[var(--toss-border)] shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">대장 내보내기</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">엑셀 · 이체용 CSV</p>
      </div>
      <div className="flex items-center gap-2">
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium flex-1" />
        <span className="text-xs text-[var(--toss-gray-3)] shrink-0">({records.length}건)</span>
      </div>
      <div className="flex gap-2">
        <button onClick={exportExcel} disabled={loading || records.length === 0} className="flex-1 py-2.5 bg-[var(--toss-blue)] text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
          엑셀
        </button>
        <button onClick={exportSAM} disabled={loading || records.length === 0} className="flex-1 py-2.5 bg-[var(--foreground)] text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
          이체 CSV
        </button>
      </div>
    </div>
  );
}

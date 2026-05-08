'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildExportRows,
  generateEdiTxt,
  generateExcelCsv,
  generateHometaxTxt,
  type PayrollExportRow,
  type TaxFileCompanyInfo,
} from '@/lib/withholding-tax-file';

type Props = { staffs: any[]; selectedCo: string };

export default function TaxFileGenerator({ staffs, selectedCo }: Props) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(
    (new Date().getMonth() + 1).toString().padStart(2, '0'),
  );
  const [exportType, setExportType] = useState<'hometax' | 'edi' | 'excel'>('hometax');
  const [isGenerating, setIsGenerating] = useState(false);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [companyInfo, setCompanyInfo] = useState<TaxFileCompanyInfo>({
    companyName: selectedCo === '전체' ? '' : selectedCo,
    businessNumber: '',
    representativeName: '',
  });

  const yearMonth = `${selectedYear}-${selectedMonth}`;

  // 확정된 급여 레코드 수 미리 조회
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targetStaffIds = staffs
        .filter((s) => selectedCo === '전체' || s.company === selectedCo)
        .map((s) => s.id)
        .filter(Boolean);
      if (targetStaffIds.length === 0) {
        setRecordCount(0);
        return;
      }
      const { count } = await supabase
        .from('payroll_records')
        .select('id', { count: 'exact', head: true })
        .eq('year_month', yearMonth)
        .in('staff_id', targetStaffIds)
        .in('status', ['확정', 'finalized']);
      if (!cancelled) setRecordCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [yearMonth, selectedCo, staffs.length]);

  // 회사 정보 조회
  useEffect(() => {
    if (selectedCo === '전체') return;
    (async () => {
      const { data } = await supabase
        .from('companies')
        .select('name, business_no, ceo_name')
        .eq('name', selectedCo)
        .maybeSingle();
      if (data) {
        setCompanyInfo({
          companyName: String(data.name || selectedCo),
          businessNumber: String(data.business_no || ''),
          representativeName: String(data.ceo_name || ''),
        });
      }
    })();
  }, [selectedCo]);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    try {
      const targetStaffIds = staffs
        .filter((s) => selectedCo === '전체' || s.company === selectedCo)
        .map((s) => s.id)
        .filter(Boolean);

      if (targetStaffIds.length === 0) {
        setIsGenerating(false);
        return;
      }

      // 확정된 급여 데이터 조회
      const { data: payrollData } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('year_month', yearMonth)
        .in('staff_id', targetStaffIds)
        .in('status', ['확정', 'finalized']);

      if (!payrollData || payrollData.length === 0) {
        alert('해당 월에 확정된 급여 데이터가 없습니다.');
        setIsGenerating(false);
        return;
      }

      // staff 맵 생성
      const staffMap = new Map<string, Record<string, unknown>>();
      for (const s of staffs) {
        if (s.id) staffMap.set(String(s.id), s);
      }

      const rows: PayrollExportRow[] = buildExportRows(
        payrollData as Record<string, unknown>[],
        staffMap,
      );

      let content: string;
      let fileName: string;
      let mimeType: string;

      if (exportType === 'hometax') {
        content = generateHometaxTxt(rows, companyInfo, yearMonth);
        fileName = `${companyInfo.companyName}_${yearMonth}_홈택스_원천세.txt`;
        mimeType = 'text/plain;charset=utf-8';
      } else if (exportType === 'edi') {
        content = generateEdiTxt(rows, companyInfo, yearMonth);
        fileName = `${companyInfo.companyName}_${yearMonth}_4대보험_EDI.txt`;
        mimeType = 'text/plain;charset=utf-8';
      } else {
        content = generateExcelCsv(rows, companyInfo, yearMonth);
        fileName = `${companyInfo.companyName}_${yearMonth}_급여대장.csv`;
        mimeType = 'text/csv;charset=utf-8';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('원천징수 파일 생성 실패:', err);
      alert('파일 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [staffs, selectedCo, yearMonth, exportType, companyInfo]);

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm animate-in fade-in duration-500"
      data-testid="payroll-utility-tax-file"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-indigo-500/10 text-base font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
          📑
        </div>
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">
            홈택스/EDI 신고 파일 자동 생성
          </h3>
          {recordCount !== null && (
            <p className="mt-0.5 text-[10px] font-semibold text-[var(--toss-gray-3)]">
              {yearMonth} 확정 급여: {recordCount}건
            </p>
          )}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
            귀속 연월
          </label>
          <div className="flex gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none"
            >
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
            다운로드 포맷 (기관양식)
          </label>
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value as 'hometax' | 'edi' | 'excel')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold outline-none"
          >
            <option value="hometax">국세청 홈택스 원천세 전자신고 (TXT)</option>
            <option value="edi">4대사회보험 EDI 일괄업로드 (TXT)</option>
            <option value="excel">사내 보고용 통합 급여대장 (CSV)</option>
          </select>
        </div>
      </div>

      <div className="mb-3 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/10 p-3">
        <p className="flex gap-2 text-[11px] font-bold leading-relaxed text-amber-800 dark:text-amber-400">
          <span className="shrink-0">⚠️</span>
          <span>
            해당 월에 &quot;급여 확정&quot; 처리가 완료된 임직원 데이터만 변환됩니다.
            <br />
            홈택스나 EDI 시스템에 업로드 전, 반드시 테스트 업로드 기능을 이용하여 오류 여부를
            검증하세요.
          </span>
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={isGenerating || recordCount === 0}
          data-testid="payroll-tax-download-button"
          className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <svg
                className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              파일 변환 중...
            </>
          ) : (
            <>
              <span>📥</span>{' '}
              {recordCount === 0
                ? '확정된 급여 데이터 없음'
                : `${exportType === 'excel' ? 'CSV' : '수신파일(TXT)'} 생성 및 다운로드`}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

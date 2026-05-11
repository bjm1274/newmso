'use client';

/**
 * StepOutput.tsx — STEP 4: 출력 단계
 *
 * 포함 뷰:
 *   - 원천징수 파일(#45): 신고 유형 선택 + 파일 생성
 *   - 급여명세서 인쇄 (print-only 영역 포함)
 *
 * JM2: useState 최소 (선택값만)
 * JM4: any 금지
 * JM6: print 미디어, .no-print / .print-only aria
 */

import React, { useState } from 'react';
import { Printer, Download } from 'lucide-react';
import Badge from '@/app/components/v2/Badge';
import Button from '@/app/components/v2/Button';
import Card from '@/app/components/v2/Card';
import { EMPLOYEES, PAYROLL_RECORDS, WITHHOLDING_SUMMARY, formatKRW } from '../dummy-data';

// ── 서브뷰 ID ───────────────────────────────────────────────────────────────────

export type Step4View = 'withholding' | 'payslip';

interface Props {
  activeView: Step4View;
}

// ── 원천징수 파일 (#45) ─────────────────────────────────────────────────────────

type ReportType  = 'monthly' | 'yearend';
type FileFormat  = 'hometax' | 'xlsx';

function ViewWithholding() {
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [fileFormat, setFileFormat] = useState<FileFormat>('hometax');
  const { incomeTaxTotal, localIncomeTaxTotal, targetCount } = WITHHOLDING_SUMMARY;

  return (
    <section aria-labelledby="ttl-wh">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-wh" className="text-base font-bold flex items-center gap-2">
          원천징수 파일 <Badge color="gray">#45</Badge>
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" iconLeft={<Download size={14} />}>미리보기</Button>
          <Button variant="primary"   size="sm" iconLeft={<Download size={14} />}>파일 생성</Button>
        </div>
      </div>
      <Card padding="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="wh-report-type" className="block text-xs text-[var(--toss-gray-4)] mb-1.5">신고 유형</label>
            <select
              id="wh-report-type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              aria-label="신고 유형 선택"
              className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="monthly">매월 원천징수 이행상황 신고서</option>
              <option value="yearend">근로소득 연말정산</option>
            </select>
          </div>
          <div>
            <label htmlFor="wh-file-format" className="block text-xs text-[var(--toss-gray-4)] mb-1.5">파일 형식</label>
            <select
              id="wh-file-format"
              value={fileFormat}
              onChange={(e) => setFileFormat(e.target.value as FileFormat)}
              aria-label="파일 형식 선택"
              className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="hometax">국세청 홈택스 (hometax)</option>
              <option value="xlsx">엑셀 (.xlsx)</option>
            </select>
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] bg-[var(--muted)] p-3 flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--toss-gray-4)]">소득세 합계</span>
            <span className="font-semibold">{formatKRW(incomeTaxTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--toss-gray-4)]">지방소득세 합계</span>
            <span className="font-semibold">{formatKRW(localIncomeTaxTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--toss-gray-4)]">대상 인원</span>
            <span className="font-semibold">{targetCount}명</span>
          </div>
        </div>
      </Card>
    </section>
  );
}

// ── 급여명세서 인쇄 ────────────────────────────────────────────────────────────

function ViewPayslip() {
  const [selectedEmpId, setSelectedEmpId] = useState(EMPLOYEES[0].id);
  const emp     = EMPLOYEES.find((e) => e.id === selectedEmpId) ?? EMPLOYEES[0];
  const record  = PAYROLL_RECORDS.find((r) => r.employeeId === selectedEmpId);

  const totalEarnings  = record?.totalEarnings  ?? 0;
  const totalDeductions= record?.totalDeductions ?? 0;
  const netPay         = record?.netPay          ?? 0;

  const earningItems = [
    { label: '기본급',       value: record?.baseSalary       ?? 0 },
    { label: '연장수당',     value: record?.overtimePay      ?? 0 },
    { label: '야간수당',     value: record?.nightPay         ?? 0 },
    { label: '식대(비과세)', value: record?.mealAllowance    ?? 0 },
  ];

  const deductItems = [
    { label: '국민연금',  value: record?.nationalPension     ?? 0 },
    { label: '건강보험',  value: record?.healthInsurance     ?? 0 },
    { label: '고용보험',  value: record?.employmentInsurance ?? 0 },
    { label: '소득세',    value: record?.incomeTax           ?? 0 },
  ];

  return (
    <section aria-labelledby="ttl-ps">
      {/* 컨트롤 영역 — 인쇄 시 숨김 */}
      <div className="flex items-center justify-between mb-3 no-print">
        <h2 id="ttl-ps" className="text-base font-bold flex items-center gap-2">
          급여명세서 <Badge color="gray">인쇄용</Badge>
        </h2>
        <div className="flex gap-2">
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            aria-label="직원 선택"
            className="h-9 px-3 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
          >
            {EMPLOYEES.map((e) => (
              <option key={e.id} value={e.id}>{e.name} — {e.dept}</option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Printer size={14} />}
            onClick={() => window.print()}
            aria-label="급여명세서 인쇄"
          >
            인쇄
          </Button>
        </div>
      </div>

      {/* 인쇄 대상 영역 — data-print="true" */}
      <Card padding="none" className="max-w-2xl payslip-print-area">
        <div className="p-6 print:p-6">
          <h1 className="text-lg font-bold text-center mb-4">급 여 명 세 서</h1>
          <div className="grid grid-cols-2 gap-1.5 mb-4 text-sm">
            <div>지급 기간: 2026년 04월</div>
            <div>발행일: 2026-05-12</div>
            <div>직원명: {emp.name}</div>
            <div>부서: {emp.dept}</div>
            <div>직책: {emp.role}</div>
            <div>입사일: {emp.hireDate}</div>
          </div>

          <table className="w-full border-collapse text-sm" aria-label="급여 지급 내역">
            <thead>
              <tr className="bg-[var(--muted)] print:bg-[#f0f0f0]">
                <th colSpan={2} scope="colgroup" className="border border-[var(--border)] px-3 py-2 text-left font-semibold print:border-black">
                  지급 항목
                </th>
                <th colSpan={2} scope="colgroup" className="border border-[var(--border)] px-3 py-2 text-left font-semibold print:border-black">
                  공제 항목
                </th>
              </tr>
            </thead>
            <tbody>
              {earningItems.map((ei, i) => {
                const di = deductItems[i];
                return (
                  <tr key={i}>
                    <td className="border border-[var(--border)] px-3 py-2 print:border-black">{ei.label}</td>
                    <td className="border border-[var(--border)] px-3 py-2 text-right print:border-black">{formatKRW(ei.value)}</td>
                    <td className="border border-[var(--border)] px-3 py-2 print:border-black">{di?.label ?? ''}</td>
                    <td className="border border-[var(--border)] px-3 py-2 text-right print:border-black">{di ? formatKRW(di.value) : ''}</td>
                  </tr>
                );
              })}
              <tr className="font-bold">
                <td className="border border-[var(--border)] px-3 py-2 print:border-black">지급 합계</td>
                <td className="border border-[var(--border)] px-3 py-2 text-right print:border-black">{formatKRW(totalEarnings)}</td>
                <td className="border border-[var(--border)] px-3 py-2 print:border-black">공제 합계</td>
                <td className="border border-[var(--border)] px-3 py-2 text-right print:border-black">{formatKRW(totalDeductions)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="font-bold text-base">
                <td colSpan={4} className="border border-[var(--border)] px-3 py-2.5 text-right print:border-black">
                  실수령액: {formatKRW(netPay)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-4 text-xs text-[var(--toss-gray-4)] text-center">
            이 명세서는 「근로기준법」 제48조에 따라 발급됩니다.
          </p>
        </div>
      </Card>

      {/* 인쇄 전용 글로벌 스타일 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .payslip-print-area { border: 1px solid #000 !important; max-width: 640px; margin: auto; }
          .payslip-print-area table th,
          .payslip-print-area table td { border: 1px solid #000 !important; }
          .payslip-print-area table thead tr { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </section>
  );
}

// ── 메인 내보내기 ──────────────────────────────────────────────────────────────

export default function StepOutput({ activeView }: Props) {
  return (
    <>
      {activeView === 'withholding' && <ViewWithholding />}
      {activeView === 'payslip'     && <ViewPayslip />}
    </>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  alphaColor,
  fetchDocumentDesignStore,
  resolveDocumentDesign,
} from '@/lib/document-designs';

export default function PayrollSlipPDF({ staff, record, yearMonth }: any) {
  const printRef = useRef<HTMLDivElement>(null);
  const [design, setDesign] = useState(() => resolveDocumentDesign(null, 'payroll_slip'));

  useEffect(() => {
    const load = async () => {
      const store = await fetchDocumentDesignStore();
      setDesign(resolveDocumentDesign(store, 'payroll_slip', staff?.company));
    };

    load().catch((error) => {
      console.error('급여명세서 PDF 서식 로딩 실패:', error);
    });
  }, [staff?.company]);

  const handlePrint = () => {
    if (!printRef.current) return;

    const popup = window.open('', '_blank');
    if (!popup) return;

    popup.document.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>${design.title}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { margin: 0; font-family: 'Noto Sans KR', sans-serif; background: #fff; color: #0f172a; }
            .root { padding: 12mm; }
          </style>
        </head>
        <body>
          <div class="root">${printRef.current.innerHTML}</div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
    popup.close();
  };

  const companyName = staff?.company || design.companyLabel || 'SY INC.';
  const displayTitle = `${companyName} ${design.title}`;
  const displayMonth = String(yearMonth || new Date().toISOString().slice(0, 7));
  const netPay = Number(record?.net_pay || 0);
  const totalDeduction = Number(record?.total_deduction || 0);
  const totalPay =
    Number(record?.total_taxable || 0) +
    Number(record?.total_taxfree || 0) ||
    Number(record?.base_salary || staff?.base_salary || 0);

  return (
    <div className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
      <div
        ref={printRef}
        className="overflow-hidden rounded-[20px] bg-white"
        style={{ border: `1px solid ${design.borderColor}` }}
      >
        <div
          className="px-6 py-6 text-white"
          style={{ background: `linear-gradient(135deg, ${design.primaryColor}, ${alphaColor(design.primaryColor, 0.84)})` }}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-80">{companyName}</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">{displayTitle}</h3>
          <p className="mt-1 text-sm opacity-85">{displayMonth}</p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          <div className="rounded-[14px] p-4" style={{ backgroundColor: alphaColor(design.primaryColor, 0.08) }}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--toss-gray-3)]">직원</p>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">
              {staff?.name || '-'} / {staff?.department || '-'}
            </p>
          </div>
          <div className="rounded-[14px] p-4" style={{ backgroundColor: alphaColor(design.primaryColor, 0.08) }}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--toss-gray-3)]">지급 합계</p>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{totalPay.toLocaleString()}원</p>
          </div>
          <div className="rounded-[14px] p-4" style={{ backgroundColor: alphaColor(design.primaryColor, 0.08) }}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--toss-gray-3)]">실지급액</p>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{netPay.toLocaleString()}원</p>
          </div>
        </div>

        <div className="border-t px-6 py-5" style={{ borderColor: design.borderColor }}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[var(--foreground)]">공제 합계</span>
            <span className="font-bold text-red-600">{totalDeduction.toLocaleString()}원</span>
          </div>
          {design.footerText && (
            <p className="mt-4 text-[11px] text-[var(--toss-gray-3)]">{design.footerText}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handlePrint}
        className="mt-4 w-full rounded-[12px] px-4 py-2.5 text-sm font-semibold text-white"
        style={{ backgroundColor: design.primaryColor }}
      >
        PDF 인쇄
      </button>
    </div>
  );
}

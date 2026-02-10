'use client';
import { useRef } from 'react';

export default function PayrollSlipPDF({ staff, record, yearMonth }: any) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>급여명세서</title>
      <style>body{font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto}
      table{width:100%;border-collapse:collapse} td,th{padding:8px;border:1px solid #ddd}
      .title{font-size:18px;font-weight:bold;margin-bottom:20px}
      .total{font-size:16px;font-weight:bold;color:#2563eb}
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    w.document.close();
    w.print();
    w.close();
  };

  const base = record?.base_salary ?? staff?.base_salary ?? staff?.base ?? 0;
  const net = record?.net_pay ?? 0;

  return (
    <div ref={printRef} className="p-6 bg-white border border-gray-200 rounded-2xl">
      <div className="title mb-6">급여명세서</div>
      <p className="text-sm font-bold text-gray-600 mb-4">{yearMonth} · {staff?.name}</p>
      <table>
        <tbody>
          <tr><td>기본급</td><td className="text-right">{base.toLocaleString()}원</td></tr>
          <tr><td>식대</td><td className="text-right">{(record?.meal_allowance ?? staff?.meal_allowance ?? 0).toLocaleString()}원</td></tr>
          <tr><td>공제합계</td><td className="text-right text-red-600">-{(record?.total_deduction ?? 0).toLocaleString()}원</td></tr>
          <tr><td className="font-bold">실지급액</td><td className="text-right font-bold text-blue-600 total">{net.toLocaleString()}원</td></tr>
        </tbody>
      </table>
      <button onClick={handlePrint} className="mt-4 w-full py-3 bg-blue-600 text-white text-xs font-black rounded-xl">
        PDF 인쇄
      </button>
    </div>
  );
}

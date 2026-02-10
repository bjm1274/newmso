'use client';
export default function DeductionSummary({ base }: { base: number }) {
  const pension = Math.floor(base * 0.045);
  const health = Math.floor(base * 0.03545);
  return (
    <div className="border border-gray-200 p-6 bg-white rounded-none shadow-sm">
      <h3 className="text-[11px] font-black text-red-500 uppercase mb-4 tracking-widest">법정 공제 (Deductions)</h3>
      <div className="space-y-3">
        <div className="flex justify-between text-xs font-bold text-gray-500"><span>국민연금</span><span className="text-red-400">-{pension.toLocaleString()}원</span></div>
        <div className="flex justify-between text-xs font-bold text-gray-500"><span>건강보험</span><span className="text-red-400">-{health.toLocaleString()}원</span></div>
      </div>
    </div>
  );
}
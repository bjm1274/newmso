'use client';
export default function DeductionSummary({ base }: { base: number }) {
  const pension = Math.floor(base * 0.045);
  const health = Math.floor(base * 0.03545);
  return (
    <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-lg shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">법정 공제</h3>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]"><span>국민연금</span><span className="text-red-500">-{pension.toLocaleString()}원</span></div>
        <div className="flex justify-between text-xs font-medium text-[var(--toss-gray-4)]"><span>건강보험</span><span className="text-red-500">-{health.toLocaleString()}원</span></div>
      </div>
    </div>
  );
}
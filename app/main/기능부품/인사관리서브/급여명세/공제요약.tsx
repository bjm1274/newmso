'use client';
export default function DeductionSummary({ base }: { base: number }) {
  const pension = Math.floor(base * 0.045);
  const health = Math.floor(base * 0.03545);
  return (
    <div className="border border-gray-200 p-4 bg-white rounded-lg shadow-sm">
      <div className="pb-2 border-b border-gray-100 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">법정 공제</h3>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-medium text-gray-600"><span>국민연금</span><span className="text-red-500">-{pension.toLocaleString()}원</span></div>
        <div className="flex justify-between text-xs font-medium text-gray-600"><span>건강보험</span><span className="text-red-500">-{health.toLocaleString()}원</span></div>
      </div>
    </div>
  );
}
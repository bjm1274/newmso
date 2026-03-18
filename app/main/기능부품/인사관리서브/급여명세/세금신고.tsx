'use client';
export default function TaxReporter({ employees }: { employees?: any[] }) {
  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm">
      <div className="pb-2 border-b border-[var(--border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">원천세 신고</h3>
      </div>
      <button className="w-full py-2.5 bg-[var(--page-bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-medium text-[var(--accent)] hover:bg-[var(--toss-blue-light)]">
        국세청 신고 데이터 추출 (SAM)
      </button>
    </div>
  );
}
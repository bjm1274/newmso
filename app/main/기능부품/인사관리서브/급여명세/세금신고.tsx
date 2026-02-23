'use client';
export default function TaxReporter({ employees }: { employees?: any[] }) {
  return (
    <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-lg shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">원천세 신고</h3>
      </div>
      <button className="w-full py-2.5 bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-lg text-xs font-medium text-[var(--toss-blue)] hover:bg-[var(--toss-blue-light)]">
        국세청 신고 데이터 추출 (SAM)
      </button>
    </div>
  );
}
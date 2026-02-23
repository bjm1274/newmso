'use client';
export default function MessageTemplate() {
  return (
    <div className="app-card p-4 bg-[var(--toss-card)] rounded-lg shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">알림톡 설정</h3>
      </div>
      <div className="p-3 bg-[var(--toss-blue-light)] rounded-lg border border-[var(--toss-blue)]/30 text-xs font-medium text-[var(--toss-blue)] leading-relaxed">
        [박철홍정형외과] 급여명세서가 발송되었습니다. 링크를 클릭해 확인하세요.
      </div>
    </div>
  );
}
'use client';
// 급여정산 3단계: 완료 화면 (순수 추출 — 인라인 JSX → props)
export function Step3Complete({ onRestart }: { onRestart: () => void }) {
  return (
    <div data-testid="salary-settlement-complete-step" className="py-10 text-center space-y-5 animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto">✓</div>
      <h3 className="text-xl font-bold text-[var(--foreground)]">정산이 완료되었습니다</h3>
      <p className="text-sm text-[var(--toss-gray-3)]">명세서가 생성되었습니다. 대장에서 확인하세요.</p>
      <button onClick={onRestart} className="px-4 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:opacity-90">다시 정산하기</button>
    </div>
  );
}

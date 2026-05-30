'use client';
// 급여정산 2단계: 검산 리포트 패널 (순수 추출 — 인라인 JSX → props)
import type { buildPayrollVerificationReport } from '@/lib/payroll-governance';

type VerificationReport = ReturnType<typeof buildPayrollVerificationReport>;

export function VerificationReportPanel({ report }: { report: VerificationReport }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">검산 리포트</p>
          <p className="text-xs text-[var(--toss-gray-3)]">
            오류 {report.errorCount}건 · 경고 {report.warningCount}건 · 참고 {report.infoCount}건
          </p>
        </div>
        <div className="text-right text-xs text-[var(--toss-gray-3)]">
          <p>실지급 합계 ₩{report.netTotal.toLocaleString()}</p>
          <p>총 공제 ₩{report.deductionTotal.toLocaleString()}</p>
        </div>
      </div>
      {report.issues.length > 0 ? (
        <div className="mt-3 space-y-2">
          {report.issues.slice(0, 6).map((issue, index) => (
            <div
              key={`${issue.code}-${issue.staffId || 'common'}-${index}`}
              className={`rounded-lg px-3 py-2 text-xs ${
                issue.level === 'error'
                  ? 'border border-rose-200 bg-rose-50 text-rose-700'
                  : issue.level === 'warning'
                    ? 'border border-amber-200 bg-amber-50 text-amber-700'
                    : 'border border-sky-200 bg-sky-50 text-sky-700'
              }`}
            >
              {issue.message}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          검산 결과 치명적인 오류 없이 정산을 진행할 수 있습니다.
        </p>
      )}
    </div>
  );
}

'use client';

import type { DischargeRuleAnalysis, DischargeRuleChecklistItem, DischargeRuleIssue } from '@/lib/discharge-review-rules';

function getStatusTone(status: DischargeRuleChecklistItem['status'] | DischargeRuleIssue['severity']) {
    switch (status) {
        case 'critical':
            return 'border-red-200 bg-red-50 text-red-700';
        case 'warning':
            return 'border-orange-200 bg-orange-50 text-orange-700';
        case 'review':
            return 'border-amber-200 bg-amber-50 text-amber-700';
        default:
            return 'border-green-200 bg-green-50 text-green-700';
    }
}

export default function DischargeRuleAnalysisPanel({ analysis }: { analysis: DischargeRuleAnalysis | null }) {
    if (!analysis) return null;

    return (
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 shadow-sm space-y-4" data-testid="discharge-rule-analysis">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    규정 기반 점검
                </h3>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                    PDF 기준
                </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                    <p className="text-lg font-bold text-red-600" data-testid="discharge-rule-critical-count">{analysis.summary.critical}</p>
                    <p className="text-[10px] font-bold text-red-500 mt-1">Critical</p>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-center">
                    <p className="text-lg font-bold text-orange-600">{analysis.summary.warning}</p>
                    <p className="text-[10px] font-bold text-orange-500 mt-1">Warning</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="text-lg font-bold text-amber-600">{analysis.summary.review}</p>
                    <p className="text-[10px] font-bold text-amber-500 mt-1">Review</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                    <p className="text-lg font-bold text-blue-600">{analysis.summary.missing}</p>
                    <p className="text-[10px] font-bold text-blue-500 mt-1">누락</p>
                </div>
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-center">
                    <p className="text-lg font-bold text-purple-600">{analysis.summary.overuse}</p>
                    <p className="text-[10px] font-bold text-purple-500 mt-1">과잉 의심</p>
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">규정 체크리스트</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {analysis.checklist.map((item) => (
                        <div
                            key={item.key}
                            className={`rounded-xl border p-3 ${getStatusTone(item.status)}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-[var(--foreground)]">{item.label}</p>
                                <span className="text-[10px] font-bold uppercase text-[var(--toss-gray-3)]">{item.status}</span>
                            </div>
                            <p className="mt-1 text-[11px] font-medium text-[var(--toss-gray-5)] leading-relaxed">{item.detail}</p>
                            <p className="mt-2 text-[10px] font-medium text-[var(--toss-gray-3)]">{item.basis}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">규정 경고</p>
                {analysis.issues.length === 0 ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
                        현재 규정 기준으로 뚜렷한 경고는 감지되지 않았습니다.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {analysis.issues.map((issue, idx) => (
                            <div
                                key={issue.key}
                                data-testid={`discharge-rule-issue-${idx}`}
                                className={`rounded-xl border p-4 ${getStatusTone(issue.severity)}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-bold text-[var(--foreground)]">{issue.title}</p>
                                    <span className="text-[10px] font-bold uppercase text-[var(--toss-gray-3)]">{issue.severity}</span>
                                </div>
                                <p className="mt-1 text-xs font-medium text-[var(--toss-gray-5)] leading-relaxed">{issue.detail}</p>
                                <p className="mt-2 text-[10px] font-medium text-[var(--toss-gray-3)]">{issue.basis}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

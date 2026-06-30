'use client';

import type { DischargeRuleAnalysis } from '@/lib/discharge-review-rules';
import { BottomSheet } from '@/app/components/BottomSheet';
import DischargeRuleAnalysisPanel from '../퇴원심사규정패널';

export type CompareResult = {
  matched: string[];
  missing: string[];
  extra: string[];
};

export type 보완요청시트Props = {
  open: boolean;
  onClose: () => void;
  compareResult: CompareResult | null;
  ruleAnalysis: DischargeRuleAnalysis | null;
  aiResult: string;
  aiLoading: boolean;
  onRequestAi: () => void;
  onAutoCompare: () => void;
  canAutoCompare: boolean;
};

/**
 * 모바일 보완요청·점검 BottomSheet.
 * - 데스크탑의 우측/하단 점검 패널을 시트로 통합 노출한다.
 * - 자동 비교 결과 · 규정 점검 · AI 분석을 한 화면에서 확인·실행.
 * - 핸들러는 부모(퇴원심사.tsx)에서 그대로 전달, 본 컴포넌트는 표시만 담당.
 */
export default function 보완요청시트({
  open,
  onClose,
  compareResult,
  ruleAnalysis,
  aiResult,
  aiLoading,
  onRequestAi,
  onAutoCompare,
  canAutoCompare }: 보완요청시트Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title="심사 점검 / 보완 요청" mode="full">
      <div className="space-y-4">
        {/* 자동 비교 */}
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
              <span>🔍</span> 템플릿 자동 비교
            </h4>
            <button
              type="button"
              onClick={onAutoCompare}
              disabled={!canAutoCompare}
              className="px-3 py-1.5 text-[11px] font-bold text-white bg-[var(--accent)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {canAutoCompare ? '자동 비교' : '템플릿 없음'}
            </button>
          </div>

          {compareResult ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-500/10 rounded-[var(--radius-md)] p-2 text-center border border-green-500/20">
                  <p className="text-lg font-bold text-green-600">{compareResult.matched.length}</p>
                  <p className="text-[10px] font-bold text-green-500 mt-0.5">일치</p>
                </div>
                <div className="bg-red-500/10 rounded-[var(--radius-md)] p-2 text-center border border-red-500/20">
                  <p className="text-lg font-bold text-red-600">{compareResult.missing.length}</p>
                  <p className="text-[10px] font-bold text-red-500 mt-0.5">누락</p>
                </div>
                <div className="bg-yellow-500/10 rounded-[var(--radius-md)] p-2 text-center border border-yellow-500/20">
                  <p className="text-lg font-bold text-yellow-600">{compareResult.extra.length}</p>
                  <p className="text-[10px] font-bold text-yellow-600 mt-0.5">추가</p>
                </div>
              </div>

              {compareResult.missing.length > 0 && (
                <details className="rounded-[var(--radius-md)] border border-red-500/20 p-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-red-600">
                    누락 {compareResult.missing.length}건
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {compareResult.missing.map((item) => (
                      <li
                        key={item}
                        className="text-[11px] text-red-700 bg-red-500/10 p-1.5 rounded font-medium"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {compareResult.extra.length > 0 && (
                <details className="rounded-[var(--radius-md)] border border-yellow-500/20 p-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-yellow-700">
                    추가 {compareResult.extra.length}건
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {compareResult.extra.map((item) => (
                      <li
                        key={item}
                        className="text-[11px] text-yellow-700 bg-yellow-500/10 p-1.5 rounded font-medium"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {compareResult.missing.length === 0 && compareResult.extra.length === 0 && (
                <p className="text-xs font-bold text-green-600 text-center py-2">
                  모든 항목이 일치합니다.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">
              상단 [자동 비교] 버튼을 누르면 템플릿과 차트 항목을 대조합니다.
            </p>
          )}
        </section>

        {/* 규정 점검 패널 (데스크탑과 동일 컴포넌트 재활용) */}
        <section>
          <DischargeRuleAnalysisPanel analysis={ruleAnalysis} />
        </section>

        {/* AI 분석 */}
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
              <span>🤖</span> AI 분석
            </h4>
            <button
              type="button"
              onClick={onRequestAi}
              disabled={aiLoading}
              className="px-3 py-1.5 text-[11px] font-bold text-white bg-purple-600 rounded-[var(--radius-md)] hover:bg-purple-700 disabled:opacity-50 transition-all"
            >
              {aiLoading ? '분석 중...' : 'AI 분석'}
            </button>
          </div>
          {aiResult ? (
            <div className="text-[11px] text-[var(--toss-gray-5)] font-medium leading-relaxed whitespace-pre-wrap bg-[var(--tab-bg)] p-3 rounded-[var(--radius-md)]">
              {aiResult}
            </div>
          ) : (
            <p className="text-[11px] font-medium text-[var(--toss-gray-3)] text-center py-2">
              AI 분석으로 누락/과잉 청구를 확인하세요.
            </p>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}

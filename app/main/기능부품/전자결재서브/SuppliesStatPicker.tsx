'use client';

/**
 * 비품구매양식 — 최근 30일 통계치 입력 (펼치기/접기)
 *
 * - 4×2 = 8개 추천 카드: cat / name / 평균 N 단위 / 재고 chip.
 * - 카드 클릭 → 부모의 onPick 콜백으로 행 삽입 위임.
 * - 재고 chip 단계: 0=danger, ≤3=warn, 정상=muted (getStockTone).
 * - 카드 hover: accent 보더 + accent-light bg + 살짝 위로.
 *
 * JM6: 카드는 <button>, aria-label에 평균/재고 음성, role 명시 불필요.
 * JM2: 카드 콜백은 memoize 가능, 부모가 안정 참조 제공.
 */

import { memo } from 'react';
import type { SupplyRequestMonthlySuggestion } from '@/app/main/inventory-utils';
import { getStockTone } from './supplies-helpers';

type SuppliesStatPickerProps = {
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  summaryText: string;
  suggestions: SupplyRequestMonthlySuggestion[];
  /** 카드별 현재 재고. 없으면 null 표기. */
  stockByName: Map<string, number>;
  onPick: (suggestion: SupplyRequestMonthlySuggestion) => void;
};

function stockToneClass(tone: ReturnType<typeof getStockTone>): string {
  switch (tone) {
    case 'danger':
      return 'bg-red-500/10 text-red-600';
    case 'warn':
      return 'bg-amber-500/15 text-amber-700';
    case 'normal':
      return 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
    case 'empty':
    default:
      return 'bg-[var(--muted)] text-[var(--toss-gray-3)]';
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function SuppliesStatPickerImpl({
  expanded,
  onToggle,
  loading,
  summaryText,
  suggestions,
  stockByName,
  onPick,
}: SuppliesStatPickerProps) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--background)]/35 px-3 py-3">
      <button
        type="button"
        data-testid="supplies-stats-toggle"
        aria-expanded={expanded}
        aria-controls="supplies-stats-panel"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-[12px] font-black text-[var(--foreground)]">
            최근 신청 통계치 입력
          </p>
          <p
            data-testid="supplies-stats-summary"
            className="mt-1 text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]"
          >
            {summaryText}
            <span className="ml-1 hidden text-[var(--toss-gray-3)] md:inline">
              — 클릭하면 아래 표에 바로 추가됩니다
            </span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent)] shadow-sm">
          {expanded ? '접기' : '펼치기'}
        </span>
      </button>

      {expanded ? (
        <div
          id="supplies-stats-panel"
          data-testid="supplies-stats-panel"
          className="mt-3"
        >
          {loading ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
              최근 신청 기준 추천 품목을 불러오는 중입니다.
            </div>
          ) : suggestions.length === 0 ? (
            <div
              data-testid="supplies-stats-empty"
              className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]"
            >
              최근 30일 추천 통계가 없습니다.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {suggestions.map((suggestion, index) => {
                const stock = stockByName.get(normalizeKey(suggestion.name)) ?? null;
                const tone = getStockTone(stock);
                return (
                  <button
                    key={suggestion.key}
                    type="button"
                    data-testid={`supplies-stats-card-${index}`}
                    aria-label={`${suggestion.name} — 평균 ${suggestion.average_qty}개, 재고 ${stock ?? '미파악'}`}
                    onClick={() => onPick(suggestion)}
                    className="group flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-px hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)]/60 focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                  >
                    <span className="inline-flex w-fit items-center rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                      {suggestion.category || '품목구분 미지정'}
                    </span>
                    <span className="line-clamp-2 text-[12px] font-black text-[var(--foreground)]">
                      {suggestion.name}
                    </span>
                    <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                      <span>
                        평균 <b className="text-[var(--foreground)]">{suggestion.average_qty}</b>개
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-black ${stockToneClass(tone)}`}
                      >
                        {stock === null ? '재고 -' : `재고 ${stock}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const SuppliesStatPicker = memo(SuppliesStatPickerImpl);
export default SuppliesStatPicker;

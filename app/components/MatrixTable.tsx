'use client';

/**
 * MatrixTable.tsx
 *
 * 매트릭스/격자 형태 데이터(행 × 동적 컬럼)를 표시하는 반응형 컴포넌트.
 * - 데스크톱: <table> + sticky 좌측 컬럼 + 가로 스크롤
 * - 모바일: 카드 1장 = 행 1개, 카드 안에서 컬럼을 가로 스크롤 칩으로 표시
 *
 * 시범 적용: JobCategoryTrainingMatrix (직종 × 교육코드, 색상 히트맵)
 * 향후 적용: 간호근무표, RosterPreviewTable, 스마트서류제출, 교육내역명단
 *
 * 제약 준수
 * - JM: 단일 책임, 300줄 이내
 * - JM4: 제네릭 타입, any 금지, Column 타입 명시
 * - JM6: sticky 컬럼/모바일 칩 모두 키보드 접근 가능
 */

import { type ReactNode } from 'react';
import { EmptyState } from '@/app/components/StatePanel';

export type MatrixCellTone = 'normal' | 'ok' | 'warn' | 'danger';

export type MatrixColumn<C> = {
  /** 컬럼 고유 id (key 용도) */
  id: string;
  /** 컬럼 헤더 표시 라벨 */
  label: ReactNode;
  /** 컬럼 메타데이터 (예: 날짜 객체, 교육코드 객체) */
  data: C;
  /** 컬럼 헤더 옆 보조 라벨 (예: 요일, 의무 유형) */
  subLabel?: ReactNode;
  /** 모바일 칩에서 사용할 짧은 라벨 (없으면 label 사용) */
  shortLabel?: ReactNode;
};

export type MatrixTableProps<R, C> = {
  rows: R[];
  columns: MatrixColumn<C>[];
  rowKey: (row: R) => string;
  /** sticky 좌측에 표시할 행 헤더 */
  rowHeader: (row: R) => ReactNode;
  /** 각 셀 렌더러 */
  renderCell: (row: R, col: MatrixColumn<C>) => ReactNode;
  /** 좌측 컬럼 헤더 (예: '직원', '직종') */
  rowHeaderLabel?: ReactNode;
  /** 셀 색상 톤 (모바일 칩에서도 사용) */
  cellTone?: (row: R, col: MatrixColumn<C>) => MatrixCellTone;
  /** 행별로 끝에 1개 추가 표시할 합계/요약 컬럼 */
  rowSummary?: (row: R) => ReactNode;
  rowSummaryLabel?: ReactNode;
  /** 빈 상태 메시지 */
  emptyMessage?: string;
  /** 데스크톱 테이블 최소 너비 (px) */
  minWidth?: number;
  className?: string;
  ariaLabel?: string;
};

// ---------------------------------------------------------------------------
// 톤 → CSS 변환
// ---------------------------------------------------------------------------
const toneBorderClass: Record<MatrixCellTone, string> = {
  normal: 'border-[var(--border)]',
  ok: 'border-green-500/30',
  warn: 'border-yellow-500/30',
  danger: 'border-red-500/30' };

const toneChipClass: Record<MatrixCellTone, string> = {
  normal: 'bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]',
  ok: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300',
  warn: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300',
  danger: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300' };

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export function MatrixTable<R, C>({
  rows,
  columns,
  rowKey,
  rowHeader,
  renderCell,
  rowHeaderLabel = '',
  cellTone,
  rowSummary,
  rowSummaryLabel,
  emptyMessage = '표시할 데이터가 없습니다.',
  minWidth = 600,
  className = '',
  ariaLabel }: MatrixTableProps<R, C>) {
  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyMessage} compact />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* ====================== 데스크톱 ====================== */}
      <div className="hidden md:block overflow-x-auto">
        <table
          className="w-full border-collapse text-xs"
          style={{ minWidth: `${minWidth}px` }}
          role="grid"
          aria-label={ariaLabel}
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 p-2 text-left text-[10px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)] bg-[var(--tab-bg)] whitespace-nowrap"
              >
                {rowHeaderLabel}
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className="p-2 text-center text-[10px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)] bg-[var(--tab-bg)] whitespace-nowrap"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{col.label}</span>
                    {col.subLabel ? <span className="opacity-70">{col.subLabel}</span> : null}
                  </div>
                </th>
              ))}
              {rowSummary ? (
                <th
                  scope="col"
                  className="p-2 text-center text-[10px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)] bg-[var(--tab-bg)] whitespace-nowrap"
                >
                  {rowSummaryLabel ?? '합계'}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-[var(--border)] last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] p-2 text-left text-[11px] font-semibold text-[var(--foreground)] bg-[var(--card)] whitespace-nowrap"
                >
                  {rowHeader(row)}
                </th>
                {columns.map((col) => {
                  const tone = cellTone ? cellTone(row, col) : 'normal';
                  return (
                    <td
                      key={col.id}
                      className={['p-1 text-center align-middle border', toneBorderClass[tone]].join(' ')}
                      data-tone={tone}
                    >
                      {renderCell(row, col)}
                    </td>
                  );
                })}
                {rowSummary ? (
                  <td className="p-2 text-center text-[11px] font-semibold text-[var(--foreground)] whitespace-nowrap">
                    {rowSummary(row)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ====================== 모바일 카드 ====================== */}
      <div className="flex flex-col gap-2 md:hidden" role="list" aria-label={ariaLabel}>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            role="listitem"
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3"
          >
            {/* 카드 헤더 */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-bold text-[var(--foreground)] flex-1 min-w-0 truncate">
                {rowHeader(row)}
              </div>
              {rowSummary ? (
                <div className="text-[11px] font-semibold text-[var(--toss-gray-4)] whitespace-nowrap">
                  {rowSummaryLabel ? <span className="mr-1 opacity-70">{rowSummaryLabel}</span> : null}
                  {rowSummary(row)}
                </div>
              ) : null}
            </div>

            {/* 가로 스크롤 칩 리스트 */}
            <div
              className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5"
              tabIndex={0}
              role="group"
              aria-label={`${typeof rowHeaderLabel === 'string' ? rowHeaderLabel + ' ' : ''}컬럼 목록`}
            >
              {columns.map((col) => {
                const tone = cellTone ? cellTone(row, col) : 'normal';
                return (
                  <div
                    key={col.id}
                    className={[
                      'flex flex-col items-center justify-center shrink-0 min-w-[60px] px-2 py-1.5 rounded-[var(--radius-md)] border',
                      toneChipClass[tone],
                    ].join(' ')}
                  >
                    <span className="text-[9px] font-semibold opacity-70 truncate max-w-[80px]">
                      {col.shortLabel ?? col.label}
                    </span>
                    <div className="text-[11px] font-bold leading-tight mt-0.5">
                      {renderCell(row, col)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MatrixTable;

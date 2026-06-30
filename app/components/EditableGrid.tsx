'use client';

import { type ReactNode } from 'react';
import { EmptyState } from '@/app/components/StatePanel';

/**
 * 셀별 input/select 등 자유 편집이 가능한 격자 컴포넌트.
 * - 데스크탑(md+): 표준 <table> 격자, 셀에 자유 ReactNode
 * - 모바일(<md): 카드 1장 = 행 1개, label-input 페어 세로 배치 (a11y 폼 시맨틱)
 *
 * ResponsiveTable과 차이:
 * - 행 단위 클릭 없음 (셀별 인터랙션이 주체)
 * - 셀 안 input/select/checkbox/버튼을 자유 렌더
 * - 행 단위 액션 컬럼 별도 지원 (모바일 카드 하단)
 * - 행 강조(에러/변경/저장됨) 톤 지원
 */

export type EditableGridRowTone = 'normal' | 'error' | 'changed' | 'ok';

export type EditableGridField<R> = {
  /** 컬럼 식별자 — React key 및 label 연결용 */
  id: string;
  /** 컬럼 헤더 라벨 (모바일 카드 dt 텍스트로도 사용) */
  label: string;
  /** 셀 렌더 — 내부의 input/select 등을 자유롭게 그림 */
  render: (row: R, idx: number) => ReactNode;
  /** 정렬 (데스크탑 td/모바일 dd 공통) */
  align?: 'left' | 'right' | 'center';
  /** 모바일 카드에 노출할지 (default true) */
  showOnMobile?: boolean;
  /** 데스크탑 컬럼 너비 — col element 속성으로 적용 */
  width?: string;
};

export type EditableGridProps<R> = {
  rows: R[];
  fields: EditableGridField<R>[];
  /** 행 안정 key */
  rowKey: (row: R, idx: number) => string;
  /** 행 톤 — 데스크탑 tr 배경 + 모바일 카드 테두리 색 */
  rowTone?: (row: R, idx: number) => EditableGridRowTone;
  /** 행 단위 액션 — 데스크탑 마지막 컬럼 / 모바일 카드 하단 */
  actions?: (row: R, idx: number) => ReactNode;
  /** 모바일 카드 헤더(주제목) — primary 라벨 (예: 직원명). 비우면 헤더 없음 */
  mobileTitle?: (row: R, idx: number) => ReactNode;
  className?: string;
  emptyMessage?: string;
};

const alignClass: Record<NonNullable<EditableGridField<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center' };

const toneRowClass: Record<EditableGridRowTone, string> = {
  normal: '',
  error: 'bg-[color:color-mix(in_oklab,var(--danger)_10%,transparent)]',
  changed: 'bg-[color:color-mix(in_oklab,var(--accent)_8%,transparent)]',
  ok: 'bg-[color:color-mix(in_oklab,var(--success,#16a34a)_8%,transparent)]' };

const toneCardClass: Record<EditableGridRowTone, string> = {
  normal: 'border-[var(--border)]',
  error: 'border-[var(--danger)]',
  changed: 'border-[var(--accent)]',
  ok: 'border-[var(--success,#16a34a)]' };

export function EditableGrid<R>({
  rows,
  fields,
  rowKey,
  rowTone,
  actions,
  mobileTitle,
  className = '',
  emptyMessage = '표시할 데이터가 없습니다.' }: EditableGridProps<R>) {
  if (rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyMessage} compact />
      </div>
    );
  }

  const mobileFields = fields.filter((f) => f.showOnMobile !== false);

  return (
    <div className={className}>
      {/* 데스크탑 — md 이상 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {fields.some((f) => f.width) || actions ? (
            <colgroup>
              {fields.map((f) => (
                <col key={f.id} style={f.width ? { width: f.width } : undefined} />
              ))}
              {actions ? <col /> : null}
            </colgroup>
          ) : null}
          <thead>
            <tr className="border-b border-[var(--border)]">
              {fields.map((f) => (
                <th
                  key={f.id}
                  scope="col"
                  className={[
                    'px-3 py-2.5 text-xs font-black text-[var(--toss-gray-4)]',
                    alignClass[f.align ?? 'left'],
                  ].join(' ')}
                >
                  {f.label}
                </th>
              ))}
              {actions ? (
                <th
                  scope="col"
                  className="px-3 py-2.5 text-xs font-black text-[var(--toss-gray-4)] text-left"
                >
                  동작
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const tone = rowTone?.(row, idx) ?? 'normal';
              return (
                <tr
                  key={rowKey(row, idx)}
                  aria-invalid={tone === 'error' ? true : undefined}
                  className={['border-b border-[var(--border)]', toneRowClass[tone]].join(' ')}
                >
                  {fields.map((f) => (
                    <td
                      key={f.id}
                      className={[
                        'px-3 py-3 align-middle text-sm text-[var(--foreground)]',
                        alignClass[f.align ?? 'left'],
                      ].join(' ')}
                    >
                      {f.render(row, idx)}
                    </td>
                  ))}
                  {actions ? (
                    <td className="px-3 py-3 align-middle">{actions(row, idx)}</td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일 — md 미만, 카드 1장 = 행 1개 */}
      <div className="flex flex-col gap-3 md:hidden" role="list">
        {rows.map((row, idx) => {
          const tone = rowTone?.(row, idx) ?? 'normal';
          return (
            <div
              key={rowKey(row, idx)}
              role="listitem"
              aria-invalid={tone === 'error' ? true : undefined}
              className={[
                'rounded-[var(--radius-lg)] border bg-[var(--card)] px-4 py-3',
                toneCardClass[tone],
              ].join(' ')}
            >
              {mobileTitle ? (
                <div className="mb-2 border-b border-[var(--border)] pb-2 text-base font-black text-[var(--foreground)]">
                  {mobileTitle(row, idx)}
                </div>
              ) : null}
              <dl className="flex flex-col gap-2.5">
                {mobileFields.map((f) => (
                  <div key={f.id} className="flex flex-col gap-1">
                    <dt className="text-[11px] font-bold uppercase text-[var(--toss-gray-4)]">
                      {f.label}
                    </dt>
                    <dd
                      className={[
                        'text-sm text-[var(--foreground)]',
                        alignClass[f.align ?? 'left'],
                      ].join(' ')}
                    >
                      {f.render(row, idx)}
                    </dd>
                  </div>
                ))}
              </dl>
              {actions ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
                  {actions(row, idx)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CalendarTable.types.ts
 *
 * CalendarTable 컴포넌트의 공개 타입 정의.
 * 본 파일과 .internal.tsx에서 공유한다.
 */

import { type ReactNode } from 'react';

export type CalendarTableMode = 'month-grid' | 'staff-by-day';

export type CalendarCellTone = 'normal' | 'ok' | 'warn' | 'danger' | 'muted';

export type CalendarRow<R> = {
  /** 행 고유 id */
  id: string;
  /** 행 메타데이터 (직원 정보 등) */
  data: R;
  /** sticky 좌측 컬럼 표시용 라벨 (직원명 등) */
  label: ReactNode;
};

export type CalendarCellInfo = {
  date: Date;
  /** 현재 월에 속하는 날짜인지 (month-grid에서 전후월 회색 처리용) */
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday?: boolean;
};

export type CalendarTableProps<R> = {
  mode: CalendarTableMode;
  /** 표시 범위 시작 (inclusive) */
  startDate: Date;
  /** 표시 범위 끝 (inclusive) */
  endDate: Date;
  /** staff-by-day 모드용 행 목록 */
  rows?: CalendarRow<R>[];
  /** 각 셀 렌더러 */
  renderCell: (cell: CalendarCellInfo, row?: CalendarRow<R>) => ReactNode;
  /** 셀 색상 톤 (border/배경에 반영) */
  cellTone?: (cell: CalendarCellInfo, row?: CalendarRow<R>) => CalendarCellTone;
  /** 주 시작 요일: 0=일, 1=월 */
  weekStartsOn?: 0 | 1;
  /** 공휴일 배열 */
  holidays?: Date[];
  /** 좌측 컬럼 헤더 (staff-by-day 전용, 기본 '직원') */
  rowHeaderLabel?: ReactNode;
  ariaLabel?: string;
  emptyMessage?: string;
  className?: string;
};

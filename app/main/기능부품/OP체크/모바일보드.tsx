'use client';

/**
 * OP체크 모바일 보드 (시범)
 *
 * docs/mobile/MSO_Mobile_Phase3_Screens.md §1 — OP체크 (5장 → 1장)
 * 데스크톱 OP체크.tsx 의 풀 워크스페이스 대신, 모바일에서는 한 화면에서:
 *   - 날짜 선택
 *   - 일정 카드 리스트 (수술명/시간/방/환자명/상태)
 *   - PullToRefresh 로 실시간 새로고침
 *   - 헤더 새로고침 버튼 (키보드 접근 대체 수단, JM6)
 *
 * JM:  ~200줄, 단일 책임 — 모바일 보드 뷰만
 * JM3: 훅에서 받은 error 표시, refresh 실패는 훅 내부에서 처리
 * JM4: any 금지, 기존 OpCheckBoardItem 타입 사용
 * JM5: 환자명은 보드에 표시 필요(현장 운영). 화면 외 로그/URL 노출은 금지
 * JM6: 시맨틱 button + aria-label, 키보드 새로고침 버튼 별도 제공
 */

import { useMemo, useState } from 'react';
import { RefreshCw, Clock, MapPin, User } from 'lucide-react';
import { PullToRefresh } from '@/app/components/PullToRefresh';
import { EmptyState } from '@/app/components/StatePanel';
import {
  useOpCheckBoardStream,
  type OpCheckBoardItem,
} from '@/app/hooks/useOpCheckBoardStream';
import { haptics } from '@/app/lib/haptics';
import { STATUS_OPTIONS } from './constants';
import { formatDateLabel, type ScheduleStatus } from './schedule-helpers';

export type OpCheckMobileBoardProps = {
  /** YYYY-MM-DD. 미지정 시 오늘. */
  date?: string;
  /** 회사 필터 */
  companyId?: string | null;
  /** 카드 클릭 시 호출 (워크스페이스 진입 등) */
  onSelectSchedule?: (scheduleId: string) => void;
};

const STATUS_BADGE_CLASS: Record<ScheduleStatus, string> = {
  준비중: 'badge badge-gray',
  준비완료: 'badge badge-blue',
  수술중: 'badge badge-yellow',
  완료: 'badge badge-green',
};

function getStatusLabel(value: string | null | undefined): ScheduleStatus {
  const normalized = String(value || '').trim();
  if ((STATUS_OPTIONS as readonly string[]).includes(normalized)) {
    return normalized as ScheduleStatus;
  }
  return '준비중';
}

function OpCheckMobileCard({
  item,
  onSelect,
}: {
  item: OpCheckBoardItem;
  onSelect?: (scheduleId: string) => void;
}) {
  const { schedule, patientCheck } = item;
  const status = getStatusLabel(patientCheck?.status);
  const handleClick = () => {
    haptics.light();
    onSelect?.(schedule.id);
  };
  const interactive = typeof onSelect === 'function';

  return (
    <button
      type="button"
      onClick={interactive ? handleClick : undefined}
      disabled={!interactive}
      aria-label={`${schedule.surgery_name || '수술'} 일정, 환자 ${schedule.patient_name || '미지정'}, 상태 ${status}`}
      className={[
        'app-card flex w-full flex-col gap-2 p-4 text-left',
        interactive
          ? 'cursor-pointer transition hover:border-[var(--accent)] active:scale-[0.99]'
          : 'cursor-default',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {schedule.surgery_name || '수술명 미지정'}
          </p>
          <p className="text-xs text-[var(--toss-gray-4)]">{schedule.company || ''}</p>
        </div>
        <span className={STATUS_BADGE_CLASS[status]} aria-label={`상태: ${status}`}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-xs text-[var(--toss-gray-4)]">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{schedule.schedule_time || '시간 미정'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{schedule.schedule_room || '방 미정'}</span>
        </div>
        <div className="col-span-2 flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="truncate text-[var(--foreground)]">
            {schedule.patient_name || '환자 미지정'}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function OpCheckMobileBoard({
  date,
  companyId,
  onSelectSchedule,
}: OpCheckMobileBoardProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    () => date || new Date().toISOString().slice(0, 10),
  );
  const { items, loading, error, refresh } = useOpCheckBoardStream({
    date: selectedDate,
    companyId: companyId ?? null,
  });

  const dateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);

  const handleManualRefresh = async () => {
    haptics.light();
    await refresh();
  };

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-col">
          <h1 className="text-base font-semibold text-[var(--foreground)]">OP체크</h1>
          <label className="mt-1 flex items-center gap-2 text-xs text-[var(--toss-gray-4)]">
            <span className="sr-only">날짜 선택</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
              aria-label="조회 날짜"
            />
            <span aria-hidden="true">{dateLabel}</span>
          </label>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={loading}
          aria-label="새로고침"
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--toss-gray-4)] transition hover:text-[var(--accent)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </header>

      <PullToRefresh
        onRefresh={refresh}
        className="flex-1"
        contentClassName="min-h-full"
      >
        {error ? (
          <div className="p-4">
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--toss-gray-4)]"
            >
              {error}
            </div>
          </div>
        ) : items.length === 0 && !loading ? (
          <div className="p-4">
            <EmptyState
              title="등록된 일정이 없습니다"
              description={`${dateLabel}에 등록된 수술 일정이 없습니다.`}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-3 p-4" aria-busy={loading} aria-live="polite">
            {items.map((item) => (
              <li key={item.id}>
                <OpCheckMobileCard item={item} onSelect={onSelectSchedule} />
              </li>
            ))}
          </ul>
        )}
      </PullToRefresh>
    </div>
  );
}

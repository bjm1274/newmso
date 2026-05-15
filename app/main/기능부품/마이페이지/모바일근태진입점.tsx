'use client';

/**
 * 모바일 근태 진입점 — 마이페이지에서 모바일 전용 근태 3종을 연결한다.
 *
 * - MobileAttendanceEntry: 모바일 프로필 탭에 노출되는 3개 카드(체크인/근무표/연차)
 * - MobileAttendanceView : 선택된 모바일 화면을 헤더(뒤로가기) + 본문으로 감싸 렌더
 *
 * JM  : 단일 책임 — 진입점 카드 + 뷰 컨테이너만 담당, ~180줄
 * JM3 : 모바일 화면 props 부족(staffId 없음) 시 안내 카드로 폴백
 * JM4 : props 타입 명시, any 금지
 * JM6 : 카드는 button 시맨틱 + aria-label, 뒤로가기 버튼 키보드 포커스 가능
 */

import { memo } from 'react';
import 모바일체크인 from '../근태기록/모바일체크인';
import 모바일근무표 from '../근태기록/모바일근무표';
import 모바일연차 from '../근태기록/모바일연차';
import { LucideIcon } from '../조직도서브/조직도측면창';

export type MobileAttendanceView = 'check-in' | 'schedule' | 'leave';

type EntryDef = {
  view: MobileAttendanceView;
  label: string;
  description: string;
  icon: string;
  tone: string;
};

const ENTRIES: EntryDef[] = [
  {
    view: 'check-in',
    label: '출퇴근 체크인',
    description: 'GPS 위치 확인 후 출근/퇴근',
    icon: 'Clock',
    tone: 'text-teal-600 bg-teal-50',
  },
  {
    view: 'schedule',
    label: '내 근무표',
    description: '이번 달 본인 근무 일정',
    icon: 'CalendarDays',
    tone: 'text-[var(--accent)] bg-[var(--accent-light)]',
  },
  {
    view: 'leave',
    label: '내 연차',
    description: '잔여 확인 및 연차 신청',
    icon: 'CalendarClock',
    tone: 'text-indigo-600 bg-indigo-50',
  },
];

export type MobileAttendanceEntryProps = {
  onSelect: (view: MobileAttendanceView) => void;
};

function MobileAttendanceEntryBase({ onSelect }: MobileAttendanceEntryProps) {
  return (
    <section
      aria-label="모바일 근태 바로가기"
      className="grid grid-cols-1 gap-2.5"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
        모바일 근태
      </p>
      {ENTRIES.map((entry) => (
        <button
          key={entry.view}
          type="button"
          onClick={() => onSelect(entry.view)}
          aria-label={entry.label}
          className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-sm transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)]"
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${entry.tone}`}
            aria-hidden="true"
          >
            <LucideIcon name={entry.icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-[var(--foreground)]">
              {entry.label}
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-[var(--toss-gray-3)]">
              {entry.description}
            </p>
          </div>
          <LucideIcon
            name="ArrowRight"
            size={16}
            className="shrink-0 text-[var(--toss-gray-3)]"
          />
        </button>
      ))}
    </section>
  );
}

export const MobileAttendanceEntry = memo(MobileAttendanceEntryBase);

export type MobileAttendanceViewContainerProps = {
  view: MobileAttendanceView;
  staffId: string | null;
  staffName?: string;
  onBack: () => void;
  /** 체크인 성공 후 부모에서 월 근태 재집계 등을 트리거할 때 사용 */
  onCheckedIn?: () => void;
  onCheckedOut?: () => void;
};

const VIEW_TITLE: Record<MobileAttendanceView, string> = {
  'check-in': '출퇴근 체크인',
  schedule: '내 근무표',
  leave: '내 연차',
};

function MobileAttendanceViewBase({
  view,
  staffId,
  staffName,
  onBack,
  onCheckedIn,
  onCheckedOut,
}: MobileAttendanceViewContainerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--page-bg)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="마이페이지로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--foreground)] hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <LucideIcon name="ArrowLeft" size={20} />
        </button>
        <h2 className="text-[15px] font-bold text-[var(--foreground)]">
          {VIEW_TITLE[view]}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {staffId ? (
          view === 'check-in' ? (
            <모바일체크인
              staffId={staffId}
              onCheckedIn={onCheckedIn}
              onCheckedOut={onCheckedOut}
            />
          ) : view === 'schedule' ? (
            <모바일근무표 staffId={staffId} staffName={staffName} />
          ) : (
            <모바일연차 staffId={staffId} staffName={staffName} />
          )
        ) : (
          <div
            role="status"
            className="m-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--toss-gray-3)]"
          >
            직원 계정 정보를 확인할 수 없어 표시할 수 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

export const MobileAttendanceViewContainer = memo(MobileAttendanceViewBase);

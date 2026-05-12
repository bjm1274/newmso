'use client';

import { formatTodayAttendancePrimary, formatTodayAttendanceSecondary } from './format-utils';
import type { TodayAttendance, AnnualLeaveSummary, PendingApprovalItem, BirthdayStaffItem } from './types';

function BirthdayBanner({ items }: { items: BirthdayStaffItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {items.map((item) => (
        <p key={item.name} className="text-[11px] text-[var(--toss-gray-3)]">
          {item.daysUntil === 0
            ? `🎂 오늘 생일: ${item.name}`
            : `🎂 ${item.daysUntil}일 후 생일: ${item.name}`}
        </p>
      ))}
    </div>
  );
}

function PendingApprovalPreview({ items, onOpen }: { items: PendingApprovalItem[]; onOpen: () => void }) {
  if (items.length === 0) return null;
  const now = Date.now();
  return (
    <div className="mt-2 space-y-1">
      {items.map((item) => {
        const isOld = now - new Date(item.created_at).getTime() > 24 * 60 * 60 * 1000;
        return (
          <button
            key={item.id}
            type="button"
            onClick={onOpen}
            className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition hover:bg-[var(--muted)]"
          >
            <span className={`truncate text-[11px] font-medium ${isOld ? 'text-red-500' : 'text-[var(--foreground)]'}`}>
              {isOld && <span className="mr-1">🔴</span>}
              {item.title}
            </span>
            {item.department && (
              <span className="shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--toss-gray-3)]">
                {item.department}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function UserDashboard({
  todayAttendance,
  annualLeave,
  pendingApprovals,
  pendingApprovalItems,
  birthdayStaff,
  setMainMenu,
  openApprovalInbox,
  formatTime,
}: {
  todayAttendance: TodayAttendance;
  annualLeave: AnnualLeaveSummary | null;
  pendingApprovals: number;
  pendingApprovalItems: PendingApprovalItem[];
  birthdayStaff: BirthdayStaffItem[];
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
  formatTime: (value: string | null) => string;
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">오늘 근태</p>
          <p className="text-lg font-bold text-[var(--foreground)]">{formatTodayAttendancePrimary(todayAttendance, formatTime)}</p>
          {formatTodayAttendanceSecondary(todayAttendance, formatTime) ? (
            <p className="text-[11px] text-[var(--toss-gray-3)]">{formatTodayAttendanceSecondary(todayAttendance, formatTime)}</p>
          ) : null}
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">연차 잔여</p>
          <p className="text-lg font-bold text-[var(--accent)]">{annualLeave?.remaining ?? '-'}일</p>
          {annualLeave ? <p className="text-[11px] text-[var(--toss-gray-3)]">총 {annualLeave.total}일</p> : null}
        </div>

        <button
          type="button"
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:bg-[var(--toss-blue-light)]/30"
          onClick={openApprovalInbox}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기</p>
          <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-500' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>

        <button
          type="button"
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:bg-[var(--toss-blue-light)]/30"
          onClick={() => setMainMenu?.('채팅')}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">채팅</p>
          <p className="text-lg font-bold text-[var(--foreground)]">열기</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>
      </div>

      {pendingApprovalItems.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기 목록</p>
          <PendingApprovalPreview items={pendingApprovalItems} onOpen={openApprovalInbox} />
        </div>
      )}

      <BirthdayBanner items={birthdayStaff} />
    </div>
  );
}

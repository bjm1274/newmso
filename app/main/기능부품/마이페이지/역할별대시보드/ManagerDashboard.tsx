'use client';

import { formatTodayAttendancePrimary, formatTodayAttendanceSecondary } from './format-utils';
import type { TodayAttendance, PendingApprovalItem, BirthdayStaffItem } from './types';

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

export function ManagerDashboard({
  teamCount,
  teamCheckedIn,
  department,
  pendingApprovals,
  pendingApprovalItems,
  todayAttendance,
  lowStockCount,
  expiringCount,
  birthdayStaff,
  setMainMenu,
  openApprovalInbox,
  formatTime,
}: {
  teamCount: number;
  teamCheckedIn: number;
  department?: string;
  pendingApprovals: number;
  pendingApprovalItems: PendingApprovalItem[];
  todayAttendance: TodayAttendance;
  lowStockCount: number;
  expiringCount: number;
  birthdayStaff: BirthdayStaffItem[];
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
  formatTime: (value: string | null) => string;
}) {
  const teamNotCheckedIn = Math.max(0, teamCount - teamCheckedIn);
  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">팀 출근 현황</p>
          <p className="text-lg font-bold text-[var(--foreground)]">
            <span className="text-green-600">{teamCheckedIn}</span>
            <span className="text-[13px] text-[var(--toss-gray-3)]"> / {teamCount}명</span>
          </p>
          <p className="text-[11px]">
            {teamNotCheckedIn > 0 ? (
              <span className="text-orange-500">미출근 {teamNotCheckedIn}명</span>
            ) : (
              <span className="text-[var(--toss-gray-3)]">{department || '-'}</span>
            )}
          </p>
        </div>

        <button
          type="button"
          className={`rounded-[var(--radius-lg)] border p-4 text-left transition-all ${
            pendingApprovals > 0
              ? 'border-orange-500/20 bg-orange-500/10 hover:bg-orange-500/20'
              : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
          }`}
          onClick={openApprovalInbox}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">결재 대기</p>
          <p className={`text-lg font-bold ${pendingApprovals > 0 ? 'text-orange-500' : 'text-[var(--foreground)]'}`}>{pendingApprovals}건</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">내 근태</p>
          <p className="text-lg font-bold text-[var(--foreground)]">{formatTodayAttendancePrimary(todayAttendance, formatTime)}</p>
          {formatTodayAttendanceSecondary(todayAttendance, formatTime) ? (
            <p className="text-[11px] text-[var(--toss-gray-3)]">{formatTodayAttendanceSecondary(todayAttendance, formatTime)}</p>
          ) : null}
        </div>

        <button
          type="button"
          className={`rounded-[var(--radius-lg)] border p-4 text-left transition-all ${
            lowStockCount > 0
              ? 'border-red-500/20 bg-red-500/10 hover:bg-red-500/20'
              : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
          }`}
          onClick={() => setMainMenu?.('재고관리')}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">재고 부족</p>
          <p className={`text-lg font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-[var(--foreground)]'}`}>{lowStockCount}건</p>
          <p className="text-[11px] text-[var(--accent)]">바로가기</p>
        </button>
      </div>

      {expiringCount > 0 && (
        <button
          type="button"
          className="w-full rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/10 px-4 py-3 text-left transition-all hover:bg-red-500/20"
          onClick={() => setMainMenu?.('재고관리')}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">유통기한 임박</p>
          <p className="mt-0.5 text-lg font-bold text-red-600">{expiringCount}건</p>
          <p className="text-[11px] text-red-500">30일 이내 만료 · 바로가기</p>
        </button>
      )}

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

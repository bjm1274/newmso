'use client';

import type { PendingApprovalItem, BirthdayStaffItem } from './types';

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

function AdminActionCard({
  title,
  value,
  icon,
  active,
  onValueClick,
}: {
  title: string;
  value: string;
  icon: string;
  active: boolean;
  onValueClick?: () => void;
}) {
  return (
    <div className="flex min-h-[88px] w-full items-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left sm:min-h-[104px] sm:w-[calc(50%-0.375rem)] xl:min-h-[128px] xl:w-[164px]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--card)]/85 text-sm shadow-sm ring-1 ring-black/5 sm:h-9 sm:w-9 sm:text-base">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">
            {title}
          </p>
          {active ? (
            <button
              type="button"
              onClick={onValueClick}
              className="mt-1 text-left text-lg font-black text-[var(--accent)] transition hover:opacity-80 focus:outline-none sm:mt-1.5 sm:text-xl"
            >
              {value}
            </button>
          ) : (
            <p className="mt-1 text-lg font-black text-[var(--foreground)] sm:mt-1.5 sm:text-xl">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard({
  pendingApprovals,
  pendingApprovalItems,
  lowStockCount,
  expiringCount,
  birthdayStaff,
  setMainMenu,
  openApprovalInbox,
}: {
  pendingApprovals: number;
  pendingApprovalItems: PendingApprovalItem[];
  lowStockCount: number;
  expiringCount: number;
  birthdayStaff: BirthdayStaffItem[];
  setMainMenu?: (menu: string) => void;
  openApprovalInbox: () => void;
}) {
  return (
    <div className="mb-0 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:gap-3">
      <AdminActionCard
        title="결재 대기"
        value={`${pendingApprovals}건`}
        icon="✅"
        active={pendingApprovals > 0}
        onValueClick={openApprovalInbox}
      />
      <AdminActionCard
        title="재고 부족"
        value={`${lowStockCount}건`}
        icon="📦"
        active={lowStockCount > 0}
        onValueClick={() => setMainMenu?.('재고관리')}
      />
      {expiringCount > 0 && (
        <AdminActionCard
          title="유통기한 임박"
          value={`${expiringCount}건`}
          icon="⚠️"
          active={true}
          onValueClick={() => setMainMenu?.('재고관리')}
        />
      )}
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

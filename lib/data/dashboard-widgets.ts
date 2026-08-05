/**
 * 대시보드 위젯 데이터 페처
 *
 * - 모든 호출이 lib/fetcher 위에서 동작 → 동일 key 호출 자동 dedup + 1분 TTL 캐시
 * - 같은 페이지 안에서 동일 위젯이 중복 호출되어도 네트워크는 1회
 * - 대시보드는 실시간성이 약하고 재방문이 잦아 짧은 TTL 캐시가 효과적
 */

import { fetcher } from '@/lib/fetcher';
import { db, d1 } from '@/lib/db-client';
import { getKoreanTodayString } from '@/lib/seoul-time';

const WIDGET_TTL = 60_000; // 1분

export async function fetchActiveStaffCount(): Promise<number> {
  return fetcher(
    'dashboard:staff_members:count:active',
    async () => {
      const { count } = await db
        .from('staff_members')
        .select('id', { count: 'exact', head: true })
        .eq('status', '재직');
      return count ?? 0;
    },
    { ttl: WIDGET_TTL },
  );
}

export async function fetchPendingApprovalCount(): Promise<number> {
  return fetcher(
    'dashboard:approvals:count:pending',
    async () => {
      const { count } = await db
        .from('approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', '대기');
      return count ?? 0;
    },
    { ttl: WIDGET_TTL },
  );
}

export type InventoryItem = {
  id: string;
  quantity: number | null;
  min_quantity: number | null;
};

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  return fetcher(
    'dashboard:inventory:list',
    async () => {
      const { data } = await db
        .from('inventory')
        .select('id, quantity, min_quantity');
      return (data ?? []) as InventoryItem[];
    },
    { ttl: WIDGET_TTL },
  );
}

export async function fetchTodayCheckedInCount(): Promise<number> {
  const today = getKoreanTodayString();
  return fetcher(
    `dashboard:attendances:count:checked-in:${today}`,
    async () => {
      // 예전에는 `.eq('date', today).not('check_in', 'is', null)` 이었다. 두 컬럼은
      // 구 `attendance`(단수) 테이블 이름이라 `attendances` 에는 없다. SQLite 가
      // 큰따옴표 토큰을 문자열 리터럴로 해석하는 바람에 WHERE 가 `'date' = '2026-08-05'`
      // 즉 상시 거짓이 되어, 에러 없이 카운트가 항상 0 이었다. `count ?? 0` 폴백까지
      // 겹쳐 "오늘 출근자 0명"이 정상값처럼 보였다.
      const { count } = await db
        .from('attendances')
        .select('id', { count: 'exact', head: true })
        .eq('work_date', today)
        .not('check_in_time', 'is', null);
      return count ?? 0;
    },
    { ttl: WIDGET_TTL },
  );
}

export type StaffLeaveSnapshot = {
  annual_leave_total: number | null;
  annual_leave_used: number | null;
};

export async function fetchActiveStaffLeaves(): Promise<StaffLeaveSnapshot[]> {
  return fetcher(
    'dashboard:staff_members:leaves:active',
    async () => {
      const { data } = await db
        .from('staff_members')
        .select('annual_leave_total, annual_leave_used')
        .eq('status', '재직');
      return (data ?? []) as StaffLeaveSnapshot[];
    },
    { ttl: WIDGET_TTL },
  );
}

/**
 * 이번 달 입금 합계 (virtual_account_deposits, deposit_status='deposited')
 *
 * NOTE: 이 시스템에는 별도의 "매출/수익" 데이터 소스가 없다. 가짜 매출 숫자를
 * 만들지 않는다는 팀 정책(ExecDashboard PendingCard)을 지키되, 실제 입금 데이터는
 * 정직한 현금 유입 지표로 노출한다. 라벨은 "매출"이 아니라 "이번 달 입금"이어야 한다.
 */
export async function fetchCurrentMonthDepositTotal(): Promise<number> {
  const ym = getKoreanTodayString().slice(0, 7); // 'YYYY-MM'
  const monthStart = `${ym}-01`;
  return fetcher(
    `dashboard:deposits:sum:${ym}`,
    async () => {
      const { data } = await db
        .from('virtual_account_deposits')
        .select('amount, deposited_at')
        .eq('deposit_status', 'deposited')
        .gte('deposited_at', monthStart);
      const rows = (data ?? []) as Array<{ amount: number | null; deposited_at: string | null }>;
      return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    },
    { ttl: WIDGET_TTL },
  );
}

export type RecentNotificationItem = {
  title: string | null;
  created_at: string | null;
};

export async function fetchRecentNotifications(limit = 5): Promise<RecentNotificationItem[]> {
  return fetcher(
    `dashboard:notifications:recent:${limit}`,
    async () => {
      const { data } = await d1.from('notifications')
        .select('title, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      return (data ?? []) as RecentNotificationItem[];
    },
    { ttl: WIDGET_TTL },
  );
}

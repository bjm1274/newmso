'use client';
import { useState, useEffect } from 'react';
import { fetchPendingApprovalCount, fetchCurrentMonthDepositTotal } from '@/lib/data/dashboard-widgets';
import { MenuIcon } from '../조직도서브/조직도측면창';
import { useIsMobile } from '@/app/components/useIsMobile';
import 경영분석모바일대시보드 from './경영분석/모바일대시보드';

export default function BusinessDashboard({ staffs = [], inventory = [] }: Record<string, unknown>) {
  const _staffs = (staffs as Record<string, unknown>[]) ?? [];
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [monthlyDeposit, setMonthlyDeposit] = useState<number | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    fetchPendingApprovalCount()
      .then((count) => {
        if (!cancelled) setPendingApprovalCount(count);
      })
      .catch(() => {
        if (!cancelled) setPendingApprovalCount(0);
      });
    fetchCurrentMonthDepositTotal()
      .then((total) => {
        if (!cancelled) setMonthlyDeposit(total);
      })
      .catch(() => {
        if (!cancelled) setMonthlyDeposit(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeStaffs = _staffs.filter((staff: Record<string, unknown>) => String(staff.status ?? staff.상태 ?? '').trim() !== '퇴사');
  const inventoryRows = (inventory as Record<string, unknown>[]) ?? [];
  const lowStockCount = inventoryRows.filter((item) => {
    const quantity = Number(item.quantity ?? item.stock ?? 0);
    const minimum = Number(item.min_quantity ?? item.min_stock ?? item.minimum_quantity ?? 0);
    return minimum > 0 && quantity <= minimum;
  }).length;
  const leaveTotal = activeStaffs.reduce((sum, staff) => sum + Number(staff.annual_leave_total ?? 15), 0);
  const leaveUsed = activeStaffs.reduce((sum, staff) => sum + Number(staff.annual_leave_used ?? 0), 0);
  const leaveUsageRate = leaveTotal > 0 ? Math.round((leaveUsed / leaveTotal) * 1000) / 10 : 0;

  const stats = [
    {
      label: '이번 달 입금',
      value:
        monthlyDeposit === null
          ? '집계 중…'
          : `₩${Math.round(monthlyDeposit).toLocaleString('ko-KR')}`,
      detail: '가상계좌 입금 합계',
      icon: 'analytics',
      tone: 'text-[var(--success)] bg-[var(--success-light)]',
    },
    {
      label: '총 직원',
      value: `${activeStaffs.length}명`,
      detail: '재직 기준',
      icon: 'users',
      tone: 'text-[var(--accent)] bg-[var(--accent-light)]',
    },
    {
      label: '미결재 건수',
      value: `${pendingApprovalCount}건`,
      detail: pendingApprovalCount > 0 ? '검토 필요' : '정상',
      icon: 'history',
      tone: 'text-[var(--warning)] bg-[var(--warning-light)]',
    },
    {
      label: '재고 이상',
      value: `${lowStockCount}개`,
      detail: lowStockCount > 0 ? '확인 필요' : '정상',
      icon: 'alert',
      tone: 'text-[var(--danger)] bg-[var(--danger-light)]',
    },
  ];

  const notices = [
    ...(pendingApprovalCount > 0
      ? [{ label: `결재 대기 ${pendingApprovalCount}건`, detail: '확인 필요', icon: 'history', tone: 'text-[var(--warning)] bg-[var(--warning-light)]' }]
      : []),
  ];

  const quickLinks = [
    { label: '경영 대시보드', icon: 'analytics' },
    { label: '급여 이상치', icon: 'alert' },
    { label: '감사 로그', icon: 'search' },
    { label: '데이터 백업', icon: 'save' },
    { label: '직원 권한', icon: 'users' },
    { label: '운영 설정', icon: 'settings' },
  ];

  if (isMobile) {
    return (
      <경영분석모바일대시보드
        stats={stats}
        notices={notices}
        quickLinks={quickLinks}
        leaveUsageRate={leaveUsageRate}
      />
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="admin-analysis-business">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <article key={item.label} className="erp-stat-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold text-[var(--zinc-500)]">{item.label}</p>
                <p className="mt-6 text-2xl font-bold text-[var(--foreground)]">{item.value}</p>
                <p className="mt-2 text-[11px] font-bold text-[var(--accent)]">{item.detail}</p>
              </div>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${item.tone}`}>
                <MenuIcon name={item.icon} className="h-4 w-4" />
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="app-card p-4 md:p-5">
          <h3 className="mb-5 text-base font-bold text-[var(--foreground)]">최근 알림</h3>
          <div className="space-y-4">
            {notices.length === 0 ? (
              <p className="text-[12px] text-[var(--zinc-400)]">데이터 준비 중</p>
            ) : (
              notices.map((notice) => (
                <div key={notice.label} className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${notice.tone}`}>
                    <MenuIcon name={notice.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--foreground)]">{notice.label}</p>
                    <p className="mt-1 text-[11px] font-semibold text-[var(--zinc-400)]">{notice.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="app-card p-4 md:p-5">
          <h3 className="mb-5 text-base font-bold text-[var(--foreground)]">빠른 액세스</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                className="flex h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-4 text-left text-[12px] font-bold text-[var(--foreground)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                disabled
                title="준비 중"
              >
                <MenuIcon name={link.icon} className="h-4 w-4 text-[var(--accent)]" />
                <span>{link.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="app-card p-4 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">연차 사용률</h3>
            <p className="mt-1 text-[11px] font-semibold text-[var(--zinc-400)]">전사 평균 소진 현황</p>
          </div>
          <span className="inline-flex w-fit rounded-[var(--radius-md)] bg-[var(--success-light)] px-3 py-1 text-[11px] font-bold text-[var(--success)]">
            {leaveUsageRate}%
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--tab-bg)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, leaveUsageRate)}%` }} />
        </div>
      </div>
    </div>
  );
}

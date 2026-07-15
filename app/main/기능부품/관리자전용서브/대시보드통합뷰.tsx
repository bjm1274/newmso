'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { db } from '@/lib/db-client';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';
import { MenuIcon } from '../조직도서브/조직도측면창';
import { fetchPendingApprovalCount, fetchCurrentMonthDepositTotal } from '@/lib/data/dashboard-widgets';
import { DEFAULT_WIDGETS, WIDGET_DEFINITIONS, type WidgetConfig, type WidgetType } from '@/lib/dashboard-widgets';
import {
  fetchActiveStaffCount,
  fetchActiveStaffLeaves,
  fetchInventoryItems,
  fetchRecentNotifications,
  fetchTodayCheckedInCount } from '@/lib/data/dashboard-widgets';
import { SwipeableKpiCards, type KpiCard } from '@/app/components/SwipeableKpiCards';
import { MobileChartWrapper } from '@/app/components/MobileChartWrapper';

// ==========================================
// 1. BUSINESS DASHBOARD (경영 대시보드)
// ==========================================
export function BusinessDashboard({
  staffs = [],
  inventory = [],
  onNavigate }: Record<string, any>) {
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
  // 15일 폴백 금지 — 직원 필드/잔액 미등록 시 0
  const leaveTotal = activeStaffs.reduce((sum, staff) => sum + Number(staff.annual_leave_total ?? 0), 0);
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
      tone: 'text-[var(--success)] bg-[var(--success-light)]' },
    {
      label: '총 직원',
      value: `${activeStaffs.length}명`,
      detail: '재직 기준',
      icon: 'users',
      tone: 'text-[var(--accent)] bg-[var(--accent-light)]' },
    {
      label: '미결재 건수',
      value: `${pendingApprovalCount}건`,
      detail: pendingApprovalCount > 0 ? '검토 필요' : '정상',
      icon: 'history',
      tone: 'text-[var(--warning)] bg-[var(--warning-light)]' },
    {
      label: '재고 이상',
      value: `${lowStockCount}개`,
      detail: lowStockCount > 0 ? '확인 필요' : '정상',
      icon: 'alert',
      tone: 'text-[var(--danger)] bg-[var(--danger-light)]' },
  ];

  const notices = [
    ...(pendingApprovalCount > 0
      ? [{ label: `결재 대기 ${pendingApprovalCount}건`, detail: '확인 필요', icon: 'history', tone: 'text-[var(--warning)] bg-[var(--warning-light)]' }]
      : []),
  ];

  const quickLinks = [
    { label: '경영 대시보드', icon: 'analytics', viewId: 'exec' },
    { label: '급여 이상치', icon: 'alert', viewId: 'audit' },
    { label: '감사 로그', icon: 'search', viewId: 'audit' },
    { label: '데이터 백업', icon: 'save', viewId: 'audit' },
    { label: '직원 권한', icon: 'users', viewId: 'roles' },
    { label: '운영 설정', icon: 'settings', viewId: 'ops' },
  ];

  if (isMobile) {
    return (
      <BusinessMobileDashboard
        stats={stats}
        notices={notices}
        quickLinks={quickLinks}
        leaveUsageRate={leaveUsageRate}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-5xl mx-auto" data-testid="admin-analysis-business">
      {/* KPI 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((card) => (
          <div key={card.label} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">{card.label}</span>
              <span className={`w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center font-bold ${card.tone}`}>
                <MenuIcon name={card.icon} className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-black text-[var(--foreground)] mt-2">{card.value}</p>
            <p className="text-[10px] text-[var(--toss-gray-3)] mt-1">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 최근 알림 */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-black text-[var(--foreground)] mb-3">최근 알림</h3>
          <div className="space-y-3">
            {notices.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--toss-gray-3)] font-bold uppercase">
                대기 중인 중요 알림이 없습니다
              </div>
            ) : (
              notices.map((notice) => (
                <div key={notice.label} className="flex items-center gap-3">
                  <span className={`flex w-9 h-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${notice.tone}`}>
                    <MenuIcon name={notice.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--foreground)] truncate">{notice.label}</p>
                    <p className="text-[10px] font-semibold text-[var(--toss-gray-3)] mt-1">{notice.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 연차 요약 */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm flex flex-col justify-center">
          <h3 className="text-sm font-black text-[var(--foreground)] mb-1">연차 사용률</h3>
          <p className="text-[10px] text-[var(--toss-gray-3)] font-bold mb-4">전사 평균 소진 현황</p>
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-black text-[var(--foreground)]">{leaveUsageRate}%</span>
            <span className="text-xs font-semibold text-[var(--toss-gray-3)]">{leaveUsed.toFixed(0)} / {leaveTotal.toFixed(0)} 일</span>
          </div>
          <div className="h-3 bg-[var(--muted)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${leaveUsageRate}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Private helper mobile view component for BusinessDashboard
type BusinessMobileDashboardProps = {
  stats: Array<{ label: string; value: ReactNode; detail: string; icon: string; tone: string }>;
  notices: Array<{ label: string; detail: string; icon: string; tone: string }>;
  quickLinks: Array<{ label: string; icon: string; viewId?: string }>;
  leaveUsageRate: number;
  onNavigate?: (view: any) => void;
};

function BusinessMobileDashboard({
  stats,
  notices,
  quickLinks,
  leaveUsageRate,
  onNavigate }: BusinessMobileDashboardProps) {
  const kpiCards = useMemo<KpiCard[]>(
    () =>
      stats.map((s, idx) => ({
        id: `${idx}-${s.label}`,
        label: s.label,
        value: s.value,
        description: s.detail,
        icon: <MenuIcon name={s.icon} className="h-4 w-4" /> })),
    [stats],
  );

  const clampedRate = Math.max(0, Math.min(100, leaveUsageRate));

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="admin-analysis-business-mobile">
      <SwipeableKpiCards cards={kpiCards} ariaLabel="경영 지표" />

      <section className="app-card p-4">
        <h3 className="mb-4 text-base font-bold text-[var(--foreground)]">최근 알림</h3>
        <div className="space-y-3">
          {notices.length === 0 ? (
            <p className="text-[12px] text-[var(--zinc-400)]">데이터 준비 중</p>
          ) : (
            notices.map((notice) => (
              <div key={notice.label} className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${notice.tone}`}>
                  <MenuIcon name={notice.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)] truncate">{notice.label}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[var(--zinc-400)]">{notice.detail}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="app-card p-4">
        <h3 className="mb-3 text-base font-bold text-[var(--foreground)]">빠른 액세스</h3>
        <div className="grid grid-cols-2 gap-2">
          {quickLinks.map((link) => (
            <button
              key={link.label}
              type="button"
              className="flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-3 text-left text-[12px] font-bold text-[var(--foreground)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)] hover:text-[var(--accent)] active:bg-[var(--muted)]"
              onClick={() => {
                if (link.viewId && onNavigate) {
                  onNavigate(link.viewId);
                }
              }}
              title={link.label}
            >
              <MenuIcon name={link.icon} className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span className="truncate">{link.label}</span>
            </button>
          ))}
        </div>
      </section>

      <MobileChartWrapper
        title="연차 사용률"
        subtitle="전사 평균 소진 현황"
        height={120}
        ariaLabel="연차 사용률 차트"
        actions={
          <span className="inline-flex w-fit rounded-[var(--radius-md)] bg-[var(--success-light)] px-3 py-1 text-[11px] font-bold text-[var(--success)]">
            {leaveUsageRate}%
          </span>
        }
      >
        <div className="flex h-full flex-col justify-center gap-2">
          <div
            role="progressbar"
            aria-valuenow={clampedRate}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`연차 사용률 ${clampedRate}%`}
            className="h-2 overflow-hidden rounded-full bg-[var(--tab-bg)]"
          >
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${clampedRate}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--zinc-400)]">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </MobileChartWrapper>
    </div>
  );
}

// ==========================================
// 2. FINANCIAL DASHBOARD (재무 대시보드)
// ==========================================
export function FinancialDashboard() {
  const [period, setPeriod] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4' | '초기화'>('Q1');
  const [cashFlow, setCashFlow] = useState({ in: 0, out: 0, balance: 0 });
  const [budgets, setBudgets] = useState<any[]>([]);

  useEffect(() => {
    const fetchFinancials = async () => {
      const today = getKoreanTodayString();
      const { data } = await db
        .from('daily_closures')
        .select('total_amount, date') // Optimized L22 select('*')
        .eq('date', today)
        .maybeSingle();

      if (data) {
        setCashFlow({
          in: Number(data.total_amount) || 0,
          out: 0,
          balance: Number(data.total_amount) || 0 });
      }
    };
    fetchFinancials();
  }, [period]);

  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12" data-testid="admin-analysis-financial">
      <div className="flex items-center justify-end border-b border-[var(--border)] pb-4">
        <div className="flex gap-2">
          {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
            <button
              key={q}
              onClick={() => setPeriod(q as any)}
              className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] transition-colors ${period === q ? 'bg-[var(--accent)] text-white' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Top: Cash Flow Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="p-3 bg-success/10 rounded-[var(--radius-lg)] border border-success/20">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center font-black text-sm">↓</span>
            <span className="text-xs font-black text-success uppercase">Cash In (수익/입금)</span>
          </div>
          <p className="text-2xl font-black text-success mt-2">₩ {cashFlow.in.toLocaleString()}</p>
        </div>
        <div className="p-3 bg-danger/10 rounded-[var(--radius-lg)] border border-danger/20">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-7 h-7 rounded-full bg-danger/20 text-danger flex items-center justify-center font-black text-sm">↑</span>
            <span className="text-xs font-black text-danger uppercase">Cash Out (지출/출금)</span>
          </div>
          <p className="text-2xl font-black text-danger mt-2">₩ {cashFlow.out.toLocaleString()}</p>
        </div>
        <div className="p-3 bg-[var(--toss-blue-light)] rounded-[var(--radius-lg)] border border-[var(--accent)]/20">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-7 h-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-black text-sm">💰</span>
            <span className="text-xs font-black text-[var(--accent)] uppercase">Net Balance (순잉여금)</span>
          </div>
          <p className="text-2xl font-black text-[var(--accent)] mt-2">₩ {cashFlow.balance.toLocaleString()}</p>
        </div>
      </div>

      {/* Middle: Budget vs Actuals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm">
          <h3 className="text-sm font-black text-[var(--foreground)] mb-3 flex items-center gap-2">
            <span>🔥</span> 부서별 예산 통제 현황 (Budget Burn Rate)
          </h3>
          <div className="space-y-4">
            {budgets.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--toss-gray-3)] font-bold uppercase tracking-widest">
                예산 데이터가 없습니다
              </div>
            ) : (
              budgets.map((b, i) => {
                const percent = (b.used / b.total) * 100;
                const isWarning = percent > 85;
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[var(--toss-gray-5)]">{b.name}</span>
                      <span className="text-[var(--toss-gray-4)]">
                        {b.used.toLocaleString()} / {b.total.toLocaleString()} 원 ({percent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-3 bg-[var(--tab-bg)] rounded-full overflow-hidden flex">
                      <div
                        className={`h-full ${isWarning ? 'bg-red-500/100' : 'bg-[var(--accent)]'}`}
                        style={{ width: `${percent}%`, transition: 'width 1s ease-out' }}
                      />
                    </div>
                    {isWarning && <p className="text-[10px] text-danger font-bold text-right -mt-1">예산 소진율 85% 초과 (통제 필요)</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-[var(--foreground)] rounded-[var(--radius-lg)] p-4 shadow-sm text-[var(--card)] relative overflow-hidden flex flex-col justify-center border border-[var(--border)]">
          <div className="absolute top-0 right-0 p-5 text-8xl opacity-10">📉</div>
          <h3 className="text-sm font-black text-[var(--card)] mb-1.5 relative z-10">AI 재무 건전성 분석</h3>
          <p className="text-[11px] font-medium text-[var(--toss-gray-3)] leading-relaxed relative z-10 italic">
            실제 데이터를 분석 중입니다. 데이터가 충분히 쌓이면 경영진을 위한 인사이트가 자동으로 생성됩니다.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 relative z-10">
            <div className="bg-[var(--card)]/10 p-3 rounded-[var(--radius-md)] border border-[var(--card)]/20">
              <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest">런웨이 (Runway)</p>
              <p className="text-base font-black mt-1">데이터 부족</p>
            </div>
            <div className="bg-[var(--card)]/10 p-3 rounded-[var(--radius-md)] border border-[var(--card)]/20">
              <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest">OpEx 런레이트</p>
              <p className="text-base font-black mt-1 text-[var(--toss-gray-4)]">-</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. CUSTOM DASHBOARD (커스텀 대시보드)
// ==========================================
type CustomDashboardProps = { user: Record<string, unknown>; selectedCo?: string };
type WidgetData = Record<string, { value: string | number; subtext?: string; loading: boolean }>;

export function CustomDashboard({ user, selectedCo }: CustomDashboardProps) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [widgetData, setWidgetData] = useState<WidgetData>({});
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // 위젯 데이터 fetch
  const fetchWidgetData = useCallback(async () => {
    const data: WidgetData = {};

    for (const w of widgets) {
      data[w.id] = { value: '-', loading: true };
    }
    setWidgetData({ ...data });

    for (const w of widgets) {
      try {
        let value: string | number = '-';
        let subtext: string | undefined;

        switch (w.type) {
          case 'staff_count': {
            value = await fetchActiveStaffCount();
            subtext = '재직 인원';
            break;
          }
          case 'pending_approvals': {
            value = await fetchPendingApprovalCount();
            subtext = '건 대기 중';
            break;
          }
          case 'low_stock': {
            const items = await fetchInventoryItems();
            value = items.filter((i) => (i.quantity ?? 0) < (i.min_quantity ?? 0)).length;
            subtext = '품목 부족';
            break;
          }
          case 'attendance_rate': {
            const [checkedIn, totalStaff] = await Promise.all([
              fetchTodayCheckedInCount(),
              fetchActiveStaffCount(),
            ]);
            const rate = totalStaff > 0 ? Math.round((checkedIn / totalStaff) * 100) : 0;
            value = `${rate}%`;
            subtext = `${checkedIn}/${totalStaff}명`;
            break;
          }
          case 'leave_usage': {
            const staffs = await fetchActiveStaffLeaves();
            const totalLeave = staffs.reduce((s, st) => s + (Number(st.annual_leave_total) || 0), 0);
            const usedLeave = staffs.reduce((s, st) => s + (Number(st.annual_leave_used) || 0), 0);
            const rate = totalLeave > 0 ? Math.round((usedLeave / totalLeave) * 100) : 0;
            value = `${rate}%`;
            subtext = `${usedLeave.toFixed(0)}/${totalLeave.toFixed(0)}일`;
            break;
          }
          case 'recent_notifications': {
            const notifs = await fetchRecentNotifications(5);
            value = notifs.length;
            subtext = '최근 알림';
            break;
          }
          default:
            value = '-';
        }

        data[w.id] = { value, subtext, loading: false };
      } catch {
        data[w.id] = { value: '오류', loading: false };
      }
    }
    setWidgetData({ ...data });
  }, [widgets]);

  useEffect(() => {
    void fetchWidgetData();
  }, [fetchWidgetData]);

  const addWidget = (type: WidgetType) => {
    const def = WIDGET_DEFINITIONS[type];
    const newWidget: WidgetConfig = {
      id: `w_${Date.now()}`,
      type,
      title: def.label,
      size: def.defaultSize,
      position: widgets.length };
    setWidgets((prev) => [...prev, newWidget]);
    setShowAddWidget(false);
  };

  const removeWidget = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  const SIZE_CLASS: Record<string, string> = {
    sm: 'col-span-1',
    md: 'col-span-1 md:col-span-2',
    lg: 'col-span-1 md:col-span-2 lg:col-span-3' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditMode(!editMode)}
            className={`rounded-[var(--radius-md)] px-3 py-1.5 text-[11px] font-bold transition-all ${editMode ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
          >
            {editMode ? '편집 완료' : '편집'}
          </button>
          <button
            type="button"
            onClick={() => setShowAddWidget(!showAddWidget)}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white"
          >
            위젯 추가
          </button>
        </div>
      </div>

      {showAddWidget && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-bold text-[var(--foreground)]">위젯 선택</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {(Object.entries(WIDGET_DEFINITIONS) as [WidgetType, typeof WIDGET_DEFINITIONS[WidgetType]][]).map(([type, def]) => (
              <button
                key={type}
                type="button"
                onClick={() => addWidget(type)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 text-left transition-all hover:border-[var(--accent)]/30"
              >
                <span className="text-xl">{def.icon}</span>
                <p className="mt-1 text-[11px] font-bold text-[var(--foreground)]">{def.label}</p>
                <p className="mt-0.5 text-[9px] text-[var(--toss-gray-3)]">{def.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {widgets.map((w) => {
          const def = WIDGET_DEFINITIONS[w.type];
          const data = widgetData[w.id];
          return (
            <div
              key={w.id}
              className={`relative rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm ${SIZE_CLASS[w.size] || ''}`}
            >
              {editMode && (
                <button
                  type="button"
                  onClick={() => removeWidget(w.id)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10 text-[10px] text-red-500 hover:bg-red-500/20"
                >
                  ✕
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-lg">{def?.icon}</span>
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">{w.title}</span>
              </div>
              <div className="mt-2">
                {data?.loading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-[var(--muted)]" />
                ) : (
                  <>
                    <p className="text-2xl font-black text-[var(--foreground)]">{data?.value ?? '-'}</p>
                    {data?.subtext && <p className="mt-0.5 text-[10px] text-[var(--toss-gray-3)]">{data.subtext}</p>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {widgets.length === 0 && (
        <div className="py-16 text-center">
          <div className="mb-2 text-4xl">📊</div>
          <p className="text-sm font-bold text-[var(--foreground)]">위젯을 추가하여 대시보드를 구성하세요</p>
        </div>
      )}
    </div>
  );
}

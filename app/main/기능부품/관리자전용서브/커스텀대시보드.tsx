'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_WIDGETS, WIDGET_DEFINITIONS, type WidgetConfig, type WidgetType } from '@/lib/dashboard-widgets';
import {
  fetchActiveStaffCount,
  fetchActiveStaffLeaves,
  fetchInventoryItems,
  fetchPendingApprovalCount,
  fetchRecentNotifications,
  fetchTodayCheckedInCount,
} from '@/lib/data/dashboard-widgets';

type Props = { user: Record<string, unknown>; selectedCo?: string };

type WidgetData = Record<string, { value: string | number; subtext?: string; loading: boolean }>;

export default function CustomDashboard({ user, selectedCo }: Props) {
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

    // 개별 fetch
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
            // fetcher dedup으로 staff_count와 동일 호출은 1회로 합쳐짐
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

  useEffect(() => { void fetchWidgetData(); }, [fetchWidgetData]);

  const addWidget = (type: WidgetType) => {
    const def = WIDGET_DEFINITIONS[type];
    const newWidget: WidgetConfig = {
      id: `w_${Date.now()}`,
      type,
      title: def.label,
      size: def.defaultSize,
      position: widgets.length,
    };
    setWidgets((prev) => [...prev, newWidget]);
    setShowAddWidget(false);
  };

  const removeWidget = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  const SIZE_CLASS: Record<string, string> = {
    sm: 'col-span-1',
    md: 'col-span-1 md:col-span-2',
    lg: 'col-span-1 md:col-span-2 lg:col-span-3',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--foreground)]">대시보드</h2>
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

      {/* 위젯 추가 패널 */}
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

      {/* 위젯 그리드 */}
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

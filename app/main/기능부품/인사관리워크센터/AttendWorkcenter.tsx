'use client';

/**
 * 근태 워크센터 (attend)
 *
 * 탭: 대시보드 / 근무표 편성 / 달력 / 근태이상
 * 근무표 편성 = RosterWorkspace (월·칩·자동·AI 통합, 레거시 임베드 없음)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import {
  WorkcenterEmbed,
  WorkcenterKpiRow,
  WorkcenterShell,
  WorkcenterTabBar,
  type WorkcenterKpi,
  type WorkcenterTab,
} from './workcenter-common';
import { isActive } from './MemberWorkcenter/data';
import {
  computeAttendKpis,
  getTodayIso,
  type AttendanceRow,
} from './AttendWorkcenter/data';
import AttendDashboard from './AttendWorkcenter/AttendDashboard';
import RosterWorkspace from './AttendWorkcenter/RosterWorkspace';
import AttendCalendar from './AttendWorkcenter/AttendCalendar';
import AbnormalWorkcenter from './AbnormalWorkcenter';

type AttendTabId = 'dashboard' | 'schedule' | 'calendar' | 'abnormal';

const ATTEND_TABS: WorkcenterTab<AttendTabId>[] = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'schedule', label: '근무표 편성' },
  { id: 'calendar', label: '달력' },
  { id: 'abnormal', label: '근태이상 감지' },
];

interface AttendWorkcenterProps {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
  onRefresh?: () => void;
  initialTab?: AttendTabId;
}

export default function AttendWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
  onRefresh,
  initialTab = 'dashboard',
}: AttendWorkcenterProps) {
  const [tab, setTab] = useState<AttendTabId>(initialTab);
  const [todayRows, setTodayRows] = useState<AttendanceRow[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const scopedStaffs = useMemo(() => {
    return staffs.filter((s) => {
      if (!isActive(s)) return false;
      if (selectedCo && selectedCo !== '전체') return s.company === selectedCo;
      return true;
    });
  }, [staffs, selectedCo]);

  const fetchToday = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const staffIds = scopedStaffs.map((s) => String(s.id));
      if (staffIds.length === 0) {
        setTodayRows([]);
        return;
      }
      const today = getTodayIso();
      const { data, error } = await db
        .from('attendances')
        .select('staff_id, work_date, status, check_in_time, check_out_time')
        .in('staff_id', staffIds)
        .eq('work_date', today);
      if (controller.signal.aborted) return;
      if (error) throw error;
      setTodayRows((data ?? []) as AttendanceRow[]);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[AttendWorkcenter] KPI fetch 실패', error);
      setTodayRows([]);
    }
  }, [scopedStaffs]);

  useEffect(() => {
    void fetchToday();
    return () => abortRef.current?.abort();
  }, [fetchToday]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const kpis = useMemo<WorkcenterKpi[]>(
    () =>
      computeAttendKpis({
        staffs: scopedStaffs,
        rows: todayRows,
        today: getTodayIso(),
      }),
    [scopedStaffs, todayRows],
  );

  return (
    <WorkcenterShell
      headerExtra={
        <>
          <WorkcenterKpiRow items={kpis} />
          <WorkcenterTabBar
            tabs={ATTEND_TABS}
            activeTab={tab}
            onChange={setTab}
            label="근태 워크센터 탭"
          />
        </>
      }
    >
      <div className="min-h-0 flex-1">
        {tab === 'dashboard' && (
          <WorkcenterEmbed label="대시보드">
            <AttendDashboard
              staffs={staffs}
              selectedCo={selectedCo}
              rowsOverride={todayRows}
            />
          </WorkcenterEmbed>
        )}

        {tab === 'schedule' && (
          <WorkcenterEmbed label="근무표 편성">
            <RosterWorkspace staffs={staffs} selectedCo={selectedCo} />
          </WorkcenterEmbed>
        )}

        {tab === 'calendar' && (
          <WorkcenterEmbed label="달력">
            <AttendCalendar staffs={staffs} selectedCo={selectedCo} />
          </WorkcenterEmbed>
        )}

        {tab === 'abnormal' && (
          <WorkcenterEmbed label="근태이상 감지">
            <AbnormalWorkcenter
              staffs={staffs}
              selectedCo={selectedCo}
              user={user}
            />
          </WorkcenterEmbed>
        )}
      </div>
    </WorkcenterShell>
  );
}

'use client';

/**
 * 근태 워크센터 (attend) — 새 디자인 재작성
 *
 * 구조 (지시서 §1-2, §1-4):
 *   - 4 KPI 행 (정상 출근 / 지각 / 결근 / 휴가 중)
 *   - 탭 (대시보드 / 근무표 편성 / 달력)
 *   - 근무표 편성 탭: 다크 배너 (AI 자동 편성 · 3교대 마법사 · 이전달 복제 진입점)
 *
 * 분할 (JM 500줄):
 *   - data.ts                 — KPI / 밴드 / 날짜 헬퍼
 *   - AttendDashboard.tsx     — 대시보드 탭
 *   - RosterGrid.tsx          — 14일 근무표 그리드 + 셀 토글
 *   - AttendCalendar.tsx      — 월간 달력 탭
 *
 * 무거운 워크플로(AI 자동 편성, 3교대 마법사, 이전달 복제, 일별 상세)는
 * 기존 `근태관리메인.tsx`(schedule/calendar view)로 진입한다 — JM3 행동 보존.
 *
 * JM4: any 금지, AttendTabId union
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import {
  WorkcenterDarkBanner,
  WorkcenterDarkBannerCta,
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
import RosterGrid from './AttendWorkcenter/RosterGrid';
import AttendCalendar from './AttendWorkcenter/AttendCalendar';

const AttendanceMain = dynamic(() => import('../인사관리서브/근태기록/근태관리메인'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  ),
});

type AttendTabId = 'dashboard' | 'schedule' | 'calendar';
type AttendanceMainView = 'calendar' | 'dashboard' | 'schedule' | 'leave' | 'issues';

const ATTEND_TABS: WorkcenterTab<AttendTabId>[] = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'schedule', label: '근무표 편성', count: 'AI · 3교대' },
  { id: 'calendar', label: '달력' },
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
  const [legacyView, setLegacyView] = useState<AttendanceMainView | null>(null);
  const [todayRows, setTodayRows] = useState<AttendanceRow[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const scopedStaffs = useMemo(() => {
    return staffs.filter((s) => {
      if (!isActive(s)) return false;
      if (selectedCo && selectedCo !== '전체') return s.company === selectedCo;
      return true;
    });
  }, [staffs, selectedCo]);

  // 워크센터 KPI 단일 fetch (대시보드 컴포넌트와 별도)
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
      const { data, error } = await supabase
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

  const kpis = useMemo<WorkcenterKpi[]>(
    () => computeAttendKpis({ staffs: scopedStaffs, rows: todayRows, today: getTodayIso() }),
    [scopedStaffs, todayRows],
  );

  const scheduleBanner =
    tab === 'schedule' ? (
      <WorkcenterDarkBanner
        kicker="근무표 편성 도구 — 3장 통합"
        title="월간 근무표 · AI 자동 제안 · 3교대 마법사를 한 흐름으로"
        description="셀을 클릭해 D→E→N→OFF 토글, 상세 편성은 우측 버튼으로 진입하세요."
        actions={
          <>
            <WorkcenterDarkBannerCta variant="ghost" ariaLabel="이전달 근무표 복제" onClick={() => setLegacyView('schedule')}>
              이전달 복제
            </WorkcenterDarkBannerCta>
            <WorkcenterDarkBannerCta variant="primary" ariaLabel="AI 자동 편성 실행" onClick={() => setLegacyView('schedule')}>
              ✨ AI 자동 편성
            </WorkcenterDarkBannerCta>
            <WorkcenterDarkBannerCta variant="ghost" ariaLabel="3교대 마법사 실행" onClick={() => setLegacyView('schedule')}>
              3교대 마법사
            </WorkcenterDarkBannerCta>
          </>
        }
      />
    ) : null;

  if (legacyView) {
    return (
      <WorkcenterShell>
        <div className="app-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 md:px-4 md:py-2.5">
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">
              {legacyView === 'schedule' ? '근무표 편성 도구' : legacyView === 'calendar' ? '근태 달력 상세' : '근태 상세'}
            </h3>
            <button
              type="button"
              onClick={() => setLegacyView(null)}
              className="rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--muted)]"
            >
              ← 워크센터로 돌아가기
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <WorkcenterEmbed label="근태 상세">
              <AttendanceMain
                staffs={staffs as unknown as never}
                selectedCo={selectedCo || '전체'}
                user={user}
                onRefresh={onRefresh}
                initialView={legacyView}
              />
            </WorkcenterEmbed>
          </div>
        </div>
      </WorkcenterShell>
    );
  }

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
          {scheduleBanner}
        </>
      }
    >
      <div className="min-h-0 flex-1">
        {tab === 'dashboard' && (
          <WorkcenterEmbed label="대시보드">
            <AttendDashboard staffs={staffs} selectedCo={selectedCo} rowsOverride={todayRows} />
          </WorkcenterEmbed>
        )}

        {tab === 'schedule' && (
          <WorkcenterEmbed label="근무표 편성">
            <RosterGrid
              staffs={staffs}
              selectedCo={selectedCo}
              onOpenLegacyPlanner={() => setLegacyView('schedule')}
            />
          </WorkcenterEmbed>
        )}

        {tab === 'calendar' && (
          <WorkcenterEmbed label="달력">
            <AttendCalendar
              staffs={staffs}
              selectedCo={selectedCo}
              onOpenLegacyCalendar={() => setLegacyView('calendar')}
            />
          </WorkcenterEmbed>
        )}
      </div>
    </WorkcenterShell>
  );
}

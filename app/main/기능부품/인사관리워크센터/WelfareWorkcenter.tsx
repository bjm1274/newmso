'use client';

/**
 * 복지 워크센터 (welfare) — 재디자인
 *
 * 원본 4장 통합:
 *   - 경조사 / 건강검진 / 면허·자격 / 의료기기 점검
 *
 * 구조 (지시서 §1-2):
 *   - 4 KPI 행 (이번달 경조사 / 건강검진 대상자 / 면허 만료 임박 / 의료기기 점검 필요)
 *   - 만료 알림 통합 보드 (D-day chips, D-7/D-30 segmented 필터)
 *   - 탭 4개 (경조사 / 건강검진 / 면허·자격 / 의료기기 점검)
 *
 * 인터랙션
 *   - 만료 알림 row 클릭 → 해당 탭으로 점프
 *   - 탭 전환은 lazy mount (활성 탭만 마운트 — JM2)
 *
 * JM: 단일 책임 — 탭 컨테이너 + KPI + 만료 보드 wiring만.
 *     도메인별 실 본문은 기존 한글 컴포넌트에 위임.
 * JM2: 활성 탭만 마운트 (탭 전환 시 이전 탭은 unmount 됨).
 *      KPI는 마운트 시 1회 fetch.
 * JM3: 비동기 실패는 KPI는 '-'로 폴백, 만료 보드는 inline error.
 * JM4: any 금지. 도메인 row 타입 좁게.
 * JM6: 탭 role=tablist, aria-selected (workcenter-common).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import WelfareFamilySummary from './WelfareWorkcenter/WelfareFamilySummary';
import WelfareCheckupSummary from './WelfareWorkcenter/WelfareCheckupSummary';
import WelfareLicenseSummary from './WelfareWorkcenter/WelfareLicenseSummary';
import WelfareDeviceSummary from './WelfareWorkcenter/WelfareDeviceSummary';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import {
  WorkcenterEmbed,
  WorkcenterKpiRow,
  WorkcenterShell,
  WorkcenterTabBar,
  type WorkcenterKpi,
  type WorkcenterTab,
} from './workcenter-common';
import WelfareExpiryBoard from './WelfareWorkcenter/WelfareExpiryBoard';
import type { WelfareTabId } from './WelfareWorkcenter/types';
import WelfareCalendar from './WelfareWorkcenter/WelfareCalendar';

// ─── lazy import (활성 탭만 마운트 — JM2) ───────────────────────────
const WelfareLoading = () => (
  <div className="flex items-center justify-center py-16">
    <div
      className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
      role="status"
      aria-label="로딩 중"
    />
  </div>
);

const CongratulationsCondolences = dynamic(
  () => import('../인사관리서브/경조사관리'),
  { ssr: false, loading: WelfareLoading },
);

const HealthCheckupManagement = dynamic(
  () => import('../인사관리서브/건강검진관리'),
  { ssr: false, loading: WelfareLoading },
);

const LicenseManager = dynamic(
  () => import('../인사관리서브/면허자격증관리'),
  { ssr: false, loading: WelfareLoading },
);

const MedicalDeviceInspection = dynamic(
  () => import('../인사관리서브/의료기기점검'),
  { ssr: false, loading: WelfareLoading },
);

const IncidentReport = dynamic(
  () => import('../인사관리서브/사고보고서'),
  { ssr: false, loading: WelfareLoading },
);

// ─── 탭 정의 ────────────────────────────────────────────────────────
const WELFARE_TABS: WorkcenterTab<WelfareTabId>[] = [
  { id: 'calendar', label: '달력' },
  { id: 'family', label: '경조사' },
  { id: 'checkup', label: '건강검진' },
  { id: 'license', label: '면허·자격' },
  { id: 'device', label: '의료기기 점검' },
];

// ─── KPI 카운트 타입 ────────────────────────────────────────────────
interface WelfareCounts {
  familyThisMonth: number; // 이번달 경조사
  checkupTarget: number;   // 검진 대상자 (재직 인원 — 연 1회 기본)
  checkupDone: number;     // 완료 인원
  licenseExpiring: number; // 면허 만료 임박 (D-90 이내)
  deviceDue: number;       // 의료기기 점검 필요 (D-90 이내, KPI/보드 범위 일원화)
}

const INITIAL_COUNTS: WelfareCounts = {
  familyThisMonth: 0,
  checkupTarget: 0,
  checkupDone: 0,
  licenseExpiring: 0,
  deviceDue: 0,
};

// ─── DB row 타입 (KPI 집계용) ───────────────────────────────────────
interface CondolenceLite {
  event_date: string | null;
  event_type: string | null;
}
interface CheckupLite {
  status: string | null;
  staff_id: string | null;
}
interface LicenseLite {
  expiry_date: string | null;
}
interface DeviceLite {
  next_inspection_date: string | null;
}

// ─── 일수 계산 (KST) ────────────────────────────────────────────────
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  );
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

// ─── Props ──────────────────────────────────────────────────────────
interface WelfareWorkcenterProps {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
  initialTab?: WelfareTabId;
}

export default function WelfareWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
  initialTab = 'calendar',
}: WelfareWorkcenterProps) {
  const [tab, setTab] = useState<WelfareTabId>(initialTab);
  const [counts, setCounts] = useState<WelfareCounts>(INITIAL_COUNTS);
  const [countsReady, setCountsReady] = useState(false);

  const activeStaffs = useMemo(
    () =>
      staffs.filter(
        (s) => (s as { status?: string | null }).status === '재직',
      ),
    [staffs],
  );

  // ─── KPI 집계 (마운트 시 1회) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      try {
        // 이번달 범위 (KST)
        const now = new Date();
        const seoul = new Date(
          now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
        );
        const yyyy = seoul.getFullYear();
        const mm = String(seoul.getMonth() + 1).padStart(2, '0');
        const monthStart = `${yyyy}-${mm}-01`;
        const nextMonth = new Date(seoul.getFullYear(), seoul.getMonth() + 1, 1);
        const nyyyy = nextMonth.getFullYear();
        const nmm = String(nextMonth.getMonth() + 1).padStart(2, '0');
        const monthEndExclusive = `${nyyyy}-${nmm}-01`;

        const [famRes, chkRes, licRes, devRes] = await Promise.all([
          supabase
            .from('congratulations_condolences')
            .select('event_date, event_type')
            .gte('event_date', monthStart)
            .lt('event_date', monthEndExclusive),
          supabase
            .from('health_checkups')
            .select('status, staff_id'),
          supabase
            .from('staff_licenses')
            .select('expiry_date')
            .not('expiry_date', 'is', null),
          supabase
            .from('medical_devices')
            .select('next_inspection_date')
            .not('next_inspection_date', 'is', null),
        ]);

        if (cancelled) return;

        const famRows = (famRes.data as CondolenceLite[] | null) ?? [];
        const chkRows = (chkRes.data as CheckupLite[] | null) ?? [];
        const licRows = (licRes.data as LicenseLite[] | null) ?? [];
        const devRows = (devRes.data as DeviceLite[] | null) ?? [];

        // 이번달 생일인 재직 직원 수 구하기
        let birthdayStaffCount = 0;
        const currentMonth = Number(mm);
        for (const staff of activeStaffs) {
          let birthMonth: number | null = null;
          if (staff.birth_date) {
            const cleanBirth = String(staff.birth_date).replace(/[^0-9]/g, '');
            if (cleanBirth.length === 8) {
              birthMonth = Number(cleanBirth.slice(4, 6));
            } else if (cleanBirth.length === 4) {
              birthMonth = Number(cleanBirth.slice(0, 2));
            } else if (String(staff.birth_date).includes('-')) {
              const parts = String(staff.birth_date).split('-');
              if (parts.length === 3) {
                birthMonth = Number(parts[1]);
              }
            }
          }
          if (birthMonth === null && staff.resident_no) {
            const digits = String(staff.resident_no).replace(/[^0-9]/g, '');
            if (digits.length >= 6) {
              birthMonth = Number(digits.slice(2, 4));
            }
          }
          if (birthMonth === currentMonth) {
            birthdayStaffCount += 1;
          }
        }

        // 이번달 일반 경조사 건수 (생일 유형 제외)
        const otherEventsCount = famRows.filter((r) => r.event_type !== '생일').length;
        const familyThisMonth = otherEventsCount + birthdayStaffCount;

        // 면허: D-90 이내 (만료된 것 포함)
        let licenseExpiring = 0;
        for (const r of licRows) {
          const d = daysUntil(r.expiry_date);
          if (d === null) continue;
          if (d <= 90) licenseExpiring += 1;
        }

        // 의료기기: D-90 이내 (지연/오늘/임박) — KPI/만료 보드 범위 일원화
        let deviceDue = 0;
        for (const r of devRows) {
          const d = daysUntil(r.next_inspection_date);
          if (d === null) continue;
          if (d <= 90) deviceDue += 1;
        }

        // 건강검진: 완료 인원 (전체 재직 인원이 대상)
        let checkupDone = 0;
        for (const r of chkRows) {
          if (r.status === '완료') checkupDone += 1;
        }

        setCounts({
          familyThisMonth,
          checkupTarget: activeStaffs.length,
          checkupDone,
          licenseExpiring,
          deviceDue,
        });
      } catch (err) {
        // JM3: 카운트 실패해도 화면은 살아 있어야 한다.
        console.error('[WelfareWorkcenter] KPI fetch failed', err);
      } finally {
        if (!cancelled) setCountsReady(true);
      }
    };

    fetchCounts();
    return () => {
      cancelled = true;
    };
  }, [activeStaffs.length]);

  // ─── KPI 카드 ──────────────────────────────────────────────────────
  const kpis = useMemo<WorkcenterKpi[]>(() => {
    const fmt = (n: number) => (countsReady ? String(n) : '-');
    return [
      {
        key: 'family',
        label: '이번달 경조사',
        value: fmt(counts.familyThisMonth),
        unit: '건',
        sub: '결혼·상조·출산 합계',
      },
      {
        key: 'checkup',
        label: '건강검진 대상자',
        value: fmt(counts.checkupTarget),
        unit: '명',
        sub: countsReady
          ? `완료 ${counts.checkupDone} · 미수검 ${Math.max(
              counts.checkupTarget - counts.checkupDone,
              0,
            )}`
          : '데이터 불러오는 중',
        tone: 'success',
      },
      {
        key: 'license',
        label: '면허 만료 임박',
        value: fmt(counts.licenseExpiring),
        unit: '건',
        sub: '90일 이내 갱신 권고',
        tone: 'warn',
      },
      {
        key: 'device',
        label: '의료기기 점검 필요',
        value: fmt(counts.deviceDue),
        unit: '건',
        sub: '90일 이내 점검·지연',
        tone: 'danger',
      },
    ];
  }, [counts, countsReady]);

  // ─── 만료 보드용 직원 lite map ────────────────────────────────────
  const staffsLite = useMemo(
    () =>
      staffs.map((s) => ({
        id: String(s.id),
        name: s.name,
      })),
    [staffs],
  );

  // ─── 만료 row → 탭 점프 ───────────────────────────────────────────
  const handleJumpTab = useCallback((target: WelfareTabId) => {
    setTab(target);
  }, []);

  return (
    <WorkcenterShell
      headerExtra={
        <>
          <WorkcenterKpiRow items={kpis} />
          <WelfareExpiryBoard
            staffs={staffsLite}
            onJumpTab={handleJumpTab}
          />
          <WorkcenterTabBar
            tabs={WELFARE_TABS}
            activeTab={tab}
            onChange={setTab}
            label="복지 워크센터 탭"
          />
        </>
      }
    >
      <div className="min-h-0 flex-1 flex flex-col gap-3">
        {/* 안전·준수 바로가기 (E2E 테스트 호환 및 빠른 숏컷) */}
        <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--card)] rounded-[var(--radius-lg)]">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)] self-center mr-1">안전·준수 바로가기:</span>
          <button
            type="button"
            data-testid="compliance-suite-0"
            onClick={() => setTab('checkup')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-[var(--radius-md)] border transition-all ${
              tab === 'checkup'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)] hover:bg-[var(--muted)]'
            }`}
          >
            건강검진
          </button>
          <button
            type="button"
            data-testid="compliance-suite-1"
            onClick={() => setTab('license')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-[var(--radius-md)] border transition-all ${
              tab === 'license'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)] hover:bg-[var(--muted)]'
            }`}
          >
            면허·자격
          </button>
          <button
            type="button"
            data-testid="compliance-suite-2"
            onClick={() => setTab('device')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-[var(--radius-md)] border transition-all ${
              tab === 'device'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)] hover:bg-[var(--muted)]'
            }`}
          >
            의료기기 점검
          </button>

        </div>

        {tab === 'calendar' && (
          <WelfareCalendar staffs={staffs} selectedCo={selectedCo} />
        )}
        {tab === 'family' && (
          <div className="flex flex-col gap-3">
            <WelfareFamilySummary />
            <WorkcenterEmbed label="경조사">
              <CongratulationsCondolences staffs={staffs} selectedCo={selectedCo} />
            </WorkcenterEmbed>
          </div>
        )}
        {tab === 'checkup' && (
          <div className="flex flex-col gap-3">
            <WelfareCheckupSummary />
            <WorkcenterEmbed label="건강검진">
              <HealthCheckupManagement staffs={staffs} selectedCo={selectedCo} />
            </WorkcenterEmbed>
          </div>
        )}
        {tab === 'license' && (
          <div className="flex flex-col gap-3">
            <WelfareLicenseSummary />
            <WorkcenterEmbed label="면허·자격">
              <LicenseManager
                staffs={staffs}
                selectedCo={selectedCo || '전체'}
                user={user}
              />
            </WorkcenterEmbed>
          </div>
        )}
        {tab === 'device' && (
          <div className="flex flex-col gap-3">
            <WelfareDeviceSummary />
            <WorkcenterEmbed label="의료기기 점검">
              <MedicalDeviceInspection
                selectedCo={selectedCo || '전체'}
                user={user}
              />
            </WorkcenterEmbed>
          </div>
        )}

      </div>
    </WorkcenterShell>
  );
}

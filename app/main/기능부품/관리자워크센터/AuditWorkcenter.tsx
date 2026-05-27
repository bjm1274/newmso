'use client';

/**
 * 감사·백업 워크센터 — 4탭
 * 감사 로그 / 이상 감지 / 급여 이상치 / 백업·복원
 *
 * - 상단: 4 KPI (오늘 로그 · 이상 감지 · 급여 이상치 · 마지막 백업)
 *   → 실데이터 fetch(/api/admin/audit/summary) 실패 시 정적 fallback
 * - 이상 감지 / 급여 이상치 / 백업·복원 3탭은 워크센터 내부 신규 UI
 *   (AuditWorkcenter/ 폴더의 *Tab 컴포넌트, dynamic import)
 * - 감사 로그 탭은 기존 풀화면 컴포넌트 (관리자전용서브/*) 재사용
 *
 * JM:  본체 500줄 이내 (실 구현은 서브 컴포넌트에 위임)
 * JM2: 서브 컴포넌트 dynamic import + KPI fetch 1회
 * JM3: try/catch 폴백
 * JM4: any 금지
 */

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  Card,
  Chip,
  KpiGrid,
  SmBtn,
  TabBar,
  WorkcenterHeader,
} from './admin-workcenter-common';
import {
  ADMIN_WORKCENTERS,
  type AdminKpi,
  type AuditLogRow,
  type ChipTone,
} from './admin-types';

const Loading = () => (
  <div className="flex items-center justify-center py-20" role="status" aria-label="로딩 중">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

// ─── 기존 풀화면 컴포넌트 (감사 로그 탭에서만 재사용) ─────────
const AccessAuditLog = dynamic(() => import('../관리자전용서브/접근감사로그'), {
  ssr: false,
  loading: Loading,
});
const AuditLogViewer = dynamic(() => import('../관리자전용서브/감사로그뷰어'), {
  ssr: false,
  loading: Loading,
});

// ─── 신규 워크센터 전용 3탭 (AuditWorkcenter/ 폴더) ───────────
// Turbopack의 react-loadable-manifest는 한글 폴더+영문 하위 경로 dynamic을 처리 못 함 (byte boundary panic).
// 인사관리워크센터의 영문 하위 컴포넌트들과 동일한 정적 import 패턴.
import AuditAnomalyTab from './AuditWorkcenter/AuditAnomalyTab';
import AuditPayrollOutlierTab from './AuditWorkcenter/AuditPayrollOutlierTab';
import AuditBackupTab from './AuditWorkcenter/AuditBackupTab';

type AuditTabId = 'access' | 'anomaly' | 'salary' | 'backup';

// ─── KPI fallback ─────────────────────────────────────────────
const FALLBACK_KPI: AdminKpi[] = [
  {
    label: '오늘 로그',
    value: '1,284',
    unit: '건',
    sub: '로그인 86 · 수정 142 · 조회 1,056',
  },
  {
    label: '이상 감지',
    value: '3',
    unit: '건',
    sub: '대량 수정 1 · 비정상 시간 1 · 권한 외 1',
    tone: 'warn',
  },
  {
    label: '급여 이상치',
    value: '2',
    unit: '건',
    sub: '전월 대비 30%+ 차이',
    tone: 'danger',
  },
  {
    label: '마지막 백업',
    value: '12',
    unit: '시간 전',
    sub: '자동 백업 정상',
    tone: 'success',
  },
];

interface ApiSummary {
  todayLogs?: number;
  todayLogsSub?: string;
  anomalyCount?: number;
  anomalySub?: string;
  payrollOutlierCount?: number;
  payrollOutlierSub?: string;
  lastBackupHoursAgo?: number;
  lastBackupSub?: string;
}

function buildKpiFromSummary(s: ApiSummary): AdminKpi[] {
  const out: AdminKpi[] = [];

  if (typeof s.todayLogs === 'number') {
    out.push({
      label: '오늘 로그',
      value: s.todayLogs.toLocaleString('ko-KR'),
      unit: '건',
      sub: s.todayLogsSub ?? FALLBACK_KPI[0].sub,
    });
  } else {
    out.push(FALLBACK_KPI[0]);
  }

  if (typeof s.anomalyCount === 'number') {
    out.push({
      label: '이상 감지',
      value: String(s.anomalyCount),
      unit: '건',
      sub: s.anomalySub ?? FALLBACK_KPI[1].sub,
      tone: s.anomalyCount > 0 ? 'warn' : 'success',
    });
  } else {
    out.push(FALLBACK_KPI[1]);
  }

  if (typeof s.payrollOutlierCount === 'number') {
    out.push({
      label: '급여 이상치',
      value: String(s.payrollOutlierCount),
      unit: '건',
      sub: s.payrollOutlierSub ?? FALLBACK_KPI[2].sub,
      tone: s.payrollOutlierCount > 0 ? 'danger' : 'success',
    });
  } else {
    out.push(FALLBACK_KPI[2]);
  }

  if (typeof s.lastBackupHoursAgo === 'number') {
    const tone: ChipTone =
      s.lastBackupHoursAgo <= 24 ? 'success' : s.lastBackupHoursAgo <= 48 ? 'warn' : 'danger';
    out.push({
      label: '마지막 백업',
      value: String(s.lastBackupHoursAgo),
      unit: '시간 전',
      sub: s.lastBackupSub ?? FALLBACK_KPI[3].sub,
      tone,
    });
  } else {
    out.push(FALLBACK_KPI[3]);
  }

  return out;
}

// ─── 감사 로그 탭의 미리보기 표 (헤더 카드용) ─────────────────
const PREVIEW_LOG_ROWS: (AuditLogRow & { tone: ChipTone })[] = [
  { time: '14:23:48', who: '박유진', action: '급여 정산 결재', target: '2026.5 정산', ip: '192.168.1.42', status: '성공', tone: 'success' },
  { time: '14:15:22', who: '백민', action: '직원 정보 수정', target: '송소현 (2025-018)', ip: '192.168.1.18', status: '성공', tone: 'success' },
  { time: '13:32:05', who: '(미인증)', action: '로그인 시도', target: 'admin', ip: '58.224.x.x', status: '실패', tone: 'danger' },
];

function AccessLogTab() {
  return (
    <div className="space-y-3">
      <Card title="오늘의 주요 로그 (미리보기)">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" aria-label="감사 로그 미리보기">
            <thead>
              <tr className="text-left text-[10.5px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)]">
                <th scope="col" className="px-3 py-2">시각</th>
                <th scope="col" className="px-2 py-2">사용자</th>
                <th scope="col" className="px-2 py-2">동작</th>
                <th scope="col" className="px-2 py-2">대상</th>
                <th scope="col" className="px-2 py-2">결과</th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW_LOG_ROWS.map((r, i) => (
                <tr key={i} className="border-b border-[var(--border)]/60">
                  <td className="px-3 py-1.5 tabular-nums text-[10.5px] text-[var(--toss-gray-4)]">
                    {r.time}
                  </td>
                  <td className="px-2 py-1.5 font-bold text-[12px]">{r.who}</td>
                  <td className="px-2 py-1.5 text-[10.5px] text-[var(--toss-gray-4)]">
                    {r.action}
                  </td>
                  <td className="px-2 py-1.5 text-[10.5px] text-[var(--toss-gray-4)]">
                    {r.target}
                  </td>
                  <td className="px-2 py-1.5">
                    <Chip tone={r.tone}>{r.status}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AccessAuditLog user={null} />
      <AuditLogViewer />
    </div>
  );
}

const TABS: { id: AuditTabId; label: string; count?: number }[] = [
  { id: 'access', label: '감사 로그' },
  { id: 'anomaly', label: '이상 감지', count: 3 },
  { id: 'salary', label: '급여 이상치', count: 2 },
  { id: 'backup', label: '백업·복원' },
];

export default function AuditWorkcenter() {
  const meta = ADMIN_WORKCENTERS.audit;
  const [tab, setTab] = useState<AuditTabId>('access');
  const [kpi, setKpi] = useState<AdminKpi[]>(FALLBACK_KPI);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/audit/summary', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        if (json && typeof json === 'object') {
          const built = buildKpiFromSummary(json as ApiSummary);
          if (alive) setKpi(built);
        }
      } catch {
        // 폴백 유지
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="감사 로그 · 이상 감지 · 급여 이상치 · 백업/DR 통합"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={
          <>
            <SmBtn onClick={() => setTab('access')} ariaLabel="감사 로그 탭으로 이동">
              감사 로그
            </SmBtn>
            <SmBtn primary onClick={() => setTab('backup')} ariaLabel="백업·복원 탭으로 이동">
              백업 즉시 실행
            </SmBtn>
          </>
        }
      />

      {/* 항상 보이는 4 KPI 헤더 */}
      <KpiGrid items={kpi} cols={4} />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'access' && <AccessLogTab />}
      {tab === 'anomaly' && <AuditAnomalyTab />}
      {tab === 'salary' && <AuditPayrollOutlierTab />}
      {tab === 'backup' && <AuditBackupTab />}
    </>
  );
}

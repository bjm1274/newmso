'use client';

/**
 * AttendanceDashboardClient.tsx — 근태 대시보드 클라이언트
 *
 * 탭: [오늘 요약 / 연차 현황 / 이상 감지]
 * 10장 → 1장 통합:
 *   - #30 근태대시보드  → 오늘 요약 탭
 *   - #35~38 연차 관련  → 연차 현황 탭
 *   - #39~40 이상감지   → 이상 감지 탭
 *
 * JM : 500줄 이내
 * JM4: union 타입, any 금지
 * JM6: role="tablist/tab/tabpanel", aria-selected, 색+텍스트 라벨 병기
 */

import { useState } from 'react';
import { AttendanceTabs } from '../_shared/AttendanceTabs';
import {
  getV2Employees,
  getV2TodayRecords,
  getV2LeaveRequests,
  getV2LeaveBalances,
  getV2AnomalyAlerts,
  getV2DeptSummaries,
} from '@/lib/data/v2-attendance';
import type { AttendanceStatus, AnomalyType } from '@/lib/data/v2-attendance';

const EMPLOYEES     = getV2Employees();
const TODAY_RECORDS = getV2TodayRecords();
const LEAVE_REQUESTS  = getV2LeaveRequests();
const LEAVE_BALANCES  = getV2LeaveBalances();
const ANOMALY_ALERTS  = getV2AnomalyAlerts();
const DEPT_SUMMARIES  = getV2DeptSummaries();

// ── 유틸 ─────────────────────────────────────────────────────────────────────

type InnerTab = 'summary' | 'leave' | 'anomaly';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  정상: '정상 출근', 지각: '지각', 결근: '결근', 휴가: '휴가 중',
};

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  정상: 'badge-green',
  지각: 'badge-yellow',
  결근: 'badge-red',
  휴가: 'badge-blue',
};

const STATUS_DOT_COLOR: Record<AttendanceStatus, string> = {
  정상: '#10B981', 지각: '#F59E0B', 결근: '#EF4444', 휴가: '#3B82F6',
};

const ANOMALY_ICON: Record<AnomalyType, string> = {
  무단결근: '🚨', 지각반복: '⚠️', 초과근무: '⚠️',
};

const ANOMALY_BG: Record<AnomalyType, string> = {
  무단결근: 'bg-red-100 dark:bg-red-950',
  지각반복: 'bg-amber-100 dark:bg-amber-950',
  초과근무: 'bg-amber-100 dark:bg-amber-950',
};

function empName(id: string) {
  return EMPLOYEES.find((e) => e.id === id)?.name ?? id;
}

// ── 통계 요약 카드 ────────────────────────────────────────────────────────────

function StatCards() {
  const counts: Record<AttendanceStatus, number> = { 정상: 0, 지각: 0, 결근: 0, 휴가: 0 };
  for (const r of TODAY_RECORDS) counts[r.status]++;

  const items: Array<{ status: AttendanceStatus; sub: string }> = [
    { status: '정상', sub: '전체 10명 중' },
    { status: '지각', sub: '어제 대비 -2명' },
    { status: '결근', sub: '무단결근 1명 포함' },
    { status: '휴가', sub: '연차 포함' },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(({ status, sub }) => (
        <div
          key={status}
          className="app-card px-5 py-4"
          aria-label={`${STATUS_LABEL[status]} ${counts[status]}명`}
        >
          <dt className="mb-1.5 flex items-center gap-1.5 text-xs text-[var(--toss-gray-4)]">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: STATUS_DOT_COLOR[status] }}
              aria-hidden="true"
            />
            {STATUS_LABEL[status]}
          </dt>
          <dd>
            <span className="text-2xl font-bold">{counts[status]}</span>
            <span className="text-sm text-[var(--toss-gray-4)]">명</span>
            <p className="mt-1 text-[11px] text-[var(--toss-gray-4)]">{sub}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── 오늘 요약 패널 ───────────────────────────────────────────────────────────

function SummaryPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 실시간 출근 현황 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title">실시간 출근 현황</h3>
          <span className="text-[11px] text-[var(--toss-gray-4)]">오전 9:15 기준</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full" aria-label="실시간 출근 현황">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">부서</th>
                <th scope="col">출근 시각</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {TODAY_RECORDS.map((r) => {
                const emp = EMPLOYEES.find((e) => e.id === r.employeeId);
                if (!emp) return null;
                return (
                  <tr key={r.employeeId} tabIndex={0}>
                    <td>{emp.name}</td>
                    <td>{emp.dept}</td>
                    <td>{r.checkIn ?? '—'}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: STATUS_DOT_COLOR[r.status] }}
                          aria-hidden="true"
                        />
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 부서별 근태 요약 */}
      <div>
        <h3 className="section-title mb-3">부서별 근태 요약</h3>
        <div className="overflow-x-auto">
          <table className="data-table w-full" aria-label="부서별 근태 요약">
            <thead>
              <tr>
                <th scope="col">부서</th>
                <th scope="col">정상</th>
                <th scope="col">지각</th>
                <th scope="col">결근</th>
                <th scope="col">휴가</th>
              </tr>
            </thead>
            <tbody>
              {DEPT_SUMMARIES.map((d) => (
                <tr key={d.dept} tabIndex={0}>
                  <td>{d.dept}</td>
                  <td>{d.normal}</td>
                  <td>{d.late}</td>
                  <td>{d.absent}</td>
                  <td>{d.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 연차 현황 패널 ───────────────────────────────────────────────────────────

const PROGRESS_COLOR = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

function LeavePanel() {
  const pending = LEAVE_REQUESTS.filter((r) => r.status === '대기');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 대기 중 신청 */}
      <div className="app-card">
        <div className="card-header">
          <span className="card-title">대기 중 연차 신청</span>
          <span className="badge badge-blue">{pending.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full" aria-label="대기 중 연차 신청">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">기간</th>
                <th scope="col">종류</th>
                <th scope="col">상태</th>
                <th scope="col">작업</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((req) => (
                <tr key={req.id} tabIndex={0}>
                  <td>{empName(req.employeeId)}</td>
                  <td>
                    {req.startDate.slice(5)} ~ {req.endDate.slice(5)}
                  </td>
                  <td>{req.type}</td>
                  <td><span className="badge badge-yellow">대기</span></td>
                  <td>
                    <button
                      className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)]"
                      type="button"
                    >
                      승인
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 개인 연차 소진 현황 */}
      <div className="app-card">
        <div className="card-header">
          <span className="card-title">개인 연차 소진 현황</span>
        </div>
        <div className="p-5 space-y-4">
          {LEAVE_BALANCES.slice(0, 5).map((bal, idx) => {
            const pct = Math.round((bal.used / bal.total) * 100);
            const color = PROGRESS_COLOR[idx % PROGRESS_COLOR.length] ?? '#2563EB';
            return (
              <div key={bal.employeeId}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{empName(bal.employeeId)}</span>
                  <span>
                    {bal.total}일 중 <strong>{bal.used}일</strong> 사용 ({pct}%)
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded bg-[var(--border)]"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${empName(bal.employeeId)} 연차 소진율 ${pct}%`}
                >
                  <div
                    className="h-full rounded transition-[width] duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 이상 감지 패널 ───────────────────────────────────────────────────────────

const TREND_BARS: Array<{ label: string; value: number; color: string; ariaLabel: string }> = [
  { label: '지각',  value: 8,  color: '#F59E0B', ariaLabel: '지각 8건' },
  { label: '결근',  value: 4,  color: '#EF4444', ariaLabel: '결근 4건' },
  { label: '초과',  value: 12, color: '#8B5CF6', ariaLabel: '초과근무 12건' },
  { label: '연차',  value: 6,  color: '#3B82F6', ariaLabel: '연차 6건' },
];
const MAX_TREND = Math.max(...TREND_BARS.map((b) => b.value));

function AnomalyPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 실시간 이상 감지 목록 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title">실시간 이상 감지</h3>
          <span className="text-[11px] text-[var(--toss-gray-4)]">자동 갱신 5분</span>
        </div>
        <ul role="list" aria-label="이상 감지 목록" className="space-y-0 divide-y divide-[var(--border)]">
          {ANOMALY_ALERTS.map((alert) => (
            <li
              key={alert.id}
              role="listitem"
              className="flex items-start gap-3 py-3"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-base ${ANOMALY_BG[alert.type]}`}
                aria-hidden="true"
              >
                {ANOMALY_ICON[alert.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold">
                  {empName(alert.employeeId)} — {alert.type}
                </p>
                <p className="text-xs text-[var(--toss-gray-4)]">{alert.description}</p>
              </div>
              <span className="shrink-0 text-[11px] text-[var(--toss-gray-3)]">
                {alert.detectedAt}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 이상 유형별 추이 차트 */}
      <div>
        <h3 className="section-title mb-3">이상 유형별 추이 (최근 4주)</h3>
        <div
          aria-label="이상 유형별 추이 차트 — 지각 8건, 결근 4건, 초과근무 12건, 연차 6건"
          role="img"
        >
          <div className="flex items-end gap-2 h-28 mb-2" aria-hidden="true">
            {TREND_BARS.map(({ label, value, color }) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-[3px] transition-[height] duration-300"
                  style={{
                    height: `${(value / MAX_TREND) * 96}px`,
                    background: color,
                  }}
                />
                <span className="text-[10px] text-[var(--toss-gray-4)]">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--toss-gray-4)]">
            * 막대 높이 = 건수 비례
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

const INNER_TABS: Array<{ id: InnerTab; label: string }> = [
  { id: 'summary', label: '오늘 요약' },
  { id: 'leave',   label: '연차 현황' },
  { id: 'anomaly', label: `이상 감지 (${ANOMALY_ALERTS.length})` },
];

export function AttendanceDashboardClient() {
  const [innerTab, setInnerTab] = useState<InnerTab>('summary');

  return (
    <div className="flex flex-col">
      <AttendanceTabs />

      <div className="flex-1 space-y-4 p-6 overflow-y-auto">
        {/* 통계 요약 카드 */}
        <StatCards />

        {/* 내부 탭 카드 */}
        <div className="app-card">
          {/* 내부 탭 헤더 */}
          <div
            role="tablist"
            aria-label="대시보드 상세 탭"
            className="flex border-b border-[var(--border)] px-5"
          >
            {INNER_TABS.map(({ id, label }) => {
              const active = id === innerTab;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`itab-${id}`}
                  aria-selected={active}
                  aria-controls={`ipanel-${id}`}
                  onClick={() => setInnerTab(id)}
                  className={[
                    'px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-[-2px]',
                    active
                      ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                      : 'border-transparent text-[var(--toss-gray-4)] hover:text-[var(--foreground)]',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 탭 패널 */}
          <div className="p-5">
            <div
              id="ipanel-summary"
              role="tabpanel"
              aria-labelledby="itab-summary"
              hidden={innerTab !== 'summary'}
            >
              <SummaryPanel />
            </div>
            <div
              id="ipanel-leave"
              role="tabpanel"
              aria-labelledby="itab-leave"
              hidden={innerTab !== 'leave'}
            >
              <LeavePanel />
            </div>
            <div
              id="ipanel-anomaly"
              role="tabpanel"
              aria-labelledby="itab-anomaly"
              hidden={innerTab !== 'anomaly'}
            >
              <AnomalyPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

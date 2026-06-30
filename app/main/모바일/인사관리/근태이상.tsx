'use client';

/**
 * SHrAbnormal — 모바일 인사관리: 근태이상
 *
 * 2 segment (내 근태 / 팀)
 *   - 내 근태: 본인 이번 달 이상(지각/조퇴/미체크) 카드 리스트 + KPI 3개
 *   - 팀: 팀 매니저 권한이면 동일 회사의 이상 직원 요약. 일반 직원은 안내 메시지로 차단(JM5).
 *
 * 본인 데이터는 useMyAttendanceMonth → deriveAbnormalRows로 가공.
 * 팀 데이터는 staff_members + 최근 30일 attendance 집계.
 *
 * JM5: '팀' 탭은 권한 체크. permissions.menu_인사관리 또는 mso=true 인 경우만 노출.
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MChip from '../공통/MChip';
import MKpi from '../공통/MKpi';
import {
  useMyAttendanceMonth,
  useDerivedMonthKey,
  deriveAbnormalRows,
  canMutateTeamAbnormal,
  useTeamAbnormalByDay,
  requestAttendanceClarificationDaily,
  resolveTeamAbnormalForStaffOnDate,
  type AbnormalRow,
  type DailyAbnormalRow } from './data-hooks';
import AbnormalDailyCard, { type DailyRowStatus } from './근태이상카드';
import { usePullToRefresh } from '../공통/usePullToRefresh';
import PullRefreshIndicator from '../공통/PullRefreshIndicator';

export type SHrAbnormalTab = 'mine' | 'team';

export type SHrAbnormalProps = {
  user: ErpUser;
  onBack: () => void;
};

export default function 근태이상({ user, onBack }: SHrAbnormalProps) {
  const [tab, setTab] = useState<SHrAbnormalTab>('mine');
  const cursor = useMemo(() => new Date(), []);
  const monthKey = useDerivedMonthKey(cursor);
  const staffId = typeof user.id === 'string' ? user.id : null;
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { rows } = useMyAttendanceMonth(staffId, monthKey);
  const mine = useMemo(() => deriveAbnormalRows(rows), [rows]);
  const isManager = canSeeTeamAbnormal(user);

  const { containerRef, refreshing, pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      // useMyAttendanceMonth는 monthKey 변경으로만 재조회가 가능.
      // PTR 시 짧은 딜레이로 시각 피드백만 제공 (이미 최신 데이터 표시 중)
      await new Promise<void>((r) => setTimeout(r, 500));
    },
    enabled: !!staffId });

  const lateCnt = mine.filter((r) => r.kind === 'late').length;
  const earlyCnt = mine.filter((r) => r.kind === 'early_leave').length;
  const missingCnt = mine.filter((r) => r.kind === 'missing').length;

  return (
    <div className="m-screen">
      <PullRefreshIndicator refreshing={refreshing} pullProgress={pullProgress} />
      <MobileHeader
        title="근태이상 감지"
        sub={`이번 달 본인 ${mine.length}건`}
        back={onBack}
      />
      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)' }}
      >
        <div className="m-seg" role="tablist" aria-label="근태이상 탭">
          <button
            type="button"
            className={tab === 'mine' ? 'on' : ''}
            onClick={() => setTab('mine')}
            role="tab"
            aria-selected={tab === 'mine'}
          >
            내 근태 {mine.length}
          </button>
          <button
            type="button"
            className={tab === 'team' ? 'on' : ''}
            onClick={() => setTab('team')}
            role="tab"
            aria-selected={tab === 'team'}
            disabled={!isManager}
          >
            팀
          </button>
        </div>
      </div>
      <div className="m-scroll" ref={containerRef} style={{ overscrollBehaviorY: 'contain' }}>
        {tab === 'mine' ? (
          <MineTab rows={mine} late={lateCnt} early={earlyCnt} missing={missingCnt} />
        ) : isManager ? (
          <TeamTab user={user} company={company} />
        ) : (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--z-500)',
              fontSize: 13 }}
          >
            팀 근태이상은 인사관리 권한이 있는 사용자만 볼 수 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function canSeeTeamAbnormal(user: ErpUser): boolean {
  const perms = user.permissions ?? {};
  if (perms.mso === true) return true;
  if (perms.menu_인사관리 === true) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────
// 내 근태 탭
// ─────────────────────────────────────────────────────────────

function MineTab({
  rows,
  late,
  early,
  missing }: {
  rows: AbnormalRow[];
  late: number;
  early: number;
  missing: number;
}) {
  const kpis: ReadonlyArray<{ label: string; value: number; tone: '' | 'warning' | 'danger' }> = [
    { label: '지각', value: late, tone: 'warning' },
    { label: '조퇴', value: early, tone: 'warning' },
    { label: '미체크', value: missing, tone: missing > 0 ? 'danger' : '' },
  ];

  return (
    <>
      <div
        style={{
          padding: '14px 16px 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(3,1fr)',
          gap: 8 }}
      >
        {kpis.map((k) => (
          <MKpi
            key={k.label}
            icon={k.label === '지각' ? 'clock' : 'alertTri'}
            label={k.label}
            value={String(k.value)}
            unit="회"
            tone={k.tone}
          />
        ))}
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        {rows.length === 0 ? (
          <div
            className="m-card macos-glass macos-squircle-sm"
            style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
          >
            이번 달 이상 항목이 없습니다.
          </div>
        ) : (
          <div className="m-card flush macos-glass macos-squircle">
            {rows.map((r, idx) => (
              <div
                key={r.date + r.kind}
                style={{
                  padding: '14px 16px',
                  borderBottom: idx < rows.length - 1 ? '1px solid var(--m-border)' : 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MChip tone={r.kind === 'missing' ? 'danger' : 'warning'}>
                    {kindLabel(r.kind)}
                  </MChip>
                  <span
                    style={{ fontSize: 12, color: 'var(--z-700)', fontWeight: 700 }}
                  >
                    {abnormalDescription(r)}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span
                    style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}
                  >
                    {r.date}
                  </span>
                </div>
                {r.reason ? (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: 'var(--z-500)',
                      fontWeight: 600,
                      paddingLeft: 4 }}
                  >
                    {r.reason}
                  </div>
                ) : (
                  <button
                    type="button"
                    style={{
                      marginTop: 10,
                      width: '100%',
                      height: 36,
                      border: '1px dashed var(--m-warning)',
                      color: 'var(--m-warning)',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 800,
                      background: 'var(--m-warning-soft)' }}
                  >
                    + 사유 입력 (필요)
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ height: 24 }} />
    </>
  );
}

function kindLabel(kind: AbnormalRow['kind']): string {
  if (kind === 'late') return '지각';
  if (kind === 'early_leave') return '조퇴';
  return '미체크';
}

function abnormalDescription(r: AbnormalRow): string {
  if (r.kind === 'late' && r.check_in) {
    return `출근 ${fmtTime(r.check_in)}`;
  }
  if (r.kind === 'early_leave' && r.check_out) {
    return `퇴근 ${fmtTime(r.check_out)}`;
  }
  return '기록 누락';
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─────────────────────────────────────────────────────────────
// 팀 탭 — 최근 30일 attendances 의 (직원 × 일자) abnormal 카드
// ─────────────────────────────────────────────────────────────

/** cooldown / 상태 key: staffId + ':' + date (같은 직원·다른 날은 각각 발송 가능) */
function dailyRowKey(row: { staffId: string; date: string }): string {
  return `${row.staffId}:${row.date}`;
}

function TeamTab({ user, company }: { user: ErpUser; company?: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { rows, loading } = useTeamAbnormalByDay(company, reloadKey);
  const [statusByRow, setStatusByRow] = useState<Record<string, DailyRowStatus>>({});

  const canMutate = useMemo(() => canMutateTeamAbnormal(user), [user]);

  const handleClarify = useCallback(
    async (row: DailyAbnormalRow) => {
      if (!canMutate) return;
      const key = dailyRowKey(row);
      const current = statusByRow[key] ?? 'idle';
      if (current !== 'idle') return;
      setStatusByRow((m) => ({ ...m, [key]: 'clarifying' }));

      const result = await requestAttendanceClarificationDaily({
        user,
        targetStaffId: row.staffId,
        targetStaffName: row.staffName,
        date: row.date,
        lateMinutes: row.lateMinutes,
        earlyLeaveMinutes: row.earlyLeaveMinutes,
        missingCount: row.missingCount });
      if (result.ok) {
        toast(`${row.staffName} (${row.date}) 사유 요청 발송 완료`, 'success');
        setStatusByRow((m) => ({ ...m, [key]: 'clarified' }));
      } else if (result.reason === 'duplicate') {
        toast('이미 24시간 안에 동일 요청을 보냈습니다.', 'info');
        setStatusByRow((m) => ({ ...m, [key]: 'idle' }));
      } else if (result.reason === 'no_permission') {
        toast('관리자 권한이 필요합니다.', 'error');
        setStatusByRow((m) => ({ ...m, [key]: 'idle' }));
      } else {
        toast('사유 요청 발송에 실패했습니다.', 'error');
        setStatusByRow((m) => ({ ...m, [key]: 'idle' }));
      }
    },
    [canMutate, statusByRow, user],
  );

  const handleResolve = useCallback(
    async (row: DailyAbnormalRow) => {
      if (!canMutate) return;
      const key = dailyRowKey(row);
      const current = statusByRow[key] ?? 'idle';
      if (current === 'resolving' || current === 'resolved') return;
      setStatusByRow((m) => ({ ...m, [key]: 'resolving' }));

      const result = await resolveTeamAbnormalForStaffOnDate({
        user,
        targetStaffId: row.staffId,
        date: row.date });
      if (result.ok) {
        toast(`${row.staffName} ${row.date} 정상 처리 완료`, 'success');
        setStatusByRow((m) => ({ ...m, [key]: 'resolved' }));
        // 카드 사라지도록 잠시 후 재조회
        setTimeout(() => setReloadKey((k) => k + 1), 800);
      } else if (result.reason === 'no_permission') {
        toast('관리자 권한이 필요합니다.', 'error');
        setStatusByRow((m) => ({ ...m, [key]: 'idle' }));
      } else {
        toast(`${row.staffName} 정상 처리에 실패했습니다.`, 'error');
        setStatusByRow((m) => ({ ...m, [key]: 'idle' }));
      }
    },
    [canMutate, statusByRow, user],
  );

  if (loading) {
    return (
      <div
        style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
      >
        불러오는 중...
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
      >
        최근 30일간 팀 근태이상이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 16px 0' }}>
      {!canMutate ? (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            background: 'var(--m-warning-soft)',
            color: 'var(--m-warning)',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700 }}
        >
          관리자 권한이 없어 사유 요청·정상 처리는 비활성화되어 있습니다.
        </div>
      ) : null}
      <div className="m-card flush macos-glass macos-squircle">
        {rows.map((row, idx) => {
          const key = dailyRowKey(row);
          const status = statusByRow[key] ?? 'idle';
          return (
            <AbnormalDailyCard
              key={key}
              row={row}
              canMutate={canMutate}
              status={status}
              onClarify={handleClarify}
              onResolve={handleResolve}
              isLast={idx === rows.length - 1}
            />
          );
        })}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

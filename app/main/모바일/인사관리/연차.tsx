'use client';

/**
 * SHrLeave — 모바일 인사관리: 연차·휴가
 *
 * 핸드오프 §3 (m-screens-hr.jsx :304~384) 1:1 이식.
 *   - hero: 잔여 N일 + progress bar
 *   - 소멸 알림 카드 (12/31 기준 잔여)
 *   - 월별 사용 막대 차트 (이번 연도)
 *   - 신청 내역 리스트
 *   - sticky 푸터: 휴가계획서 / 연차 신청
 *
 * 데이터: useMyLeaveBalance + leave_requests 필터(올해).
 *
 * JM6: progress aria-valuenow, button 시맨틱
 */

import { useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import {
  useMyLeaveBalance,
  useStaffList,
  canMutateTeamAbnormal,
  type LeaveHistoryRow } from './data-hooks';
import 연차관리자 from './연차관리자';
import type { ErpUser } from '@/types';

export type SHrLeaveProps = {
  staffId: string | null;
  company?: string;
  user: ErpUser;
  onBack: () => void;
  onApply: () => void;
};

export default function 연차({ staffId, company, user, onBack, onApply }: SHrLeaveProps) {
  const [mode, setMode] = useState<'my' | 'admin'>('my');
  const { data, loading } = useMyLeaveBalance(staffId);
  const { staffs } = useStaffList({ company, includeResigned: false });

  const year = new Date().getFullYear();
  const monthly = useMemo(() => buildMonthly(data.history, year), [data.history, year]);
  const maxMonthly = useMemo(() => Math.max(1, ...monthly), [monthly]);

  const progressPct = data.total > 0 ? Math.round((data.used / data.total) * 100) : 0;

  const isHrAdmin = useMemo(() => canMutateTeamAbnormal(user), [user]);

  const handleModeChange = (targetMode: 'my' | 'admin') => {
    setMode(targetMode);
  };

  return (
    <div className="m-screen">
      <MobileHeader title={mode === 'admin' ? '전사 연차 관리' : '연차·휴가'} sub={`${year}년 잔여`} back={onBack} />
      {isHrAdmin && (
        <div style={{ padding: '8px 16px', background: 'var(--m-card)', borderBottom: '1px solid var(--m-border)' }}>
          <div className="m-seg" role="tablist" aria-label="연차 보기 모드">
            <button
              type="button"
              className={mode === 'my' ? 'on' : ''}
              onClick={() => handleModeChange('my')}
              role="tab"
              aria-selected={mode === 'my'}
            >
              내 연차
            </button>
            <button
              type="button"
              className={mode === 'admin' ? 'on' : ''}
              onClick={() => handleModeChange('admin')}
              role="tab"
              aria-selected={mode === 'admin'}
            >
              전사 관리
            </button>
          </div>
        </div>
      )}
      <div className="m-scroll">
        {mode === 'admin' ? (
          <연차관리자 staffs={staffs} company={company} user={user} />
        ) : loading ? (
          <div
            style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
          >
            불러오는 중...
          </div>
        ) : (
          <>
            <HeroSection
              remaining={data.remaining}
              total={data.total}
              used={data.used}
              progressPct={progressPct}
            />

            <ExpiryAlert remaining={data.remaining} year={year} />

            <MonthlySection monthly={monthly} max={maxMonthly} />

            <HistorySection history={data.history} year={year} />
            <div style={{ height: 24 }} />
          </>
        )}
      </div>
      {mode !== 'admin' && (
        <div className="m-sticky-foot">
          <MBtn block>휴가계획서</MBtn>
          <MBtn block variant="primary" icon="plus" onClick={onApply}>
            연차 신청
          </MBtn>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// hero
// ─────────────────────────────────────────────────────────────

function HeroSection({
  remaining,
  total,
  used,
  progressPct }: {
  remaining: number;
  total: number;
  used: number;
  progressPct: number;
}) {
  const remainingFlex = Math.max(0, total - used);
  const usedFlex = used;
  return (
    <div
      style={{
        padding: '24px 20px 16px',
        textAlign: 'center',
        background: 'var(--m-card)',
        borderBottom: '1px solid var(--m-border)' }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 800,
          letterSpacing: '0.04em' }}
      >
        잔여 연차
      </div>
      <div
        className="m-tnum"
        style={{
          fontSize: 48,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          color: 'var(--m-accent)',
          marginTop: 4 }}
      >
        {remaining}
        <span
          style={{
            fontSize: 20,
            color: 'var(--z-500)',
            fontWeight: 700,
            marginLeft: 4 }}
        >
          일
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 4 }}>
        총 {total}일 중 사용 {used}일
      </div>
      <div
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`연차 사용률 ${progressPct}%`}
        style={{
          marginTop: 14,
          height: 8,
          background: 'var(--z-100)',
          borderRadius: 999,
          overflow: 'hidden',
          display: 'flex' }}
      >
        <div
          style={{
            flex: remainingFlex,
            background: 'var(--m-accent)',
            borderRadius: '999px 0 0 999px' }}
        />
        <div style={{ flex: usedFlex, background: 'var(--z-300)' }} />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 10,
          color: 'var(--z-500)',
          fontWeight: 700 }}
      >
        <span>잔여 {remaining}일</span>
        <span>사용 {used}일</span>
      </div>
    </div>
  );
}

function ExpiryAlert({ remaining, year }: { remaining: number; year: number }) {
  if (remaining === 0) return null;
  return (
    <div className="m-section">
      <div className="m-section-h">
        <div className="lbl">소멸 알림</div>
      </div>
      <div
        className="m-card macos-glass macos-squircle-sm"
        style={{
          padding: '14px 16px',
          background: 'var(--m-warning-soft)',
          borderColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 12 }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--m-warning)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center' }}
        >
          <MIcon name="alertTri" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-warning)' }}>
            {year}.12.31 소멸 예정 — 현재 잔여 {remaining}일
          </div>
          <div
            style={{ fontSize: 11, color: 'var(--z-600)', fontWeight: 600, marginTop: 1 }}
          >
            연말까지 분산 사용을 권장합니다
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 월별 사용 차트
// ─────────────────────────────────────────────────────────────

function buildMonthly(history: LeaveHistoryRow[], year: number): number[] {
  const arr = Array<number>(12).fill(0);
  for (const r of history) {
    if (r.status !== '승인') continue;
    const start = new Date(r.start_date);
    if (Number.isNaN(start.getTime())) continue;
    if (start.getFullYear() !== year) continue;
    arr[start.getMonth()] += 1;
  }
  return arr;
}

function MonthlySection({ monthly, max }: { monthly: number[]; max: number }) {
  const thisMonth = new Date().getMonth();
  return (
    <div className="m-section">
      <div className="m-section-h">
        <div className="lbl">월별 사용</div>
      </div>
      <div className="m-card macos-glass macos-squircle-sm" style={{ padding: '14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
          {monthly.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4 }}
            >
              <div
                style={{
                  height: v > 0 ? (v / max) * 60 + 12 : 4,
                  width: '100%',
                  background:
                    i === thisMonth
                      ? 'var(--m-accent)'
                      : v > 0
                        ? 'var(--m-accent-soft)'
                        : 'var(--z-100)',
                  borderRadius: '4px 4px 2px 2px' }}
              />
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 8,
            fontSize: 10,
            color: 'var(--z-500)',
            fontWeight: 600 }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((m, i) => (
            <div
              key={m}
              style={{
                flex: 1,
                textAlign: 'center',
                color: i === thisMonth ? 'var(--m-accent)' : 'var(--z-500)',
                fontWeight: i === thisMonth ? 800 : 600 }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 신청 내역
// ─────────────────────────────────────────────────────────────

function HistorySection({ history, year }: { history: LeaveHistoryRow[]; year: number }) {
  const filtered = useMemo(() => {
    return history.filter((r) => {
      const start = new Date(r.start_date);
      return !Number.isNaN(start.getTime()) && start.getFullYear() === year;
    });
  }, [history, year]);

  return (
    <div className="m-section">
      <div className="m-section-h">
        <div className="lbl">신청 내역</div>
        <span className="more">전체 {history.length}건</span>
      </div>
      {filtered.length === 0 ? (
        <div
          className="m-card macos-glass macos-squircle-sm"
          style={{ padding: 16, fontSize: 13, color: 'var(--z-500)' }}
        >
          올해 신청 내역이 없습니다.
        </div>
      ) : (
        <div className="m-card flush macos-glass macos-squircle">
          {filtered.slice(0, 10).map((r) => {
            const tone = leaveTone(r.status);
            return (
              <div key={r.id} className="m-list-row">
                <div className={'ico-tile tone-' + (tone || 'accent')}>
                  <MIcon name="calendar" size={18} />
                </div>
                <div>
                  <div className="lbl">{formatRange(r.start_date, r.end_date)}</div>
                  <div className="sub">{r.leave_type}</div>
                </div>
                <MChip tone={tone}>{r.status}</MChip>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function leaveTone(status: '대기' | '승인' | '반려'): '' | 'success' | 'warning' | 'danger' {
  if (status === '승인') return 'success';
  if (status === '반려') return 'danger';
  return 'warning';
}

function formatRange(start: string, end: string): string {
  if (!start) return '-';
  const s = start.slice(0, 10).replaceAll('-', '.');
  const e = (end || start).slice(0, 10).replaceAll('-', '.');
  if (s === e) return s;
  return `${s} ~ ${e}`;
}

'use client';

/**
 * MyMainClient.tsx — 마이페이지 메인
 *
 * 섹션:
 *   - ProfileCard: 이름 / 역할 / 이니셜 아바타
 *   - CommuteStatus: 오늘 출퇴근 상태
 *   - TodayTodos: 오늘 할 일 요약
 *   - PendingApprovals: 미결 결재 요약
 *
 * JM2: 더미 데이터 정적 const, 불필요 useEffect 없음
 * JM4: any 금지, 타입 명시
 * JM6: section aria-labelledby, 상태 aria-label
 */

import React from 'react';
import Link from 'next/link';
import { Clock, CheckSquare, FileText, ChevronRight } from 'lucide-react';

// ── 더미 데이터 ───────────────────────────────────────────────────────────────

interface DummyProfile {
  name: string;
  role: string;
  dept: string;
  joinDate: string;
}

const PROFILE: DummyProfile = {
  name: '김민수',
  role: '간호사',
  dept: '3내과 병동',
  joinDate: '2023.03.01',
};

interface CommuteSummary {
  checkIn: string | null;
  checkOut: string | null;
  status: 'working' | 'off' | 'absent';
}

const TODAY_COMMUTE: CommuteSummary = {
  checkIn: '08:52',
  checkOut: null,
  status: 'working',
};

interface TodoSummary {
  total: number;
  done: number;
}

const TODAY_TODO: TodoSummary = { total: 5, done: 2 };

interface ApprovalSummary {
  pending: number;
  myRequests: number;
}

const APPROVALS: ApprovalSummary = { pending: 3, myRequests: 1 };

// ── 색상 상수 ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<CommuteSummary['status'], string> = {
  working: '#10B981',
  off: '#2563EB',
  absent: '#EF4444',
};

const STATUS_LABELS: Record<CommuteSummary['status'], string> = {
  working: '근무 중',
  off: '퇴근',
  absent: '결근',
};

// ── 프로필 카드 ───────────────────────────────────────────────────────────────

function ProfileCard() {
  const initial = PROFILE.name[0] ?? '?';

  return (
    <section
      aria-labelledby="profile-heading"
      className="app-card"
      style={{ padding: '20px 16px', display: 'flex', gap: 16, alignItems: 'center' }}
    >
      {/* 아바타 */}
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: 9999,
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>

      <div>
        <h2
          id="profile-heading"
          className="text-lg font-black"
          style={{ color: 'var(--foreground)', margin: '0 0 2px' }}
        >
          {PROFILE.name}
        </h2>
        <p className="text-sm" style={{ color: 'var(--toss-gray-4)', margin: '0 0 4px' }}>
          {PROFILE.dept} · {PROFILE.role}
        </p>
        <p className="text-xs" style={{ color: 'var(--toss-gray-4)', margin: 0 }}>
          입사일 {PROFILE.joinDate}
        </p>
      </div>
    </section>
  );
}

// ── 출퇴근 현황 ───────────────────────────────────────────────────────────────

function CommuteStatus() {
  const { checkIn, checkOut, status } = TODAY_COMMUTE;
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];

  return (
    <section
      aria-labelledby="commute-heading"
      className="app-card"
      style={{ padding: '16px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3
          id="commute-heading"
          className="section-title"
          style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Clock size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
          오늘 출퇴근
        </h3>
        <span
          aria-label={`근무 상태: ${label}`}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color,
            background: `${color}18`,
            padding: '2px 8px',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          {label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <StatChip label="출근" value={checkIn ?? '--:--'} />
        <StatChip label="퇴근" value={checkOut ?? '--:--'} muted={!checkOut} />
      </div>

      <Link
        href="/main-v2/work/my-commute"
        className="text-xs font-medium transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        aria-label="출퇴근 상세 보기"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          marginTop: 12,
          color: 'var(--accent)',
        }}
      >
        상세 보기 <ChevronRight size={12} aria-hidden="true" />
      </Link>
    </section>
  );
}

interface StatChipProps {
  label: string;
  value: string;
  muted?: boolean;
}

function StatChip({ label, value, muted = false }: StatChipProps) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--page-bg)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        textAlign: 'center',
      }}
    >
      <p className="text-xs" style={{ color: 'var(--toss-gray-4)', margin: '0 0 4px' }}>{label}</p>
      <p
        className="text-base font-bold"
        style={{ color: muted ? 'var(--toss-gray-4)' : 'var(--foreground)', margin: 0 }}
      >
        {value}
      </p>
    </div>
  );
}

// ── 오늘 할 일 ────────────────────────────────────────────────────────────────

function TodayTodos() {
  const pct = TODAY_TODO.total > 0 ? Math.round((TODAY_TODO.done / TODAY_TODO.total) * 100) : 0;

  return (
    <section
      aria-labelledby="todo-heading"
      className="app-card"
      style={{ padding: '16px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3
          id="todo-heading"
          className="section-title"
          style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <CheckSquare size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
          오늘 할 일
        </h3>
        <span className="text-xs" style={{ color: 'var(--toss-gray-4)' }}>
          {TODAY_TODO.done} / {TODAY_TODO.total}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`할 일 진행률 ${pct}%`}
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--muted)',
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: 3,
            transition: 'width var(--transition-slow)',
          }}
        />
      </div>

      <Link
        href="/main-v2/work/my-todo"
        className="text-xs font-medium transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        aria-label="할 일 전체 보기"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          color: 'var(--accent)',
        }}
      >
        전체 보기 <ChevronRight size={12} aria-hidden="true" />
      </Link>
    </section>
  );
}

// ── 미결 결재 ─────────────────────────────────────────────────────────────────

function PendingApprovals() {
  return (
    <section
      aria-labelledby="approval-heading"
      className="app-card"
      style={{ padding: '16px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3
          id="approval-heading"
          className="section-title"
          style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FileText size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
          결재
        </h3>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <StatChip label="처리 대기" value={`${APPROVALS.pending}건`} />
        <StatChip label="내 요청" value={`${APPROVALS.myRequests}건`} />
      </div>
    </section>
  );
}

// ── MyMainClient 본체 ─────────────────────────────────────────────────────────

export function MyMainClient() {
  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: '16px 16px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <nav aria-label="현재 위치" style={{ marginBottom: 4 }}>
        <ol style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0, fontSize: 12, color: 'var(--toss-gray-4)' }}>
          <li aria-current="page" style={{ color: 'var(--foreground)' }}>내정보</li>
        </ol>
      </nav>

      <ProfileCard />
      <CommuteStatus />
      <TodayTodos />
      <PendingApprovals />
    </div>
  );
}

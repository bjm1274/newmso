'use client';

/**
 * SHome — 내정보 홈 (모바일 마이페이지 진입 화면)
 *   - 헤더 (인사 + 날짜·소속) + 알림 종/QR 액션
 *   - 프로필 카드
 *   - 빠른액션 8 그리드 (출퇴근·할일·연차·급여·서류·증명서·복지·근태이상)
 *   - 오늘 한눈에 / 이번 달 KPI 리스트
 *   - 하단 로그아웃·정보수정 버튼
 * JM(파일당 500줄·단일 책임), JM2(데이터는 훅 1회), JM6(button 시맨틱·aria-label)
 */

import type { ReactNode } from 'react';
import type { ErpUser } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MAvatar from '../공통/MAvatar';
import MListRow from '../공통/MListRow';
import { useMonthlyAttendance, useTodayCounts } from './data-hooks';
import type { MHomeSub } from '../셸/m-routes';

type QuickAction = {
  ic: string;
  lbl: string;
  tone: '' | 'accent' | 'success' | 'warning' | 'danger';
  sub: MHomeSub | null;
  badge?: number;
};

function getInitial(name?: string | null) {
  return String(name || '').trim().slice(0, 1) || '나';
}

function formatTodayLabel(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const dow = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

export type SHomeProps = {
  user: ErpUser;
  onSub: (sub: MHomeSub) => void;
  onLogout: () => void;
};

export default function SHome({ user, onSub, onLogout }: SHomeProps) {
  const staffId = typeof user.id === 'string' ? user.id : null;
  const active = isActiveStaff(user);
  const { data: monthly } = useMonthlyAttendance(staffId);
  const counts = useTodayCounts(staffId);

  const todayLabel = formatTodayLabel(new Date());
  const company = (user.company || '박철홍정형외과') as string;
  const name = (user.name || '직원') as string;
  const position = (user.position || '') as string;
  const department = (user.department || '') as string;
  const employeeNo = (user.employee_no || '') as string;
  const employmentType = (user.employment_type || '정규직') as string;
  const initial = getInitial(name);

  const leaveRemaining =
    Number(user.annual_leave_remaining) ||
    Math.max(0, Number(user.annual_leave_total || 15) - Number(user.annual_leave_used || 0)) ||
    0;

  const attendanceSub: ReactNode = !monthly
    ? '집계 중'
    : monthly.absent > 0
      ? `결근 ${monthly.absent}일`
      : monthly.late > 0
        ? `지각 ${monthly.late}회`
        : monthly.present > 0
          ? '개근'
          : '집계 중';

  const QUICK_ACTIONS: QuickAction[] = [
    { ic: 'clock',    lbl: '출퇴근',  tone: 'accent',  sub: 'attend' },
    { ic: 'check',    lbl: '할일',    tone: '',        sub: 'todo' },
    { ic: 'calendar', lbl: '연차',    tone: 'success', sub: null },
    { ic: 'won',      lbl: '급여',    tone: '',        sub: null },
    { ic: 'fileText', lbl: '서류',    tone: '',        sub: 'docs' },
    { ic: 'badge',    lbl: '증명서',  tone: '',        sub: null },
    { ic: 'star',     lbl: '복지',    tone: '',        sub: null },
    { ic: 'alertTri', lbl: '근태이상', tone: 'warning', sub: null },
  ];

  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title">안녕하세요, {name}님</div>
          <div className="sub">{todayLabel} · {company}</div>
        </div>
        <div className="actions">
          <button type="button" onClick={() => onSub('alert')} aria-label="알림">
            <MIcon name="bell" size={20} />
            {counts.unreadAlert > 0 && <span className="badge">{Math.min(counts.unreadAlert, 99)}</span>}
          </button>
          <button type="button" aria-label="QR 인식">
            <MIcon name="qr" size={20} />
          </button>
        </div>
      </div>

      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        {/* 프로필 카드 */}
        <div style={{ padding: '16px 16px 0' }}>
          <div className="m-card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
            <MAvatar tone="blue" size="lg">{initial}</MAvatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{name}</div>
                {position && <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600 }}>{position}</div>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--z-500)', marginTop: 2 }}>
                {department}{employeeNo ? ` · 사번 ${employeeNo}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                {active
                  ? <MChip tone="success" dot>재직중</MChip>
                  : <MChip tone="danger" dot>퇴사</MChip>}
                <MChip>{employmentType}</MChip>
              </div>
            </div>
          </div>
        </div>

        {/* 빠른액션 8 */}
        <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q.lbl}
              type="button"
              className="m-quick"
              onClick={() => q.sub && onSub(q.sub)}
              disabled={!q.sub}
              aria-label={q.lbl}
            >
              <div className={'ico' + (q.tone ? ' tone-' + q.tone : '')}>
                <MIcon name={q.ic} size={16} />
              </div>
              <span className="lbl">{q.lbl}</span>
              {q.badge ? <span className="badge">{q.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* 오늘 한눈에 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">오늘 한눈에</div></div>
          <div className="m-card flush">
            <MListRow
              icon="clock"
              iconTone="accent"
              label="오늘 근태"
              sub={attendanceSub}
              val="진행 중"
              onClick={() => onSub('attend')}
            />
            <MListRow
              icon="approval"
              iconTone="warning"
              label="미결재"
              sub="결재 대기중"
              val={counts.pendingApproval}
              valUnit="건"
            />
            <MListRow
              icon="bell"
              iconTone="accent"
              label="안 읽은 알림"
              sub="전체 알림함"
              val={counts.unreadAlert}
              valUnit="건"
              onClick={() => onSub('alert')}
            />
          </div>
        </div>

        {/* 이번 달 KPI */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">이번 달</div></div>
          <div className="m-card flush">
            <MListRow
              icon="calendar"
              label="이번 달 근태"
              sub={
                monthly
                  ? `정상 ${monthly.present} · 지각 ${monthly.late} · 결근 ${monthly.absent}`
                  : '집계 중'
              }
              val={
                monthly ? (
                  <>
                    {monthly.present}
                    <span style={{ fontSize: 11, color: 'var(--z-400)', fontWeight: 700 }}>/{monthly.total}일</span>
                  </>
                ) : '—'
              }
            />
            <MListRow
              icon="badge"
              label="연차 휴가"
              sub={`총 ${user.annual_leave_total || 15}일 중 사용 ${user.annual_leave_used || 0}일`}
              val={leaveRemaining}
              valUnit="일"
            />
            <MListRow
              icon="won"
              label="이번 달 급여"
              sub="실수령액 미확정"
              val="—"
            />
            <MListRow
              icon="fileText"
              label="제출 서류"
              sub="대기/반려 확인"
              onClick={() => onSub('docs')}
            />
          </div>
        </div>

        <div style={{ padding: '18px 16px 4px', display: 'flex', gap: 8 }}>
          <MBtn icon="out" block onClick={onLogout}>로그아웃</MBtn>
          <MBtn icon="edit" block variant="primary">정보 수정</MBtn>
        </div>
      </div>
    </div>
  );
}

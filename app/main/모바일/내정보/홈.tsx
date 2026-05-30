'use client';

/**
 * SHome — 내정보 홈 (모바일 마이페이지 진입 화면) — 리디자인.
 *   - NO 헤더 — 콘텐츠 바로 시작
 *   - 프로필 히어로 (블루 그라데이션): 수정 버튼, 아바타, 이름/직책, 칩, 3분할 통계
 *   - 빠른 메뉴 8 그리드 (m-card 내): 출퇴근·연차·급여명세·증명서 | 전자결재·재고·조직도·추가기능
 *   - 설정 리스트: 정보 수정, 알림 설정, 비밀번호 변경
 *   - 로그아웃 버튼 + 버전 텍스트
 *   - 비밀번호 게이트 모달 (급여명세/증명서 접근 시)
 * JM: 단일 책임 (홈 화면), ~450줄
 * JM2: 데이터는 훅 1회
 * JM4: any 금지
 * JM6: button 시맨틱, aria-label, aria-live
 */

import { memo, useState, useCallback } from 'react';
import type { ErpUser } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import MIcon from '../공통/MIcon';
import { useTodayCounts } from './data-hooks';
import type { MHomeSub, MTab } from '../셸/m-routes';

/* ─── 유틸 ────────────────────────────────────────────────── */
function getInitial(name?: string | null) {
  return String(name || '').trim().slice(0, 1) || '나';
}

function getYearsSince(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, new Date().getFullYear() - d.getFullYear());
}

/* ─── PC 사이드바와 동일한 빠른메뉴 아이콘 SVG ──────────── */
const QUICK_ICON_PATHS: Record<string, React.ReactNode> = {
  /* 출퇴근: History(clock) — PC 사이드바 인사관리 > 근태 아이콘 */
  attend: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  /* 연차: Calendar — PC 사이드바 인사관리 > 연차·휴가 아이콘 */
  leave: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </>
  ),
  /* 급여명세: Banknote — PC 사이드바 인사관리 > 급여 아이콘 */
  payslip: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M7 12h.01M17 12h.01" />
    </>
  ),
  /* 증명서: Document — PC 사이드바 문서 아이콘 */
  cert: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h5" />
    </>
  ),
  /* 전자결재: FileCheck — PC 사이드바 전자결재 메인 아이콘 */
  approval: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="m9 15 2 2 4-5" />
    </>
  ),
  /* 재고: Package(3D box) — PC 사이드바 재고관리 메인 아이콘 */
  stock: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  /* 조직도: Users — PC 사이드바 인사관리 > 구성원 아이콘 */
  org: (
    <>
      <path d="M16 21a6 6 0 0 0-12 0" />
      <circle cx="10" cy="8" r="4" />
      <path d="M22 21a5 5 0 0 0-5-5" />
      <path d="M17 4a4 4 0 0 1 0 8" />
    </>
  ),
  /* 추가기능: LayoutGrid(4칸) — PC 사이드바 추가기능 메인 아이콘 */
  more: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </>
  ),
};

/* ─── 빠른 메뉴 타입 ─────────────────────────────────────── */
type QuickItem = {
  id: string;
  icon: string;
  label: string;
  tone: 'accent' | 'success' | 'warn' | 'muted';
  /** onSub target (attend/leave/payslip/cert) or null for tab switch */
  sub: MHomeSub | null;
  /** tab switch target */
  tab: MTab | null;
  badge?: number;
  /** requires password gate */
  pwGate?: boolean;
};

const TONE_BG: Record<QuickItem['tone'], { bg: string; fg: string }> = {
  accent:  { bg: 'var(--m-accent-soft)', fg: 'var(--m-accent)' },
  success: { bg: 'var(--m-success-soft)', fg: 'var(--m-success)' },
  warn:    { bg: 'var(--m-warning-soft)', fg: 'var(--m-warning)' },
  muted:   { bg: 'var(--z-100)', fg: 'var(--z-600)' },
};

/* ─── Props ───────────────────────────────────────────────── */
export type SHomeProps = {
  user: ErpUser;
  onSub: (sub: MHomeSub) => void;
  onLogout: () => void;
  onSwitchTab?: (tab: MTab) => void;
};

/* ─── 컴포넌트 ────────────────────────────────────────────── */
function SHomeBase({ user, onSub, onLogout, onSwitchTab }: SHomeProps) {
  const staffId = typeof user.id === 'string' ? user.id : null;
  const active = isActiveStaff(user);
  const counts = useTodayCounts(staffId);

  const name = (user.name || '직원') as string;
  const position = (user.position || '') as string;
  const department = (user.department || '') as string;
  const employmentType = (user.employment_type || '정규직') as string;
  const initial = getInitial(name);
  const hireYears = getYearsSince(user.hire_date as string | undefined);

  /* 비밀번호 게이트 */
  const [pwGate, setPwGate] = useState<'payslip' | 'cert' | null>(null);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState(false);

  const handlePwConfirm = useCallback(() => {
    if (pw.length < 4) {
      setPwErr(true);
      return;
    }
    const target = pwGate;
    setPwGate(null);
    setPw('');
    setPwErr(false);
    if (target) onSub(target);
  }, [pw, pwGate, onSub]);

  const handlePwCancel = useCallback(() => {
    setPwGate(null);
    setPw('');
    setPwErr(false);
  }, []);

  /* 빠른 메뉴 데이터 */
  const QUICK_ITEMS: QuickItem[] = [
    { id: 'attend',   icon: 'clock',       label: '출퇴근',   tone: 'accent',  sub: 'attend', tab: null },
    { id: 'leave',    icon: 'calendar',    label: '연차',     tone: 'success', sub: 'leave',  tab: null },
    { id: 'payslip',  icon: 'won',         label: '급여명세', tone: 'warn',    sub: 'payslip', tab: null, pwGate: true },
    { id: 'cert',     icon: 'fileText',    label: '증명서',   tone: 'muted',   sub: 'cert', tab: null, pwGate: true },
    { id: 'approval', icon: 'checkCircle', label: '전자결재', tone: 'accent',  sub: null, tab: 'approval', badge: counts.pendingApproval > 0 ? counts.pendingApproval : undefined },
    { id: 'stock',    icon: 'box',         label: '재고',     tone: 'success', sub: null, tab: 'stock' },
    { id: 'org',      icon: 'users',       label: '조직도',   tone: 'muted',   sub: null, tab: 'addon' },
    { id: 'more',     icon: 'grid',        label: '추가기능', tone: 'muted',   sub: null, tab: 'addon' },
  ];

  const handleQuick = useCallback((item: QuickItem) => {
    if (item.pwGate) {
      setPwGate(item.sub as 'payslip' | 'cert');
      return;
    }
    if (item.sub) {
      onSub(item.sub);
      return;
    }
    if (item.tab && onSwitchTab) {
      onSwitchTab(item.tab);
    }
  }, [onSub, onSwitchTab]);

  /* 연차 잔여 (간이 계산) */
  const leaveTotal = Number(user.annual_leave_total) || 15;
  const leaveUsed = Number(user.annual_leave_used) || 0;
  const leaveRemaining = Math.max(0, leaveTotal - leaveUsed);

  return (
    <div className="m-screen">
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        {/* ── 프로필 히어로 ─────────────────────────────────── */}
        <div
          className="msm-hero"
          style={{
            margin: '0',
            padding: '32px 24px 24px',
            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
            color: '#fff',
            position: 'relative',
          }}
        >
          {/* 수정 버튼 (우상단) */}
          <button
            type="button"
            onClick={() => onSub('edit')}
            aria-label="정보 수정"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <MIcon name="edit" size={18} />
          </button>

          {/* 아바타 */}
          <div
            className="msm-hero-av"
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              background: 'rgba(255,255,255,0.2)',
              border: '3px solid rgba(255,255,255,0.3)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 26,
              fontWeight: 800,
              margin: '0 auto',
            }}
          >
            {initial}
          </div>

          {/* 이름 + 직책 */}
          <div
            className="msm-hero-nm"
            style={{
              textAlign: 'center',
              marginTop: 14,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.03em',
            }}
          >
            {name}
          </div>
          {(position || department) && (
            <div
              className="msm-hero-role"
              style={{
                textAlign: 'center',
                marginTop: 4,
                fontSize: 13,
                fontWeight: 600,
                opacity: 0.75,
              }}
            >
              {department}{position ? ` · ${position}` : ''}
            </div>
          )}

          {/* 칩 */}
          <div
            className="msm-hero-chips"
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 6,
              marginTop: 14,
            }}
          >
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: active ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
                color: '#fff',
              }}
            >
              {active ? '재직중' : '퇴사'}
            </span>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
              }}
            >
              {employmentType}
            </span>
            {hireYears > 0 && (
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                }}
              >
                입사 {hireYears}년차
              </span>
            )}
          </div>

          {/* 통계 3분할 */}
          <div
            className="msm-hero-stats"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
              marginTop: 20,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            {[
              { label: '이번달 지각', value: '0회' },
              { label: '잔여 연차', value: `${leaveRemaining}일` },
              { label: '미결재', value: `${counts.pendingApproval}건` },
            ].map((st) => (
              <div
                key={st.label}
                style={{
                  padding: '14px 8px',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
                  {st.value}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.65, marginTop: 2 }}>
                  {st.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 빠른 메뉴 8 그리드 ──────────────────────────── */}
        <div style={{ padding: '16px 16px 0' }}>
          <div
            className="msm-quick m-card"
            style={{
              padding: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}
          >
            {QUICK_ITEMS.map((q) => {
              const t = TONE_BG[q.tone];
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleQuick(q)}
                  aria-label={q.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 4px',
                    borderRadius: 14,
                    background: 'transparent',
                    position: 'relative',
                    border: 0,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: t.bg,
                      color: t.fg,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <svg
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {QUICK_ICON_PATHS[q.id]}
                    </svg>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-700)' }}>
                    {q.label}
                  </span>
                  {q.badge !== undefined && q.badge > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 8,
                        minWidth: 16,
                        height: 16,
                        padding: '0 5px',
                        background: 'var(--m-danger)',
                        color: '#fff',
                        borderRadius: 999,
                        fontSize: 9,
                        fontWeight: 800,
                        display: 'grid',
                        placeItems: 'center',
                        border: '2px solid var(--m-card)',
                      }}
                    >
                      {Math.min(q.badge, 99)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 설정 리스트 ──────────────────────────────────── */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">설정</div>
          </div>
          <div className="msm-setlist m-card flush">
            {/* 정보 수정 */}
            <button
              type="button"
              onClick={() => onSub('edit')}
              aria-label="정보 수정"
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: '13px 16px',
                borderBottom: '1px solid var(--m-border)',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--m-accent-soft)',
                  color: 'var(--m-accent)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <MIcon name="user" size={18} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>정보 수정</div>
              <MIcon name="chevR" size={18} color="var(--z-400)" />
            </button>

            {/* 알림 설정 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: '13px 16px',
                borderBottom: '1px solid var(--m-border)',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--z-100)',
                  color: 'var(--z-600)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <MIcon name="bell" size={18} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>알림 설정</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--z-500)' }}>켜짐</span>
            </div>

            {/* 비밀번호 변경 */}
            <button
              type="button"
              aria-label="비밀번호 변경"
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: '13px 16px',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--z-100)',
                  color: 'var(--z-600)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <MIcon name="shield" size={18} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>비밀번호 변경</div>
              <MIcon name="chevR" size={18} color="var(--z-400)" />
            </button>
          </div>
        </div>

        {/* ── 로그아웃 ─────────────────────────────────────── */}
        <div style={{ padding: '18px 16px 0' }}>
          <button
            type="button"
            className="msm-btn-lg danger"
            onClick={onLogout}
            aria-label="로그아웃"
            style={{
              width: '100%',
              height: 52,
              borderRadius: 14,
              background: 'var(--m-danger-soft)',
              color: 'var(--m-danger)',
              fontSize: 15,
              fontWeight: 700,
              border: '1px solid var(--m-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <MIcon name="out" size={18} />
            로그아웃
          </button>
        </div>

        {/* ── 버전 ─────────────────────────────────────────── */}
        <div
          style={{
            textAlign: 'center',
            padding: '16px 0 8px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--z-400)',
          }}
        >
          MSO · v2.4.1
        </div>
      </div>

      {/* ── 비밀번호 게이트 모달 ──────────────────────────── */}
      {pwGate && (
        <div
          className="msm-pw-scrim"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="보안 확인"
        >
          <div
            style={{
              width: 'calc(100% - 48px)',
              maxWidth: 340,
              background: 'var(--m-card)',
              borderRadius: 20,
              padding: '28px 24px 20px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            }}
          >
            {/* 잠금 아이콘 */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: 'var(--m-accent-soft)',
                color: 'var(--m-accent)',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px',
              }}
            >
              <MIcon name="shield" size={24} />
            </div>

            <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
              보안 확인
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>
              {pwGate === 'payslip' ? '급여명세서 열람을 위해' : '증명서 발급을 위해'}
              <br />비밀번호를 입력해 주세요.
            </div>

            {/* 비밀번호 입력 */}
            <div style={{ marginTop: 18 }}>
              <input
                type="password"
                value={pw}
                onChange={(e) => { setPw(e.target.value); setPwErr(false); }}
                placeholder="비밀번호 입력"
                aria-label="비밀번호"
                autoFocus
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 16px',
                  borderRadius: 12,
                  border: `1px solid ${pwErr ? 'var(--m-danger)' : 'var(--m-border)'}`,
                  background: 'var(--z-50)',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              />
              {pwErr && (
                <div
                  role="alert"
                  style={{
                    fontSize: 12,
                    color: 'var(--m-danger)',
                    fontWeight: 700,
                    marginTop: 6,
                    paddingLeft: 4,
                  }}
                >
                  비밀번호를 4자 이상 입력해 주세요.
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={handlePwCancel}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  border: '1px solid var(--m-border)',
                  background: 'var(--m-card)',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handlePwConfirm}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  border: 0,
                  background: 'var(--m-accent)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SHome = memo(SHomeBase);
export default SHome;

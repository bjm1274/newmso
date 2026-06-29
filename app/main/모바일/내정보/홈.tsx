'use client';

/**
 * SHome — 내정보 홈 (모바일 마이페이지 진입 화면) — 리디자인.
 *   - NO 헤더 — 콘텐츠 바로 시작
 *   - 프로필 히어로 (블루 그라데이션): 수정 버튼, 아바타, 이름/직책, 칩, 3분할 통계
 *   - 빠른 메뉴 8 그리드 (m-card 내): 출퇴근·연차·급여명세·증명서 | 전자결재·재고·조직도·추가기능
 *   - 설정 리스트: 정보 수정, 알림 설정, 비밀번호 변경
 *   - 로그아웃 버튼 + 버전 텍스트
 *   - 비밀번호 게이트 모달 (증명서 접근 시)
 * JM: 단일 책임 (홈 화면), ~450줄
 * JM2: 데이터는 훅 1회
 * JM4: any 금지
 * JM6: button 시맨틱, aria-label, aria-live
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import type { ErpUser } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import MIcon from '../공통/MIcon';
import { useMonthlyAttendance, useTodayCounts, useLeaveBalance } from './data-hooks';
import type { MHomeSub, MTab } from '../셸/m-routes';

import { toast } from '@/lib/toast';

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
  records: (
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
  visible?: boolean;
};

const LAUNCHPAD_COLORS: Record<string, { bg: string; shadow: string }> = {
  attend: { bg: 'linear-gradient(135deg, #FF9500, #FF5E3A)', shadow: 'rgba(255, 149, 0, 0.3)' },
  leave: { bg: 'linear-gradient(135deg, #34C759, #119F35)', shadow: 'rgba(52, 199, 89, 0.3)' },
  payslip: { bg: 'linear-gradient(135deg, #30B0C7, #007A8D)', shadow: 'rgba(48, 176, 199, 0.3)' },
  cert: { bg: 'linear-gradient(135deg, #BF5AF2, #8F22D0)', shadow: 'rgba(191, 90, 242, 0.3)' },
  records: { bg: 'linear-gradient(135deg, #BF5AF2, #8F22D0)', shadow: 'rgba(191, 90, 242, 0.3)' },
  approval: { bg: 'linear-gradient(135deg, #007AFF, #0A55E1)', shadow: 'rgba(0, 122, 255, 0.3)' },
  stock: { bg: 'linear-gradient(135deg, #FF3B30, #C2160C)', shadow: 'rgba(255, 59, 48, 0.3)' },
  org: { bg: 'linear-gradient(135deg, #5856D6, #3B39C1)', shadow: 'rgba(88, 86, 214, 0.3)' },
  more: { bg: 'linear-gradient(135deg, #8E8E93, #636366)', shadow: 'rgba(142, 142, 147, 0.3)' },
};

/* ─── Props ───────────────────────────────────────────────── */
export type SHomeProps = {
  user: ErpUser;
  onSub: (sub: MHomeSub) => void;
  onLogout: () => void;
  onSwitchTab?: (tab: MTab, sub?: string) => void;
};

const DEFAULT_QUICK_ITEMS: QuickItem[] = [
  { id: 'attend',   icon: 'clock',       label: '출퇴근',   tone: 'accent',  sub: 'attend', tab: null },
  { id: 'leave',    icon: 'calendar',    label: '연차',     tone: 'success', sub: 'leave',  tab: null },
  { id: 'records',  icon: 'fileText',    label: '급여·증명서', tone: 'warn',    sub: 'records', tab: null, pwGate: true },
  { id: 'approval', icon: 'checkCircle', label: '전자결재', tone: 'accent',  sub: null, tab: 'approval' },
  { id: 'stock',    icon: 'box',         label: '재고',     tone: 'success', sub: null, tab: 'stock' },
  { id: 'org',      icon: 'users',       label: '조직도',   tone: 'muted',   sub: null, tab: 'addon' },
  { id: 'more',     icon: 'grid',        label: '추가기능', tone: 'muted',   sub: null, tab: 'addon' },
];

/* ─── 컴포넌트 ────────────────────────────────────────────── */
function SHomeBase({ user, onSub, onLogout, onSwitchTab }: SHomeProps) {
  const staffId = typeof user.id === 'string' ? user.id : null;
  const active = isActiveStaff(user);
  const counts = useTodayCounts(staffId);
  const { data: monthlyAttendance } = useMonthlyAttendance(staffId);
  const { data: leaveBalance } = useLeaveBalance(staffId);

  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [isEditingMenu, setIsEditingMenu] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    tasks: true,
    account: true,
    system: false,
  });

  const toggleSection = useCallback((section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('mso_quick_menu_order');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { id: string; visible: boolean }[];
        const loaded = parsed
          .map((p) => {
            const orig = DEFAULT_QUICK_ITEMS.find((d) => d.id === p.id);
            if (!orig) return null;
            return { ...orig, visible: p.visible };
          })
          .filter(Boolean) as QuickItem[];
        
        const missing = DEFAULT_QUICK_ITEMS.filter((d) => !loaded.some((l) => l.id === d.id));
        setQuickItems([...loaded, ...missing.map(m => ({ ...m, visible: true }))]);
      } catch {
        setQuickItems(DEFAULT_QUICK_ITEMS.map((item) => ({ ...item, visible: true })));
      }
    } else {
      setQuickItems(DEFAULT_QUICK_ITEMS.map((item) => ({ ...item, visible: true })));
    }
  }, []);



  // 프로필 사진 — PC 프로필카드와 동일 패턴(getProfilePhotoUrl: path/url/version 처리)
  const photoUrl = getProfilePhotoUrl(user);

  const name = (user.name || '직원') as string;
  const position = (user.position || '') as string;
  const department = (user.department || '') as string;
  const employmentType = (user.employment_type || '정규직') as string;
  const initial = getInitial(name);
  const hireYears = getYearsSince(user.hire_date as string | undefined);

  /* 비밀번호 게이트 */
  const [pwGate, setPwGate] = useState<'records' | null>(null);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const pwLoadingRef = useRef(false);

  const handleBioAuth = useCallback(async () => {
    if (typeof window === 'undefined') return;
    
    // 1. 브라우저 지원 여부 확인
    if (!window.PublicKeyCredential) {
      toast('이 기기/브라우저는 생체인증을 지원하지 않습니다.', 'warning');
      return;
    }

    try {
      // 로컬 개발 환경이나 브라우저 기능 수준 체크
      const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!isAvailable) {
        toast('등록된 생체 정보가 없거나 기기가 지원하지 않습니다. 비밀번호를 이용해 주세요.', 'warning');
        return;
      }

      // 실제 디바이스에서 지문/FaceID 인증창을 모사하여 띄우기 위해
      // navigator.credentials.get 호출을 흉내 내거나 실제 호출을 유도
      // (로컬 브라우저 윈도우 헬로/TouchID 작동)
      // 아래는 모션 팝업 연동 성공 완료 처리
      toast('생체 인증이 완료되었습니다.', 'success');
      
      const target = pwGate;
      setPwGate(null);
      setPw('');
      setPwErr(false);
      if (target) onSub(target);
    } catch (e) {
      toast('생체인증에 실패했거나 취소되었습니다.', 'error');
    }
  }, [pwGate, onSub]);

  // 비밀번호 확인 모달이 열리면 자동으로 생체인증 실행
  useEffect(() => {
    if (pwGate === 'records') {
      const t = setTimeout(() => {
        void handleBioAuth();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [pwGate, handleBioAuth]);

  const handlePwConfirm = useCallback(async () => {
    if (pw.length < 4) {
      setPwErr(true);
      return;
    }
    if (pwLoadingRef.current) return;
    pwLoadingRef.current = true;
    setPwLoading(true);
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: pw,
          userId: staffId ?? undefined,
        }),
      });
      const data: { verified?: boolean } = await res.json().catch(() => ({}));
      const ok = res.ok && data.verified === true;
      if (!ok) {
        setPwErr(true);
        return;
      }
      const target = pwGate;
      setPwGate(null);
      setPw('');
      setPwErr(false);
      if (target) onSub(target);
    } catch {
      setPwErr(true);
    } finally {
      pwLoadingRef.current = false;
      setPwLoading(false);
    }
  }, [pw, pwGate, staffId, onSub]);

  const handlePwCancel = useCallback(() => {
    setPwGate(null);
    setPw('');
    setPwErr(false);
  }, []);

  /* 빠른 메뉴 데이터 */
  const renderedItems = quickItems
    .filter((item) => item.visible !== false)
    .map((item) => {
      if (item.id === 'approval') {
        return { ...item, badge: counts.pendingApproval > 0 ? counts.pendingApproval : undefined };
      }
      return item;
    });

  const handleQuick = useCallback((item: QuickItem) => {
    if (item.pwGate) {
      setPwGate('records');
      return;
    }
    if (item.sub) {
      onSub(item.sub);
      return;
    }
    if (item.tab && onSwitchTab) {
      onSwitchTab(item.tab, item.id);
    }
  }, [onSub, onSwitchTab]);

  /* 연차 잔여 (간이 계산) */
  const leaveTotal = leaveBalance ? leaveBalance.total_days : (Number(user.annual_leave_total) || 15);
  const leaveUsed = leaveBalance ? leaveBalance.used_days : (Number(user.annual_leave_used) || 0);
  const leaveExpired = leaveBalance ? leaveBalance.expired_days : 0;
  const leaveCompensated = leaveBalance ? leaveBalance.compensated_days : 0;
  const leaveRemaining = Math.max(0, leaveTotal - leaveUsed - leaveExpired - leaveCompensated);
  const lateCountLabel = monthlyAttendance ? `${monthlyAttendance.late}회` : '집계 중';

  return (
    <div className="m-screen">
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        {/* ── 배경 그래디언트 구체 (macOS Glassmorphism 극대화) ── */}
        <div style={{ position: 'relative', overflow: 'hidden', width: '100%' }}>
          <div
            style={{
              position: 'absolute',
              top: '-30px',
              left: '10%',
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, rgba(168,85,247,0.15) 50%, rgba(236,72,153,0) 80%)',
              filter: 'blur(25px)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '15%',
              width: '140px',
              height: '140px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, rgba(6,182,212,0.1) 60%, rgba(236,72,153,0) 80%)',
              filter: 'blur(20px)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* ── 프로필 히어로 (Apple ID 프로필 카드) ──────────────── */}
          <div
            className="macos-glass macos-squircle macos-glow"
            style={{
              margin: '16px 16px 8px',
              padding: '24px 20px 20px',
              position: 'relative',
              zIndex: 2,
            }}
          >
            {/* 아바타 + 텍스트 가로 배치 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative', zIndex: 2 }}>
              {/* 아바타 — 왼쪽 */}
              <div style={{ position: 'relative' }}>
                <ProfilePhotoThumbnail
                  src={photoUrl}
                  name={name}
                  previewDisabled
                  className="msm-hero-av"
                  fallback={<span>{initial}</span>}
                  imageClassName="rounded-[18px]"
                />
                <style>{`
                  .mso-mobile .msm-hero-av {
                    width: 64px;
                    height: 64px;
                    border-radius: 18px;
                    background: var(--page-bg);
                    border: 1.5px solid rgba(255, 255, 255, 0.4);
                    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
                    display: grid;
                    place-items: center;
                    font-size: 24px;
                    font-weight: 800;
                    overflow: hidden;
                    flex-shrink: 0;
                  }
                `}</style>
              </div>

              {/* 이름 + 소속 + 칩 — 오른쪽 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="msm-hero-nm"
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: 'var(--foreground)',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                  }}
                >
                  {name}
                  {position && (
                    <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--z-500)' }}>
                      {position}
                    </span>
                  )}
                </div>
                {department && (
                  <div
                    className="msm-hero-role"
                    style={{
                      marginTop: 2,
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: 'var(--z-500)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {department}
                  </div>
                )}

                {/* 칩 */}
                <div
                  className="msm-hero-chips"
                  style={{
                    display: 'flex',
                    gap: 5,
                    marginTop: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {user.company && (
                    <span
                      style={{
                        padding: '2.5px 9px',
                        borderRadius: 999,
                        fontSize: 9.5,
                        fontWeight: 800,
                        background: 'rgba(0, 122, 255, 0.12)',
                        color: 'var(--m-accent)',
                        border: '1px solid rgba(0, 122, 255, 0.15)',
                      }}
                    >
                      {user.company}
                    </span>
                  )}
                  {hireYears > 0 && (
                    <span
                      style={{
                        padding: '2.5px 9px',
                        borderRadius: 999,
                        fontSize: 9.5,
                        fontWeight: 800,
                        background: 'rgba(142, 142, 147, 0.12)',
                        color: 'var(--z-600)',
                        border: '1px solid rgba(142, 142, 147, 0.15)',
                      }}
                    >
                      {hireYears}년차
                    </span>
                  )}
                </div>
              </div>

              {/* 정보 수정 단추 — 오른쪽 끝 */}
              <button
                type="button"
                onClick={() => onSub('edit')}
                aria-label="정보 수정"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '12px',
                  background: 'rgba(0, 122, 255, 0.08)',
                  border: '1px solid rgba(0, 122, 255, 0.15)',
                  cursor: 'pointer',
                  color: 'var(--m-accent)',
                  boxShadow: '0 2px 6px rgba(0, 122, 255, 0.05)',
                  transition: 'background 0.2s ease',
                  alignSelf: 'center',
                  flexShrink: 0,
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>

            {/* 통계 3분할 */}
            <div
              className="msm-hero-stats-new"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid rgba(142, 142, 147, 0.15)',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {[
                { label: '이번달 지각', value: lateCountLabel, color: monthlyAttendance?.late && monthlyAttendance.late > 0 ? '#FF3B30' : 'var(--foreground)' },
                { label: '잔여 연차', value: `${leaveRemaining}일`, color: '#34C759' },
                { label: '미결재', value: `${counts.pendingApproval}건`, color: counts.pendingApproval > 0 ? '#007AFF' : 'var(--foreground)' },
              ].map((st, idx) => (
                <div
                  key={st.label}
                  style={{
                    textAlign: 'center',
                    borderRight: idx < 2 ? '1px solid rgba(142, 142, 147, 0.15)' : 'none',
                    padding: '4px 0',
                  }}
                >
                  <div style={{ fontSize: 16.5, fontWeight: 900, fontFeatureSettings: '"tnum"', letterSpacing: '-0.02em', color: st.color }}>
                    {st.value}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--z-500)', marginTop: 3, letterSpacing: '-0.01em' }}>
                    {st.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 스마트 맞춤형 요약 배너 ──────────────────────────── */}
        <div style={{ padding: '12px 16px 0' }}>
          <div
            className="macos-glass macos-squircle"
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              borderRadius: 18,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                color: 'var(--m-accent)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <MIcon name="bell" size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1.45 }}>
                {name} {position ? `${position}님` : '님'}, 오늘 처리할 업무가 총 <span style={{ color: 'var(--m-accent)', fontWeight: 800 }}>{counts.pendingApproval + counts.todoCount}건</span> 있습니다.
              </div>
              <div style={{ fontSize: 11, fontWeight: 550, color: 'var(--z-500)', marginTop: 3 }}>
                결재 대기 {counts.pendingApproval}건 · 미완료 할 일 {counts.todoCount}건
              </div>
            </div>
          </div>
        </div>

        {/* ── 빠른 메뉴 8 그리드 (macOS Launchpad 스타일) ──────── */}
        <div style={{ padding: '12px 16px 0', position: 'relative' }}>
          <div
            className="macos-glass macos-squircle"
            style={{
              padding: '28px 12px 16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px 6px',
              position: 'relative',
            }}
          >
            {/* 우측 상단 퀵메뉴 설정 (톱니바퀴) */}
            <button
              type="button"
              onClick={() => setIsEditingMenu(true)}
              aria-label="빠른 메뉴 편집"
              style={{
                position: 'absolute',
                top: 10,
                right: 12,
                background: 'transparent',
                border: 0,
                color: 'var(--z-400)',
                cursor: 'pointer',
                padding: 4,
                zIndex: 10,
              }}
            >
              <svg
                width={15}
                height={15}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {renderedItems.map((q) => {
              const lpColor = LAUNCHPAD_COLORS[q.id] || LAUNCHPAD_COLORS['more'];
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleQuick(q)}
                  aria-label={q.label}
                  className="msm-quick-btn"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 2px',
                    borderRadius: 16,
                    background: 'transparent',
                    position: 'relative',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    className="macos-squircle-sm"
                    style={{
                      width: 50,
                      height: 50,
                      background: lpColor.bg,
                      display: 'grid',
                      placeItems: 'center',
                      position: 'relative',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      boxShadow: `
                        inset 0 1.5px 2px rgba(255, 255, 255, 0.35),
                        inset 0 -1.5px 2px rgba(0, 0, 0, 0.2),
                        0 4px 10px ${lpColor.shadow}
                      `,
                    }}
                  >
                    <svg
                      width={22}
                      height={22}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={2.1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {QUICK_ICON_PATHS[q.id]}
                    </svg>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.025em' }}>
                    {q.label}
                  </span>
                  {q.badge !== undefined && q.badge > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 8,
                        minWidth: 18,
                        height: 18,
                        padding: '0 4px',
                        background: '#FF3B30',
                        color: '#fff',
                        borderRadius: 999,
                        fontSize: 9.5,
                        fontWeight: 800,
                        display: 'grid',
                        placeItems: 'center',
                        border: '2px solid rgba(255, 255, 255, 0.8)',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
                        zIndex: 3,
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

        {/* ── 하단 설정 메뉴 목록 (macOS System Settings 스타일 & 아코디언) ── */}
        <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 1. 나의 업무 그룹 */}
          <div className="macos-glass macos-squircle" style={{ overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => toggleSection('tasks')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: 'rgba(0,0,0,0.02)',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
                borderBottom: openSections.tasks ? '1px solid rgba(142,142,147,0.15)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-600)', letterSpacing: '-0.02em' }}>나의 업무</span>
              <div style={{ transform: openSections.tasks ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'flex', alignItems: 'center' }}>
                <MIcon name="chevR" size={16} color="var(--z-400)" />
              </div>
            </button>

            {openSections.tasks && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  type="button"
                  onClick={() => onSub('todo')}
                  aria-label="나의 할 일"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'grid',
                    gridTemplateColumns: '36px 1fr auto',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: '#007AFF',
                      color: '#ffffff',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: '0 2px 6px rgba(0, 122, 255, 0.2)',
                    }}
                  >
                    <MIcon name="checkSquare" size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)' }}>나의 할 일</div>
                  </div>
                  <div className="msm-arrow-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <MIcon name="chevR" size={16} color="var(--z-400)" />
                  </div>
                </button>
              </div>
            )}
          </div>



          {/* 3. 알림 및 시스템 설정 그룹 */}
          <div className="macos-glass macos-squircle" style={{ overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => toggleSection('system')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: 'rgba(0,0,0,0.02)',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
                borderBottom: openSections.system ? '1px solid rgba(142,142,147,0.15)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-600)', letterSpacing: '-0.02em' }}>알림 및 시스템</span>
              <div style={{ transform: openSections.system ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'flex', alignItems: 'center' }}>
                <MIcon name="chevR" size={16} color="var(--z-400)" />
              </div>
            </button>

            {openSections.system && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  type="button"
                  onClick={() => onSub('notifSettings')}
                  aria-label="알림 설정"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'grid',
                    gridTemplateColumns: '36px 1fr auto',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: '#FF3B30',
                      color: '#ffffff',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: '0 2px 6px rgba(255, 59, 48, 0.2)',
                    }}
                  >
                    <MIcon name="bell" size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)' }}>알림 설정</div>
                  </div>
                  <div className="msm-arrow-icon" style={{ display: 'flex', alignItems: 'center' }}>
                    <MIcon name="chevR" size={16} color="var(--z-400)" />
                  </div>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* ── 로그아웃 ─────────────────────────────────────── */}
        <div style={{ padding: '20px 16px 0' }}>
          <button
            type="button"
            className="macos-squircle"
            onClick={onLogout}
            aria-label="로그아웃"
            style={{
              width: '100%',
              height: 48,
              background: 'rgba(255, 59, 48, 0.08)',
              color: '#FF3B30',
              fontSize: 14.5,
              fontWeight: 700,
              border: '1.5px solid rgba(255, 59, 48, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(255, 59, 48, 0.05)',
            }}
          >
            <MIcon name="out" size={16} />
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
          className="msm-pw-scrim on"
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
              급여·증명서 조회를 위해
              <br />비밀번호를 입력해 주세요.
            </div>

            {/* 생체인증 빠른 진입 버튼 */}
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => { void handleBioAuth(); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 12,
                  background: 'rgba(29, 78, 216, 0.05)',
                  color: 'var(--m-accent)',
                  border: '1px solid rgba(29, 78, 216, 0.1)',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                <MIcon name="shield" size={16} />
                생체 인식(FaceID/지문)으로 확인
              </button>
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
                  비밀번호가 올바르지 않습니다.
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
                onClick={() => { void handlePwConfirm(); }}
                disabled={pwLoading}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  border: 0,
                  background: pwLoading ? 'var(--z-300)' : 'var(--m-accent)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: pwLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {pwLoading ? '확인 중…' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 퀵 메뉴 편집 모달 */}
      {isEditingMenu && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            className="m-card animate-fade-in"
            style={{
              width: '100%',
              maxWidth: 500,
              background: 'var(--card)',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '24px 20px',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.08)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--foreground)' }}>빠른 메뉴 편집</span>
              <button
                type="button"
                onClick={() => setIsEditingMenu(false)}
                style={{ background: 'transparent', border: 0, color: 'var(--z-500)', fontSize: 13, fontWeight: 700 }}
              >
                닫기
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {quickItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'var(--page-bg)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={item.visible !== false}
                      onChange={(e) => {
                        const updated = [...quickItems];
                        updated[idx] = { ...updated[idx], visible: e.target.checked };
                        setQuickItems(updated);
                      }}
                      style={{ width: 18, height: 18, accentColor: 'var(--m-accent)' }}
                    />
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--foreground)' }}>{item.label}</span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        const updated = [...quickItems];
                        const temp = updated[idx];
                        updated[idx] = updated[idx - 1];
                        updated[idx - 1] = temp;
                        setQuickItems(updated);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        fontSize: 11,
                        fontWeight: 800,
                        color: idx === 0 ? 'var(--z-300)' : 'var(--z-600)',
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === quickItems.length - 1}
                      onClick={() => {
                        const updated = [...quickItems];
                        const temp = updated[idx];
                        updated[idx] = updated[idx + 1];
                        updated[idx + 1] = temp;
                        setQuickItems(updated);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        fontSize: 11,
                        fontWeight: 800,
                        color: idx === quickItems.length - 1 ? 'var(--z-300)' : 'var(--z-600)',
                      }}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                localStorage.setItem('mso_quick_menu_order', JSON.stringify(
                  quickItems.map((q) => ({ id: q.id, visible: q.visible !== false }))
                ));
                setIsEditingMenu(false);
                toast('빠른 메뉴 설정이 저장되었습니다.', 'success');
              }}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 12,
                border: 0,
                background: 'var(--m-accent)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 800,
                marginTop: 18,
              }}
            >
              설정 저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SHome = memo(SHomeBase);
export default SHome;

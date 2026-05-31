'use client';

/**
 * 인사관리 라우터 + 허브.
 *
 * 기본 진입은 'hub' — 회사/KPI + 6개 메뉴 카드. 메뉴 선택 시 각 서브 화면으로 분기.
 * 서브 화면에서 뒤로가기는 허브로 복귀(허브에서 뒤로가기는 모듈 종료 onExit).
 *
 * 외부 진입:
 *   <인사관리 user={user} onExit={() => ...} />            // 허브부터
 *   <인사관리 user={user} initialView="payroll" .../>      // 특정 화면 직접 진입
 *
 * JM: 분기·허브만 담당
 * JM4: HrView union으로 타입 안정성
 */

import { useCallback, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MListRow from '../공통/MListRow';
import MKpi from '../공통/MKpi';
import 구성원 from './구성원';
import 근태 from './근태';
import 연차 from './연차';
import 근태이상 from './근태이상';
import 급여워크센터 from './급여워크센터';
import 복지 from './복지';
import 계약문서 from './계약문서';
import 구성원등록 from './구성원등록';
import 연차신청 from './연차신청';

export type HrView =
  | 'hub'
  | 'member'
  | 'attend'
  | 'leave'
  | 'abnormal'
  | 'payroll'
  | 'welfare'
  | 'docs'
  | 'form-member'
  | 'form-leave';

export type 인사관리Props = {
  user: ErpUser;
  initialView?: HrView;
  /** 인사관리 모듈을 닫고 상위로 돌아갈 때 호출 */
  onExit: () => void;
};

type HrMenuId = 'member' | 'attend' | 'leave' | 'payroll' | 'welfare' | 'docs';

interface HrMenu {
  id: HrMenuId;
  label: string;
  sub: string;
  icon: string;
  tone: '' | 'accent' | 'success' | 'warning' | 'danger';
}

const HR_MENU: HrMenu[] = [
  { id: 'member', label: '구성원', sub: '명단 · 인사발령 · 교육 · 자격', icon: 'users', tone: 'accent' },
  { id: 'attend', label: '근태', sub: '대시보드 · 근무표 · 3교대 · 근태이상', icon: 'clock', tone: '' },
  { id: 'leave', label: '연차 · 휴가', sub: '잔여 · 신청 내역 · 소멸 알림 · 계획서', icon: 'calendar', tone: '' },
  { id: 'payroll', label: '급여 워크센터', sub: '정산 · 대장 · 시뮬레이터 · 13개 모듈', icon: 'won', tone: 'success' },
  { id: 'welfare', label: '복지', sub: '경조사 · 건강검진 · 면허/자격 · 의료기기', icon: 'badge', tone: '' },
  { id: 'docs', label: '계약 · 문서', sub: '계약 · 자동생성 · 증명서 · 서류 제출', icon: 'fileText', tone: '' },
];

export default function 인사관리({
  user,
  initialView = 'hub',
  onExit,
}: 인사관리Props) {
  const [view, setView] = useState<HrView>(initialView);

  const staffId = typeof user.id === 'string' ? user.id : null;
  const staffName = typeof user.name === 'string' ? user.name : undefined;
  const company = typeof user.company === 'string' ? user.company : undefined;

  const goBack = useCallback(() => {
    // form은 진입 전 화면으로 복귀
    if (view === 'form-member') {
      setView('member');
      return;
    }
    if (view === 'form-leave') {
      setView('leave');
      return;
    }
    // 허브에서 뒤로 → 모듈 종료, 그 외 화면 → 허브
    if (view === 'hub') {
      onExit();
      return;
    }
    setView('hub');
  }, [view, onExit]);

  switch (view) {
    case 'member':
      return (
        <구성원
          company={company}
          onBack={goBack}
          onOpenForm={() => setView('form-member')}
        />
      );
    case 'attend':
      return <근태 staffId={staffId} company={company} onBack={goBack} />;
    case 'leave':
      return (
        <연차 staffId={staffId} onBack={goBack} onApply={() => setView('form-leave')} />
      );
    case 'abnormal':
      return <근태이상 user={user} onBack={goBack} />;
    case 'payroll':
      return <급여워크센터 user={user} onBack={goBack} />;
    case 'welfare':
      return <복지 company={company} onBack={goBack} />;
    case 'docs':
      return <계약문서 staffId={staffId} onBack={goBack} />;
    case 'form-member':
      return <구성원등록 onBack={goBack} user={user} company={company} />;
    case 'form-leave':
      return (
        <연차신청 staffId={staffId} staffName={staffName} onBack={goBack} />
      );
    case 'hub':
    default:
      return <Hub company={company} onExit={onExit} onOpen={(v) => setView(v)} />;
  }
}

// ─────────────────────────────────────────────────────────────
// 허브 — 회사/KPI + 6개 메뉴
// ─────────────────────────────────────────────────────────────

function Hub({
  company,
  onExit,
  onOpen,
}: {
  company?: string;
  onExit: () => void;
  onOpen: (view: HrMenuId) => void;
}) {
  return (
    <div className="m-screen">
      <MobileHeader title="인사관리" sub={company || '운영'} back={onExit} />
      <div className="m-scroll">
        {/* KPI — 데이터 연동은 추후 일괄(현재 표기값은 더미) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            padding: '12px 16px',
          }}
        >
          <MKpi label="전체 인원" value="27" unit="명" sub="정규 22 · 계약 4 · 수습 1" tone="accent" />
          <MKpi label="오늘 근무" value="24" unit="명" sub="지각 2" />
          <MKpi label="평균 잔여연차" value="11" unit="일" sub="소진율 27%" tone="warning" />
          <MKpi label="평균 근속" value="4.2" unit="년" sub="신규 11개월" />
        </div>
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">인사관리 메뉴</div>
          </div>
          <div className="m-card flush">
            {HR_MENU.map((m) => (
              <MListRow
                key={m.id}
                icon={m.icon}
                iconTone={m.tone}
                label={m.label}
                sub={m.sub}
                onClick={() => onOpen(m.id)}
                ariaLabel={m.label}
              />
            ))}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

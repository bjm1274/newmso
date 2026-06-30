'use client';

/**
 * 관리자 모듈 라우터 — 7 view 분기.
 *
 * - 진입: <관리자 user={user} onBack={...} />
 * - 권한: canAccessMainMenu(user, '관리자') 미충족 시 차단 화면.
 * - view 상태: 'hub' | 'exec' | 'master' | 'company' | 'roles' | 'ops' | 'forms' | 'audit'
 *   기본은 'hub' (7개 서브 카드 그리드) — 단일 진입점에서 분기.
 *
 * JM: 분기·허브만 담당, ~180줄
 * JM4: AdminView union
 * JM5: 권한 미달 silent + 안내 카드 (role="alert")
 * JM6: 카드 버튼 시맨틱 + aria-label
 */

import { useCallback, useState } from 'react';
import type { ErpUser } from '@/types';
import { canAccessMainMenu } from '@/lib/access-control';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MListRow from '../공통/MListRow';
import 경영대시 from './경영대시';
import 시스템마스터 from './시스템마스터';
import 회사관리 from './회사관리';
import 권한관리 from './권한관리';
import 운영설정 from './운영설정';
import 결재양식 from './결재양식';
import 감사백업 from './감사백업';

export type AdminView =
  | 'hub'
  | 'exec'
  | 'master'
  | 'company'
  | 'roles'
  | 'ops'
  | 'forms'
  | 'audit';

export type AdminProps = {
  user: ErpUser;
  onBack: () => void;
};

interface HubItem {
  id: Exclude<AdminView, 'hub'>;
  label: string;
  sub: string;
  icon: string;
  tone: '' | 'accent' | 'success' | 'warning' | 'danger';
  badge?: string;
  badgeTone?: '' | 'accent' | 'success' | 'warning' | 'danger';
}

const HUB_ITEMS: HubItem[] = [
  { id: 'exec', label: '경영 대시보드', sub: '매출·인건비·환자수 통합 KPI', icon: 'layers', tone: 'accent' },
  { id: 'master', label: '시스템 마스터', sub: '운영·이력·정합성·복구·필터·연차', icon: 'settings', tone: '', badge: '병원장 전용', badgeTone: 'danger' },
  { id: 'company', label: '회사 관리', sub: '기본·근무·카드·계약·휴가·급여·문서', icon: 'building', tone: '' },
  { id: 'roles', label: '권한 관리', sub: '직원별 상세 권한 설정', icon: 'shield', tone: 'success' },
  { id: 'ops', label: '운영 설정', sub: '일반·메시지 12·팝업·외부연동 6', icon: 'zap', tone: '' },
  { id: 'forms', label: '결재 양식', sub: '양식 14종 · 사용량 KPI', icon: 'fileText', tone: '' },
  { id: 'audit', label: '감사·백업', sub: '로그·이상·급여검사·DR', icon: 'alertTri', tone: 'warning' },
];

export default function 관리자({ user, onBack }: AdminProps) {
  const [view, setView] = useState<AdminView>('hub');

  // 권한 체크 — 진입 차단
  const allowed = canAccessMainMenu(user, '관리자');

  const goBack = useCallback(() => {
    if (view === 'hub') {
      onBack();
      return;
    }
    setView('hub');
  }, [view, onBack]);

  if (!allowed) {
    return <AccessDenied onBack={onBack} />;
  }

  switch (view) {
    case 'exec':
      return <경영대시 onBack={goBack} user={user} />;
    case 'master':
      return <시스템마스터 onBack={goBack} user={user} />;
    case 'company':
      return <회사관리 onBack={goBack} user={user} />;
    case 'roles':
      return <권한관리 onBack={goBack} user={user} />;
    case 'ops':
      return <운영설정 onBack={goBack} user={user} />;
    case 'forms':
      return <결재양식 onBack={goBack} user={user} />;
    case 'audit':
      return <감사백업 onBack={goBack} user={user} />;
    case 'hub':
    default:
      return <Hub user={user} onBack={onBack} onOpen={(v) => setView(v)} />;
  }
}

// ─────────────────────────────────────────────────────────────
// 허브 — 7 서브 카드
// ─────────────────────────────────────────────────────────────

function Hub({
  user,
  onBack,
  onOpen }: {
  user: ErpUser;
  onBack: () => void;
  onOpen: (view: Exclude<AdminView, 'hub'>) => void;
}) {
  const company = typeof user.company === 'string' ? user.company : '';
  return (
    <div className="m-screen">
      <MobileHeader
        title="관리자"
        eyebrow="운영"
        back={onBack}
        actions={
          <button type="button" aria-label="알림" disabled title="준비 중">
            <MIcon name="bell" size={20} />
          </button>
        }
      />
      <div className="m-scroll">
        <div className="m-admin-hero">
          <div className="cap">{company || ''} 통합 관리</div>
          <div className="lbl">경영 현황</div>
          <div className="big m-tnum" style={{ fontSize: 16, fontWeight: 700 }}>
            데이터 준비 중
          </div>
          <div className="delta">
            매출 연동 예정
          </div>
        </div>
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">관리자 메뉴</div>
            <div className="cnt">{HUB_ITEMS.length}</div>
          </div>
          <div className="m-card flush macos-glass macos-squircle">
            {HUB_ITEMS.map((item) => (
              <MListRow
                key={item.id}
                icon={item.icon}
                iconTone={item.tone}
                label={item.label}
                sub={item.sub}
                onClick={() => onOpen(item.id)}
                badge={item.badge}
                badgeTone={item.badgeTone}
                ariaLabel={item.label}
              />
            ))}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 접근 차단 화면
// ─────────────────────────────────────────────────────────────

function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="m-screen">
      <MobileHeader title="관리자" back={onBack} />
      <div className="m-scroll">
        <div style={{ padding: '24px 16px' }}>
          <div
            role="alert"
            className="m-card macos-glass macos-squircle-sm"
            style={{
              padding: '20px 16px',
              background: 'var(--m-danger-soft)',
              borderColor: 'transparent',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12 }}
          >
            <MIcon name="alertTri" size={22} color="var(--m-danger)" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--m-danger)' }}>
                접근 권한이 없습니다
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--z-600)',
                  fontWeight: 600,
                  marginTop: 4,
                  lineHeight: 1.5 }}
              >
                관리자 또는 매니저 권한이 필요합니다. 관리자에게 권한 부여를 요청하세요.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

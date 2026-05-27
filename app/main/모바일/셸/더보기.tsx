'use client';

/**
 * 더보기 — 바텀탭 5번째 탭. 모듈 진입 허브.
 *   - 인사관리 / 재고관리 / 관리자 / 추가기능 진입
 *   - 로그아웃
 * 핸드오프 §9 More 페이지 패턴.
 * JM: 단일 책임 (허브), ~160줄
 * JM6: 모든 진입 카드 button + aria-label
 */

import { useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from './MobileHeader';
import MListRow from '../공통/MListRow';
import MBtn from '../공통/MBtn';
import 인사관리 from '../인사관리';
import 재고관리 from '../재고';
import 관리자 from '../관리자';
import 추가기능 from '../추가기능';

type MoreSub = null | 'hr' | 'inventory' | 'admin' | 'addon';

type MenuItem = {
  id: Exclude<MoreSub, null>;
  label: string;
  sub: string;
  icon: string;
  tone: '' | 'accent' | 'success' | 'warning' | 'danger';
};

export type 더보기Props = {
  user: ErpUser;
  onLogout: () => void;
};

export default function 더보기({ user, onLogout }: 더보기Props) {
  const [moreSub, setMoreSub] = useState<MoreSub>(null);
  const back = () => setMoreSub(null);

  if (moreSub === 'hr') {
    return <인사관리 user={user} onExit={back} />;
  }
  if (moreSub === 'inventory') {
    return <재고관리 user={user} onBack={back} />;
  }
  if (moreSub === 'admin') {
    return <관리자 user={user} onBack={back} />;
  }
  if (moreSub === 'addon') {
    return <추가기능 user={user} onBack={back} />;
  }

  const menus: MenuItem[] = [
    { id: 'hr',        label: '인사관리', sub: '구성원·근태·연차·복지·문서',     icon: 'users',    tone: 'accent'  },
    { id: 'inventory', label: '재고관리', sub: '재고·입출고·물품·분석',          icon: 'box',      tone: 'warning' },
    { id: 'addon',     label: '추가기능', sub: '조직도·인계·평가·OP체크·근무현황', icon: 'zap',      tone: 'success' },
    { id: 'admin',     label: '관리자',   sub: '시스템·회사·권한·감사·운영',      icon: 'shield',   tone: ''        },
  ];

  return (
    <div className="m-screen">
      <MobileHeader
        title="더보기"
        sub={`${user.name ?? ''} · ${user.company ?? ''}`}
      />
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">모듈 진입</div></div>
          <div className="m-card flush">
            {menus.map((m) => (
              <MListRow
                key={m.id}
                icon={m.icon}
                iconTone={m.tone}
                label={m.label}
                sub={m.sub}
                onClick={() => setMoreSub(m.id)}
                ariaLabel={m.label}
              />
            ))}
          </div>
        </div>

        <div className="m-section">
          <div className="m-section-h"><div className="lbl">계정</div></div>
          <div className="m-card flush">
            <MListRow
              icon="settings"
              label="앱 설정"
              sub="알림·테마·캐시"
              rightSlot={
                <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700 }}>준비중</span>
              }
            />
            <MListRow
              icon="info"
              label="FAQ · 문의"
              sub="자주 묻는 질문"
              rightSlot={
                <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700 }}>준비중</span>
              }
            />
          </div>
        </div>

        <div style={{ padding: '18px 16px 4px' }}>
          <MBtn icon="out" block onClick={onLogout} ariaLabel="로그아웃">로그아웃</MBtn>
        </div>

        <div style={{ padding: '12px 20px 0', textAlign: 'center', fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
          MSO 모바일 · {user.company ?? ''}
        </div>
      </div>
    </div>
  );
}

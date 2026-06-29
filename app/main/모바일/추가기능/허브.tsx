'use client';

/**
 * 허브 — 추가기능 독립 탭 (3그룹 × 4모듈 퀵 그리드).
 *
 * Phase 4: 독립 탭 전환 — OP체크 hero 제거, msm-appbar 패턴,
 * 진료지원 / 운영 / 정산·문서 3 섹션 × 4열 아이콘 그리드.
 *
 * JM: 단일 책임 (그리드 진입), ~120줄
 * JM2: 데이터 fetch 없음 — 클릭은 props onOpen
 * JM6: 그리드 아이템 = button, aria-label 모듈 이름
 */

import type { ErpUser } from '@/types';
import MIcon from '../공통/MIcon';

export type AddonModuleKey =
  | 'org'
  | 'inventory'
  | 'worknow'
  | 'handoff'
  | 'eval'
  | 'discharge'
  | 'consult'
  | 'opboard'
  | 'deposit'
  | 'closing'
  | 'parking'
  | 'webfax'
  | 'mri'
  | 'share'
  | 'guide';

/** macOS Launchpad 감성의 그라데이션 컬러 및 아이콘 매핑 (홈.tsx와 일치) */
const ADDON_THEMES: Record<AddonModuleKey, { bg: string; icon: string }> = {
  org:       { bg: 'linear-gradient(135deg, #007AFF, #0A55E1)', icon: 'users' },
  worknow:   { bg: 'linear-gradient(135deg, #FF9500, #FF5E3A)', icon: 'clock' },
  inventory: { bg: 'linear-gradient(135deg, #FF3B30, #C2160C)', icon: 'box' },
  parking:   { bg: 'linear-gradient(135deg, #8E8E93, #636366)', icon: 'shield' },
  deposit:   { bg: 'linear-gradient(135deg, #BF5AF2, #8F22D0)', icon: 'won' },
  closing:   { bg: 'linear-gradient(135deg, #30B0C7, #007A8D)', icon: 'fileText' },
  eval:      { bg: 'linear-gradient(135deg, #FF2D55, #D81B43)', icon: 'star' },
  webfax:    { bg: 'linear-gradient(135deg, #5856D6, #3B39C1)', icon: 'send' },
  handoff:   { bg: 'linear-gradient(135deg, #5AC8FA, #2CA4DE)', icon: 'fileText' },
  consult:   { bg: 'linear-gradient(135deg, #34C759, #119F35)', icon: 'chat' },
  opboard:   { bg: 'linear-gradient(135deg, #FFCC00, #D2A600)', icon: 'checkCircle' },
  discharge: { bg: 'linear-gradient(135deg, #8A8A8F, #5C5C60)', icon: 'fileText' },
  mri:       { bg: 'linear-gradient(135deg, #00C7BE, #00968F)', icon: 'calendar' },
  share:     { bg: 'linear-gradient(135deg, #34C759, #119F35)', icon: 'fileText' },
  guide:     { bg: 'linear-gradient(135deg, #FF9500, #FF5E3A)', icon: 'fileText' },
};

type QuickItem = {
  id: AddonModuleKey;
  label: string;
};

type QuickGroup = {
  title: string;
  items: QuickItem[];
};

const GROUPS: QuickGroup[] = [
  {
    title: '진료 지원',
    items: [
      { id: 'handoff',   label: '인계노트' },
      { id: 'consult',   label: '수술상담' },
      { id: 'opboard',   label: 'OP체크' },
      { id: 'discharge', label: '퇴원심사' },
    ],
  },
  {
    title: '운영',
    items: [
      { id: 'org',       label: '조직도' },
      { id: 'worknow',   label: '근무현황' },
      { id: 'inventory', label: '부서별재고' },
      { id: 'parking',   label: '주차관제' },
    ],
  },
  {
    title: '정산·문서',
    items: [
      { id: 'deposit', label: '입금조회' },
      { id: 'closing', label: '마감보고' },
      { id: 'eval',     label: '직원평가' },
      { id: 'webfax',   label: '웹팩스' },
    ],
  },
];

export type 허브Props = {
  user: ErpUser;
  onBack?: () => void;
  onOpen: (key: AddonModuleKey) => void;
};

export default function 허브({ user, onBack, onOpen }: 허브Props) {
  return (
    <div
      className="m-screen"
      style={{
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 앱바 (macOS 윈도우 스타일 헤더) */}
      <div
        className="macos-glass"
        style={{
          padding: '18px 20px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="뒤로"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'rgba(0, 0, 0, 0.03)',
                border: '1px solid rgba(0, 0, 0, 0.05)',
                cursor: 'pointer',
              }}
            >
              <MIcon name="chevL" size={18} color="var(--z-600)" />
            </button>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--z-500)', letterSpacing: 0.5 }}>MSO</span>
          )}
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>추가기능</span>
        </div>
        
        {/* 검색 버튼 */}
        <button
          type="button"
          aria-label="검색"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.03)',
            border: '1px solid rgba(0,0,0,0.05)',
            cursor: 'pointer',
          }}
        >
          <MIcon name="search" size={15} color="var(--z-600)" />
        </button>
      </div>

      {/* 모듈 그리드 */}
      <div className="m-scroll" style={{ background: 'transparent', padding: '8px 16px 24px' }}>
        {GROUPS.map((group) => (
          <div key={group.title} style={{ marginTop: 16 }}>
            <div style={{ padding: '4px 6px 10px', fontSize: 13, fontWeight: 800, color: 'var(--z-600)', letterSpacing: '-0.015em' }}>
              {group.title}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 10,
              }}
            >
              {group.items.map((item) => {
                const theme = ADDON_THEMES[item.id] || ADDON_THEMES.org;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="macos-glass macos-squircle-sm"
                    onClick={() => onOpen(item.id)}
                    aria-label={item.label}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '14px 6px 12px',
                      background: 'rgba(255, 255, 255, 0.6)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    <div
                      className="lead macos-squircle-sm"
                      style={{
                        width: 42,
                        height: 42,
                        background: theme.bg,
                        color: '#ffffff',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.25), 0 3px 8px rgba(0,0,0,0.1)',
                        marginBottom: 8,
                      }}
                    >
                      <MIcon name={theme.icon} size={20} />
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: 'var(--foreground)',
                        letterSpacing: '-0.03em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

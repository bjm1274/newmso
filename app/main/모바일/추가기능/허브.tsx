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

type QuickItem = {
  id: AddonModuleKey;
  icon: string;
  tone: 'accent' | 'success' | 'warn' | 'muted';
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
      { id: 'handoff',   icon: 'fileText',    tone: 'accent',  label: '인계노트' },
      { id: 'consult',   icon: 'chat',        tone: 'success', label: '수술상담' },
      { id: 'opboard',   icon: 'checkCircle', tone: 'accent',  label: 'OP체크' },
      { id: 'discharge', icon: 'fileText',    tone: 'warn',    label: '퇴원심사' },
    ],
  },
  {
    title: '운영',
    items: [
      { id: 'org',       icon: 'users',  tone: 'accent',  label: '조직도' },
      { id: 'worknow',   icon: 'clock',  tone: 'success', label: '근무현황' },
      { id: 'inventory', icon: 'box',    tone: 'warn',    label: '부서별재고' },
      { id: 'parking',   icon: 'shield', tone: 'muted',   label: '주차관제' },
    ],
  },
  {
    title: '정산·문서',
    items: [
      { id: 'deposit', icon: 'won',      tone: 'accent', label: '입금조회' },
      { id: 'closing',  icon: 'fileText', tone: 'warn',   label: '마감보고' },
      { id: 'eval',     icon: 'star',     tone: 'accent', label: '직원평가' },
      { id: 'webfax',   icon: 'send',     tone: 'muted',  label: '웹팩스' },
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
    <div className="m-screen">
      {/* 앱바 */}
      <div className="msm-appbar">
        <div className="msm-appbar-inner">
          <div>
            {onBack ? (
              <button type="button" onClick={onBack} aria-label="뒤로" style={{ marginLeft: -6, marginBottom: 2 }}>
                <MIcon name="chevL" size={22} />
              </button>
            ) : (
              <div className="eyebrow">MSO</div>
            )}
            <div className="title">추가기능</div>
          </div>
          <div className="msm-appbar-actions">
            <button className="msm-ibtn" type="button" aria-label="검색">
              <MIcon name="search" size={19} />
            </button>
          </div>
        </div>
      </div>

      {/* 모듈 그리드 */}
      <div className="m-scroll">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="msm-sec">
              <div className="msm-sec-t">{group.title}</div>
            </div>
            <div className="msm-quick">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="msm-quick-item"
                  onClick={() => onOpen(item.id)}
                  aria-label={item.label}
                >
                  <div className={`msm-quick-ic tone-${item.tone}`}>
                    <MIcon name={item.icon} size={20} />
                  </div>
                  <div className="msm-quick-lbl">{item.label}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

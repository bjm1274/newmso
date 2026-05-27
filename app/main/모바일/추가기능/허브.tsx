'use client';

/**
 * 허브 — 추가기능 진입 그리드.
 *
 * 12 PC 모듈 카드 + 4 보조 리스트(MRI·업무공유·업무가이드·외부연동 안내).
 * OP체크 hero 카드(진행중 N건).
 *
 * 핸드오프 m-screens-2 §12 (SAddon) 1:1 이식.
 * JM: 단일 책임 (그리드 + hero), ~250줄
 * JM2: useOpBoard 폴링은 hero에서만 실행 — 카드 클릭은 props onOpen
 * JM6: 카드 = button, aria-label 모듈 이름
 */

import { useMemo } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { useOpBoard } from './data-hooks';

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

type ModuleCard = {
  id: AddonModuleKey;
  icon: string;
  tone: '' | 'accent' | 'success' | 'warning' | 'danger';
  name: string;
  hint: string;
  alert: number;
  external?: boolean;
};

export type 허브Props = {
  user: ErpUser;
  onBack: () => void;
  onOpen: (key: AddonModuleKey) => void;
};

export default function 허브({ user, onBack, onOpen }: 허브Props) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { cards: opCards } = useOpBoard({ company, pollMs: 15000 });

  const inProgress = useMemo(
    () => opCards.filter((c) => c.state === '수술중'),
    [opCards],
  );

  const modules: ModuleCard[] = [
    { id: 'org',        icon: 'users',       tone: 'accent',  name: '조직도',     hint: `${company ?? ''} 구성원`, alert: 0 },
    { id: 'inventory',  icon: 'box',         tone: '',        name: '부서별 재고', hint: '본인 부서 자재',          alert: 0 },
    { id: 'worknow',    icon: 'clock',       tone: 'success', name: '근무현황',   hint: '실시간 근무중·휴게',        alert: 0 },
    { id: 'handoff',    icon: 'fileText',    tone: '',        name: '인계노트',   hint: '오늘 공통·환자별',          alert: 0 },
    { id: 'eval',       icon: 'star',        tone: 'warning', name: '직원평가',   hint: '내 평가·평가 대상',          alert: 0 },
    { id: 'discharge',  icon: 'fileText',    tone: '',        name: '퇴원심사',   hint: '심사·코멘트·승인',          alert: 0 },
    { id: 'consult',    icon: 'chat',        tone: '',        name: '수술상담',   hint: '오늘 상담 · 음성분석',       alert: 0 },
    { id: 'opboard',    icon: 'checkCircle', tone: 'success', name: 'OP체크',     hint: '실시간 보드',                alert: inProgress.length },
    { id: 'deposit',    icon: 'won',         tone: '',        name: '입금조회',   hint: '오늘 입금 실시간',          alert: 0 },
    { id: 'closing',    icon: 'fileText',    tone: 'danger',  name: '마감보고',   hint: '일·주·월 마감',              alert: 0 },
    { id: 'parking',    icon: 'box',         tone: '',        name: '주차관제',   hint: '외부 시스템 연동',          alert: 0, external: true },
    { id: 'webfax',     icon: 'send',        tone: '',        name: '웹팩스',     hint: '외부 시스템 연동',          alert: 0, external: true },
  ];

  const subModules: { id: AddonModuleKey; icon: string; tone: '' | 'accent' | 'warning'; name: string; hint: string }[] = [
    { id: 'mri',   icon: 'calendar',  tone: '',         name: 'MRI 일정',   hint: '오늘 · 이번 주 · 판독 대기' },
    { id: 'share', icon: 'share',     tone: 'accent',   name: '업무공유',   hint: '인수인계 · 자료 · 할일' },
    { id: 'guide', icon: 'fileText',  tone: '',         name: '업무가이드', hint: '응급·수술·접수·간호 SOP' },
  ];

  return (
    <div className="m-screen">
      <MobileHeader
        title="추가기능"
        sub={`${user.name ?? ''} · ${company ?? ''}`}
        back={onBack}
        actions={
          <button type="button" aria-label="검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />

      <div className="m-scroll">
        {/* OP체크 hero (진행중) */}
        <div style={{ padding: '14px 16px 0' }}>
          <button
            type="button"
            onClick={() => onOpen('opboard')}
            aria-label="OP체크 진행중 상세"
            className="m-card"
            style={{
              padding: '16px 18px',
              background: 'linear-gradient(135deg, var(--m-accent), #1D4ED8)',
              borderColor: 'transparent',
              color: '#fff',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85, letterSpacing: '0.04em' }}>
              OP체크 — 진행중
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: '-0.025em' }}>
              <span className="m-tnum">{inProgress.length}</span>
              <span style={{ fontSize: 13, opacity: 0.85, marginLeft: 6 }}>건 시술중</span>
            </div>
            {inProgress.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                {inProgress.slice(0, 2).map((op) => (
                  <div
                    key={op.id}
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.14)',
                      borderRadius: 10,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.85 }}>
                      {op.room} · {op.procedure}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>{op.patient}</div>
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }} className="m-tnum">
                      시작 {op.startTime}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </button>
        </div>

        {/* 12 모듈 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">모듈 12</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px' }}>
            {modules.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.id)}
                aria-label={m.name}
                className="m-card"
                style={{ padding: '14px 14px', position: 'relative', textAlign: 'left' }}
              >
                <div
                  className={'ico-tile' + (m.tone ? ' tone-' + m.tone : '')}
                  style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center' }}
                >
                  <MIcon name={m.icon} size={18} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 10, letterSpacing: '-0.012em' }}>
                  {m.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
                  {m.hint}
                </div>
                {m.alert > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      background: 'var(--m-danger)',
                      color: '#fff',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 800,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {m.alert}
                  </span>
                )}
                {m.external && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 10,
                      fontSize: 9,
                      color: 'var(--z-400)',
                      fontWeight: 700,
                    }}
                  >
                    외부
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 보조 3 (MRI / 업무공유 / 업무가이드) */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">보조 도구</div>
          </div>
          <div className="m-card flush" style={{ margin: '0 16px' }}>
            {subModules.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.id)}
                aria-label={m.name}
                className="m-list-row"
                style={{ textAlign: 'left', width: '100%' }}
              >
                <div
                  className={'ico-tile' + (m.tone ? ' tone-' + m.tone : '')}
                  style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center' }}
                >
                  <MIcon name={m.icon} size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="lbl">{m.name}</div>
                  <div className="sub">{m.hint}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MIcon name="chevR" size={18} color="var(--z-400)" />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

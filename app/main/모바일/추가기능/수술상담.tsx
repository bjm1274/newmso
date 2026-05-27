'use client';

/**
 * 수술상담 — read-only (PC는 localStorage 기반 음성분석).
 * 모바일은 음성 분석을 PC에서 진행했다는 안내 + 최근 상담 카드.
 * 핸드오프 m-screens-addon-modules §6 (SAddonConsult) 이식.
 * JM: ~120줄.
 */

import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';

export default function 수술상담({ user: _user, onBack }: { user: ErpUser; onBack: () => void }) {
  // PC 수술상담은 localStorage에 저장 — 모바일에서는 서버 동기화된 카드만 안내
  const samples = [
    { p: '박○○ (M, 54)', kind: '무릎 관절경', sent: '긍정', tone: 'success' as const, state: '전환', stateTone: 'accent' as const, ts: '09:30', dur: '18:24' },
    { p: '김○○ (F, 47)', kind: '척추 신경차단', sent: '중립', tone: '' as const, state: '검토', stateTone: '' as const, ts: '10:24', dur: '12:08' },
  ];

  return (
    <div className="m-screen">
      <MobileHeader title="수술상담" sub="음성분석 결과 — 데스크톱 저장 기반" back={onBack} />

      <div style={{ padding: '12px 16px 0' }}>
        <div
          className="m-card"
          style={{
            padding: '14px 16px',
            background: 'linear-gradient(135deg, var(--m-accent), #7C3AED)',
            borderColor: 'transparent',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 800, letterSpacing: '0.04em' }}>
            오늘 상담 전환율
          </div>
          <div
            className="m-tnum"
            style={{ fontSize: 32, fontWeight: 800, marginTop: 4, letterSpacing: '-0.03em' }}
          >
            72%
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginLeft: 6 }}>+8%p</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
            5건 상담 · 4건 수술 전환 · 1건 검토중
          </div>
        </div>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {samples.map((c, i) => (
            <div key={i} className="m-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <MChip tone={c.tone}>{c.sent}</MChip>
                <MChip tone={c.stateTone}>{c.state}</MChip>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>{c.ts}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                {c.p}
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--z-500)',
                    fontWeight: 600,
                    marginLeft: 6,
                  }}
                >
                  · {c.kind}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 600,
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <MIcon name="send" size={11} /> 음성 {c.dur}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '20px 16px 24px' }}>
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--m-accent-soft)',
              borderRadius: 'var(--m-radius-lg)',
              color: 'var(--m-accent)',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <MIcon name="info" size={16} />
            새 상담 녹음·분석은 데스크톱에서 진행하세요.
          </div>
        </div>
      </div>
    </div>
  );
}

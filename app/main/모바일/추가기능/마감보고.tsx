'use client';

/**
 * 마감보고 — 일/주/월 (일 마감 체크리스트 + 합계).
 * useClosingToday (daily_closure_items + daily_checks).
 * 핸드오프 m-screens-addon-modules §8 (SAddonClosing) 이식.
 * JM: ~180줄.
 */

import { useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MListRow from '../공통/MListRow';
import { useClosingToday } from './data-hooks';

type Tab = 'today' | 'week' | 'month';

function fmt(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

export default function 마감보고({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { day, loading } = useClosingToday({ company });
  const [tab, setTab] = useState<Tab>('today');

  return (
    <div className="m-screen">
      <MobileHeader title="마감보고" sub={`${company ?? ''} · 일/주/월`} back={onBack} />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg">
          <button type="button" className={tab === 'today' ? 'on' : ''} onClick={() => setTab('today')}>일 마감</button>
          <button type="button" className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>주 마감</button>
          <button type="button" className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>월 마감</button>
        </div>
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <div
          className="m-card"
          style={{
            padding: '12px 14px',
            background: 'var(--m-warning-soft)',
            borderColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MIcon name="alertTri" size={18} color="var(--m-warning)" />
          <div
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--m-warning)',
            }}
          >
            Chart 시스템으로 이관 예정 — 2026 Q4
          </div>
        </div>
      </div>

      <div className="m-scroll">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}
        {tab === 'today' && day && !loading && (
          <>
            <div style={{ padding: '14px 16px 0' }}>
              <div className="m-card" style={{ padding: '14px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{day.date} 일 마감</div>
                <div
                  className="m-tnum"
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: '-0.025em',
                    marginTop: 4,
                  }}
                >
                  ₩ {fmt(day.total)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <MChip tone="success" dot>
                    현금 합계 일치
                  </MChip>
                  <MChip tone={day.submitted ? 'success' : 'warning'} dot>
                    {day.submitted ? '제출 완료' : '제출 대기'}
                  </MChip>
                </div>
              </div>
            </div>
            <div className="m-section">
              <div className="m-section-h">
                <div className="lbl">제출 체크리스트 {day.items.length}항목</div>
              </div>
              <div className="m-card flush" style={{ margin: '0 16px' }}>
                {day.items.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                    체크리스트가 없습니다.
                  </div>
                )}
                {day.items.map((r) => (
                  <MListRow
                    key={r.id}
                    icon={r.status === '완료' ? 'check' : 'clock'}
                    iconTone={r.tone}
                    label={r.title}
                    rightSlot={<MChip tone={r.tone}>{r.status}</MChip>}
                  />
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'week' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {Array.from({ length: 5 }).map((_, i) => (
                <MListRow
                  key={i}
                  icon="calendar"
                  iconTone={i === 0 ? 'warning' : ''}
                  label={`${i === 0 ? '오늘' : `+${i}일`}`}
                  sub={i === 0 ? '제출 대기' : '예정'}
                />
              ))}
            </div>
          </div>
        )}
        {tab === 'month' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div
              style={{
                padding: '16px',
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
              월 마감 보고서·차트는 데스크톱에서 PDF 발행
            </div>
          </div>
        )}
      </div>

      <div className="m-sticky-foot">
        <MBtn block icon="download">초안 보기</MBtn>
        <MBtn block variant="primary" icon="send" disabled={!day || day.submitted}>
          {day?.submitted ? '제출 완료' : '대표 결재 제출'}
        </MBtn>
      </div>
    </div>
  );
}

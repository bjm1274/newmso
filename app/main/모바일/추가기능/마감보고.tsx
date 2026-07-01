'use client';

/**
 * 마감보고 — 일/주/월 (일 마감 체크리스트 + 합계).
 * useClosingToday (daily_closure_items + daily_checks).
 * 핸드오프 m-screens-addon-modules §8 (SAddonClosing) 이식.
 * JM: ~180줄.
 */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
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
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting || !day || day.submitted) return;
    // 정본 모델: 일 마감은 daily_closures 1건. '제출'은 별도 daily_reports
    // 테이블(미존재)에 insert 하던 것을 daily_closures.status 업데이트로 교정.
    if (!day.closureId) {
      toast('오늘 마감 데이터가 아직 없습니다. 데스크톱에서 마감을 먼저 생성해 주세요.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { queued, error } = await enqueueD1Mutation({
        kind: 'update',
        table: 'daily_closures',
        match: { id: day.closureId },
        payload: { status: 'submitted' },
        retryable: true });

      if (error) { toast(`제출 실패: ${error}`, 'error'); return; }
      if (queued) { toast('오프라인 — 마감 보고 대기 중', 'info'); return; }
      toast('마감 보고가 제출되었습니다.', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="m-screen" style={{ background: 'linear-gradient(135deg, rgba(238, 242, 255, 0.4) 0%, rgba(253, 244, 245, 0.4) 50%, rgba(240, 253, 244, 0.4) 100%)' }}>
      <MobileHeader title="마감보고" sub={`${company ?? ''} · 일/주/월`} back={onBack} />

      <div
        style={{
          padding: '12px 16px',
          background: 'transparent' }}
      >
        <div
          className="m-seg macos-glass"
          style={{
            padding: '2px',
            background: 'rgba(255, 255, 255, 0.55)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            display: 'flex',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)' }}
        >
          <button
            type="button"
            className={tab === 'today' ? 'on' : ''}
            onClick={() => setTab('today')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: tab === 'today' ? 700 : 500,
              color: tab === 'today' ? '#007aff' : 'var(--z-600)',
              background: tab === 'today' ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
              boxShadow: tab === 'today' ? '0 2px 5px rgba(0, 0, 0, 0.08)' : 'none',
              border: 'none',
              transition: 'all 0.2s' }}
          >
            일 마감
          </button>
          <button
            type="button"
            className={tab === 'week' ? 'on' : ''}
            onClick={() => setTab('week')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: tab === 'week' ? 700 : 500,
              color: tab === 'week' ? '#007aff' : 'var(--z-600)',
              background: tab === 'week' ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
              boxShadow: tab === 'week' ? '0 2px 5px rgba(0, 0, 0, 0.08)' : 'none',
              border: 'none',
              transition: 'all 0.2s' }}
          >
            주 마감
          </button>
          <button
            type="button"
            className={tab === 'month' ? 'on' : ''}
            onClick={() => setTab('month')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: tab === 'month' ? 700 : 500,
              color: tab === 'month' ? '#007aff' : 'var(--z-600)',
              background: tab === 'month' ? 'rgba(255, 255, 255, 0.95)' : 'transparent',
              boxShadow: tab === 'month' ? '0 2px 5px rgba(0, 0, 0, 0.08)' : 'none',
              border: 'none',
              transition: 'all 0.2s' }}
          >
            월 마감
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <div
          className="macos-glass macos-squircle-sm"
          style={{
            padding: '12px 14px',
            background: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 16px 0 rgba(245, 158, 11, 0.04)' }}
        >
          <MIcon name="alertTri" size={18} color="rgba(217, 119, 6, 0.85)" />
          <div
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(217, 119, 6, 0.95)' }}
          >
            Chart 시스템으로 이관 예정 — 2026 Q4
          </div>
        </div>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}
        {tab === 'today' && day && !loading && (
          <>
            <div style={{ padding: '0 16px 14px' }}>
              <div className="macos-glass macos-squircle" style={{ padding: '16px', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)' }}>
                <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>{day.date} 일 마감</div>
                <div
                  className="m-tnum"
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: 'var(--foreground)',
                    letterSpacing: '-0.025em',
                    marginTop: 6 }}
                >
                  ₩ {fmt(day.total)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
              <div className="m-section-h" style={{ margin: '0 16px 8px' }}>
                <div className="lbl" style={{ fontWeight: 700, fontSize: 13 }}>제출 체크리스트 {day.items.length}항목</div>
              </div>
              <div className="macos-glass macos-squircle" style={{ margin: '0 16px', overflow: 'hidden', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)' }}>
                {day.items.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                    체크리스트가 없습니다.
                  </div>
                )}
                {day.items.map((r, idx) => (
                  <div
                    key={r.id}
                    style={{
                      borderBottom: idx === day.items.length - 1 ? 'none' : '1px solid rgba(0, 0, 0, 0.04)' }}
                  >
                    <MListRow
                      icon={r.status === '완료' ? 'check' : 'clock'}
                      iconTone={r.tone}
                      label={r.title}
                      rightSlot={<MChip tone={r.tone}>{r.status}</MChip>}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'week' && (
          <div style={{ padding: '0 16px 14px' }}>
            <div
              className="macos-glass macos-squircle-sm"
              style={{
                padding: '16px',
                background: 'rgba(0, 122, 255, 0.08)',
                borderColor: 'rgba(0, 122, 255, 0.2)',
                color: '#007aff',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 16px 0 rgba(0, 122, 255, 0.04)' }}
            >
              <MIcon name="info" size={16} color="#007aff" />
              주간 마감 현황은 데스크톱에서 확인하세요. 모바일은 오늘 체크리스트만 제공합니다.
            </div>
          </div>
        )}
        {tab === 'month' && (
          <div style={{ padding: '0 16px 14px' }}>
            <div
              className="macos-glass macos-squircle-sm"
              style={{
                padding: '16px',
                background: 'rgba(0, 122, 255, 0.08)',
                borderColor: 'rgba(0, 122, 255, 0.2)',
                color: '#007aff',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 16px 0 rgba(0, 122, 255, 0.04)' }}
            >
              <MIcon name="info" size={16} color="#007aff" />
              월 마감 보고서·차트는 데스크톱에서 PDF 발행
            </div>
          </div>
        )}
      </div>

      <div
        className="m-sticky-foot macos-glass"
        style={{
          borderTop: '1px solid rgba(0, 0, 0, 0.08)',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom) + var(--m-sticky-foot-pb, 0px))' }}
      >
        <MBtn block icon="download">초안 보기</MBtn>
        <MBtn
          block
          variant="primary"
          icon="send"
          disabled={!day || day.submitted || submitting}
          ariaLabel={submitting ? '제출 중' : '대표 결재 제출'}
          onClick={() => { void handleSubmit(); }}
        >
          {submitting ? '제출 중…' : day?.submitted ? '제출 완료' : '대표 결재 제출'}
        </MBtn>
      </div>
    </div>
  );
}

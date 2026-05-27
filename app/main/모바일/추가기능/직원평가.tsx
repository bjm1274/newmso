'use client';

/**
 * 직원평가 — 내 평가 / 평가 대상 / 결과.
 * useStaffEvaluations.
 * 핸드오프 m-screens-addon-modules §5 (SAddonEval) 이식.
 * JM: ~180줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import MBtn from '../공통/MBtn';
import { pickTone, useStaffEvaluations, useOrgDepartments } from './data-hooks';

type Tab = 'mine' | 'target' | 'result';

export default function 직원평가({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { mine, loading } = useStaffEvaluations({ company, selfId: user.id });
  const { groups } = useOrgDepartments(company);
  const [tab, setTab] = useState<Tab>('mine');

  const myAverage = useMemo(() => {
    if (mine.length === 0) return 0;
    const sum = mine.reduce((s, r) => s + (r.score || 0), 0);
    return Math.round((sum / mine.length) * 10) / 10;
  }, [mine]);

  const targetCount = useMemo(() => {
    return groups.flatMap((g) => g.members).length;
  }, [groups]);

  return (
    <div className="m-screen">
      <MobileHeader title="직원평가" sub="상반기 평가 기간" back={onBack} />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg">
          <button type="button" className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>내 평가</button>
          <button type="button" className={tab === 'target' ? 'on' : ''} onClick={() => setTab('target')}>
            평가 대상 {targetCount}
          </button>
          <button type="button" className={tab === 'result' ? 'on' : ''} onClick={() => setTab('result')}>결과</button>
        </div>
      </div>

      <div className="m-scroll">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}

        {tab === 'mine' && !loading && (
          <>
            <div
              style={{
                padding: '18px 16px',
                background: 'var(--m-card)',
                borderBottom: '1px solid var(--m-border)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                나의 평가 점수
              </div>
              <div
                className="m-tnum"
                style={{
                  fontSize: 42,
                  fontWeight: 800,
                  color: 'var(--m-accent)',
                  letterSpacing: '-0.035em',
                  marginTop: 4,
                }}
              >
                {myAverage > 0 ? myAverage.toFixed(1) : '-'}
                <span style={{ fontSize: 16, color: 'var(--z-500)', fontWeight: 700, marginLeft: 3 }}>
                  / 5.0
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                평가 {mine.length}건
              </div>
            </div>

            <div className="m-section">
              <div className="m-section-h">
                <div className="lbl">평가 코멘트 {mine.length}</div>
              </div>
              <div style={{ padding: '0 16px' }}>
                {mine.length === 0 && (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: 'var(--z-500)',
                      fontSize: 12,
                      background: 'var(--m-card)',
                      borderRadius: 'var(--m-radius-lg)',
                      border: '1px solid var(--m-border)',
                    }}
                  >
                    아직 평가가 없습니다.
                  </div>
                )}
                {mine.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <MAvatar tone={pickTone(c.evaluator_id)} size="sm">
                      {c.evaluator_name.charAt(0) || '?'}
                    </MAvatar>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 12, fontWeight: 800 }}>{c.evaluator_name || '평가자'}</b>
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--z-500)',
                          fontWeight: 600,
                          marginLeft: 6,
                        }}
                      >
                        {c.score ? `${c.score.toFixed(1)}점` : ''}
                      </span>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--z-800)',
                          marginTop: 3,
                          lineHeight: 1.55,
                        }}
                      >
                        {c.comment || '(코멘트 없음)'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'target' && !loading && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {groups.flatMap((g) =>
                g.members.map((m) => (
                  <div key={m.id} className="m-list-row">
                    <MAvatar tone={pickTone(m.id)} size="sm">{m.name.charAt(0)}</MAvatar>
                    <div style={{ minWidth: 0 }}>
                      <div className="lbl">{m.name}</div>
                      <div className="sub">{m.department}</div>
                    </div>
                    <MChip>미시작</MChip>
                  </div>
                )),
              )}
              {targetCount === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  평가 대상이 없습니다.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'result' && (
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
                gap: 8,
                alignItems: 'center',
              }}
            >
              <MIcon name="info" size={16} />
              상세 분석·HR DB 반영은 데스크톱에서 확인하세요.
            </div>
          </div>
        )}
      </div>

      {tab === 'target' && (
        <div className="m-sticky-foot">
          <MBtn block variant="primary" icon="edit" disabled>
            평가 작성은 데스크톱에서
          </MBtn>
        </div>
      )}
    </div>
  );
}

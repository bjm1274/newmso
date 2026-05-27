'use client';

/**
 * 퇴원심사 목록.
 * useDischargeReviews. 🟡 조회+코멘트+승인만 가능.
 * 핸드오프 m-screens-addon-details §AD3 (SDischarge) 이식.
 * JM: ~150줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import { useDischargeReviews } from './data-hooks';

type Filter = 'mine' | 'request' | 'all' | 'done';

function statusMeta(status: string): { label: string; tone: '' | 'accent' | 'warning' | 'success' | 'danger' } {
  if (status === 'approved') return { label: '승인 완료', tone: 'success' };
  if (status === 'rejected') return { label: '반려', tone: 'danger' };
  if (status === 'review_requested' || status === 'request') return { label: '보완요청', tone: 'warning' };
  if (status === 'in_progress' || status === '2nd') return { label: '심사중', tone: 'accent' };
  return { label: '대기', tone: '' };
}

export default function 퇴원심사목록({
  user,
  onBack,
  onOpenDetail,
}: {
  user: ErpUser;
  onBack: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const { rows, loading } = useDischargeReviews({ selfId: user.id });
  const [filter, setFilter] = useState<Filter>('mine');

  const counts = useMemo(
    () => ({
      mine: rows.filter((r) => r.reviewer_id === user.id || r.status === 'pending').length,
      request: rows.filter((r) => r.status === 'review_requested' || r.status === 'request').length,
      all: rows.length,
      done: rows.filter((r) => r.status === 'approved').length,
    }),
    [rows, user.id],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'request') return rows.filter((r) => r.status === 'review_requested' || r.status === 'request');
    if (filter === 'done') return rows.filter((r) => r.status === 'approved');
    return rows.filter((r) => r.reviewer_id === user.id || r.status === 'pending');
  }, [rows, filter, user.id]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="퇴원심사"
        sub={`내 차례 ${counts.mine}건`}
        back={onBack}
        actions={
          <button type="button" aria-label="검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />

      <div className="m-chip-bar">
        <button type="button" className={filter === 'mine' ? 'on' : ''} onClick={() => setFilter('mine')}>
          내 차례<span className="cnt">{counts.mine}</span>
        </button>
        <button type="button" className={filter === 'request' ? 'on' : ''} onClick={() => setFilter('request')}>
          보완요청<span className="cnt">{counts.request}</span>
        </button>
        <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          전체<span className="cnt">{counts.all}</span>
        </button>
        <button type="button" className={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}>
          완료<span className="cnt">{counts.done}</span>
        </button>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              불러오는 중…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
              해당 조건의 퇴원심사가 없습니다.
            </div>
          )}
          {filtered.map((it) => {
            const meta = statusMeta(it.status);
            const mine = it.reviewer_id === user.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onOpenDetail(it.id)}
                aria-label={`${it.patient_name} 퇴원심사 상세`}
                className="m-card"
                style={{ padding: '14px 16px', position: 'relative', textAlign: 'left', width: '100%' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MChip tone={meta.tone}>{meta.label}</MChip>
                  {mine && <MChip tone="accent">내 차례</MChip>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    {it.admission_date || '-'}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>
                  {it.patient_name}{' '}
                  {it.gender && (
                    <span style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600 }}>
                      · {it.gender}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                    fontSize: 11,
                    color: 'var(--z-500)',
                    fontWeight: 600,
                  }}
                >
                  <span>{it.department}</span>
                  <div style={{ flex: 1 }} />
                  <span>{it.diagnosis || ''}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * 부서별 재고 — 본인 부서 자재.
 * useDeptInventory. 부서 칩 + 알람 카드 + 리스트.
 * 핸드오프 m-screens-addon-modules §2 (SAddonDeptInv) 이식.
 * JM: ~150줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import { useDeptInventory } from './data-hooks';

export default function 부서재고({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const dept = typeof user.department === 'string' ? user.department : undefined;
  const isHQ = company?.includes('SY') || company?.includes('본사');
  const [filter, setFilter] = useState<'all' | 'short' | 'warn' | 'med' | 'office'>('all');
  const { items, loading } = useDeptInventory({ company, department: dept });

  const filtered = useMemo(() => {
    if (filter === 'short') return items.filter((i) => i.tone === 'danger');
    if (filter === 'warn') return items.filter((i) => i.tone === 'warning');
    if (filter === 'med') return items.filter((i) => i.category.includes('의료') || i.category.includes('소모'));
    if (filter === 'office') return items.filter((i) => i.category.includes('사무'));
    return items;
  }, [items, filter]);

  const shortCount = items.filter((i) => i.tone === 'danger').length;

  return (
    <div className="m-screen">
      <MobileHeader
        title="부서별 재고"
        sub={`${dept ?? '본인 부서'} · ${items.length}종`}
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="검색"><MIcon name="search" size={20} /></button>
            <button type="button" aria-label="QR 스캔"><MIcon name="qr" size={20} /></button>
          </>
        }
      />

      <div className="m-chip-bar">
        <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          전체<span className="cnt">{items.length}</span>
        </button>
        <button type="button" className={filter === 'short' ? 'on' : ''} onClick={() => setFilter('short')}>
          부족<span className="cnt">{shortCount}</span>
        </button>
        <button type="button" className={filter === 'warn' ? 'on' : ''} onClick={() => setFilter('warn')}>
          주의<span className="cnt">{items.filter((i) => i.tone === 'warning').length}</span>
        </button>
        <button type="button" className={filter === 'med' ? 'on' : ''} onClick={() => setFilter('med')}>
          의료소모품
        </button>
        <button type="button" className={filter === 'office' ? 'on' : ''} onClick={() => setFilter('office')}>
          사무
        </button>
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <div
          className="m-card"
          style={{
            padding: '12px 14px',
            background: isHQ ? 'var(--m-accent-soft)' : 'var(--m-warning-soft)',
            borderColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MIcon name="info" size={18} color={isHQ ? 'var(--m-accent)' : 'var(--m-warning)'} />
          <div
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 700,
              color: isHQ ? 'var(--m-accent)' : 'var(--m-warning)',
            }}
          >
            {isHQ
              ? 'MSO 본사 — 자동 발주가 외부 거래처에 PO 발송됩니다'
              : '일반 부서 — 자동 발주는 MSO 본사로 내부 요청됩니다'}
          </div>
        </div>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '12px 16px 80px' }}>
          <div className="m-card flush">
            {loading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
                불러오는 중…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                일치하는 품목이 없습니다.
              </div>
            )}
            {filtered.map((it) => (
              <div key={it.id} className="m-list-row">
                <div className={'ico-tile' + (it.tone ? ' tone-' + it.tone : '')}>
                  <MIcon name="box" size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="lbl">{it.name}</div>
                  <div className="sub">{it.location}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="m-tnum" style={{ fontSize: 15, fontWeight: 800 }}>
                    {it.stock}
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--z-500)',
                        fontWeight: 700,
                        marginLeft: 2,
                      }}
                    >
                      {it.unit}
                    </span>
                  </div>
                  <MChip tone={it.tone}>{it.status}</MChip>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="m-sticky-foot">
        <MBtn block icon="upload">출고 요청</MBtn>
        <MBtn block icon="paperclip" variant="primary">
          {isHQ ? '발주 PO' : '본사 요청'}
        </MBtn>
      </div>
    </div>
  );
}

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
    <div
      className="m-screen"
      style={{
        background:
          'linear-gradient(135deg, rgba(235, 244, 255, 0.7) 0%, rgba(243, 231, 255, 0.7) 50%, rgba(255, 230, 240, 0.7) 100%)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
      }}
    >
      <MobileHeader
        title="부서별 재고"
        sub={`${dept ?? '본인 부서'} · ${items.length}종`}
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="검색">
              <MIcon name="search" size={20} />
            </button>
            <button type="button" aria-label="QR 스캔">
              <MIcon name="qr" size={20} />
            </button>
          </>
        }
      />

      <div
        className="m-chip-bar"
        style={{
          background: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          padding: '8px 16px',
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          type="button"
          className={`macos-squircle-sm ${filter === 'all' ? 'on' : ''}`}
          style={{
            background: filter === 'all' ? 'rgba(0, 122, 255, 0.12)' : 'rgba(255, 255, 255, 0.55)',
            border: filter === 'all' ? '1px solid rgba(0, 122, 255, 0.25)' : '1px solid rgba(0, 0, 0, 0.08)',
            color: filter === 'all' ? '#007aff' : 'var(--z-700)',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onClick={() => setFilter('all')}
        >
          전체
          <span
            className="cnt"
            style={{
              background: filter === 'all' ? 'rgba(0, 122, 255, 0.2)' : 'rgba(0, 0, 0, 0.06)',
              color: filter === 'all' ? '#007aff' : 'var(--z-600)',
              borderRadius: '8px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 700,
              marginLeft: 2,
            }}
          >
            {items.length}
          </span>
        </button>
        <button
          type="button"
          className={`macos-squircle-sm ${filter === 'short' ? 'on' : ''}`}
          style={{
            background: filter === 'short' ? 'rgba(255, 59, 48, 0.1)' : 'rgba(255, 255, 255, 0.55)',
            border: filter === 'short' ? '1px solid rgba(255, 59, 48, 0.25)' : '1px solid rgba(0, 0, 0, 0.08)',
            color: filter === 'short' ? '#ff3b30' : 'var(--z-700)',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onClick={() => setFilter('short')}
        >
          부족
          <span
            className="cnt"
            style={{
              background: filter === 'short' ? 'rgba(255, 59, 48, 0.2)' : 'rgba(0, 0, 0, 0.06)',
              color: filter === 'short' ? '#ff3b30' : 'var(--z-600)',
              borderRadius: '8px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 700,
              marginLeft: 2,
            }}
          >
            {shortCount}
          </span>
        </button>
        <button
          type="button"
          className={`macos-squircle-sm ${filter === 'warn' ? 'on' : ''}`}
          style={{
            background: filter === 'warn' ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 255, 255, 0.55)',
            border: filter === 'warn' ? '1px solid rgba(255, 149, 0, 0.25)' : '1px solid rgba(0, 0, 0, 0.08)',
            color: filter === 'warn' ? '#ff9500' : 'var(--z-700)',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onClick={() => setFilter('warn')}
        >
          주의
          <span
            className="cnt"
            style={{
              background: filter === 'warn' ? 'rgba(255, 149, 0, 0.2)' : 'rgba(0, 0, 0, 0.06)',
              color: filter === 'warn' ? '#ff9500' : 'var(--z-600)',
              borderRadius: '8px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 700,
              marginLeft: 2,
            }}
          >
            {items.filter((i) => i.tone === 'warning').length}
          </span>
        </button>
        <button
          type="button"
          className={`macos-squircle-sm ${filter === 'med' ? 'on' : ''}`}
          style={{
            background: filter === 'med' ? 'rgba(0, 122, 255, 0.12)' : 'rgba(255, 255, 255, 0.55)',
            border: filter === 'med' ? '1px solid rgba(0, 122, 255, 0.25)' : '1px solid rgba(0, 0, 0, 0.08)',
            color: filter === 'med' ? '#007aff' : 'var(--z-700)',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
          onClick={() => setFilter('med')}
        >
          의료소모품
        </button>
        <button
          type="button"
          className={`macos-squircle-sm ${filter === 'office' ? 'on' : ''}`}
          style={{
            background: filter === 'office' ? 'rgba(0, 122, 255, 0.12)' : 'rgba(255, 255, 255, 0.55)',
            border: filter === 'office' ? '1px solid rgba(0, 122, 255, 0.25)' : '1px solid rgba(0, 0, 0, 0.08)',
            color: filter === 'office' ? '#007aff' : 'var(--z-700)',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
          onClick={() => setFilter('office')}
        >
          사무
        </button>
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <div
          className="macos-glass macos-squircle"
          style={{
            padding: '14px 16px',
            background: isHQ ? 'rgba(0, 122, 255, 0.06)' : 'rgba(255, 149, 0, 0.06)',
            border: isHQ ? '1px solid rgba(0, 122, 255, 0.15)' : '1px solid rgba(255, 149, 0, 0.15)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <MIcon name="info" size={18} color={isHQ ? '#007aff' : '#ff9500'} />
          <div
            style={{
              flex: 1,
              fontSize: 12.5,
              fontWeight: 600,
              color: isHQ ? '#005bc4' : '#b25900',
              lineHeight: 1.4,
            }}
          >
            {isHQ
              ? 'MSO 본사 — 자동 발주가 외부 거래처에 PO 발송됩니다'
              : '일반 부서 — 자동 발주는 MSO 본사로 내부 요청됩니다'}
          </div>
        </div>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div style={{ padding: '12px 16px 80px' }}>
          <div
            className="macos-glass macos-squircle"
            style={{
              background: 'rgba(255, 255, 255, 0.55)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)',
              overflow: 'hidden',
            }}
          >
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
            {filtered.map((it, idx) => (
              <div
                key={it.id}
                className="m-list-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderBottom: idx === filtered.length - 1 ? 'none' : '1px solid rgba(0, 0, 0, 0.04)',
                  gap: 12,
                }}
              >
                <div
                  className={'ico-tile' + (it.tone ? ' tone-' + it.tone : '')}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '10px',
                    display: 'grid',
                    placeItems: 'center',
                    background:
                      it.tone === 'danger'
                        ? 'rgba(255, 59, 48, 0.08)'
                        : it.tone === 'warning'
                        ? 'rgba(255, 149, 0, 0.08)'
                        : 'rgba(0, 0, 0, 0.04)',
                    color:
                      it.tone === 'danger'
                        ? '#ff3b30'
                        : it.tone === 'warning'
                        ? '#ff9500'
                        : '#8e8e93',
                  }}
                >
                  <MIcon name="box" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1d1d1f', marginBottom: 2 }}>
                    {it.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#86868b', fontWeight: 500 }}>
                    {it.location}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 4,
                  }}
                >
                  <div className="m-tnum" style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f' }}>
                    {it.stock}
                    <span
                      style={{
                        fontSize: 11,
                        color: '#86868b',
                        fontWeight: 600,
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

      <div
        className="m-sticky-foot macos-glass"
        style={{
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          gap: 10,
          padding: '12px 16px',
        }}
      >
        <MBtn block icon="upload" className="macos-squircle-sm">
          출고 요청
        </MBtn>
        <MBtn block icon="paperclip" variant="primary" className="macos-squircle-sm">
          {isHQ ? '발주 PO' : '본사 요청'}
        </MBtn>
      </div>
    </div>
  );
}

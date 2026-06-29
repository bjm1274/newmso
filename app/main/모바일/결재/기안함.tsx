'use client';

/**
 * SApprovalSent — 내가 기안한 결재 문서 (sent 목록)
 *   - 상태 필터 칩: 전체 / 대기 / 승인 / 반려
 *   - 카드: 상태 칩 + 제목 + 금액 + 사유(반려 시) + 결재 진행 표시
 *
 * JM(파일당 500줄), JM2(filter useMemo), JM3(부모 toast 의존), JM4(any 금지, Filter 유니온),
 * JM6(button 시맨틱, aria-label)
 */

import { useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MChip, { type MChipTone } from '../공통/MChip';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import type { ApprovalRow } from './data-hooks';
import { resolveLineIds } from './data-hooks';

type SentFilter = 'all' | 'pending' | 'approved' | 'rejected';

const FILTER_LABEL: Record<SentFilter, string> = {
  all: '전체',
  pending: '대기',
  approved: '승인',
  rejected: '반려',
};

function statusInfo(row: ApprovalRow, staffId: string | null): { label: string; tone: MChipTone } {
  const status = String(row.status || '');
  if (status === '승인') return { label: '승인', tone: 'success' };
  if (status === '반려') return { label: '반려', tone: 'danger' };
  if (status === '회수') return { label: '회수', tone: '' };
  // 대기 — 진행도 계산
  const line = resolveLineIds(row);
  const cur = String(row.current_approver_id || '');
  const idx = line.findIndex((id) => id === cur);
  const step = idx >= 0 ? idx + 1 : 1;
  const total = line.length || 1;
  const isMine = staffId != null && line.includes(staffId);
  return {
    label: total > 1 ? `${step}/${total} 결재중` : isMine ? '결재중' : '대기',
    tone: 'warning',
  };
}

function formatTs(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function readAmount(row: ApprovalRow): string | null {
  const meta = (row.meta_data ?? {}) as Record<string, unknown>;
  const candidates = [meta.total_amount, meta.amount, meta.requested_amount];
  for (const v of candidates) {
    if (v == null) continue;
    const num = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(num) && num !== 0) return num.toLocaleString('ko-KR');
  }
  return null;
}

function readRejectReason(row: ApprovalRow): string | null {
  const meta = (row.meta_data ?? {}) as Record<string, unknown>;
  const reason = meta.reject_reason ?? meta.rejected_reason ?? null;
  if (typeof reason === 'string' && reason.trim() !== '') return reason;
  return null;
}

export type SApprovalSentProps = {
  staffId: string | null;
  rows: ApprovalRow[];
  loading: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  onWrite: () => void;
};

export default function SApprovalSent({
  staffId,
  rows,
  loading,
  onBack,
  onOpen,
  onWrite,
}: SApprovalSentProps) {
  const [filter, setFilter] = useState<SentFilter>('all');

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const status = String(row.status || '');
      if (filter === 'pending') return status === '대기';
      if (filter === 'approved') return status === '승인';
      if (filter === 'rejected') return status === '반려';
      return true;
    });
  }, [rows, filter]);

  const counts: Record<SentFilter, number> = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => String(r.status) === '대기').length,
      approved: rows.filter((r) => String(r.status) === '승인').length,
      rejected: rows.filter((r) => String(r.status) === '반려').length,
    }),
    [rows]
  );

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MobileHeader
        title="기안함"
        sub={`내가 올린 결재 · 총 ${rows.length}건`}
        back={onBack}
        actions={
          <button
            type="button"
            className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
            aria-label="결재 작성"
            onClick={onWrite}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <MIcon name="edit" size={15} color="var(--z-600)" />
          </button>
        }
      />

      <div
        className="m-chip-bar macos-glass"
        style={{
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          padding: '8px 16px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {(['all', 'pending', 'approved', 'rejected'] as SentFilter[]).map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              className="macos-squircle-sm transition-all active:scale-95 duration-100"
              onClick={() => setFilter(f)}
              aria-label={`${FILTER_LABEL[f]} 필터`}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 900,
                background: on ? '#007AFF' : 'rgba(255, 255, 255, 0.5)',
                color: on ? '#fff' : 'var(--z-700)',
                border: on ? 'none' : '1px solid rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: on ? '0 2px 8px rgba(0, 122, 255, 0.25)' : 'none',
              }}
            >
              {FILTER_LABEL[f]}
              <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 3 }}>{counts[f]}</span>
            </button>
          );
        })}
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div
          style={{
            padding: '14px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
              불러오는 중…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <MCard className="macos-glass macos-squircle" style={{ textAlign: 'center', padding: '32px 16px' }}>
              <span style={{ display: 'inline-flex', marginBottom: 8 }}><MIcon name="edit" size={24} color="var(--z-400)" /></span>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-600)' }}>
                기안 문서가 없습니다
              </div>
            </MCard>
          )}
          {filtered.map((row) => {
            const info = statusInfo(row, staffId);
            const amount = readAmount(row);
            const reject = info.tone === 'danger' ? readRejectReason(row) : null;
            const ts = formatTs(row.created_at);
            const title = String(row.title || row.type || '제목 없음');
            return (
              <button
                key={row.id}
                type="button"
                className="macos-glass macos-squircle transition-all duration-150 active:scale-[0.98]"
                style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  width: '100%',
                  display: 'block',
                  outline: 'none',
                  cursor: 'pointer',
                  border: 'none',
                }}
                onClick={() => onOpen(row.id)}
                aria-label={`${title} 상세 열기`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MChip tone={info.tone}>{info.label}</MChip>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>{ts}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.012em', color: 'var(--z-900)' }}>
                  {title}
                </div>
                {reject && (
                  <div style={{ fontSize: 11, color: 'var(--m-danger)', fontWeight: 800, marginTop: 6 }}>
                    사유: {reject}
                  </div>
                )}
                {amount && (
                  <div
                    className="m-tnum"
                    style={{ fontSize: 13, fontWeight: 900, marginTop: 8, color: 'var(--z-700)' }}
                  >
                    ₩ {amount}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

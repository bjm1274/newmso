'use client';

/**
 * SApprovalRef — 참조 받은 문서함 (읽기 전용)
 *   - 리스트 형태 (m-list-row + ico-tile)
 *   - 미열람 행은 좌측 accent-soft 배경 + 우측에 6px dot
 *   - notifications 테이블의 read 여부로 미열람 판별
 *
 * JM(파일당 500줄), JM2(read 맵을 useMemo), JM3(에러 silent — 미열람 안 보여도 무방),
 * JM4(any 금지), JM6(button 시맨틱)
 */

import { useEffect, useMemo, useState } from 'react';
import { db, d1 } from '@/lib/db-client';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import type { ApprovalRow } from './data-hooks';

import { formatTs } from './format-utils';

function iconTone(status?: string | null): 'success' | 'warning' | 'danger' | 'accent' {
  if (status === '승인') return 'success';
  if (status === '반려') return 'danger';
  if (status === '회수') return 'warning';
  return 'accent';
}

export type SApprovalRefProps = {
  staffId: string | null;
  rows: ApprovalRow[];
  loading: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
};

export default function SApprovalRef({
  staffId,
  rows,
  loading,
  onBack,
  onOpen }: SApprovalRefProps) {
  const [readMap, setReadMap] = useState<Record<string, boolean>>({});

  // 알림 테이블에서 본인의 참조 알림 읽음 여부 조회
  useEffect(() => {
    if (!staffId || rows.length === 0) return;
    let cancelled = false;
    const ids = rows.map((r) => String(r.id));
    (async () => {
      try {
        const idSet = new Set(ids);
        const { data, error } = await d1.from('notifications')
          .select('metadata, read_at')
          .eq('user_id', staffId)
          .eq('type', 'approval');
        if (error || !data || cancelled) return;
        const map: Record<string, boolean> = {};
        for (const n of data as Array<{ metadata?: unknown; read_at?: string | null }>) {
          let aid = '';
          const rawMeta = n.metadata;
          if (typeof rawMeta === 'string' && rawMeta.length > 0) {
            try {
              const parsed = JSON.parse(rawMeta) as unknown;
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                aid = String((parsed as Record<string, unknown>).approval_id || '');
              }
            } catch {
              aid = '';
            }
          } else if (rawMeta && typeof rawMeta === 'object') {
            aid = String((rawMeta as Record<string, unknown>).approval_id || '');
          }
          if (!aid || !idSet.has(aid)) continue;
          map[aid] = Boolean(n.read_at);
        }
        setReadMap(map);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId, rows]);

  const unreadCount = useMemo(() => {
    return rows.filter((r) => !readMap[String(r.id)]).length;
  }, [rows, readMap]);

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MobileHeader
        title="참조 문서함"
        sub={`내가 참조 · ${unreadCount}건 미열람`}
        back={onBack}
        actions={
          <button
            type="button"
            className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
            aria-label="필터"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              border: 'none',
              cursor: 'pointer' }}
          >
            <MIcon name="filter" size={15} color="var(--z-600)" />
          </button>
        }
      />

      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div style={{ padding: '14px 16px 16px' }}>
          {loading && rows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
              불러오는 중…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <MCard className="macos-glass macos-squircle" style={{ textAlign: 'center', padding: '32px 16px' }}>
              <span style={{ display: 'inline-flex', marginBottom: 8 }}><MIcon name="fileText" size={24} color="var(--z-400)" /></span>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-600)' }}>
                참조 문서가 없습니다
              </div>
            </MCard>
          )}
          {rows.length > 0 && (
            <MCard
              className="macos-glass macos-squircle"
              style={{
                overflow: 'hidden',
                padding: 0 }}
            >
              {rows.map((row) => {
                const read = Boolean(readMap[String(row.id)]);
                const tone = iconTone(row.status);
                const ts = formatTs(row.created_at);
                const title = String(row.title || row.type || '제목 없음');
                const sender = String(row.sender_name || '').trim();
                const dept = String(row.sender_department || row.sender_company || '').trim();
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="m-list-row transition-all duration-150 active:bg-black/[0.04]"
                    style={{
                      background: read ? 'transparent' : 'rgba(0, 122, 255, 0.05)',
                      textAlign: 'left',
                      width: '100%',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
                      cursor: 'pointer',
                      outline: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      borderTop: 'none',
                      display: 'flex',
                      alignItems: 'center' }}
                    onClick={() => onOpen(row.id)}
                    aria-label={`${title} 참조 문서 열기${read ? '' : ', 미열람'}`}
                  >
                    <div className={`ico-tile tone-${tone}`} aria-hidden="true" style={{ borderRadius: 8 }}>
                      <MIcon name="fileText" size={18} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1, marginLeft: 12 }}>
                      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 13,
                            fontWeight: 900,
                            color: 'var(--z-900)' }}
                        >
                          {title}
                        </span>
                        {!read && (
                          <span
                            aria-hidden="true"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 999,
                              background: '#007AFF',
                              flexShrink: 0 }}
                          />
                        )}
                      </div>
                      <div className="sub" style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800, marginTop: 2 }}>
                        {sender}
                        {dept ? ` · ${dept}` : ''}
                        {ts ? ` · ${ts}` : ''}
                      </div>
                    </div>
                    <MIcon name="chevR" size={15} color="var(--z-400)" />
                  </button>
                );
              })}
            </MCard>
          )}
        </div>
      </div>
    </div>
  );
}

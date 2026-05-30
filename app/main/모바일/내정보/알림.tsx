'use client';

/**
 * SAlert — 모바일 알림함
 *   - 칩바: 전체 / 결재 / 채팅 / 인사 / 재고 / 기타
 *   - 카드 리스트 (아이콘+제목+서브+본문+chevR)
 *   - 우상단: 필터/모두읽음
 * 데이터: notifications 테이블 (PC 알림인박스와 동일 컬럼)
 * JM(파일당 500줄), JM2(필요한 컬럼만 select·limit), JM3(에러 toast), JM6(button 시맨틱)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import PushSettingCard from './푸시설정카드';
import { usePullToRefresh } from '../공통/usePullToRefresh';
import PullRefreshIndicator from '../공통/PullRefreshIndicator';

type AlertCategory = 'all' | 'approval' | 'chat' | 'hr' | 'inventory' | 'other';

type NotificationRow = {
  id: string;
  user_id: string;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  message?: string | null;
  read_at?: string | null;
  created_at?: string | null;
};

const CATEGORY_MATCH: Record<Exclude<AlertCategory, 'all'>, string[]> = {
  approval: ['approval', '결재'],
  chat: ['message', 'mention', 'chat'],
  hr: ['인사', 'payroll', 'education', 'attendance', '근태'],
  inventory: ['inventory', '재고'],
  other: ['board', 'notification', '공지'],
};

const CATEGORY_LABEL: Record<AlertCategory, string> = {
  all: '전체',
  approval: '결재',
  chat: '채팅',
  hr: '인사',
  inventory: '재고',
  other: '기타',
};

function categoryOf(type?: string | null): Exclude<AlertCategory, 'all'> {
  const t = String(type ?? '').toLowerCase();
  for (const cat of Object.keys(CATEGORY_MATCH) as Array<Exclude<AlertCategory, 'all'>>) {
    if (CATEGORY_MATCH[cat].some(k => t.includes(k.toLowerCase()))) return cat;
  }
  return 'other';
}

function iconOf(cat: Exclude<AlertCategory, 'all'>): { ic: string; tone: '' | 'accent' | 'success' | 'warning' | 'danger' } {
  switch (cat) {
    case 'approval':  return { ic: 'approval', tone: 'accent' };
    case 'chat':      return { ic: 'chat',     tone: 'accent' };
    case 'hr':        return { ic: 'user',     tone: 'success' };
    case 'inventory': return { ic: 'box',      tone: 'warning' };
    default:          return { ic: 'board',    tone: '' };
  }
}

function timeAgoKR(iso?: string | null) {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const delta = Math.floor((Date.now() - ts) / 1000);
  if (delta < 60) return `방금 전`;
  if (delta < 3600) return `${Math.floor(delta / 60)}분 전`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}시간 전`;
  if (delta < 7 * 86400) return `${Math.floor(delta / 86400)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export type SAlertProps = {
  staffId: string | null;
  onBack: () => void;
};

export default function SAlert({ staffId, onBack }: SAlertProps) {
  const [cat, setCat] = useState<AlertCategory>('all');
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, body, message, read_at, created_at')
        .eq('user_id', staffId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setItems((data as NotificationRow[]) ?? []);
    } catch (err) {
      toast(`알림 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  const { containerRef, refreshing, pullProgress } = usePullToRefresh({
    onRefresh: fetchItems,
    enabled: !!staffId,
  });

  const counts = useMemo(() => {
    const result: Record<AlertCategory, number> = {
      all: items.length, approval: 0, chat: 0, hr: 0, inventory: 0, other: 0,
    };
    for (const n of items) result[categoryOf(n.type)] += 1;
    return result;
  }, [items]);

  const filtered = useMemo(() => {
    if (cat === 'all') return items;
    return items.filter(n => categoryOf(n.type) === cat);
  }, [items, cat]);

  const unreadCount = items.filter(n => !n.read_at).length;

  const markAllRead = async () => {
    if (!staffId || unreadCount === 0) return;
    try {
      const readAt = new Date().toISOString();
      await supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('user_id', staffId)
        .is('read_at', null);
      setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: readAt })));
      toast('모두 읽음 처리했습니다.', 'success');
    } catch (err) {
      toast(`처리 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    }
  };

  return (
    <div className="m-screen">
      <PullRefreshIndicator refreshing={refreshing} pullProgress={pullProgress} />
      <MobileHeader
        title="알림"
        sub={`안 읽음 ${unreadCount}건`}
        back={onBack}
        actions={
          <button type="button" onClick={() => void markAllRead()} aria-label="모두 읽음">
            <MIcon name="checkCircle" size={20} />
          </button>
        }
      />
      <PushSettingCard staffId={staffId} />

      <div className="m-chip-bar">
        {(['all', 'approval', 'chat', 'hr', 'inventory', 'other'] as AlertCategory[]).map(c => (
          <button
            key={c}
            type="button"
            className={cat === c ? 'on' : ''}
            onClick={() => setCat(c)}
          >
            {CATEGORY_LABEL[c]}<span className="cnt">{counts[c]}</span>
          </button>
        ))}
      </div>

      <div className="m-scroll" ref={containerRef} style={{ overscrollBehaviorY: 'contain' }}>
        <div style={{ padding: '12px 16px' }}>
          {loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)' }}>
              불러오는 중…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="m-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
              <MIcon name="bell" size={24} color="var(--z-400)" />
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--z-600)' }}>
                새 알림이 없습니다
              </div>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="m-card flush">
              {filtered.map((n) => {
                const ncat = categoryOf(n.type);
                const { ic, tone } = iconOf(ncat);
                const isNew = !n.read_at;
                const title = n.title || CATEGORY_LABEL[ncat];
                const body = n.body || n.message || '';
                return (
                  <div key={n.id} className="m-list-row" style={{ position: 'relative' }}>
                    <div className={'ico-tile ' + (tone ? 'tone-' + tone : '')} aria-hidden="true">
                      <MIcon name={ic} size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>{title}</span>
                        {isNew && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--m-accent)' }} aria-label="안 읽음" />}
                      </div>
                      <div className="sub" style={{ marginTop: 2 }}>{timeAgoKR(n.created_at)}</div>
                      {body && (
                        <div style={{ fontSize: 12, color: 'var(--z-700)', marginTop: 4, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {body}
                        </div>
                      )}
                    </div>
                    <MIcon name="chevR" size={18} color="var(--z-400)" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

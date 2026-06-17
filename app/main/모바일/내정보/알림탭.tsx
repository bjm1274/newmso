'use client';

/**
 * 알림탭 — 독립 알림 탭 화면 (바텀탭 연동용).
 *   - 상단 큰 제목 '알림' + '모두 읽음' 버튼
 *   - 알림 리스트 (msm-list): unread 파란 틴트 배경, read 기본 카드 배경
 *   - 각 행: 톤 아이콘 타일 + 제목/본문 + 시간
 * 실제 notifications 테이블 연동(read_at 기반 읽음). D1 정본 스키마는 read_at 컬럼만 존재.
 * JM: 단일 책임 (알림 리스트 표시)
 * JM4: any 금지
 * JM6: button 시맨틱, aria-label
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import type { ErpUser } from '@/types';
import { supabase } from '@/lib/supabase';
import { timeAgo, toNotificationText } from '@/lib/notification-utils';
import {
  resolveNotificationTarget,
  toNotificationMetadataRecord,
} from '@/lib/notification-metadata';
import { useNavigation } from '@/app/main/contexts/NavigationContext';
import MIcon from '../공통/MIcon';

// 알림시스템.tsx 의 NOTIFICATION_LIST_UPDATED_EVENT(= 'erp-notification-list-updated')와
// 반드시 동일해야 한다. 과거 값이 변수명 문자열로 잘못 설정돼 모바일 알림탭이 실시간
// 갱신 이벤트를 전혀 수신하지 못했음. 대형 'use client' 모듈(알림시스템.tsx)을 모바일
// 번들에 끌어오지 않기 위해 import 대신 동일 문자열로 맞춘다.
const NOTIFICATION_LIST_UPDATED_EVENT = 'erp-notification-list-updated';

type Tone = 'accent' | 'success' | 'warn' | 'danger' | 'muted';

/** 알림 항목 타입 */
type NotifItem = {
  id: string;
  icon: string;
  tone: Tone;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  /** notifications.type 원본 — 탭 시 목적지 결정에 사용 */
  type: string;
  /** notifications.metadata(jsonb) — room_id/approval_id 등 점프 컨텍스트 */
  metadata: Record<string, unknown>;
};

const TONE_MAP: Record<Tone, { bg: string; fg: string }> = {
  accent:  { bg: 'var(--m-accent-soft)', fg: 'var(--m-accent)' },
  success: { bg: 'var(--m-success-soft)', fg: '#047857' },
  warn:    { bg: 'var(--m-warning-soft)', fg: '#B45309' },
  danger:  { bg: 'var(--m-danger-soft)', fg: 'var(--m-danger)' },
  muted:   { bg: 'var(--z-100)', fg: 'var(--z-600)' },
};

const NOTIFICATION_SELECT = 'id, user_id, type, title, body, metadata, read_at, created_at';

/** notifications.type → 모바일 아이콘/톤 매핑 */
function mapTypeToVisual(type: string): { icon: string; tone: Tone } {
  switch (type) {
    case 'approval':
    case '결재':
      return { icon: 'checkCircle', tone: 'accent' };
    case 'inventory':
    case '재고':
      return { icon: 'box', tone: 'danger' };
    case 'message':
    case 'mention':
    case 'chat':
    case '채팅':
      return { icon: 'chat', tone: 'success' };
    case 'attendance':
    case '근태':
    case 'leave':
    case '연차':
      return { icon: 'calendar', tone: 'accent' };
    case 'payroll':
    case '급여':
      return { icon: 'won', tone: 'warn' };
    case 'board':
    case '게시판':
      return { icon: 'fileText', tone: 'warn' };
    default:
      return { icon: 'bell', tone: 'muted' };
  }
}

type NotificationDbRow = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  body?: unknown;
  metadata?: unknown;
  read_at?: unknown;
  created_at?: unknown;
};

function normalizeRow(row: NotificationDbRow): NotifItem {
  const type = toNotificationText(row.type, 'notification', true);
  const visual = mapTypeToVisual(type);
  const created = toNotificationText(row.created_at, '');
  return {
    id: toNotificationText(row.id, '', true),
    icon: visual.icon,
    tone: visual.tone,
    title: toNotificationText(row.title, '알림'),
    body: toNotificationText(row.body, ''),
    time: created ? timeAgo(created) : '',
    unread: row.read_at == null,
    type,
    metadata: toNotificationMetadataRecord(row.metadata),
  };
}

export type 알림탭Props = {
  user: ErpUser;
};

function 알림탭Base({ user }: 알림탭Props) {
  const staffId = typeof user?.id === 'string' ? user.id : null;
  const { setMainMenu, setSubView } = useNavigation();
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const fetchNotifs = useCallback(async () => {
    if (!staffId) { setNotifs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('user_id', staffId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (cancelledRef.current) return;
      const rows = Array.isArray(data) ? (data as NotificationDbRow[]) : [];
      setNotifs(rows.map(normalizeRow).filter((n) => n.id));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [staffId]);

  // 초기 fetch
  useEffect(() => {
    cancelledRef.current = false;
    void fetchNotifs();
    return () => { cancelledRef.current = true; };
  }, [fetchNotifs]);

  // 수정 F: NOTIFICATION_LIST_UPDATED_EVENT 리스너 — 실시간 갱신
  useEffect(() => {
    if (!staffId || typeof window === 'undefined') return;
    const handler = () => { void fetchNotifs(); };
    window.addEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handler);
  }, [staffId, fetchNotifs]);

  const handleMarkAllRead = useCallback(async () => {
    if (!staffId) return;
    const nowIso = new Date().toISOString();
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
    try {
      await supabase
        .from('notifications')
        .update({ read_at: nowIso })
        .eq('user_id', staffId)
        .is('read_at', null);
    } catch { /* 낙관적 업데이트 유지 */ }
  }, [staffId]);

  // 탭 시: (1) 읽음 처리 → (2) 알림 종류에 맞는 모바일 탭/서브뷰로 이동.
  // PC NotificationInbox와 동일하게 resolveNotificationTarget(type, metadata)로 목적지를 산출하고,
  // PC의 router.push(href) 대신 모바일 NavigationContext(setMainMenu/setSubView)로 탭을 전환한다.
  // (MobileShell이 mainMenu 변화를 감지해 route.tab을 동기화한다.)
  const handleTapItem = useCallback(async (item: NotifItem) => {
    const { id } = item;
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    try {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
    } catch { /* 낙관적 업데이트 유지 */ }

    // 목적지 결정 — PC와 동일한 매핑 엔진 재사용.
    const target = resolveNotificationTarget(item.type, item.metadata);
    switch (target.kind) {
      case 'chat':
        setMainMenu('채팅');
        break;
      case 'approval':
        setMainMenu('전자결재');
        break;
      case 'inventory':
        setMainMenu('재고관리');
        break;
      case 'board':
        setMainMenu('게시판');
        if (target.boardType) setSubView(target.boardType);
        break;
      case 'menu':
        // target.menu는 이미 한글 메뉴 라벨(채팅/전자결재/게시판/재고관리/내정보/알림/관리자).
        setMainMenu(target.menu);
        if (target.subView) setSubView(target.subView);
        break;
      case 'my_page':
        setMainMenu('내정보');
        break;
      case 'notifications':
      default:
        // 알림 화면 자체이므로 이동하지 않는다(읽음 처리만).
        break;
    }
  }, [setMainMenu, setSubView]);

  const unreadCount = notifs.filter((n) => n.unread).length;

  return (
    <div className="m-screen">
      {/* 타이틀 바 — 헤더 없음, 직접 구성 */}
      <div
        style={{
          padding: '18px 20px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>
          알림
          {unreadCount > 0 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--m-accent)',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleMarkAllRead}
          aria-label="모두 읽음 처리"
          disabled={unreadCount === 0}
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: unreadCount > 0 ? 'var(--m-accent)' : 'var(--z-400)',
            padding: '6px 12px',
            borderRadius: 8,
            background: unreadCount > 0 ? 'var(--m-accent-tint)' : 'transparent',
          }}
        >
          모두 읽음
        </button>
      </div>

      {/* 알림 리스트 */}
      <div className="m-scroll">
        {loading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--z-400)', fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : notifs.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--z-400)', fontSize: 13, fontWeight: 600 }}>
            받은 알림이 없습니다.
          </div>
        ) : (
        <div className="msm-list" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifs.map((n) => {
            const tone = TONE_MAP[n.tone];
            return (
              <button
                key={n.id}
                type="button"
                className="msm-row"
                onClick={() => { void handleTapItem(n); }}
                aria-label={`${n.title} — ${n.body}`}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '42px 1fr auto',
                  alignItems: 'start',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: `1px solid ${n.unread ? '#CADCFE' : 'var(--m-border)'}`,
                  background: n.unread ? 'var(--m-accent-tint)' : 'var(--m-card)',
                  cursor: 'pointer',
                }}
              >
                {/* lead — 톤 아이콘 */}
                <div
                  className="lead"
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: tone.bg,
                    color: tone.fg,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MIcon name={n.icon} size={20} />
                </div>

                {/* main — 제목 + 본문 */}
                <div className="main" style={{ minWidth: 0, paddingTop: 1 }}>
                  <div
                    className="nm"
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: '-0.012em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {n.unread && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'var(--m-accent)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {n.title}
                  </div>
                  <div
                    className="sub"
                    style={{
                      fontSize: 12,
                      color: 'var(--z-500)',
                      marginTop: 3,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.body}
                  </div>
                </div>

                {/* meta — 시간 */}
                <div
                  className="meta"
                  style={{
                    paddingTop: 2,
                  }}
                >
                  <span
                    className="time"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--z-400)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.time}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

const 알림탭 = memo(알림탭Base);
export default 알림탭;

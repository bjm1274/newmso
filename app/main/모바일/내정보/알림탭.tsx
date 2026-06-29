'use client';

/**
 * 알림탭 — 독립 알림 탭 화면 (바텀탭 연동용).
 *   - 상단 큰 제목 '알림' + '모두 읽음' 버튼
 *   - 알림 리스트 (msm-list): unread 파란 틴트 배경, read 기본 카드 배경
 *   - 각 행: macOS Launchpad 디자인 팩과 일치된 스쿼클 젤리 아이콘 팩 연동
 * 실제 notifications 테이블 연동(read_at 기반 읽음).
 * JM: 단일 책임 (알림 리스트 표시)
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import type { ErpUser } from '@/types';
import { timeAgo, toNotificationText } from '@/lib/notification-utils';
import {
  resolveNotificationTarget,
  toNotificationMetadataRecord,
} from '@/lib/notification-metadata';
import { useNavigation } from '@/app/main/contexts/NavigationContext';
import {
  emitNotificationReadEvent,
  fetchNotificationList,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NOTIFICATION_LIST_UPDATED_EVENT,
  type NotificationRecord,
} from '@/app/main/기능부품/알림시스템/notification-api';
import MIcon from '../공통/MIcon';

/** 알림 항목 타입 */
type NotifItem = {
  id: string;
  icon: string;
  themeKey: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  /** notifications.type 원본 — 탭 시 목적지 결정에 사용 */
  type: string;
  /** notifications.metadata(jsonb) — room_id/approval_id 등 점프 컨텍스트 */
  metadata: Record<string, unknown>;
};

/** macOS Launchpad 감성의 그라데이션 컬러 및 아이콘 매핑 (홈.tsx와 1대1 싱크) */
const NOTIF_LAUNCHPAD_THEMES: Record<string, { bg: string; icon: string }> = {
  approval:    { bg: 'linear-gradient(135deg, #007AFF, #0A55E1)', icon: 'checkCircle' },
  inventory:   { bg: 'linear-gradient(135deg, #FF3B30, #C2160C)', icon: 'box' },
  chat:        { bg: 'linear-gradient(135deg, #34C759, #119F35)', icon: 'chat' },
  attendance:  { bg: 'linear-gradient(135deg, #FF9500, #FF5E3A)', icon: 'clock' },
  payroll:     { bg: 'linear-gradient(135deg, #BF5AF2, #8F22D0)', icon: 'won' },
  board:       { bg: 'linear-gradient(135deg, #30B0C7, #007A8D)', icon: 'fileText' },
  default:     { bg: 'linear-gradient(135deg, #8E8E93, #636366)', icon: 'bell' },
};

/** notifications.type → macOS 테마 키 맵핑 */
function mapTypeToThemeKey(type: string): string {
  switch (type) {
    case 'approval':
    case '결재':
      return 'approval';
    case 'inventory':
    case '재고':
      return 'inventory';
    case 'message':
    case 'mention':
    case 'chat':
    case '채팅':
      return 'chat';
    case 'attendance':
    case '근태':
    case 'leave':
    case '연차':
      return 'attendance';
    case 'payroll':
    case '급여':
      return 'payroll';
    case 'board':
    case '게시판':
      return 'board';
    default:
      return 'default';
  }
}

function normalizeRow(row: NotificationRecord): NotifItem {
  const type = toNotificationText(row.type, 'notification', true);
  const themeKey = mapTypeToThemeKey(type);
  const visual = NOTIF_LAUNCHPAD_THEMES[themeKey] || NOTIF_LAUNCHPAD_THEMES.default;
  const created = toNotificationText(row.created_at, '');
  return {
    id: toNotificationText(row.id, '', true),
    icon: visual.icon,
    themeKey,
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

function MobileNotificationTabBase({ user }: 알림탭Props) {
  const staffId = typeof user?.id === 'string' ? user.id : null;
  const { setMainMenu, setSubView } = useNavigation();
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const fetchNotifs = useCallback(async () => {
    if (!staffId) { setNotifs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchNotificationList(200);
      if (cancelledRef.current) return;
      setNotifs(data.map(normalizeRow).filter((n) => n.id));
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

  // 실시간 갱신 리스너
  useEffect(() => {
    if (!staffId || typeof window === 'undefined') return;
    const handler = () => { void fetchNotifs(); };
    window.addEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATION_LIST_UPDATED_EVENT, handler);
  }, [staffId, fetchNotifs]);

  const handleMarkAllRead = useCallback(async () => {
    if (!staffId) return;
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
    await markAllNotificationsAsRead().catch(() => null);
    emitNotificationReadEvent();
  }, [staffId]);

  // 탭 시 라우팅 전환
  const handleTapItem = useCallback(async (item: NotifItem) => {
    const { id } = item;
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    await markNotificationAsRead(id).catch(() => null);
    emitNotificationReadEvent();

    const target = resolveNotificationTarget(item.type, item.metadata);
    switch (target.kind) {
      case 'chat':
        setMainMenu('채팅');
        break;
      case 'approval':
        setMainMenu('전자결재');
        if (target.approvalView) setSubView(target.approvalView);
        break;
      case 'inventory':
        setMainMenu('재고관리');
        break;
      case 'board':
        setMainMenu('게시판');
        if (target.boardType) setSubView(target.boardType);
        break;
      case 'menu':
        setMainMenu(target.menu);
        if (target.subView) setSubView(target.subView);
        break;
      case 'my_page':
        setMainMenu('내정보');
        break;
      case 'notifications':
      default:
        break;
    }
  }, [setMainMenu, setSubView]);

  const unreadCount = notifs.filter((n) => n.unread).length;

  return (
    <div
      className="m-screen"
      style={{
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* macOS 윈도우 스타일 타이틀 바 */}
      <div
        className="macos-glass"
        style={{
          padding: '18px 20px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 8 }}>
          알림
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: '#fff',
                background: 'var(--m-accent)',
                padding: '1px 6px',
                borderRadius: '6px',
                lineHeight: 1.25,
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
            fontSize: 12,
            fontWeight: 800,
            color: unreadCount > 0 ? 'var(--m-accent)' : 'var(--z-400)',
            padding: '5px 12px',
            borderRadius: '999px',
            background: unreadCount > 0 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0, 0, 0, 0.03)',
            border: unreadCount > 0 ? '1px solid rgba(59, 130, 246, 0.18)' : '1px solid rgba(0, 0, 0, 0.05)',
            cursor: unreadCount > 0 ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
          }}
        >
          모두 읽음
        </button>
      </div>

      {/* 알림 리스트 */}
      <div className="m-scroll" style={{ background: 'transparent' }}>
        {loading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--z-400)', fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : notifs.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--z-400)', fontSize: 13, fontWeight: 600 }}>
            받은 알림이 없습니다.
          </div>
        ) : (
        <div className="msm-list" style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifs.map((n) => {
            const theme = NOTIF_LAUNCHPAD_THEMES[n.themeKey] || NOTIF_LAUNCHPAD_THEMES.default;
            return (
              <button
                key={n.id}
                type="button"
                className="msm-row macos-glass macos-squircle-sm"
                onClick={() => { void handleTapItem(n); }}
                aria-label={`${n.title} — ${n.body}`}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '42px 1fr auto',
                  alignItems: 'start',
                  gap: 14,
                  padding: '14px 16px',
                  border: n.unread
                    ? '1px solid rgba(59, 130, 246, 0.45)'
                    : '1px solid rgba(0, 0, 0, 0.07)',
                  background: n.unread
                    ? 'rgba(59, 130, 246, 0.06)'
                    : 'rgba(255, 255, 255, 0.65)',
                  boxShadow: n.unread
                    ? '0 4px 16px rgba(59, 130, 246, 0.05)'
                    : '0 4px 12px rgba(0, 0, 0, 0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.23s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                }}
              >
                {/* lead — macOS 젤리 아이콘 팩과 1대1 매치된 톤 아이콘 */}
                <div
                  className="lead macos-squircle-sm"
                  style={{
                    width: 42,
                    height: 42,
                    background: theme.bg,
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.25), 0 3px 8px rgba(0,0,0,0.12)',
                  }}
                >
                  <MIcon name={n.icon} size={20} />
                </div>

                {/* main — 제목 + 본문 */}
                <div className="main" style={{ minWidth: 0, paddingTop: 1 }}>
                  <div
                    className="nm"
                    style={{
                      fontSize: 13.5,
                      fontWeight: 800,
                      color: 'var(--foreground)',
                      letterSpacing: '-0.015em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {n.unread && (
                      <span
                        style={{
                          width: 6.5,
                          height: 6.5,
                          borderRadius: '50%',
                          background: 'var(--m-accent)',
                          boxShadow: '0 0 6px var(--m-accent)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {n.title}
                  </div>
                  <div
                    className="sub"
                    style={{
                      fontSize: 11.5,
                      color: 'var(--z-500)',
                      marginTop: 4,
                      fontWeight: 600,
                      lineHeight: 1.45,
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
                    paddingTop: 3,
                  }}
                >
                  <span
                    className="time"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
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

const 알림탭 = memo(MobileNotificationTabBase);
export default 알림탭;

'use client';

/**
 * 알림탭 — 독립 알림 탭 화면 (바텀탭 연동용).
 *   - 상단 큰 제목 '알림' + '모두 읽음' 버튼
 *   - 알림 리스트 (msm-list): unread 파란 틴트 배경, read 기본 카드 배경
 *   - 각 행: 톤 아이콘 타일 + 제목/본문 + 시간
 * JM: 단일 책임 (알림 리스트 표시)
 * JM4: any 금지
 * JM6: button 시맨틱, aria-label
 */

import { memo, useState, useCallback } from 'react';
import type { ErpUser } from '@/types';
import MIcon from '../공통/MIcon';

/** 알림 항목 타입 */
type NotifItem = {
  id: string;
  icon: string;
  tone: 'accent' | 'success' | 'warn' | 'danger' | 'muted';
  title: string;
  body: string;
  time: string;
  unread: boolean;
};

const TONE_MAP: Record<NotifItem['tone'], { bg: string; fg: string }> = {
  accent:  { bg: 'var(--m-accent-soft)', fg: 'var(--m-accent)' },
  success: { bg: 'var(--m-success-soft)', fg: '#047857' },
  warn:    { bg: 'var(--m-warning-soft)', fg: '#B45309' },
  danger:  { bg: 'var(--m-danger-soft)', fg: 'var(--m-danger)' },
  muted:   { bg: 'var(--z-100)', fg: 'var(--z-600)' },
};

const INITIAL_NOTIFS: NotifItem[] = [
  {
    id: 'n1',
    icon: 'checkCircle',
    tone: 'accent',
    title: '결재 요청 도착',
    body: '김민수 대리의 연차 신청이 도착했습니다.',
    time: '10분 전',
    unread: true,
  },
  {
    id: 'n2',
    icon: 'box',
    tone: 'danger',
    title: '재고 0 경고',
    body: 'A4용지 재고가 0입니다. 즉시 발주하세요.',
    time: '32분 전',
    unread: true,
  },
  {
    id: 'n3',
    icon: 'chat',
    tone: 'success',
    title: 'SY INC. 경영지원',
    body: '이번 달 정산 관련 공유드립니다.',
    time: '1시간 전',
    unread: true,
  },
  {
    id: 'n4',
    icon: 'bell',
    tone: 'warn',
    title: '공지사항',
    body: '5월 워크숍 일정이 확정되었습니다.',
    time: '어제',
    unread: false,
  },
  {
    id: 'n5',
    icon: 'calendar',
    tone: 'accent',
    title: '연차 승인 완료',
    body: '6/2(월) 연차가 승인되었습니다.',
    time: '2일 전',
    unread: false,
  },
  {
    id: 'n6',
    icon: 'won',
    tone: 'warn',
    title: '급여명세서 발행',
    body: '2026년 4월 급여명세서가 발행되었습니다.',
    time: '3일 전',
    unread: false,
  },
];

export type 알림탭Props = {
  user: ErpUser;
};

function 알림탭Base({ user: _user }: 알림탭Props) {
  const [notifs, setNotifs] = useState<NotifItem[]>(INITIAL_NOTIFS);

  const handleMarkAllRead = useCallback(() => {
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
  }, []);

  const handleTapItem = useCallback((id: string) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    );
  }, []);

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
        <div className="msm-list" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifs.map((n) => {
            const tone = TONE_MAP[n.tone];
            return (
              <button
                key={n.id}
                type="button"
                className="msm-row"
                onClick={() => handleTapItem(n.id)}
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
      </div>
    </div>
  );
}

const 알림탭 = memo(알림탭Base);
export default 알림탭;

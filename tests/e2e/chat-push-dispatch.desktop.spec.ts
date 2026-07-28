import { expect, test } from '@playwright/test';
import {
  isChatPushJobExpired,
  shouldSuppressBoardAutoAnnouncementPush,
  toIsoTimestamp,
} from '../../lib/chat-push-dispatch';
import { NOTICE_ROOM_ID } from '../../lib/constants';

function buildBoardLinkedMessageContent(postId = 'notice-post-1') {
  return [
    'New board notice',
    `[[BOARD_META]]${JSON.stringify({
      type: 'board_post_link',
      board_type: '공지사항',
      post_id: postId,
    })}[[/BOARD_META]]`,
  ].join('\n');
}

test('board auto announcements in the notice room are suppressed from chat push', () => {
  expect(
    shouldSuppressBoardAutoAnnouncementPush(
      {
        room_id: NOTICE_ROOM_ID,
        content: buildBoardLinkedMessageContent(),
      },
      {
        id: NOTICE_ROOM_ID,
        type: 'notice',
      },
    ),
  ).toBe(true);
});

test('manual notice room messages still use chat push', () => {
  expect(
    shouldSuppressBoardAutoAnnouncementPush(
      {
        room_id: NOTICE_ROOM_ID,
        content: 'Manual notice room message',
      },
      {
        id: NOTICE_ROOM_ID,
        type: 'notice',
      },
    ),
  ).toBe(false);
});

// notifications.created_at 은 TEXT 라 비교가 사전순이다. 채팅 알림만 SQLite
// CURRENT_TIMESTAMP 형식('2026-07-28 11:50:08')으로 들어가고 나머지는 ISO 라서,
// ' '(0x20) < 'T'(0x54) 때문에 같은 날짜면 채팅 알림이 항상 더 작았다.
// /api/realtime/tail 이 max(created_at) 변화로 갱신을 감지하므로 새 채팅 알림이
// max 를 못 올렸고, 새 메시지 팝업·배지가 아예 뜨지 않았다.
test('chat notification timestamps sort after other notifications from the same day', () => {
  const chatRaw = '2026-07-28 11:50:08';       // 실제로 더 최신
  const approvalIso = '2026-07-28T11:30:17.636Z'; // 20분 이전

  // 정규화 전에는 순서가 뒤집혀 있었다 — 이게 버그의 본체다.
  expect(chatRaw < approvalIso).toBe(true);

  const chatIso = toIsoTimestamp(chatRaw);
  expect(chatIso).toBe('2026-07-28T11:50:08.000Z');
  expect(String(chatIso) > approvalIso).toBe(true);
});

test('toIsoTimestamp leaves ISO values alone and rejects unparseable ones', () => {
  expect(toIsoTimestamp('2026-07-28T11:30:17.636Z')).toBe('2026-07-28T11:30:17.636Z');
  expect(toIsoTimestamp('2026-07-28 11:50:08.123')).toBe('2026-07-28T11:50:08.123Z');
  // 형식을 모르면 null — 호출부가 현재 시각으로 대체한다 (잘못된 값을 흘리지 않는다).
  expect(toIsoTimestamp('28/07/2026')).toBeNull();
  expect(toIsoTimestamp(null)).toBeNull();
  expect(toIsoTimestamp('')).toBeNull();
});

// 크론이 오래 멈췄다 되살아나면 밀린 job 이 그대로 발송돼 며칠 전 채팅 푸시가 쏟아진다.
// (실제로 CRON_SECRET 이 빈 값이라 12일간 정지, 미처리 247건이 최대 19일치로 쌓였다.)
// 만료 상한을 넘긴 job 은 발송하지 않는다.
test('chat push jobs older than the expiry window are not sent', () => {
  const now = Date.parse('2026-07-28T09:00:00.000Z');

  expect(isChatPushJobExpired('2026-07-09T06:06:19.036Z', now)).toBe(true);
  expect(isChatPushJobExpired('2026-07-26T09:00:00.000Z', now)).toBe(true);
});

test('recent chat push jobs are still sent', () => {
  const now = Date.parse('2026-07-28T09:00:00.000Z');

  expect(isChatPushJobExpired('2026-07-28T08:30:00.000Z', now)).toBe(false);
  expect(isChatPushJobExpired('2026-07-27T10:00:00.000Z', now)).toBe(false);
  // created_at 이 비었거나 깨진 값이면 만료로 단정하지 않는다 (발송 기회를 잃지 않게).
  expect(isChatPushJobExpired(null, now)).toBe(false);
  expect(isChatPushJobExpired('not-a-date', now)).toBe(false);
});

test('board links outside the notice room still use chat push', () => {
  expect(
    shouldSuppressBoardAutoAnnouncementPush(
      {
        room_id: 'regular-room-1',
        content: buildBoardLinkedMessageContent(),
      },
      {
        id: 'regular-room-1',
        type: 'group',
      },
    ),
  ).toBe(false);
});

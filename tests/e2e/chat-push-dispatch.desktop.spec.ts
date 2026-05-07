import { expect, test } from '@playwright/test';
import { shouldSuppressBoardAutoAnnouncementPush } from '../../lib/chat-push-dispatch';
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

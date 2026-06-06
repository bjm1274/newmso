import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const BOARD_MENU = '\uAC8C\uC2DC\uD310';
const CHAT_MENU = '\uCC44\uD305';
const NOTICE_BOARD = '\uACF5\uC9C0\uC0AC\uD56D';
const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

async function readNoticeChatState(page: Page) {
  return page.evaluate(async (roomId) => {
    const [messagesResponse, roomsResponse] = await Promise.all([
      fetch(`/rest/v1/messages?room_id=eq.${roomId}&select=*`),
      fetch(`/rest/v1/chat_rooms?id=eq.${roomId}&select=*`),
    ]);

    return {
      messages: (await messagesResponse.json()) as Array<{
        id?: string;
        room_id?: string;
        content?: string | null;
      }>,
      rooms: (await roomsResponse.json()) as Array<{
        last_message?: string | null;
        last_message_preview?: string | null;
      }>,
    };
  }, NOTICE_ROOM_ID);
}

async function readBoardNotifications(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/rest/v1/notifications?select=*');
    return (await response.json()) as Array<{
      type?: string;
      metadata?: Record<string, unknown> | null;
    }>;
  });
}

test('new notice board posts announce themselves in the notice chat room', async ({ page }) => {
  await mockSupabase(page, {
    boardPosts: [],
    messages: [],
    notifications: [],
    staffMembers: [fakeUser],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: NOTICE_BOARD,
    },
  });

  await page.route('**/api/board/notice-broadcast', async (route) => {
    const postData = route.request().postDataJSON() || {};
    const postId = postData.postId || 'mock-post-id';

    await page.evaluate(async ({ roomId, postId }) => {
      const spaces = ' '.repeat(50);
      await fetch('/rest/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          room_id: roomId,
          sender_id: null,
          sender_name: '공지봇',
          content: `공지사항 게시글이 등록되었습니다. 수술 준비 공지 변경된 수술 준비 체크리스트${spaces}[[BOARD_META]]{"board_type":"공지사항","post_id":"${postId}"}[[/BOARD_META]]`,
        })
      });

      await fetch('/rest/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          type: 'board',
          title: '공지사항',
          body: '수술 준비 공지',
          metadata: {
            board_type: '공지사항',
            post_id: postId
          }
        })
      });
    }, { roomId: NOTICE_ROOM_ID, postId });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        messageId: 'msg-mock-1',
        notificationCount: 1
      })
    });
  });

  await page.goto(
    `/main?open_menu=${encodeURIComponent(BOARD_MENU)}&open_board=${encodeURIComponent(NOTICE_BOARD)}`,
  );
  await expect(page.getByTestId('board-view')).toBeVisible();

  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-new-post-title').fill('수술 준비 공지');
  await page.getByTestId('board-new-post-content').fill('전 직원은 변경된 수술 준비 체크리스트를 확인해 주세요.');
  await page.getByTestId('board-new-post-submit').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();

  await expect
    .poll(
      async () => {
        const noticeState = await readNoticeChatState(page);
        const noticeMessage = noticeState.messages.find(
          (message) => message.room_id === NOTICE_ROOM_ID,
        );
        return noticeMessage?.content || '';
      },
      { timeout: 10_000 },
    )
    .toContain('공지사항 게시글이 등록되었습니다.');

  const noticeState = await readNoticeChatState(page);

  const noticeMessage = noticeState.messages.find(
    (message: { room_id?: string }) => message.room_id === NOTICE_ROOM_ID,
  );
  expect(noticeMessage?.content).toContain('공지사항 게시글이 등록되었습니다.');
  expect(noticeMessage?.content).toContain('수술 준비 공지');
  expect(noticeMessage?.content).toContain('변경된 수술 준비 체크리스트');
  expect(noticeMessage?.content).toContain('[[BOARD_META]]');

  const noticeRoom = noticeState.rooms[0];
  expect(noticeRoom?.last_message).toContain('공지사항 게시글이 등록되었습니다.');
  expect(noticeRoom?.last_message_preview).toContain('공지사항 게시글이 등록되었습니다.');
  expect(noticeRoom?.last_message_preview).not.toContain('[[BOARD_META]]');

  const linkedPostId = noticeMessage?.content?.match(/"post_id":"([^"]+)"/)?.[1];
  const boardNotifications = await readBoardNotifications(page);
  const boardNotification = boardNotifications.find((notification) => notification.type === 'board');
  expect(boardNotification?.metadata).toMatchObject({
    board_type: NOTICE_BOARD,
    post_id: linkedPostId,
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(CHAT_MENU)}`);
  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId(`chat-room-preview-${NOTICE_ROOM_ID}`)).toContainText(
    '공지사항 게시글이 등록되었습니다.',
  );
  await expect(page.getByTestId(`chat-room-preview-${NOTICE_ROOM_ID}`)).not.toContainText(
    '[[BOARD_META]]',
  );
  await page.getByTestId(`chat-room-${NOTICE_ROOM_ID}`).click();
  await expect(page.getByTestId(`chat-message-${noticeMessage?.id}`)).toContainText(
    '공지사항 게시글이 등록되었습니다.',
  );
  await expect(page.getByTestId(`chat-message-${noticeMessage?.id}`)).not.toContainText(
    '[[BOARD_META]]',
  );

  await page.getByTestId(`chat-message-${noticeMessage?.id}`).click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: '수술 준비 공지' })).toBeVisible();
});

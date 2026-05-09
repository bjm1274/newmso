import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const CHAT_MENU = '\uCC44\uD305';
const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const ROOM_ID = 'room-image-fallback';

const peerOne = {
  ...fakeUser,
  id: 'chat-image-fallback-peer-1',
  employee_no: 'E2E-IMAGE-FALLBACK-1',
  name: 'Image Fallback Peer One',
};

const peerTwo = {
  ...fakeUser,
  id: 'chat-image-fallback-peer-2',
  employee_no: 'E2E-IMAGE-FALLBACK-2',
  name: 'Image Fallback Peer Two',
};

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('chat broken image keeps its bubble size and unread count', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [fakeUser, peerOne, peerTwo],
    chatRooms: [
      {
        id: NOTICE_ROOM_ID,
        name: '공지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: ROOM_ID,
        name: 'Broken Image Room',
        type: 'group',
        members: [fakeUser.id, peerOne.id, peerTwo.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T09:10:00.000Z',
        last_message_preview: 'missing.png',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-broken-image',
        room_id: ROOM_ID,
        sender_id: fakeUser.id,
        sender_name: fakeUser.name,
        content: '',
        file_url: '/missing-chat-image-for-e2e.png',
        file_name: 'missing.png',
        file_kind: 'image',
        created_at: '2026-03-08T09:10:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
    ],
    messageReads: [],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: CHAT_MENU,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(CHAT_MENU)}`);
  await expect(page.getByTestId('chat-view')).toBeVisible();
  await page.getByTestId(`chat-room-${ROOM_ID}`).click();

  const fallback = page.getByText('이미지를 불러올 수 없습니다');
  await expect(fallback).toBeVisible();
  await expect(page.getByTestId('chat-message-read-status-msg-broken-image')).toHaveText('2');

  const fallbackBox = await fallback.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });

  expect(fallbackBox.width).toBeGreaterThanOrEqual(190);
  expect(fallbackBox.height).toBeGreaterThanOrEqual(120);
});

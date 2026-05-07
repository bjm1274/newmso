import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('chat does not jump to the bottom when a peer message arrives while reading history', async ({
  page,
}) => {
  const chatMenuId = '\uCC44\uD305';
  const roomId = 'room-scroll-stability';
  const peerId = 'peer-scroll-stability';
  const messages = Array.from({ length: 50 }, (_, index) => ({
    id: `msg-scroll-${index + 1}`,
    room_id: roomId,
    sender_id: index % 2 === 0 ? fakeUser.id : peerId,
    sender_name: index % 2 === 0 ? fakeUser.name : 'Scroll Peer',
    content: `scroll history message ${index + 1} ${'history text '.repeat(18)}`,
    created_at: `2026-03-08T10:${String(index).padStart(2, '0')}:00.000Z`,
    is_deleted: false,
    staff: {
      name: index % 2 === 0 ? fakeUser.name : 'Scroll Peer',
      photo_url: null,
    },
  }));

  await mockSupabase(page, {
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Notice',
        type: 'notice',
        members: [],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: roomId,
        name: 'Scroll Stability Room',
        type: 'group',
        members: [fakeUser.id, peerId],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:49:00.000Z',
        last_message_preview: 'scroll history message 50',
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: peerId,
        name: 'Scroll Peer',
        employee_no: 'E2E-SCROLL-PEER',
      },
    ],
    messages,
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: chatMenuId,
      erp_chat_last_room: roomId,
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: chatMenuId }).toString()}`);
  const chatView = page.getByTestId('chat-view');
  await expect(chatView).toBeVisible({ timeout: 3000 }).catch(async () => {
    await page.getByTestId('sidebar-menu-chat').click();
  });
  await expect(chatView).toBeVisible();
  await expect(page.getByTestId('chat-message-msg-scroll-50')).toBeVisible();

  const before = await page.getByTestId('chat-message-list').evaluate((node) => {
    const el = node as HTMLDivElement;
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 700);
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
    return {
      scrollTop: el.scrollTop,
      distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    };
  });
  expect(before.distanceFromBottom).toBeGreaterThan(96);

  await page.evaluate(
    async ({ peerId, roomId }) => {
      await fetch('/rest/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          sender_id: peerId,
          sender_name: 'Scroll Peer',
          content: `incoming while history is open ${'new text '.repeat(18)}`,
          created_at: '2026-03-08T11:01:00.000Z',
          is_deleted: false,
        }),
      });
    },
    { peerId, roomId },
  );

  await expect(page.getByTestId('chat-message-msg-51')).toHaveCount(1);
  await page.waitForTimeout(500);

  const after = await page.getByTestId('chat-message-list').evaluate((node) => {
    const el = node as HTMLDivElement;
    return {
      scrollTop: el.scrollTop,
      distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    };
  });

  expect(after.distanceFromBottom).toBeGreaterThan(96);
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(120);
});

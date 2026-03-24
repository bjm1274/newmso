import { expect, test, type Page } from '@playwright/test';
import { fakeUser, mockSupabase, seedSession } from './helpers';

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    const text = message.text();
    if (
      text.includes('favicon') ||
      text.includes('Failed to load resource') ||
      text.includes('ERR_ABORTED')
    ) {
      return;
    }

    errors.push(`console: ${text}`);
  });

  return errors;
}

const peerOne = {
  ...fakeUser,
  id: 'chat-leave-peer-1',
  employee_no: 'E2E-CHAT-LEAVE-002',
  name: 'Leave Peer One',
  department: '간호부',
  position: '간호사',
};

const peerTwo = {
  ...fakeUser,
  id: 'chat-leave-peer-2',
  employee_no: 'E2E-CHAT-LEAVE-003',
  name: 'Leave Peer Two',
  department: '원무과',
  position: '주임',
};

test('leaving a chat room persists a leave system message', async ({ page }) => {
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerOne, peerTwo],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-leave',
        name: '퇴장 테스트 방',
        type: 'group',
        members: [fakeUser.id, peerOne.id, peerTwo.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '퇴장 전 안내',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-leave-1',
        room_id: 'room-leave',
        sender_id: peerOne.id,
        content: '퇴장 전 안내',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: peerOne.name, photo_url: null, position: peerOne.position },
        chat_rooms: {
          id: 'room-leave',
          name: '퇴장 테스트 방',
          type: 'group',
          members: [fakeUser.id, peerOne.id, peerTwo.id],
        },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-leave',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-room-room-leave')).toBeVisible();

  await page.getByTestId('chat-open-drawer').click();
  await page.getByRole('button', { name: '방 나가기' }).click();

  await expect(page.getByTestId('chat-room-room-leave')).toHaveCount(0);

  const persistedRoom = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/chat_rooms?id=eq.room-leave');
    return response.json();
  });
  const persistedMessages = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/messages?room_id=eq.room-leave&order=created_at.desc&limit=5');
    return response.json();
  });

  expect(Array.isArray(persistedRoom)).toBe(true);
  expect(persistedRoom[0]?.members).not.toContain(fakeUser.id);
  expect(
    Array.isArray(persistedMessages) &&
      persistedMessages.some(
        (message: any) =>
          String(message?.content || '').includes('[퇴장]') &&
          String(message?.content || '').includes(fakeUser.name)
      )
  ).toBe(true);

  expect(runtimeErrors).toEqual([]);
});

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
  id: 'chat-peer-1',
  employee_no: 'E2E-CHAT-002',
  name: 'Chat Peer One',
  department: '간호부',
  position: '간호사',
};

const peerTwo = {
  ...fakeUser,
  id: 'chat-peer-2',
  employee_no: 'E2E-CHAT-003',
  name: 'Chat Peer Two',
  department: '원무과',
  position: '주임',
};

test('chat advanced actions can bookmark, inspect reads, view thread, and forward', async ({
  page,
}) => {
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
        id: 'room-group',
        name: '운영팀 채팅방',
        type: 'group',
        members: [fakeUser.id, peerOne.id, peerTwo.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '북마크 테스트 메시지',
        created_by: fakeUser.id,
      },
      {
        id: 'room-target',
        name: '전달 대상방',
        type: 'group',
        members: [fakeUser.id, peerTwo.id],
        created_at: '2026-03-08T11:00:00.000Z',
        last_message_at: '2026-03-08T11:00:00.000Z',
        last_message_preview: '기존 메시지',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-root',
        room_id: 'room-group',
        sender_id: fakeUser.id,
        content: '북마크 테스트 메시지',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null, position: fakeUser.position },
      },
      {
        id: 'msg-reply',
        room_id: 'room-group',
        sender_id: peerOne.id,
        content: '스레드 답장입니다.',
        reply_to_id: 'msg-root',
        created_at: '2026-03-08T10:05:00.000Z',
        is_deleted: false,
        staff: { name: peerOne.name, photo_url: null, position: peerOne.position },
      },
      {
        id: 'msg-target-1',
        room_id: 'room-target',
        sender_id: peerTwo.id,
        content: '기존 메시지',
        created_at: '2026-03-08T11:00:00.000Z',
        is_deleted: false,
        staff: { name: peerTwo.name, photo_url: null, position: peerTwo.position },
      },
    ],
    messageReads: [
      {
        id: 'read-1',
        message_id: 'msg-root',
        user_id: peerOne.id,
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-group',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();

  await page.getByTestId('chat-message-msg-root').click();
  await page.getByTestId('chat-message-action-bookmark').click();

  await page.getByTestId('chat-message-msg-root').click();
  await expect(page.getByTestId('chat-message-action-bookmark')).toContainText('북마크 해제');

  await page.getByTestId('chat-message-action-read-status').click();
  await expect(page.getByTestId('chat-read-status-modal')).toBeVisible();
  await expect(page.getByTestId('chat-read-status-modal')).toContainText('Chat Peer One');
  await expect(page.getByTestId('chat-read-status-modal')).toContainText('Chat Peer Two');
  await page.getByTestId('chat-read-status-modal').locator('button').first().click();

  await page.getByTestId('chat-message-msg-root').click();
  await page.getByTestId('chat-message-action-thread').click();
  await expect(page.getByTestId('chat-thread-panel')).toBeVisible();
  await expect(page.getByTestId('chat-thread-panel')).toContainText('북마크 테스트 메시지');
  await expect(page.getByTestId('chat-thread-panel')).toContainText('스레드 답장입니다.');
  await page.getByTestId('chat-thread-panel').locator('button').first().click();

  await page.getByTestId('chat-message-msg-root').click();
  await page.getByTestId('chat-message-action-forward').click();
  await expect(page.getByTestId('chat-forward-modal')).toBeVisible();
  await page.getByTestId('chat-forward-target-room-target').click();
  await expect(page.getByTestId('chat-forward-modal')).toBeHidden();

  await page.getByTestId('chat-room-room-target').click();
  await expect(page.getByTestId('chat-message-msg-4')).toContainText('[전달] E2E Tester: 북마크 테스트 메시지');

  expect(runtimeErrors).toEqual([]);
});

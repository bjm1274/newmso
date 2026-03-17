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

test('chat reverse actions can unpin, vote, remove a participant, and edit/delete a message', async ({
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
        last_message_preview: '수정 전 메시지',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-edit',
        room_id: 'room-group',
        sender_id: fakeUser.id,
        content: '수정 전 메시지',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null, position: fakeUser.position },
        chat_rooms: {
          id: 'room-group',
          name: '운영팀 채팅방',
          type: 'group',
          members: [fakeUser.id, peerOne.id, peerTwo.id],
        },
      },
      {
        id: 'msg-peer-1',
        room_id: 'room-group',
        sender_id: peerOne.id,
        content: '확인 부탁드립니다.',
        created_at: '2026-03-08T10:05:00.000Z',
        is_deleted: false,
        staff: { name: peerOne.name, photo_url: null, position: peerOne.position },
        chat_rooms: {
          id: 'room-group',
          name: '운영팀 채팅방',
          type: 'group',
          members: [fakeUser.id, peerOne.id, peerTwo.id],
        },
      },
    ],
    pinnedMessages: [
      {
        id: 'pin-1',
        room_id: 'room-group',
        message_id: 'msg-edit',
        pinned_by: fakeUser.id,
        created_at: '2026-03-08T10:01:00.000Z',
      },
    ],
    polls: [
      {
        id: 'poll-1',
        room_id: 'room-group',
        creator_id: fakeUser.id,
        question: '점심 회의 시간은 언제가 좋을까요?',
        options: ['오전 11시', '오후 2시'],
        created_at: '2026-03-08T10:10:00.000Z',
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
  await expect(page.getByTestId('chat-room-room-group')).toBeVisible();

  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-drawer-notice')).toContainText('수정 전 메시지');
  await page.getByTestId('chat-room-drawer').locator('button').first().click();

  await page.getByTestId('chat-message-msg-edit').click();
  await expect(page.getByTestId('chat-message-actions-panel')).toBeVisible();
  await page.getByTestId('chat-message-action-pin').click();

  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-drawer-notice')).toContainText('등록된 공지가 없습니다.');
  await page.getByTestId('chat-room-drawer').locator('button').first().click();

  await page.getByTestId('chat-poll-vote-poll-1-1').click();
  await expect(page.getByTestId('chat-poll-vote-poll-1-1')).toContainText('(100%)');

  await page.getByTestId('chat-open-drawer').click();
  await page.getByTestId(`chat-room-member-${peerTwo.id}`).hover();
  await page.getByTestId(`chat-remove-member-${peerTwo.id}`).click();
  await expect(page.getByTestId(`chat-room-member-${peerTwo.id}`)).toHaveCount(0);
  await page.getByTestId('chat-room-drawer').locator('button').first().click();

  await page.getByTestId('chat-message-msg-edit').click();
  await page.getByTestId('chat-message-action-edit').click();
  await page.getByTestId('chat-message-edit-input').fill('수정 후 메시지');
  await page.getByTestId('chat-message-edit-save').click();
  await expect(page.getByText('수정 후 메시지')).toBeVisible();

  await page.getByTestId('chat-message-msg-edit').click();
  await page.getByTestId('chat-message-action-delete').click();
  await expect(page.getByTestId('chat-message-msg-edit')).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

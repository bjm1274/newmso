import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

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

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('chat detailed walkthrough opens each internal menu in practical order', async ({
  page,
}) => {
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
        members: [fakeUser.id, peerOne.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '운영 회의 메모',
        created_by: fakeUser.id,
      },
      {
        id: 'room-direct',
        name: '',
        type: 'direct',
        members: [fakeUser.id, peerTwo.id],
        created_at: '2026-03-08T09:30:00.000Z',
        last_message_at: '2026-03-08T10:30:00.000Z',
        last_message_preview: '직접 메시지',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-group-1',
        room_id: 'room-group',
        sender_id: fakeUser.id,
        content: '운영 회의 메모',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
        chat_rooms: { id: 'room-group', name: '운영팀 채팅방', type: 'group', members: [fakeUser.id, peerOne.id] },
      },
      {
        id: 'msg-direct-1',
        room_id: 'room-direct',
        sender_id: peerTwo.id,
        content: '직접 메시지',
        created_at: '2026-03-08T10:30:00.000Z',
        is_deleted: false,
        staff: { name: peerTwo.name, photo_url: null },
        chat_rooms: { id: 'room-direct', name: '', type: 'direct', members: [fakeUser.id, peerTwo.id] },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '\uCC44\uD305',
      erp_chat_last_room: 'room-group',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('\uCC44\uD305')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-room-room-group')).toBeVisible();

  await page.getByTestId('chat-open-global-search').click();
  await expect(page.getByTestId('chat-global-search-modal')).toBeVisible();
  await page.getByTestId('chat-global-search-input').fill('운영');
  await page.getByTestId('chat-global-search-submit').click();
  await expect(page.getByTestId('chat-global-search-result-msg-group-1')).toBeVisible();
  await page.getByTestId('chat-global-search-result-msg-group-1').click();
  await expect(page.getByTestId('chat-global-search-modal')).toBeHidden();

  await page.getByTestId('chat-open-group-modal').click();
  await expect(page.getByTestId('chat-group-modal')).toBeVisible();
  await page.getByTestId('chat-group-modal').locator('button').first().click();
  await expect(page.getByTestId('chat-group-modal')).toBeHidden();

  await page.getByTestId('chat-open-drawer').click();
  const drawer = page.getByTestId('chat-room-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('button').first().click();
  await expect(drawer).toBeHidden();

  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-room-drawer')).toBeVisible();
  await page.getByTestId('chat-open-add-member-modal').click();
  await expect(page.getByTestId('chat-add-member-modal')).toBeVisible();
  await page.getByTestId('chat-add-member-search').fill('Peer');
  await page.getByTestId('chat-add-member-cancel').click();
  await expect(page.getByTestId('chat-add-member-modal')).toBeHidden();

  await page.getByTestId('chat-tab-org').click();
  await expect(page.getByTestId('chat-org-list')).toBeVisible();
  await page.getByTestId(`chat-direct-${peerTwo.id}`).click();
  await expect(page.getByTestId('chat-tab-chat')).toBeVisible();
  await expect(page.getByTestId('chat-open-drawer')).toBeVisible();

  await page.getByTestId('chat-tab-chat').click();
  await page.getByTestId('chat-toggle-hidden-rooms').click();
  await page.getByTestId('chat-toggle-hidden-rooms').click();

  expect(runtimeErrors).toEqual([]);
});

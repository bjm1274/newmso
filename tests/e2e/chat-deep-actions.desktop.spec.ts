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
  department: '\uAC04\uD638\uBD80',
  position: '\uAC04\uD638\uC0AC',
};

const peerTwo = {
  ...fakeUser,
  id: 'chat-peer-2',
  employee_no: 'E2E-CHAT-003',
  name: 'Chat Peer Two',
  department: '\uC6D0\uBB34\uACFC',
  position: '\uC8FC\uC784',
};

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('chat deep actions can pin a notice, create a poll, and save added participants', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerOne, peerTwo],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '怨듭?硫붿떆吏',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-group',
        name: '\uC6B4\uC601\uD300 \uCC44\uD305\uBC29',
        type: 'group',
        members: [fakeUser.id, peerOne.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '怨듭?濡??щ┫ 硫붿떆吏',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-group-1',
        room_id: 'room-group',
        sender_id: fakeUser.id,
        content: '怨듭?濡??щ┫ 硫붿떆吏',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null, position: fakeUser.position },
        chat_rooms: {
          id: 'room-group',
          name: '\uC6B4\uC601\uD300 \uCC44\uD305\uBC29',
          type: 'group',
          members: [fakeUser.id, peerOne.id],
        },
      },
      {
        id: 'msg-group-2',
        room_id: 'room-group',
        sender_id: peerOne.id,
        content: '?뺤씤 遺?곷뱶由쎈땲??',
        created_at: '2026-03-08T10:05:00.000Z',
        is_deleted: false,
        staff: { name: peerOne.name, photo_url: null, position: peerOne.position },
        chat_rooms: {
          id: 'room-group',
          name: '\uC6B4\uC601\uD300 \uCC44\uD305\uBC29',
          type: 'group',
          members: [fakeUser.id, peerOne.id],
        },
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

  await page.getByTestId('chat-message-msg-group-1').click();
  await expect(page.getByTestId('chat-message-actions-panel')).toBeVisible();
  await expect(page.getByTestId('chat-message-action-pin')).toBeVisible();
  await page.getByTestId('chat-message-action-pin').click();
  await expect(page.getByTestId('chat-notice-banner')).toBeVisible();
  await expect(page.getByTestId('chat-notice-item-msg-group-1')).toBeVisible();
  await page.getByTestId('chat-notice-toggle').click();
  await expect(page.getByTestId('chat-notice-collapsed-preview')).toBeVisible();
  await page.getByTestId('chat-notice-toggle').click();

  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-room-drawer')).toBeVisible();
  await expect(page.getByTestId('chat-drawer-notice')).toContainText('怨듭?濡??щ┫ 硫붿떆吏');

  await page.getByTestId('chat-open-poll-modal').click();
  await expect(page.getByTestId('chat-poll-modal')).toBeVisible();
  await page.getByTestId('chat-poll-question').fill('\uC774\uBC88 \uC8FC \uD68C\uC758 \uC2DC\uAC04\uC740 \uC5B8\uC81C\uAC00 \uC88B\uC744\uAE4C\uC694?');
  await page.getByTestId('chat-poll-option-0').fill('\uC624\uC804 9\uC2DC');
  await page.getByTestId('chat-poll-option-1').fill('\uC624\uD6C4 2\uC2DC');
  await page.getByTestId('chat-poll-deadline').fill('2026-03-08T18:00');
  await page.getByTestId('chat-poll-submit').click();
  await expect(page.getByTestId('chat-poll-modal')).toBeHidden();
  await expect(page.getByText('\uC774\uBC88 \uC8FC \uD68C\uC758 \uC2DC\uAC04\uC740 \uC5B8\uC81C\uAC00 \uC88B\uC744\uAE4C\uC694?')).toBeVisible();

  await expect(page.getByTestId('chat-poll-deadline-label-poll-1')).toContainText('\uB9C8\uAC10');
  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-room-drawer')).toBeVisible();
  await page.getByTestId('chat-open-add-member-modal').click();
  await expect(page.getByTestId('chat-add-member-modal')).toBeVisible();
  await page.getByTestId('chat-add-member-search').fill('Peer Two');
  await page.getByTestId(`chat-add-member-option-${peerTwo.id}`).click();
  await page.getByTestId('chat-add-member-submit').click();
  await expect(page.getByTestId('chat-add-member-modal')).toBeHidden();
  await expect(page.getByTestId(`chat-room-member-${peerTwo.id}`)).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

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

test('chat drawer notice actions show read status and send targeted reminders', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await page.addInitScript(() => {
    (window as Window & { __mockInsertedNotifications?: unknown[] }).__mockInsertedNotifications = [];
    window.addEventListener('erp-mock-notification-insert', (event: Event) => {
      const customEvent = event as CustomEvent<{ rows?: unknown[] }>;
      const rows = Array.isArray(customEvent.detail?.rows) ? customEvent.detail.rows : [];
      const store = (window as Window & { __mockInsertedNotifications?: unknown[] }).__mockInsertedNotifications || [];
      store.push(...rows);
      (window as Window & { __mockInsertedNotifications?: unknown[] }).__mockInsertedNotifications = store;
    });
  });

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
        last_message_preview: '공지 리마인드 메시지',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-group-1',
        room_id: 'room-group',
        sender_id: fakeUser.id,
        content: '공지 리마인드 메시지',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null, position: fakeUser.position },
      },
    ],
    roomReadCursors: [
      {
        id: 'room-read-1',
        room_id: 'room-group',
        user_id: peerOne.id,
        last_read_at: '2026-03-08T10:10:00.000Z',
      },
      {
        id: 'room-read-2',
        room_id: 'room-group',
        user_id: peerTwo.id,
        last_read_at: '2026-03-08T09:50:00.000Z',
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

  await page.getByTestId('chat-message-msg-group-1').click();
  await page.getByTestId('chat-message-action-pin').click();

  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-drawer-notice')).toContainText('공지 리마인드 메시지');
  await expect(page.getByTestId('chat-notice-jump-message')).toBeVisible();
  await expect(page.getByTestId('chat-notice-read-count')).toContainText('읽음 1');
  await expect(page.getByTestId('chat-notice-unread-count')).toContainText('미확인 1');

  await page.getByTestId('chat-notice-open-read-status').click();
  await expect(page.getByTestId('chat-read-status-modal')).toBeVisible();
  await expect(page.getByTestId('chat-read-status-modal')).toContainText('Chat Peer One');
  await expect(page.getByTestId('chat-read-status-modal')).toContainText('Chat Peer Two');
  await page.getByTestId('chat-read-status-modal').locator('button').first().click();

  await page.getByTestId('chat-notice-send-reminder').click();
  await expect(page.getByText('1명에게 공지 리마인드를 보냈습니다.')).toBeVisible();

  const insertedNotifications = await page.evaluate(
    () => (window as Window & { __mockInsertedNotifications?: any[] }).__mockInsertedNotifications || [],
  );
  expect(insertedNotifications).toHaveLength(1);
  expect(insertedNotifications[0]?.user_id).toBe(peerTwo.id);
  expect(insertedNotifications[0]?.type).toBe('message');
  expect(insertedNotifications[0]?.metadata?.room_id).toBe('room-group');
  expect(insertedNotifications[0]?.metadata?.message_id).toBe('msg-group-1');
  expect(insertedNotifications[0]?.metadata?.reminder_kind).toBe('pinned_notice');

  expect(runtimeErrors).toEqual([]);
});

test('chat drawer exposes room-level notification modes and keyword input', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerOne],
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
        id: 'room-notify-preferences',
        name: '알림 설정 채팅방',
        type: 'group',
        members: [fakeUser.id, peerOne.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '알림 설정 확인',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-notify-1',
        room_id: 'room-notify-preferences',
        sender_id: peerOne.id,
        content: '알림 설정 확인',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: peerOne.name, photo_url: null, position: peerOne.position },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-notify-preferences',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-room-drawer')).toBeVisible();
  await expect(page.getByTestId('chat-room-notify-mode-all')).toBeVisible();
  await expect(page.getByTestId('chat-room-notify-mode-mention_only')).toBeVisible();
  await expect(page.getByTestId('chat-room-notify-mode-keyword')).toBeVisible();
  await expect(page.getByTestId('chat-room-notify-mode-mute')).toBeVisible();

  await page.getByTestId('chat-room-notify-mode-keyword').click();
  await page.getByTestId('chat-room-notify-keyword').fill('handoff');
  await expect(page.getByTestId('chat-room-notify-keyword')).toHaveValue('handoff');

  expect(runtimeErrors).toEqual([]);
});

test('chat operations center can schedule a notice and dispatch it immediately', async ({ page }) => {
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
        last_message_preview: '예약 공지 준비',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-group-1',
        room_id: 'room-group',
        sender_id: fakeUser.id,
        content: '예약 공지 준비',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null, position: fakeUser.position },
      },
    ],
  });

  await seedSession(page, {
    user: {
      ...fakeUser,
      company: 'SY INC.',
      position: '부장',
      role: 'admin',
      permissions: {
        ...fakeUser.permissions,
        mso: true,
      },
    },
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-group',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await page.getByTestId('chat-open-drawer').click();
  await expect(page.getByTestId('chat-room-drawer')).toBeVisible();
  await page.getByTestId('chat-open-ops-center').click();
  await expect(page.getByTestId('chat-ops-center')).toBeVisible();

  await page.getByTestId('chat-ops-schedule-content').fill('오늘 오후 전달할 예약 공지입니다.');
  await page.getByTestId('chat-ops-schedule-send-at').fill('2099-12-31T09:00');
  await page.getByTestId('chat-ops-schedule-reminders').fill('15, 60');
  await page.getByTestId('chat-ops-schedule-create').click();

  const scheduledId = await page.evaluate(() => {
    const scheduleKey = Object.keys(window.localStorage).find((key) =>
      key.includes('erp_chat_notice_schedules:')
    );
    const jobs = scheduleKey ? JSON.parse(window.localStorage.getItem(scheduleKey) || '[]') : [];
    return jobs[0]?.id || null;
  });

  expect(scheduledId).toBeTruthy();
  await expect(page.getByTestId(`chat-ops-schedule-${scheduledId}`)).toBeVisible();
  await page.getByTestId(`chat-ops-schedule-now-${scheduledId}`).click();

  await expect
    .poll(async () =>
      page.evaluate((jobId) => {
        const scheduleKey = Object.keys(window.localStorage).find((key) =>
          key.includes('erp_chat_notice_schedules:')
        );
        const jobs = scheduleKey ? JSON.parse(window.localStorage.getItem(scheduleKey) || '[]') : [];
        return jobs.find((job: { id?: string; status?: string }) => job.id === jobId)?.status || null;
      }, scheduledId),
    )
    .toBe('sent');

  await page.getByTestId('chat-ops-center-close').click();
  await expect(page.getByTestId('chat-ops-center')).toBeHidden();

  await page.getByTestId('chat-room-00000000-0000-0000-0000-000000000000').click();
  await expect(page.getByText('오늘 오후 전달할 예약 공지입니다.')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

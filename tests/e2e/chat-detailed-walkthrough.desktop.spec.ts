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
  photo_url: 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" rx=\"20\" fill=\"%230ea5e9\"/><text x=\"32\" y=\"39\" font-size=\"24\" text-anchor=\"middle\" fill=\"white\">P</text></svg>',
};

const noticeRoomId = '00000000-0000-0000-0000-000000000000';

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

  await page.getByTestId('chat-open-global-search').click();
  await expect(page.getByTestId('chat-global-search-modal')).toBeVisible();
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
  await page
    .locator('button')
    .filter({ hasText: peerTwo.department as string })
    .first()
    .click();
  await page.getByTestId(`chat-direct-${peerTwo.id}`).click();
  await expect(page.getByTestId('chat-tab-chat')).toBeVisible();
  await expect(page.getByTestId('chat-open-drawer')).toBeVisible();
  await expect(page.getByTestId('chat-room-icon-room-direct').locator('img')).toBeVisible();
  await expect(page.getByTestId('chat-room-header-avatar').locator('img')).toBeVisible();
  await expect(page.getByTestId('chat-message-sender-avatar-msg-direct-1').locator('img')).toBeVisible();

  await page.getByTestId('chat-tab-chat').click();
  await page.getByTestId('chat-toggle-hidden-rooms').click();
  await page.getByTestId('chat-toggle-hidden-rooms').click();

  expect(runtimeErrors).toEqual([]);
});

test('chat still renders room messages when optional message columns are missing', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerOne],
    missingMessageColumns: ['sender_name', 'message_type', 'album_id', 'is_deleted'],
    chatRooms: [
      {
        id: noticeRoomId,
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-fallback',
        name: '스키마 대응 채팅방',
        type: 'group',
        members: [fakeUser.id, peerOne.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '운영 스키마 대응 메시지',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-fallback-1',
        room_id: 'room-fallback',
        sender_id: peerOne.id,
        content: '운영 스키마 대응 메시지',
        created_at: '2026-03-08T10:00:00.000Z',
        staff: { name: peerOne.name, photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '\uCC44\uD305',
      erp_chat_last_room: 'room-fallback',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('\uCC44\uD305')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-room-room-fallback')).toBeVisible();
  await expect(page.getByTestId('chat-message-msg-fallback-1')).toContainText('운영 스키마 대응 메시지');

  expect(runtimeErrors).toEqual([]);
});

test('chat shows staff profile photos in room list, header, and sender rows', async ({
  page,
}) => {
  const peerWithPhoto = {
    ...peerTwo,
    id: 'chat-peer-photo',
    name: 'Photo Peer',
    photo_url: 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" rx=\"20\" fill=\"%2310b981\"/><text x=\"32\" y=\"39\" font-size=\"22\" text-anchor=\"middle\" fill=\"white\">Q</text></svg>',
  };

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerWithPhoto],
    chatRooms: [
      {
        id: noticeRoomId,
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-photo-direct',
        name: '',
        type: 'direct',
        members: [fakeUser.id, peerWithPhoto.id],
        created_at: '2026-03-08T09:30:00.000Z',
        last_message_at: '2026-03-08T10:30:00.000Z',
        last_message_preview: '프로필 사진 확인 메시지',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-photo-direct-1',
        room_id: 'room-photo-direct',
        sender_id: peerWithPhoto.id,
        content: '프로필 사진 확인 메시지',
        created_at: '2026-03-08T10:30:00.000Z',
        is_deleted: false,
        staff: { name: peerWithPhoto.name, photo_url: peerWithPhoto.photo_url, position: peerWithPhoto.position },
        chat_rooms: { id: 'room-photo-direct', name: '', type: 'direct', members: [fakeUser.id, peerWithPhoto.id] },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '\uCC44\uD305',
      erp_chat_last_room: 'room-photo-direct',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('\uCC44\uD305')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-room-icon-room-photo-direct').locator('img')).toBeVisible();
  await expect(page.getByTestId('chat-room-header-avatar').locator('img')).toBeVisible();
  await expect(page.getByTestId('chat-message-sender-avatar-msg-photo-direct-1').locator('img')).toBeVisible();
});

test('chat shows ward quick replies for received op ward messages and sends the selected reply', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const wardMessageContent =
    '[수술실 메시지] Ward Patient 환자 (차트: CH-033) 좌측 테스트 수술명 수술 준비가 완료되었습니다.\n' +
    '환자 처치 후 수술실로 올려주세요.\n' +
    '수술실:1 / 수술시간:09:00\n' +
    '[[WARD_MESSAGE_META]]{"type":"op_ward_request","patient_name":"Ward Patient","chart_no":"CH-033","surgery_name":"좌측 테스트 수술명","schedule_room":"1","schedule_time":"09:00"}[[/WARD_MESSAGE_META]]';

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerOne],
    chatRooms: [
      {
        id: noticeRoomId,
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-ward-direct',
        name: '',
        type: 'direct',
        members: [fakeUser.id, peerOne.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: wardMessageContent,
        created_by: peerOne.id,
      },
    ],
    messages: [
      {
        id: 'msg-ward-request-1',
        room_id: 'room-ward-direct',
        sender_id: peerOne.id,
        content: wardMessageContent,
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: peerOne.name, photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '\uCC44\uD305',
      erp_chat_last_room: 'room-ward-direct',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('\uCC44\uD305')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-message-msg-ward-request-1')).toContainText('Ward Patient');
  await expect(page.getByTestId('chat-message-msg-ward-request-1')).not.toContainText('WARD_MESSAGE_META');
  await expect(page.getByTestId('chat-ward-quick-replies-msg-ward-request-1')).toBeVisible();

  await page.getByTestId('chat-ward-quick-reply-msg-ward-request-1-confirm').click();
  await expect(page.getByText('확인했습니다. 환자 확인 후 올리겠습니다.').last()).toBeVisible();

  const persistedMessages = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/messages?room_id=eq.room-ward-direct&select=*');
    return response.json();
  });

  expect(
    Array.isArray(persistedMessages) &&
      persistedMessages.some(
        (message: any) =>
          String(message?.content || '').includes('확인했습니다. 환자 확인 후 올리겠습니다.') &&
          String(message?.reply_to_id || '') === 'msg-ward-request-1',
      ),
  ).toBeTruthy();

  expect(runtimeErrors).toEqual([]);
});

test('chat shows who reacted when a reaction chip is selected', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerOne, peerTwo],
    chatRooms: [
      {
        id: noticeRoomId,
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-reaction-detail',
        name: '반응 확인 방',
        type: 'group',
        members: [fakeUser.id, peerOne.id, peerTwo.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:05:00.000Z',
        last_message_preview: '반응 확인 메시지',
        created_by: fakeUser.id,
      },
    ],
    messages: [
      {
        id: 'msg-reaction-detail-1',
        room_id: 'room-reaction-detail',
        sender_id: peerTwo.id,
        content: '반응 확인 메시지',
        created_at: '2026-03-08T10:05:00.000Z',
        is_deleted: false,
        staff: { name: peerTwo.name, photo_url: null },
      },
    ],
    messageReactions: [
      {
        id: 'reaction-1',
        message_id: 'msg-reaction-detail-1',
        user_id: fakeUser.id,
        emoji: '👍',
      },
      {
        id: 'reaction-2',
        message_id: 'msg-reaction-detail-1',
        user_id: peerOne.id,
        emoji: '👍',
      },
      {
        id: 'reaction-3',
        message_id: 'msg-reaction-detail-1',
        user_id: peerTwo.id,
        emoji: '🔥',
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '\uCC44\uD305',
      erp_chat_last_room: 'room-reaction-detail',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('\uCC44\uD305')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-message-msg-reaction-detail-1')).toContainText('반응 확인 메시지');
  await page.getByRole('button', { name: '👍 반응 누른 사람 2명 보기' }).click();
  await expect(page.getByTestId('chat-reaction-detail-modal')).toBeVisible();
  await expect(page.getByTestId('chat-reaction-detail-modal')).toContainText('👍 2');
  await expect(page.getByTestId('chat-reaction-detail-modal')).toContainText(fakeUser.name);
  await expect(page.getByTestId('chat-reaction-detail-modal')).toContainText(peerOne.name);
  await expect(page.getByTestId('chat-reaction-detail-modal')).not.toContainText(peerTwo.name);
  await page.getByTestId('chat-reaction-detail-modal').getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('chat-reaction-detail-modal')).toBeHidden();

  expect(runtimeErrors).toEqual([]);
});

test('chat org view keeps department cards collapsed by default', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const alphaOne = {
    ...fakeUser,
    id: 'chat-org-alpha-1',
    employee_no: 'E2E-CHAT-ALPHA-1',
    name: 'Alpha One',
    department: 'Alpha Team',
    position: 'Coordinator',
  };
  const alphaTwo = {
    ...fakeUser,
    id: 'chat-org-alpha-2',
    employee_no: 'E2E-CHAT-ALPHA-2',
    name: 'Alpha Two',
    department: 'Alpha Team',
    position: 'Staff',
  };
  const betaOne = {
    ...fakeUser,
    id: 'chat-org-beta-1',
    employee_no: 'E2E-CHAT-BETA-1',
    name: 'Beta One',
    department: 'Beta Team',
    position: 'Staff',
  };

  await mockSupabase(page, {
    staffMembers: [fakeUser, alphaOne, alphaTwo, betaOne],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await page.getByTestId('chat-tab-org').click();
  await expect(page.getByTestId('chat-org-list')).toBeVisible();

  await expect(page.getByTestId(`chat-direct-${alphaOne.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`chat-direct-${betaOne.id}`)).toHaveCount(0);

  await page.getByRole('button', { name: /Alpha Team/ }).click();
  await expect(page.getByTestId(`chat-direct-${alphaOne.id}`)).toBeVisible();
  await expect(page.getByTestId(`chat-direct-${alphaTwo.id}`)).toBeVisible();
  await expect(page.getByTestId(`chat-direct-${betaOne.id}`)).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

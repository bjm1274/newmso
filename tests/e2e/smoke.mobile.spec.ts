import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('mobile chat room list opens the selected room at the latest message', async ({ page }) => {
  const longMessages = Array.from({ length: 40 }, (_, index) => ({
    id: `msg-mobile-long-${index + 1}`,
    room_id: 'room-mobile-long',
    sender_id: index % 2 === 0 ? fakeUser.id : 'peer-mobile-1',
    content: `mobile long message ${index + 1}`,
    created_at: `2026-03-08T10:${String(index).padStart(2, '0')}:00.000Z`,
    is_deleted: false,
    staff: { name: index % 2 === 0 ? fakeUser.name : 'Mobile Chat Peer', photo_url: null },
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
        id: 'room-mobile-long',
        name: 'Mobile Long Room',
        type: 'group',
        members: [fakeUser.id, 'peer-mobile-1'],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:39:00.000Z',
        last_message_preview: 'mobile long message 40',
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: 'peer-mobile-1',
        name: 'Mobile Chat Peer',
        employee_no: 'E2E-CHAT-MOBILE-001',
      },
    ],
    messages: longMessages,
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '채팅' }).toString()}`);
  await expect(page.getByTestId('chat-view')).toBeVisible();
  const backToRoomListButton = page.getByRole('button', { name: '뒤로' });
  if (await backToRoomListButton.isVisible().catch(() => false)) {
    await backToRoomListButton.click();
  }

  await page.getByTestId('chat-room-room-mobile-long').click();
  await expect(page.getByTestId('chat-message-msg-mobile-long-40')).toBeVisible();

  await expect
    .poll(async () =>
      page.getByTestId('chat-message-list').evaluate((node) => {
        const el = node as HTMLDivElement;
        return Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 24;
      }),
    )
    .toBe(true);
});

test('mobile chat menu opens the room list as the chat main screen', async ({ page }) => {
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
        id: 'room-mobile-main',
        name: 'Mobile Main Room',
        type: 'group',
        members: [fakeUser.id, 'peer-mobile-main'],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: 'main room message',
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: 'peer-mobile-main',
        name: 'Mobile Main Peer',
        employee_no: 'E2E-CHAT-MOBILE-MAIN',
      },
    ],
    messages: [
      {
        id: 'msg-mobile-main-1',
        room_id: 'room-mobile-main',
        sender_id: 'peer-mobile-main',
        content: 'main room message',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: 'Mobile Main Peer', photo_url: null },
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '내정보',
      erp_chat_last_room: 'room-mobile-main',
    },
  });

  await page.goto('/main');
  await expect(page.getByTestId('mypage-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-chat-mobile').click();

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-room-room-mobile-main')).toBeVisible();
  await expect(page.getByTestId('chat-message-input')).toBeHidden();
});

test('mobile chat tab returns to the room list when tapped again', async ({ page }) => {
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
        id: 'room-mobile-reset',
        name: 'Mobile Reset Room',
        type: 'group',
        members: [fakeUser.id, 'peer-mobile-reset'],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: 'room reset message',
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: 'peer-mobile-reset',
        name: 'Mobile Reset Peer',
        employee_no: 'E2E-CHAT-MOBILE-RESET',
      },
    ],
    messages: [
      {
        id: 'msg-mobile-reset-1',
        room_id: 'room-mobile-reset',
        sender_id: 'peer-mobile-reset',
        content: 'room reset message',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: 'Mobile Reset Peer', photo_url: null },
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '\uCC44\uD305',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '\uCC44\uD305' }).toString()}`);
  await expect(page.getByTestId('chat-view')).toBeVisible();

  const backToRoomListButton = page.getByRole('button', { name: '\uB4A4\uB85C' });
  if (await backToRoomListButton.isVisible().catch(() => false)) {
    await backToRoomListButton.click();
  }

  const roomItem = page.getByTestId('chat-room-room-mobile-reset');
  await expect(roomItem).toBeVisible();
  await roomItem.click();

  await expect(page.getByTestId('chat-message-input')).toBeVisible();
  await expect(roomItem).toBeHidden();

  await page
    .getByTestId('sidebar-menu-chat-mobile')
    .evaluate((element) => (element as HTMLElement).click());

  await expect(page.getByTestId('chat-message-input')).toBeHidden();
  await expect(page.getByTestId('chat-room-room-mobile-reset')).toBeVisible();
});

test('mobile chat room icons keep a uniform size across room names', async ({ page }) => {
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
        id: 'room-icon-short',
        name: '홍자비',
        type: 'group',
        members: [fakeUser.id, 'peer-icon-short'],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '짧은 미리보기',
      },
      {
        id: 'room-icon-long',
        name: 'SY INC. 경영지원 의료인도능자 고용 E-9 통합 채널',
        type: 'group',
        members: [fakeUser.id, 'peer-icon-long-1', 'peer-icon-long-2'],
        created_at: '2026-03-08T09:30:00.000Z',
        last_message_at: '2026-03-08T11:00:00.000Z',
        last_message_preview: '긴 방 이름에서도 아이콘 크기가 줄어들면 안 됩니다.',
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: 'peer-icon-short',
        name: '홍자비',
        employee_no: 'E2E-CHAT-ICON-SHORT',
      },
      {
        ...fakeUser,
        id: 'peer-icon-long-1',
        name: '긴이름직원1',
        employee_no: 'E2E-CHAT-ICON-LONG-1',
      },
      {
        ...fakeUser,
        id: 'peer-icon-long-2',
        name: '긴이름직원2',
        employee_no: 'E2E-CHAT-ICON-LONG-2',
      },
    ],
    messages: [],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '채팅' }).toString()}`);
  await expect(page.getByTestId('chat-view')).toBeVisible();

  const backToRoomListButton = page.getByRole('button', { name: '뒤로' });
  if (await backToRoomListButton.isVisible().catch(() => false)) {
    await backToRoomListButton.click();
  }

  const shortIcon = page.getByTestId('chat-room-icon-room-icon-short');
  const longIcon = page.getByTestId('chat-room-icon-room-icon-long');

  await expect(shortIcon).toBeVisible();
  await expect(longIcon).toBeVisible();

  const shortBox = await shortIcon.boundingBox();
  const longBox = await longIcon.boundingBox();

  expect(shortBox).not.toBeNull();
  expect(longBox).not.toBeNull();
  expect(Math.round(shortBox!.width)).toBe(Math.round(longBox!.width));
  expect(Math.round(shortBox!.height)).toBe(Math.round(longBox!.height));
});

test('mobile main shell shows the bottom tab bar', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);

  await page.goto('/main');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('main-shell')).toBeVisible();
  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();
});

test('mobile admin can switch across the main tabs without a stuck loading overlay', async ({ page }) => {
  const adminUser = {
    ...fakeUser,
    company: 'SY INC.',
    company_id: 'mso-company-id',
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
      inventory: true,
    },
    role: 'admin',
  };

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
      { id: fakeUser.company_id, name: fakeUser.company, type: 'HOSPITAL', is_active: true },
    ],
  });
  await seedSession(page, { user: adminUser });
  await page.goto('/main');

  const menus = [
    { trigger: 'sidebar-menu-home-mobile', view: 'mypage-view' },
    { trigger: 'sidebar-menu-extra-mobile', view: 'extra-view' },
    { trigger: 'sidebar-menu-chat-mobile', view: 'chat-view' },
    { trigger: 'sidebar-menu-board-mobile', view: 'board-view' },
    { trigger: 'sidebar-menu-approval-mobile', view: 'approval-view' },
    { trigger: 'sidebar-menu-hr-mobile', view: 'hr-view' },
    { trigger: 'sidebar-menu-inventory-mobile', view: 'inventory-view' },
    { trigger: 'sidebar-menu-admin-mobile', view: 'admin-view' },
  ];

  for (const menu of menus) {
    await page
      .getByTestId(menu.trigger)
      .evaluate((element) => (element as HTMLElement).click());
    await expect(page.getByTestId(menu.view)).toBeVisible();
    await expect(page.getByTestId('main-loading-overlay')).toHaveCount(0);
  }
});

test('mobile board keeps the attachment indicator beside the status badge', async ({ page }) => {
  const postId = 'board-mobile-attachment-1';

  await mockSupabase(page, {
    boardPosts: [
      {
        id: postId,
        board_type: '공지사항',
        title: '',
        content: 'attachment layout smoke test',
        created_at: '2026-03-30T10:00:00.000Z',
        author_id: fakeUser.id,
        author_name: fakeUser.name,
        company_id: fakeUser.company_id,
        company: fakeUser.company,
        status: '게시중',
        attachments: [
          {
            name: 'notice.pdf',
            url: 'https://example.com/files/notice.pdf',
            type: 'file',
          },
        ],
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '게시판',
      erp_last_subview: '공지사항',
    },
  });

  await page.goto('/main?open_menu=게시판&open_board=공지사항');
  await expect(page.getByTestId('board-view')).toBeVisible();

  const statusPill = page.getByTestId(`board-post-status-pill-${postId}`);
  const attachmentIndicator = page.getByTestId(`board-post-attachment-indicator-${postId}`);
  const dateCell = page.getByTestId(`board-post-date-${postId}`);

  await expect(statusPill).toBeVisible();
  await expect(attachmentIndicator).toBeVisible();
  await expect(dateCell).toBeVisible();

  const statusBox = await statusPill.boundingBox();
  const attachmentBox = await attachmentIndicator.boundingBox();
  const dateBox = await dateCell.boundingBox();

  expect(statusBox).not.toBeNull();
  expect(attachmentBox).not.toBeNull();
  expect(dateBox).not.toBeNull();

  const statusRight = statusBox!.x + statusBox!.width;
  const attachmentRight = attachmentBox!.x + attachmentBox!.width;

  expect(attachmentBox!.x).toBeGreaterThanOrEqual(statusRight - 1);
  expect(attachmentRight).toBeLessThanOrEqual(dateBox!.x - 4);
});

test('mobile chat uses Enter for a newline and sends only from the send button', async ({ page }) => {
  await mockSupabase(page, {
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-1',
        name: '모바일 채팅방',
        type: 'group',
        members: [fakeUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
      },
    ],
    messages: [],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-1',
    },
  });

  await page.goto('/main?open_menu=채팅');
  await expect(page.getByTestId('chat-view')).toBeVisible();

  const composer = page.getByTestId('chat-message-input');
  await composer.fill('모바일 첫줄');
  await composer.press('Enter');
  await composer.type('모바일 둘째줄');

  await expect(composer).toHaveValue('모바일 첫줄\n모바일 둘째줄');
  await expect(
    page
      .locator('span.break-words.whitespace-pre-wrap')
      .filter({ hasText: '모바일 첫줄' })
      .filter({ hasText: '모바일 둘째줄' }),
  ).toHaveCount(0);

  await page.getByTestId('chat-send-button').click();

  await expect(
    page
      .locator('span.break-words.whitespace-pre-wrap')
      .filter({ hasText: '모바일 첫줄' }),
  ).toBeVisible();
  await expect(
    page
      .locator('span.break-words.whitespace-pre-wrap')
      .filter({ hasText: '모바일 둘째줄' }),
  ).toBeVisible();
});

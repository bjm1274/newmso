import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
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

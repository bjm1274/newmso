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

const adminUser = {
  ...fakeUser,
  company: 'SY INC.',
  company_id: '99999999-9999-9999-9999-999999999999',
  position: '시스템관리자',
  role: 'admin',
  permissions: {
    ...fakeUser.permissions,
    hr: true,
    inventory: true,
    approval: true,
    admin: true,
    mso: true,
    menu_관리자: true,
    menu_인사관리: true,
  },
};

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('top-level menus switch without runtime errors', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    boardPosts: [
      {
        id: 'post-1',
        board_type: '공지사항',
        title: '통합 점검 공지',
        content: '메뉴 전환 테스트',
        created_at: '2026-03-08T10:00:00.000Z',
        author_id: adminUser.id,
        author_name: adminUser.name,
      },
    ],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [adminUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-1',
        name: '통합 점검 채팅방',
        type: 'group',
        members: [adminUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '점검 메시지',
      },
    ],
    messages: [
      {
        id: 'msg-1',
        room_id: 'room-1',
        sender_id: adminUser.id,
        content: '점검 메시지',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: {
          name: adminUser.name,
          photo_url: null,
        },
      },
    ],
    staffMembers: [adminUser],
    companies: [
      {
        id: adminUser.company_id,
        name: adminUser.company,
        type: 'mso',
        is_active: true,
      },
      {
        id: fakeUser.company_id,
        name: fakeUser.company,
        type: 'hospital',
        is_active: true,
      },
    ],
  });

  await seedSession(page, { user: adminUser });
  await page.goto('/main');

  await expect(page.getByTestId('main-shell')).toBeVisible();

  await page.getByTestId('sidebar-menu-home').click();
  await expect(page.getByTestId('mypage-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-extra').click();
  await expect(page.getByTestId('extra-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-chat').click();
  await expect(page.getByTestId('chat-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-board').click();
  await expect(page.getByTestId('board-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-approval').click();
  await expect(page.getByTestId('approval-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-hr').click();
  await expect(page.getByTestId('hr-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-inventory').click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-admin').click();
  await expect(page.getByTestId('admin-view')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('notification routing opens the expected destination without runtime errors', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [adminUser],
    notifications: [
      {
        id: 'noti-message',
        user_id: adminUser.id,
        type: 'message',
        title: '새 채팅',
        body: '채팅방으로 이동',
        metadata: { room_id: 'room-1' },
        created_at: '2026-03-08T10:05:00.000Z',
        read_at: null,
      },
      {
        id: 'noti-approval',
        user_id: adminUser.id,
        type: 'approval',
        title: '결재 요청',
        body: '전자결재로 이동',
        metadata: {},
        created_at: '2026-03-08T10:04:00.000Z',
        read_at: null,
      },
      {
        id: 'noti-board',
        user_id: adminUser.id,
        type: 'board',
        title: '게시판 알림',
        body: '게시판으로 이동',
        metadata: {},
        created_at: '2026-03-08T10:03:00.000Z',
        read_at: null,
      },
      {
        id: 'noti-inventory',
        user_id: adminUser.id,
        type: 'inventory',
        title: '재고 알림',
        body: '재고관리로 이동',
        metadata: {},
        created_at: '2026-03-08T10:02:00.000Z',
        read_at: null,
      },
    ],
    boardPosts: [
      {
        id: 'post-1',
        board_type: '공지사항',
        title: '통합 점검 공지',
        content: '알림 라우팅 테스트',
        created_at: '2026-03-08T10:00:00.000Z',
        author_id: adminUser.id,
        author_name: adminUser.name,
      },
    ],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [adminUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-1',
        name: '알림 채팅방',
        type: 'group',
        members: [adminUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: '알림 메시지',
      },
    ],
    messages: [
      {
        id: 'msg-1',
        room_id: 'room-1',
        sender_id: adminUser.id,
        content: '알림 메시지',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: {
          name: adminUser.name,
          photo_url: null,
        },
      },
    ],
  });

  await seedSession(page, { user: adminUser });
  await page.goto('/main');
  const desktopBell = page.getByTestId('desktop-sidebar').getByTestId('notification-bell');

  await desktopBell.click();
  await page.getByTestId('notification-item-noti-message').click();
  await expect(page.getByTestId('chat-view')).toBeVisible();

  await desktopBell.click();
  await page.getByTestId('notification-item-noti-approval').click();
  await expect(page.getByTestId('approval-view')).toBeVisible();

  await desktopBell.click();
  await page.getByTestId('notification-item-noti-board').click();
  await expect(page.getByTestId('board-view')).toBeVisible();

  await desktopBell.click();
  await page.getByTestId('notification-item-noti-inventory').click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

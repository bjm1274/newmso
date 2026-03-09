import { expect, test } from '@playwright/test';
import {
  buildSessionCookieHeader,
  dismissDialogs,
  fakeUser,
  mockSupabase,
  seedSession,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('root route shows the login form', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');

  await expect(page.locator('input[type="text"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button').first()).toBeVisible();
});

test('login route shows the dedicated login page', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/login');

  await expect(page.getByTestId('login-page')).toBeVisible();
  await expect(page.getByTestId('login-form')).toBeVisible();
  await expect(page.getByTestId('login-id-input')).toBeVisible();
  await expect(page.getByTestId('login-password-input')).toBeVisible();
});

test('login route redirects to main when a session already exists', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);

  await page.goto('/login');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('main-shell')).toBeVisible();
});

test('login submission navigates to the main shell', async ({ page }) => {
  await mockSupabase(page);
  const cookieHeader = await buildSessionCookieHeader(fakeUser);
  await page.route('**/api/auth/master-login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'set-cookie': cookieHeader,
      },
      body: JSON.stringify({
        success: true,
        user: fakeUser,
      }),
    });
  });

  await page.goto('/login');
  await page.getByTestId('login-id-input').fill('master');
  await page.getByTestId('login-password-input').fill('password');
  await page.getByTestId('login-submit-button').click();

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('main-shell')).toBeVisible();
});

test('main route redirects to root when no session exists', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/main');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('desktop main shell loads with a seeded session', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);

  await page.goto('/main');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('main-shell')).toBeVisible();
  await expect(page.getByTestId('desktop-sidebar')).toBeVisible();
  await expect(page.getByTestId('sidebar-menu-home')).toBeVisible();
});

test('chat view opens from the main menu routing state', async ({ page }) => {
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
        name: '테스트 채팅방',
        type: 'group',
        members: [fakeUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: 'hello chat',
      },
    ],
    messages: [
      {
        id: 'msg-1',
        room_id: 'room-1',
        sender_id: fakeUser.id,
        content: 'hello chat',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: {
          name: fakeUser.name,
          photo_url: null,
        },
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_chat_last_room: 'room-1',
    },
  });

  await page.goto('/main?open_menu=채팅');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('chat-view')).toBeVisible();
});

test('chat can send a message and render it immediately', async ({ page }) => {
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
        name: '테스트 채팅방',
        type: 'group',
        members: [fakeUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: 'hello chat',
      },
    ],
    messages: [
      {
        id: 'msg-1',
        room_id: 'room-1',
        sender_id: fakeUser.id,
        content: 'hello chat',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: {
          name: fakeUser.name,
          photo_url: null,
        },
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_chat_last_room: 'room-1',
    },
  });

  await page.goto('/main?open_menu=채팅');
  await page.getByTestId('chat-message-input').fill('새 메시지');
  await page.getByTestId('chat-send-button').click();

  await expect(page.locator('span.break-words.whitespace-pre-wrap').filter({ hasText: '새 메시지' })).toBeVisible();
});

test('chat retries a failed message send from the bubble', async ({ page }) => {
  await mockSupabase(page, {
    messageInsertFailures: 1,
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
        name: '테스트 채팅방',
        type: 'group',
        members: [fakeUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T10:00:00.000Z',
        last_message_preview: 'hello chat',
      },
    ],
    messages: [],
  });
  await seedSession(page, {
    localStorage: {
      erp_chat_last_room: 'room-1',
    },
  });

  await page.goto('/main?open_menu=채팅');
  await page.getByTestId('chat-message-input').fill('재전송 메시지');
  await page.getByTestId('chat-send-button').click();

  await expect(page.getByText('전송 실패')).toBeVisible();
  await page.getByRole('button', { name: '재전송' }).click();

  await expect(page.locator('span.break-words.whitespace-pre-wrap').filter({ hasText: '재전송 메시지' })).toBeVisible();
  await expect(page.getByText('전송됨')).toBeVisible();
});

test('board view opens from the main menu routing state', async ({ page }) => {
  await mockSupabase(page, {
    boardPosts: [
      {
        id: 'post-1',
        board_type: '공지사항',
        title: 'E2E Board Post',
        content: 'board smoke test',
        created_at: '2026-03-08T10:00:00.000Z',
        author_id: fakeUser.id,
        author_name: fakeUser.name,
      },
    ],
  });
  await seedSession(page);

  await page.goto(`/main?${new URLSearchParams({ open_menu: '게시판' }).toString()}`);

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('board-view')).toBeVisible();
});

test('approval view opens from notification routing state', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);

  await page.goto('/main?open_menu=전자결재');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('approval-view')).toBeVisible();
});

test('inventory view opens from the main menu routing state', async ({ page }) => {
  await mockSupabase(page, {
    chatRooms: [],
  });
  await seedSession(page);

  await page.goto(`/main?${new URLSearchParams({ open_menu: '재고관리' }).toString()}`);

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('inventory-view')).toBeVisible();
});

test('payroll view opens through HR menu state', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '인사관리',
      erp_last_subview: '급여',
      erp_hr_tab: '급여',
    },
  });

  await page.goto('/main?open_menu=인사관리');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('payroll-view')).toBeVisible();
});

test('hr workspace navigation switches between the new grouped menus', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '인사관리',
      erp_hr_tab: '구성원',
      erp_hr_workspace: '인력관리',
    },
  });

  await page.goto('/main?open_menu=인사관리');

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByRole('button', { name: '인력관리' })).toBeVisible();
  await expect(page.getByRole('button', { name: '근태 · 급여' })).toBeVisible();
  await expect(page.getByRole('button', { name: '복지 · 문서' })).toBeVisible();

  await page.getByRole('button', { name: '근태 · 급여' }).click();
  await page.getByRole('button', { name: '💰 급여' }).click();

  await expect(page.getByTestId('payroll-view')).toBeVisible();
});

test('admin view opens for an MSO session', async ({ page }) => {
  const adminUser = {
    ...fakeUser,
    company: 'SY INC.',
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
    },
    role: 'admin',
  };
  await mockSupabase(page, {
    staffMembers: [adminUser],
  });
  await seedSession(page, {
    user: adminUser,
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '관리자' }).toString()}`);

  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId('admin-view')).toBeVisible();
});

test('shift created in company manager is selectable for a new staff member in the same company', async ({ page }) => {
  const adminUser = {
    ...fakeUser,
    company: 'SY INC.',
    company_id: 'mso-company-id',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      mso: true,
      admin: true,
      menu_관리자: true,
      menu_인사관리: true,
    },
    role: 'admin',
  };

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
      { id: 'hospital-2', name: '수연의원', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    workShifts: [],
    orgTeams: [
      { company_name: '박철홍정형외과', team_name: '외래팀', division: '진료부' },
      { company_name: '수연의원', team_name: '외래팀', division: '진료부' },
      { company_name: 'SY INC.', team_name: '인사팀', division: '경영지원' },
    ],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_subview: '회사관리',
    },
  });

  await page.goto('/main?open_menu=관리자');
  await page.getByRole('button', { name: '근무형태' }).click();
  await page.getByTestId('shift-create-button').click();

  await expect(page.getByTestId('shift-modal')).toBeVisible();
  await expect(page.getByTestId('shift-company-박철홍정형외과')).not.toBeChecked();
  await expect(page.getByTestId('shift-company-수연의원')).not.toBeChecked();

  await page.getByTestId('shift-name-input').fill('수연의원-데이');
  await page.getByTestId('shift-company-수연의원').check();
  await page.getByTestId('shift-save-button').click();

  await expect(page.getByText('수연의원-데이')).toBeVisible();

  await page.getByRole('button', { name: '👥 인사관리' }).click();
  await expect(page.getByTestId('new-staff-button')).toBeVisible();
  await page.getByTestId('new-staff-button').click();
  await page.getByRole('button', { name: '🏢 소속/근무' }).click();
  await page.getByTestId('new-staff-company-select').selectOption('수연의원');

  const shiftSelect = page.getByTestId('new-staff-shift-select');
  await expect(shiftSelect.locator('option', { hasText: '수연의원-데이' })).toHaveCount(1);
});

test('notification dropdown opens and clicking an approval notification navigates correctly', async ({ page }) => {
  await mockSupabase(page, {
    notifications: [
      {
        id: 'noti-approval-1',
        user_id: fakeUser.id,
        type: 'approval',
        title: 'Approval Request',
        body: 'Please review the approval document.',
        created_at: '2026-03-08T10:00:00.000Z',
        read_at: null,
        metadata: {},
      },
    ],
  });
  await seedSession(page);

  await page.goto('/main');
  await page.getByTestId('desktop-sidebar').getByTestId('notification-bell').click();

  await expect(page.getByTestId('notification-dropdown')).toBeVisible();
  await expect(page.getByText('Approval Request')).toBeVisible();
  await page.getByTestId('notification-item-noti-approval-1').click();

  await expect(page.getByTestId('approval-view')).toBeVisible();
});

test('notification dropdown routes message notifications to chat', async ({ page }) => {
  await mockSupabase(page, {
    notifications: [
      {
        id: 'noti-message-1',
        user_id: fakeUser.id,
        type: 'message',
        title: 'Chat Alert',
        body: 'Open the chat room.',
        created_at: '2026-03-08T10:00:00.000Z',
        read_at: null,
        metadata: {
          room_id: '00000000-0000-0000-0000-000000000000',
        },
      },
    ],
  });
  await seedSession(page);

  await page.goto('/main');
  await page.getByTestId('desktop-sidebar').getByTestId('notification-bell').click();
  await page.getByTestId('notification-item-noti-message-1').click();

  await expect(page.getByTestId('chat-view')).toBeVisible();
});

test('notification dropdown routes board notifications to board view', async ({ page }) => {
  await mockSupabase(page, {
    notifications: [
      {
        id: 'noti-board-1',
        user_id: fakeUser.id,
        type: 'board',
        title: 'Board Update',
        body: 'Open the board page.',
        created_at: '2026-03-08T10:00:00.000Z',
        read_at: null,
        metadata: {},
      },
    ],
  });
  await seedSession(page);

  await page.goto('/main');
  await page.getByTestId('desktop-sidebar').getByTestId('notification-bell').click();
  await page.getByTestId('notification-item-noti-board-1').click();

  await expect(page.getByTestId('board-view')).toBeVisible();
});

test('service worker asset is served', async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/sw.js`);
  const contentType = response.headers()['content-type'];

  expect(response.ok()).toBeTruthy();
  expect(contentType).toContain('javascript');
});

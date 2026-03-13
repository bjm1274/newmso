import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('manual-style menu walkthrough stays free of console and page errors', async ({ page }) => {
  test.setTimeout(90_000);
  const auditUser = {
    ...fakeUser,
    employee_no: 'bjm127',
    role: 'admin',
    permissions: {
      ...fakeUser.permissions,
      admin: true,
      system_master: true,
      menu_관리자: true,
      admin_회사관리: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [auditUser],
    notifications: [
      {
        id: 'manual-audit-notification',
        user_id: '11111111-1111-1111-1111-111111111111',
        type: 'notification',
        title: '수동 점검 알림',
        body: '메뉴 점검 중',
        read_at: null,
        created_at: '2026-03-12T09:00:00.000Z',
      },
    ],
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
        id: 'manual-audit-room',
        name: '점검 채팅방',
        type: 'group',
        members: ['11111111-1111-1111-1111-111111111111'],
        created_at: '2026-03-12T09:00:00.000Z',
        last_message_at: '2026-03-12T09:00:00.000Z',
        last_message_preview: '점검용 메시지',
      },
    ],
    messages: [
      {
        id: 'manual-audit-message',
        room_id: 'manual-audit-room',
        sender_id: '11111111-1111-1111-1111-111111111111',
        sender_name: 'E2E Tester',
        content: '점검용 메시지',
        created_at: '2026-03-12T09:00:00.000Z',
        is_deleted: false,
        staff: { name: 'E2E Tester', photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    user: auditUser,
    localStorage: {
      erp_last_menu: '\uB0B4\uC815\uBCF4',
      erp_permission_prompt_shown: '1',
    },
  });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  await page.getByTestId('sidebar-menu-home').click();
  await expect(page.getByTestId('mypage-view')).toBeVisible();
  await page.getByRole('button', { name: '\uAE09\uC5EC\u00B7\uC99D\uBA85\uC11C' }).click();
  await page.getByRole('button', { name: '\uC6D4\uBCC4 \uC815\uC0B0 \uCE74\uB4DC' }).click();
  await expect(page.getByTestId('mypage-salary-tab')).toBeVisible();

  await page.getByTestId('sidebar-menu-chat').click();
  await expect(page.getByTestId('chat-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-board').click();
  await expect(page.getByTestId('board-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-approval').click();
  await expect(page.getByTestId('approval-view')).toBeVisible();

  await page.getByTestId('sidebar-menu-hr').click();
  await expect(page.getByTestId('hr-view')).toBeVisible();
  await page.getByTestId('hr-view').getByRole('button', { name: /\uAD50\uC721/ }).click();
  await expect(page.getByText(/Compliance/)).toBeVisible();

  await page.getByTestId('sidebar-menu-inventory').click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  await page.goto('/main?open_menu=%EA%B4%80%EB%A6%AC%EC%9E%90&open_subview=%ED%9A%8C%EC%82%AC%EA%B4%80%EB%A6%AC');
  await expect(page.getByTestId('admin-view')).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

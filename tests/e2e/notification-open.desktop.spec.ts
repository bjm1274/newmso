import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('notification center all notifications opens notifications view directly', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [fakeUser],
    notifications: [
      {
        id: 'notification-open-1',
        user_id: fakeUser.id,
        type: 'attendance',
        title: '출퇴근 알림',
        body: '알림 메뉴 이동 확인',
        read_at: null,
        created_at: '2026-03-21T09:00:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: fakeUser,
  });

  await page.goto('/main');
  const desktopSidebar = page.getByTestId('desktop-sidebar');
  const notificationBell = desktopSidebar.getByTestId('notification-bell');
  await expect(notificationBell).toBeVisible();

  await notificationBell.click();
  await expect(page.getByTestId('notification-dropdown')).toBeVisible();

  await page.getByRole('button', { name: '전체 알림 보기' }).click();
  await expect(page.getByTestId('notifications-view')).toBeVisible();
  await expect(page.getByText('출퇴근 알림')).toBeVisible();
});

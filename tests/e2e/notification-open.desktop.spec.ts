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

test('approval notifications in the inbox open the linked approval detail', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [fakeUser],
    approvals: [
      {
        id: 'approval-from-notification-1',
        type: '일반기안',
        title: '알림에서 연 결재 문서',
        content: '알림을 눌렀을 때 상세 문서가 열려야 합니다.',
        sender_id: 'approval-sender-1',
        sender_name: '기안자',
        sender_company: fakeUser.company,
        company_id: fakeUser.company_id,
        current_approver_id: fakeUser.id,
        approver_line: [fakeUser.id],
        status: '대기',
        created_at: '2026-03-21T09:10:00.000Z',
        meta_data: {},
      },
    ],
    notifications: [
      {
        id: 'notification-approval-open-1',
        user_id: fakeUser.id,
        type: 'approval',
        title: '결재 차례가 되었습니다',
        body: '해당 문서를 바로 열어주세요.',
        read_at: null,
        created_at: '2026-03-21T09:20:00.000Z',
        metadata: {
          approval_id: 'approval-from-notification-1',
          approval_view: '결재함',
        },
      },
    ],
  });

  await seedSession(page, {
    user: fakeUser,
  });

  await page.goto('/main?open_menu=알림');
  await expect(page.getByTestId('notifications-view')).toBeVisible();

  await page.getByText('결재 차례가 되었습니다').click();

  await expect(page.getByTestId('approval-view')).toBeVisible();
  const approvalDetailModal = page.getByTestId('approval-detail-modal');
  await expect(approvalDetailModal).toBeVisible();
  await expect(approvalDetailModal.getByRole('heading', { name: '알림에서 연 결재 문서' })).toBeVisible();
});

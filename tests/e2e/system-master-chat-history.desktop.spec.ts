import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const systemMasterUser = {
  ...fakeUser,
  id: '9999',
  employee_no: 'MASTER-9999',
  name: 'System Master',
  company: 'SY INC.',
  role: 'admin',
  permissions: {
    ...(fakeUser.permissions || {}),
    mso: true,
    system_master: true,
    menu_관리자: true,
    admin_시스템마스터센터: true,
  },
};

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('system master chat history keeps deleted messages visible with original content', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [systemMasterUser],
    notifications: [],
  });

  await page.route('**/api/admin/system-master?*', async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get('scope') || 'overview';

    if (scope === 'overview') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            staffCount: 1,
            auditCount: 0,
            payrollCount: 0,
            roomCount: 1,
            messageCount: 1,
          },
          recentAudits: [],
          recentPayrolls: [],
          sensitiveStaffs: [],
        }),
      });
    }

    if (scope === 'chats') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rooms: [
            {
              id: 'room-deleted-history',
              room_label: '삭제이력 채팅방',
              member_labels: ['System Master', 'Chat Peer'],
            },
          ],
          messages: [
            {
              id: 'msg-deleted-history',
              room_id: 'room-deleted-history',
              room_label: '삭제이력 채팅방',
              sender_name: 'Chat Peer',
              sender_company: 'SY INC.',
              content: '삭제된 메시지 원문이 그대로 남아 있어야 합니다.',
              file_url: 'https://example.com/deleted-message.txt',
              created_at: '2026-04-13T09:00:00.000Z',
              edited_at: null,
              is_deleted: true,
            },
          ],
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await seedSession(page, {
    user: systemMasterUser,
  });

  await page.goto('/main?open_menu=관리자&open_subview=시스템마스터센터');
  await expect(page.getByTestId('admin-view')).toBeVisible();
  await expect(page.getByTestId('system-master-center')).toBeVisible();

  await page.getByRole('button', { name: '전체채팅' }).click();
  await expect(page.getByRole('heading', { name: '전 직원 채팅 대화 열람' })).toBeVisible();

  const row = page.locator('tbody tr').filter({
    hasText: '삭제된 메시지 원문이 그대로 남아 있어야 합니다.',
  }).first();

  await expect(row).toBeVisible();
  await expect(row).toContainText('삭제이력 채팅방');
  await expect(row).toContainText('Chat Peer');
  await expect(row).toContainText('첨부 보기');
  await expect(row).not.toContainText('삭제 처리');
});

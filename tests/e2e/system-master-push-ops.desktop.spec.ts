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

test('system master operations dashboard shows push diagnostics and QA checklist', async ({ page }) => {
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
            roomCount: 0,
            messageCount: 0,
          },
          recentAudits: [],
          recentPayrolls: [],
          sensitiveStaffs: [],
        }),
      });
    }

    if (scope === 'operations') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkedAt: '2026-03-31T12:00:00.000Z',
          queue: {
            pending: 2,
            ready: 1,
            retrying: 1,
            deadLettered: 0,
            inFlight: 0,
            migrationReady: true,
          },
          subscriptions: {
            total: 8,
            nullStaff: 0,
            orphan: 0,
            duplicateEndpointGroups: 0,
            duplicateRows: 0,
            fcmEnabled: 5,
            webPushOnly: 3,
            placeholderEndpoints: 1,
            platformSummary: [
              { platform: 'ios-webapp', count: 3 },
              { platform: 'android', count: 3 },
              { platform: 'web', count: 2 },
            ],
            recentSubscriptions: [
              {
                id: 'sub-1',
                platform: 'ios-webapp',
                has_fcm: true,
                created_at: '2026-03-31T11:58:00.000Z',
              },
            ],
          },
          pushFailures: {
            total: 2,
            summary: [
              { error: 'web-push-disabled', count: 1 },
              { error: 'no-active-subscriptions', count: 1 },
            ],
            recent: [],
          },
          recentBackups: [],
          latestBackup: null,
          restoreRuns: [],
          cronJobs: [],
          usageSummary: [],
          todoAutomation: {
            dueReminders: 0,
            repeatingOpenTodos: 0,
            reminderLogs24h: 0,
          },
          wiki: {
            documents: 0,
            versions: 0,
            recentVersions: [],
          },
          failureItems: [],
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
  await page.getByRole('button', { name: '시스템마스터센터' }).click();
  await expect(page.getByTestId('system-master-center')).toBeVisible();

  await page.getByRole('button', { name: '운영대시보드' }).click();

  const diagnosticsCard = page.getByTestId('system-master-push-diagnostics');
  await expect(diagnosticsCard).toBeVisible();
  await expect(diagnosticsCard).toContainText('FCM 연결');
  await expect(diagnosticsCard).toContainText('iPhone 설치형');
  await expect(diagnosticsCard).toContainText('web-push-disabled');
  await expect(page.getByText('실기기 QA 체크리스트')).toBeVisible();
});

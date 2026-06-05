import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

function buildSubMenuTestId(mainMenuId: string, subMenuId: string) {
  const slug = `${mainMenuId}-${subMenuId}`
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      const isAsciiLetter =
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      return isAsciiLetter ? char.toLowerCase() : `u${code.toString(16)}`;
    })
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `submenu-${slug}`;
}

async function openAdminSubMenu(page: Page, subMenuId: string) {
  const locator = page.locator(`[data-testid="${buildSubMenuTestId('관리자', subMenuId)}"]:visible`).first();
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await expect(page.getByTestId('admin-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('admin sidebar walkthrough opens each submenu in order without runtime errors', async ({ page }) => {
  test.setTimeout(120_000);

  const adminUser = {
    ...fakeUser,
    id: 'bjm127',
    employee_no: 'bjm127',
    name: 'System Master Admin',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    role: 'admin',
    permissions: {
      ...fakeUser.permissions,
      admin: true,
      mso: true,
      system_master: true,
      menu_관리자: true,
    },
  };

  await page.route('**/api/admin/system-master**', async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get('scope');

    if (scope === 'overview') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            staffCount: 12,
            auditCount: 34,
            payrollCount: 22,
            roomCount: 4,
            messageCount: 128,
          },
          staffs: [],
          payrolls: [],
          audits: [],
        }),
      });
      return;
    }

    if (scope === 'audit') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ logs: [] }),
      });
      return;
    }

    if (scope === 'chats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rooms: [], messages: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/api/admin/verify-unlock', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
      { id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
    ],
    orgTeams: [
      {
        id: 'org-team-1',
        company_id: 'hospital-1',
        company: '박철홍정형외과',
        name: '외래팀',
        division: '진료부',
      },
    ],
    inventoryItems: [
      {
        id: 'inventory-1',
        item_name: '거즈',
        quantity: 12,
        stock: 12,
        min_quantity: 4,
        company: 'SY INC.',
        department: '경영지원팀',
        created_at: '2026-03-16T09:00:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_menu: '관리자',
      erp_last_subview: 'exec',
      erp_admin_subview: 'exec',
      erp_permission_prompt_shown: '1',
    },
  });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource') || text.includes('serviceWorker') || text.includes('Service Worker')) return;
    consoleErrors.push(text);
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/main?open_menu=관리자&open_subview=exec');
  await expect(page.getByTestId('admin-view')).toBeVisible();

  await openAdminSubMenu(page, 'exec');
  await expect(page.getByRole('tab', { name: '개요' })).toBeVisible();
  await page.getByRole('tab', { name: '경영 대시보드' }).click();
  await page.getByRole('tab', { name: '재무 대시보드' }).click();
  await page.getByRole('tab', { name: '예산 관리' }).click();
  await page.getByRole('tab', { name: '통합 보고서' }).click();
  await page.getByRole('tab', { name: '법인 손익' }).click();
  await page.getByRole('tab', { name: '커스텀 대시보드' }).click();

  await openAdminSubMenu(page, 'company');
  await expect(page.getByTestId('company-manager-view')).toBeVisible();
  await expect(page.getByTestId('team-manager-view')).toBeVisible();
  await page.getByTestId('company-manager-tab-company').click();
  await expect(page.getByTestId('company-manager-view')).toBeVisible();

  await openAdminSubMenu(page, 'roles');
  await expect(page.getByTestId('staff-permission-view')).toBeVisible();

  await openAdminSubMenu(page, 'ops');
  await expect(page.getByRole('tab', { name: '알림 자동화' })).toBeVisible();
  await page.getByRole('tab', { name: '수술·검사 템플릿' }).click();
  await page.getByRole('tab', { name: '팝업 관리' }).click();

  await openAdminSubMenu(page, 'forms');
  await expect(page.getByRole('heading', { name: '결재 양식' })).toBeVisible();

  await openAdminSubMenu(page, 'audit');
  await expect(page.getByRole('tab', { name: '감사 로그' })).toBeVisible();
  await page.getByRole('tab', { name: '이상 감지' }).click();
  await page.getByRole('tab', { name: '급여 이상치' }).click();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

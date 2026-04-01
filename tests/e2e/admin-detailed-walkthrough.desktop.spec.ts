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
  const locator = page.getByTestId(buildSubMenuTestId('관리자', subMenuId));
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
      erp_last_subview: '경영분석',
      erp_admin_subview: '경영분석',
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

  await page.goto('/main?open_menu=관리자&open_subview=경영분석');
  await expect(page.getByTestId('admin-view')).toBeVisible();

  await openAdminSubMenu(page, '경영분석');
  await expect(page.getByTestId('admin-analysis-tab-bar')).toBeVisible();
  for (const index of [0, 1, 2, 3, 4]) {
    await page.getByTestId(`admin-analysis-tab-${index}`).click();
  }

  await openAdminSubMenu(page, '회사관리');
  await expect(page.getByTestId('company-manager-view')).toBeVisible();
  await page.getByTestId('company-manager-tab-team').click();
  await expect(page.getByTestId('team-manager-view')).toBeVisible();
  await page.getByTestId('company-manager-tab-company').click();
  await expect(page.getByTestId('company-manager-view')).toBeVisible();

  await openAdminSubMenu(page, '직원권한');
  await expect(page.getByTestId('staff-permission-view')).toBeVisible();

  await openAdminSubMenu(page, '운영설정');
  await expect(page.getByTestId('admin-operations-tab-bar')).toBeVisible();
  await page.getByTestId('admin-operations-tab-0').click();
  await expect(page.getByRole('heading', { name: '알림 자동화' })).toBeVisible();
  await page.getByTestId('admin-operations-tab-1').click();
  await expect(page.getByRole('heading', { name: '수술 · 검사명 템플릿 관리' })).toBeVisible();
  await page.getByTestId('admin-operations-tab-2').click();
  await expect(page.getByRole('heading', { name: '홈페이지 팝업 설정' })).toBeVisible();

  await openAdminSubMenu(page, '문서양식');
  await expect(page.getByRole('heading', { name: '기본양식 관리' })).toBeVisible();

  await openAdminSubMenu(page, '엑셀등록');
  await expect(page.getByRole('heading', { name: '엑셀 일괄 등록' })).toBeVisible();

  await openAdminSubMenu(page, '데이터백업');
  await expect(page.getByRole('heading', { name: '데이터 백업' })).toBeVisible();

  await openAdminSubMenu(page, '데이터초기화');
  await expect(page.getByRole('heading', { name: '시스템 보안 인증' })).toBeVisible();
  await page.getByPlaceholder('••••••').fill('qkrcjfghd!!');
  await page.getByRole('button', { name: '보안 잠금 해제' }).click();
  await expect(page.getByRole('heading', { name: '통합 데이터 초기화 관리' })).toBeVisible();

  await openAdminSubMenu(page, '감사센터');
  await expect(page.getByTestId('admin-audit-tab-bar')).toBeVisible();
  await page.getByTestId('admin-audit-tab-0').click();
  await page.getByTestId('admin-audit-tab-1').click();
  await page.getByTestId('admin-audit-tab-2').click();
  await expect(page.getByTestId('salary-anomaly-detector')).toBeVisible();

  await openAdminSubMenu(page, '시스템마스터센터');
  await expect(page.getByTestId('system-master-center')).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

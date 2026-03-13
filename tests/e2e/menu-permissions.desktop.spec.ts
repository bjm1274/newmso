import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('explicit menu permissions override legacy broad admin flags', async ({ page }) => {
  const explicitlyLockedUser = {
    ...fakeUser,
    id: 'locked-user-1',
    employee_no: 'LOCK-001',
    name: 'Explicit Lock User',
    role: 'staff',
    permissions: {
      ...fakeUser.permissions,
      admin: true,
      mso: true,
      approval: true,
      hr: true,
      inventory: true,
      ['menu_추가기능']: false,
      ['menu_게시판']: false,
      ['menu_전자결재']: false,
      ['menu_인사관리']: false,
      ['menu_재고관리']: false,
      ['menu_관리자']: false,
    },
  };

  await mockSupabase(page, {
    staffMembers: [explicitlyLockedUser],
    companies: [
      {
        id: explicitlyLockedUser.company_id,
        name: explicitlyLockedUser.company,
        type: 'hospital',
        is_active: true,
      },
    ],
  });
  await seedSession(page, { user: explicitlyLockedUser });

  await page.goto('/main');

  await expect(page.getByTestId('sidebar-menu-home')).toBeVisible();
  await expect(page.getByTestId('sidebar-menu-chat')).toBeVisible();
  await expect(page.getByTestId('sidebar-menu-extra')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-menu-board')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-menu-approval')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-menu-hr')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-menu-inventory')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-menu-admin')).toHaveCount(0);
});

test('explicit admin detail permissions override the legacy admin flag', async ({ page }) => {
  const partiallyLockedAdminUser = {
    ...fakeUser,
    id: 'locked-user-2',
    employee_no: 'LOCK-002',
    name: 'Scoped Admin User',
    role: 'staff',
    permissions: {
      ...fakeUser.permissions,
      admin: true,
      ['menu_관리자']: true,
      ['admin_회사관리']: true,
      ['admin_직원권한']: false,
    },
  };

  await mockSupabase(page, {
    staffMembers: [partiallyLockedAdminUser],
    companies: [
      {
        id: partiallyLockedAdminUser.company_id,
        name: partiallyLockedAdminUser.company,
        type: 'hospital',
        is_active: true,
      },
    ],
  });
  await seedSession(page, { user: partiallyLockedAdminUser });

  await page.goto('/main?open_menu=관리자');

  await expect(page.getByTestId('admin-view')).toBeVisible();
  await expect(page.getByRole('button', { name: '회사 / 조직' })).toBeVisible();
  await expect(page.getByRole('button', { name: '직원 권한' })).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

async function fetchRows<T>(page: Page, path: string): Promise<T[]> {
  return page.evaluate(
    async ({ targetPath }) => {
      const response = await fetch(targetPath, {
        headers: { Accept: 'application/json' },
      });
      return response.json();
    },
    { targetPath: path },
  ) as Promise<T[]>;
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('inventory expiry alerts are deduped for admin recipients across repeated visits', async ({
  page,
}) => {
  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-alert-user',
    name: '재고 담당자',
    company: '박철홍정형외과',
    company_id: 'hospital-1',
    department: '외래팀',
    team: '외래팀',
    permissions: {
      ...fakeUser.permissions,
      inventory: true,
      menu_재고관리: true,
      inventory_현황: true,
    },
  };

  const hanJihye = {
    ...fakeUser,
    id: 'staff-han-jihye',
    name: '한지혜',
    company: '박철홍정형외과',
    company_id: 'hospital-1',
    department: '행정팀',
    team: '행정팀',
    permissions: {
      ...fakeUser.permissions,
    },
  };

  await mockSupabase(page, {
    staffMembers: [inventoryUser, hanJihye],
    companies: [
      { id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
    ],
    orgTeams: [
      {
        id: 'org-team-outpatient',
        company_id: 'hospital-1',
        company: '박철홍정형외과',
        name: '외래팀',
        division: '진료부',
      },
      {
        id: 'org-team-admin',
        company_id: 'hospital-1',
        company: '박철홍정형외과',
        name: '행정팀',
        division: '행정부',
      },
    ],
    inventoryItems: [
      {
        id: 'inventory-expiry-1',
        item_name: '유효기간 테스트 품목',
        quantity: 20,
        stock: 20,
        min_quantity: 5,
        min_stock: 5,
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        department: '외래팀',
        expiry_date: '2026-04-20',
        expiration_date: '2026-04-20',
        supplier_name: '테스트 공급처',
        created_at: '2026-04-06T08:00:00.000Z',
      },
    ],
    notifications: [],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: '재고관리',
      erp_last_subview: '현황',
      erp_permission_prompt_shown: '1',
    },
  });

  const openInventoryView = async (subview: string) => {
    await page.goto(
      `/main?${new URLSearchParams({
        open_menu: '재고관리',
        open_subview: subview,
      }).toString()}`,
    );
    await expect(page.getByTestId('inventory-view')).toBeVisible();
  };

  const fetchNotifications = async () =>
    fetchRows<any>(page, '/rest/v1/notifications?select=*');

  await openInventoryView('현황');
  await expect
    .poll(async () => {
      const rows = await fetchNotifications();
      return rows.filter(
        (row) => row.user_id === hanJihye.id && row.type === 'expiry_alert',
      ).length;
    })
    .toBe(1);

  await openInventoryView('현황');
  await expect
    .poll(async () => {
      const rows = await fetchNotifications();
      return rows.filter(
        (row) => row.user_id === hanJihye.id && row.type === 'expiry_alert',
      ).length;
    })
    .toBe(1);

  await openInventoryView('현황');
  await expect
    .poll(async () => {
      const rows = await fetchNotifications();
      return rows.filter(
        (row) => row.user_id === hanJihye.id && row.type === 'expiry_alert',
      ).length;
    })
    .toBe(1);
});

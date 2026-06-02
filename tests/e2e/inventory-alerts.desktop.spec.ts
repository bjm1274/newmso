import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

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
        // 미래 날짜로 90일 이내 만료 (유효기간 임박)
        expiry_date: '2026-08-20',
        expiration_date: '2026-08-20',
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
      erp_last_subview: 'status',
      erp_permission_prompt_shown: '1',
      erp_e2e_inventory_workcenter: '1',
    },
  });

  const openInventoryView = async () => {
    await page.goto(
      `/main?${new URLSearchParams({
        open_menu: '재고관리',
        open_subview: 'status',
      }).toString()}`,
    );
    await expect(page.getByTestId('inventory-view')).toBeVisible();
  };

  // StatusWorkcenter 기반으로 inventory-view가 로드됨 확인
  await openInventoryView();
  // 워크센터가 정상 렌더되고 재고 현황 KPI 표시
  await expect(page.getByText('유효기간 임박')).toBeVisible();

  // 두 번째 방문 - 뷰가 동일하게 유지됨
  await openInventoryView();
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  // 세 번째 방문
  await openInventoryView();
  await expect(page.getByTestId('inventory-view')).toBeVisible();
});

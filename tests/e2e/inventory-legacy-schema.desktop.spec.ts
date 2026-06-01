import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('approved supply requests load on a legacy inventory schema without department', async ({
  page,
}) => {
  const inventoryOpsUser = {
    ...fakeUser,
    id: 'inventory-ops-user',
    employee_no: 'INV-001',
    name: '재고 담당자',
    company: 'SY INC.',
    company_id: 'sy-inc-company',
    department: '경영지원팀',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      inventory: true,
      menu_재고관리: true,
      inventory_현황: true,
    },
  };
  const consoleErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await mockSupabase(page, {
    staffMembers: [inventoryOpsUser, fakeUser],
    legacyInventoryDepartmentSchema: true,
    inventoryItems: [
      {
        id: 'support-item-1',
        item_name: '거즈',
        quantity: 20,
        stock: 20,
        min_quantity: 5,
        company: 'SY INC.',
      },
    ],
    approvals: [
      {
        id: 'approval-supply-1',
        type: '물품신청',
        status: '승인',
        title: '거즈 요청',
        sender_id: fakeUser.id,
        sender_name: fakeUser.name,
        sender_company: fakeUser.company,
        meta_data: {
          items: [
            {
              name: '거즈',
              qty: 3,
              dept: '외래팀',
              purpose: 'E2E legacy schema test',
            },
          ],
        },
      },
    ],
  });

  await seedSession(page, {
    user: inventoryOpsUser,
    localStorage: {
      erp_e2e_inventory_workcenter: '1',
    },
  });

  // 워크센터로 진입 (status 탭)
  await page.goto(`/main?${new URLSearchParams({ open_menu: '재고관리', open_subview: 'status' }).toString()}`);

  await expect(page.getByTestId('inventory-view')).toBeVisible();

  // StatusWorkcenter KPI row가 표시됨
  await expect(page.getByText('전체 품목')).toBeVisible();

  // '승인된 물품신청 처리 목록 로드 실패' 에러가 콘솔에 없어야 함
  // (legacyInventoryDepartmentSchema=true이더라도 graceful하게 처리됨)
  expect(
    consoleErrors.filter((message) => message.includes('승인된 물품신청 처리 목록 로드 실패')),
  ).toHaveLength(0);
});

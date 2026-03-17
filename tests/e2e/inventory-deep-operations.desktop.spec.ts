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

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    const text = message.text();
    if (
      text.includes('favicon') ||
      text.includes('Failed to load resource') ||
      text.includes('ERR_ABORTED')
    ) {
      return;
    }

    errors.push(`console: ${text}`);
  });

  return errors;
}

async function openInventorySubMenu(page: Page, subMenuId: string) {
  const locator = page.getByTestId(buildSubMenuTestId('재고관리', subMenuId));
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();
}

async function fetchRows<T>(page: Page, path: string) {
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

test('inventory deep operations walkthrough performs create, update, and delete flows', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.addInitScript(() => {
    window.confirm = () => true;
    window.alert = () => undefined;
  });

  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-manager-deep-1',
    employee_no: 'INV-DEEP-001',
    name: '재고 운영 관리자',
    company: '박철홍정형외과',
    company_id: 'hospital-1',
    department: '경영지원팀',
    team: '관리팀',
    position: '팀장',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      inventory: true,
      menu_재고관리: true,
      inventory_현황: true,
      inventory_이력: true,
      inventory_수요예측: true,
      inventory_등록: true,
      inventory_스캔: true,
      inventory_발주: true,
      inventory_재고실사: true,
      inventory_이관: true,
      inventory_물품확인서: true,
      inventory_UDI: true,
      inventory_자산: true,
      inventory_거래처: true,
      inventory_카테고리: true,
      inventory_AS반품: true,
      inventory_소모품통계: true,
    },
  };

  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [inventoryUser],
    companies: [
      { id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
    ],
    orgTeams: [
      {
        id: 'team-management',
        company_id: 'hospital-1',
        company: '박철홍정형외과',
        name: '관리팀',
        division: '경영지원실',
      },
    ],
    suppliers: [
      {
        id: 'supplier-existing-1',
        name: '기존 공급사',
        contact_name: '한기존',
        phone: '010-1111-2222',
        category: '소모품',
        created_at: '2026-03-16T09:00:00.000Z',
      },
    ],
    inventoryCategories: [
      {
        id: 'inventory-category-existing-1',
        name: '기존분류',
        parent_id: null,
        description: '기존 카테고리',
        color: 'bg-blue-500',
      },
    ],
    inventoryItems: [
      {
        id: 'inventory-low-stock-1',
        item_name: 'E2E 거즈',
        quantity: 1,
        stock: 1,
        min_quantity: 5,
        category: '소모품',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        department: '외래팀',
        supplier_name: '기존 공급사',
        unit_price: 1200,
        created_at: '2026-03-16T09:00:00.000Z',
      },
      {
        id: 'inventory-healthy-1',
        item_name: 'E2E 장갑',
        quantity: 20,
        stock: 20,
        min_quantity: 4,
        category: '소모품',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        department: '수술팀',
        supplier_name: '기존 공급사',
        unit_price: 2500,
        created_at: '2026-03-16T09:10:00.000Z',
      },
    ],
    inventoryLogs: [],
    inventoryTransfers: [],
    purchaseOrders: [],
    asRepairRecords: [],
    returnRecords: [],
    approvals: [],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: '재고관리',
      erp_last_subview: '거래처',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '재고관리', open_subview: '거래처' }).toString()}`,
  );
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  await openInventorySubMenu(page, '거래처');
  await expect(page.getByTestId('supplier-management-view')).toBeVisible();

  await page.getByTestId('supplier-add-button').click();
  await expect(page.getByTestId('supplier-modal')).toBeVisible();
  await page.getByTestId('supplier-field-name').fill('E2E 거래처');
  await page.getByTestId('supplier-field-contact-name').fill('김공급');
  await page.getByTestId('supplier-field-phone').fill('010-2222-3333');
  await page.getByTestId('supplier-field-category').fill('의료소모품');
  await page.getByTestId('supplier-save-button').click();
  await expect(page.getByTestId('supplier-row-supplier-2')).toContainText('E2E 거래처');

  await page.getByTestId('supplier-edit-supplier-2').click();
  await page.getByTestId('supplier-field-name').fill('E2E 거래처 수정');
  await page.getByTestId('supplier-save-button').click();
  await expect(page.getByTestId('supplier-row-supplier-2')).toContainText('E2E 거래처 수정');

  await page.getByTestId('supplier-delete-supplier-2').click();
  await expect(page.getByTestId('supplier-row-supplier-2')).toHaveCount(0);

  await expect
    .poll(async () => {
      const rows = await fetchRows<any>(page, '/rest/v1/suppliers?select=*');
      return rows.map((row) => row.name).join(',');
    })
    .toContain('기존 공급사');

  await openInventorySubMenu(page, '카테고리');
  await expect(page.getByTestId('inventory-category-manager-view')).toBeVisible();

  await page.getByTestId('category-add-button').click();
  await expect(page.getByTestId('category-modal')).toBeVisible();
  await page.getByTestId('category-field-name').fill('E2E 카테고리');
  await page.getByTestId('category-field-description').fill('테스트용 분류');
  await page.getByTestId('category-modal').locator('button').last().click();
  await expect(page.getByTestId('category-row-inventory-category-2')).toContainText('E2E 카테고리');

  await page.getByTestId('category-row-inventory-category-2').hover();
  await page.getByTestId('category-edit-inventory-category-2').click();
  await page.getByTestId('category-field-name').fill('E2E 카테고리 수정');
  await page.getByTestId('category-modal').locator('button').last().click();
  await expect(page.getByTestId('category-row-inventory-category-2')).toContainText('E2E 카테고리 수정');

  await page.getByTestId('category-row-inventory-category-2').hover();
  await page.getByTestId('category-delete-inventory-category-2').click();
  await expect(page.getByTestId('category-row-inventory-category-2')).toHaveCount(0);

  await expect
    .poll(async () => {
      const rows = await fetchRows<any>(page, '/rest/v1/inventory_categories?select=*');
      return rows.length;
    })
    .toBe(1);

  await openInventorySubMenu(page, 'AS반품');
  await expect(page.getByTestId('as-return-management-view')).toBeVisible();

  await page.getByTestId('as-record-add-button').click();
  await expect(page.getByTestId('as-record-modal')).toBeVisible();
  await page.getByTestId('as-field-device-name').fill('E2E 내시경');
  await page.getByTestId('as-field-model-name').fill('E2E-SCOPE-1');
  await page.getByTestId('as-field-company-name').fill('메디서비스');
  await page.getByTestId('as-field-manager-name').fill('박수리');
  await page.getByTestId('as-field-problem-description').fill('화면 출력 불량');
  await page.getByTestId('as-save-button').click();
  await expect(page.getByTestId('as-record-row-as-repair-record-1')).toContainText('E2E 내시경');

  await page.getByTestId('as-edit-as-repair-record-1').click();
  await page.getByTestId('as-field-manager-name').fill('박수리 수정');
  await page.getByTestId('as-save-button').click();
  await expect(page.getByTestId('as-record-row-as-repair-record-1')).toContainText('박수리 수정');

  await page.getByTestId('as-delete-as-repair-record-1').click();
  await expect(page.getByTestId('as-record-row-as-repair-record-1')).toHaveCount(0);

  await page.getByTestId('as-return-tab-return').click();
  await page.getByTestId('return-record-add-button').click();
  await expect(page.getByTestId('return-record-modal')).toBeVisible();
  await page.getByTestId('return-field-item-name').fill('E2E 반품 거즈');
  await page.getByTestId('return-field-quantity').fill('4');
  await page.getByTestId('return-field-company-name').fill('메디서비스');
  await page.getByTestId('return-field-reason').fill('포장 훼손');
  await page.getByTestId('return-save-button').click();
  await expect(page.getByTestId('return-record-row-return-record-1')).toContainText('E2E 반품 거즈');

  await page.getByTestId('return-edit-return-record-1').click();
  await page.getByTestId('return-field-quantity').fill('6');
  await page.getByTestId('return-save-button').click();
  await expect(page.getByTestId('return-record-row-return-record-1')).toContainText('6');

  await page.getByTestId('return-delete-return-record-1').click();
  await expect(page.getByTestId('return-record-row-return-record-1')).toHaveCount(0);

  await expect
    .poll(async () => {
      const [asRows, returnRows] = await Promise.all([
        fetchRows<any>(page, '/rest/v1/as_repair_records?select=*'),
        fetchRows<any>(page, '/rest/v1/return_records?select=*'),
      ]);
      return { asCount: asRows.length, returnCount: returnRows.length };
    })
    .toEqual({ asCount: 0, returnCount: 0 });

  await openInventorySubMenu(page, '발주');
  await expect(page.getByTestId('purchase-order-management-view')).toBeVisible();
  await page.getByTestId('purchase-order-auto-generate').click();
  await expect(page.getByTestId('purchase-order-card-purchase-order-1')).toBeVisible();

  await expect
    .poll(async () => {
      const rows = await fetchRows<any>(page, '/rest/v1/purchase_orders?select=*');
      return rows.length;
    })
    .toBe(1);

  await page.getByTestId('purchase-order-approve-purchase-order-1').click();
  await expect
    .poll(async () => {
      const rows = await fetchRows<any>(page, '/rest/v1/purchase_orders?select=*');
      return rows[0]?.status ?? null;
    })
    .toBe('승인');

  expect(runtimeErrors).toEqual([]);
});

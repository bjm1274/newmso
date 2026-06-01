import { expect, test } from '@playwright/test';
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

const INVENTORY_MENU_ID = '재고관리';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('item workcenter displays catalog and registration view', async ({ page }) => {
  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-ecount-user',
    employee_no: 'INV-ECOUNT-001',
    name: 'Ecount Upload Manager',
    company: 'SuyeonMedical',
    company_id: 'company-suyeon',
    department: 'Ops',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      inventory: true,
      ['menu_재고관리']: true,
      ['inventory_등록']: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [inventoryUser],
    companies: [{ id: 'company-suyeon', name: 'SuyeonMedical', type: 'HOSPITAL', is_active: true }],
    inventoryItems: [
      {
        id: 'inventory-item-suyeon-1',
        item_name: 'Test Bandage',
        quantity: 0,
        stock: 0,
        min_quantity: 0,
        category: '의료기기',
        company: 'SuyeonMedical',
        company_id: 'company-suyeon',
        unit: 'EA',
        unit_price: 1500,
        created_at: '2026-04-10T09:00:00.000Z',
      },
    ],
    suppliers: [{ id: 'supplier-a', name: 'Supplier A' }],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: INVENTORY_MENU_ID,
      erp_last_subview: 'item',
      erp_permission_prompt_shown: '1',
      erp_e2e_inventory_workcenter: '1',
    },
  });

  await page.goto('/main?open_menu=재고관리&open_subview=item');
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  // ItemWorkcenter에 물품 카탈로그 탭이 있음
  await expect(page.getByRole('tab', { name: '물품 카탈로그' })).toBeVisible();

  // 카탈로그에 품목이 보임
  await expect(page.getByText('Test Bandage')).toBeVisible();
});

test('item workcenter catalog tab shows item registration button', async ({ page }) => {
  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-upload-visible-user',
    employee_no: 'INV-UPLOAD-001',
    name: 'Inventory Upload Manager',
    company: 'ParkHospital',
    company_id: 'company-park',
    department: 'Ops',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      inventory: true,
      ['menu_재고관리']: true,
      ['inventory_현황']: true,
      ['inventory_등록']: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [inventoryUser],
    companies: [{ id: 'company-park', name: 'ParkHospital', type: 'HOSPITAL', is_active: true }],
    inventoryItems: [
      {
        id: 'inventory-item-park-1',
        item_name: 'Test Gauze',
        quantity: 0,
        stock: 0,
        min_quantity: 0,
        category: '소모품',
        company: 'ParkHospital',
        company_id: 'company-park',
        unit: 'EA',
        unit_price: 1200,
        created_at: '2026-04-10T09:00:00.000Z',
      },
    ],
    suppliers: [],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: INVENTORY_MENU_ID,
      erp_last_subview: 'item',
      erp_permission_prompt_shown: '1',
      erp_e2e_inventory_workcenter: '1',
    },
  });

  await page.goto('/main?open_menu=재고관리&open_subview=item');
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  // ItemWorkcenter에 물품 등록 버튼이 있음
  await expect(page.getByRole('button', { name: '+ 물품 등록', exact: true })).toBeVisible();

  // 물품 카탈로그에 ParkHospital 품목 보임
  await expect(page.getByText('Test Gauze')).toBeVisible();

  // status 탭으로 전환하여 inventory-view가 여전히 보임
  // status 탭으로 이동 (URL)
  await page.goto(`/main?${new URLSearchParams({ open_menu: '재고관리', open_subview: 'status' }).toString()}`);
  await expect(page.getByTestId('inventory-view')).toBeVisible();
  await expect(page.getByText('Test Gauze').first()).toBeVisible();
});

test('item workcenter shows catalog, categories, assets and UDI tabs', async ({ page }) => {
  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-ecount-dedupe-user',
    employee_no: 'INV-ECOUNT-DEDUP-001',
    name: 'Ecount Dedup Manager',
    company: 'SuyeonMedical',
    company_id: 'company-suyeon',
    department: 'Ops',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      inventory: true,
      ['menu_재고관리']: true,
      ['inventory_등록']: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [inventoryUser],
    companies: [{ id: 'company-suyeon', name: 'SuyeonMedical', type: 'HOSPITAL', is_active: true }],
    inventoryItems: [],
    suppliers: [],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: INVENTORY_MENU_ID,
      erp_last_subview: 'item',
      erp_permission_prompt_shown: '1',
      erp_e2e_inventory_workcenter: '1',
    },
  });

  await page.goto('/main?open_menu=재고관리&open_subview=item');
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  // ItemWorkcenter의 4개 탭이 모두 있음 (count 포함되므로 exact: false)
  await expect(page.getByRole('tab', { name: '물품 카탈로그' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '카테고리' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '자산·QR' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'UDI' })).toBeVisible();

  // 각 탭을 순회
  await page.getByRole('tab', { name: '카테고리' }).click();
  await page.getByRole('tab', { name: '자산·QR' }).click();
  await page.getByRole('tab', { name: 'UDI' }).click();
  await page.getByRole('tab', { name: '물품 카탈로그' }).click();

  await expect(page.getByTestId('inventory-view')).toBeVisible();
});

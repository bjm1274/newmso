import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
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

const INVENTORY_MENU_ID = '\uC7AC\uACE0\uAD00\uB9AC';
const INVENTORY_STATUS_SUBMENU_ID = '\uD604\uD669';
const INVENTORY_REGISTRATION_SUBMENU_ID = '\uB4F1\uB85D';

async function openInventoryRegistration(page: import('@playwright/test').Page) {
  await page.goto('/main');
  await page.getByTestId('sidebar-menu-inventory').click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();
  await page.getByTestId(buildSubMenuTestId(INVENTORY_MENU_ID, INVENTORY_REGISTRATION_SUBMENU_ID)).click();
  await expect(page.getByTestId('inventory-registration-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('ecount inventory excel upload maps the template into inventory payloads', async ({ page }) => {
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
      ['menu_\uC7AC\uACE0\uAD00\uB9AC']: true,
      ['inventory_\uB4F1\uB85D']: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [inventoryUser],
    companies: [{ id: 'company-suyeon', name: 'SuyeonMedical', type: 'HOSPITAL', is_active: true }],
    inventoryItems: [],
    suppliers: [{ id: 'supplier-a', name: 'Supplier A' }],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: INVENTORY_MENU_ID,
      erp_last_subview: INVENTORY_REGISTRATION_SUBMENU_ID,
      erp_inventory_view: INVENTORY_REGISTRATION_SUBMENU_ID,
      erp_permission_prompt_shown: '1',
    },
  });

  await openInventoryRegistration(page);
  await page.getByLabel('\uC5D1\uC140 \uC5C5\uB85C\uB4DC').click();
  await page.getByTestId('excel-bulk-mode-inventory-ecount').click();
  await expect(page.getByTestId('inventory-ecount-company-select')).toHaveValue('SuyeonMedical');
  await page.getByTestId('inventory-ecount-department-select').selectOption('Ops');

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      'itemcode',
      'internalitemcode',
      'itemname',
      'spec',
      'unit',
      'packunit',
      'gradename',
      'purchaseprice',
      'saleprice',
      'insurancecode',
      'suppliername',
      'manufacturername',
      'udicode',
      'modelname',
      'reimbursementyn',
      'permitnumber',
      'useyn',
    ],
    [
      '00001',
      'ITEM-INTERNAL-01',
      'Test Bandage',
      '2inch',
      'EA',
      '12EA',
      '',
      1500,
      1800,
      'K7204123',
      'Supplier A',
      'Maker A',
      '08801234567890',
      'BANDAGE-2',
      'YES',
      'PERMIT-001',
      'YES',
    ],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'inventory');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const createRequestPromise = page.waitForRequest(
    (request) => request.url().includes('/inventory') && request.method() === 'POST',
  );

  await page.getByTestId('excel-bulk-upload-input').setInputFiles({
    name: 'ecount-item-upload.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });

  const createRequest = await createRequestPromise;
  const requestBody = createRequest.postDataJSON();
  const payloads = Array.isArray(requestBody) ? requestBody : [requestBody];

  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({
    item_name: 'Test Bandage',
    name: 'Test Bandage',
    company: 'SuyeonMedical',
    department: 'Ops',
    category: '\uC758\uB8CC\uAE30\uAE30',
    quantity: 0,
    stock: 0,
    min_quantity: 0,
    min_stock: 0,
    unit: 'EA',
    spec: '2inch',
    unit_price: 1500,
    price: 1800,
    supplier_name: 'Supplier A',
    supplier_id: 'supplier-a',
    insurance_code: 'K7204123',
    udi_code: '08801234567890',
    is_udi: true,
    item_code: '00001',
    internal_code: 'ITEM-INTERNAL-01',
    product_code: 'ITEM-INTERNAL-01',
    manufacturer_name: 'Maker A',
    manufacturer: 'Maker A',
    model_name: 'BANDAGE-2',
    permit_number: 'PERMIT-001',
    permit_no: 'PERMIT-001',
    pack_unit: '12EA',
    usage_yn: 'YES',
    reimbursement_yn: 'YES',
  });
});

test('excel inventory upload uses the resolved company so uploaded rows appear in inventory status', async ({ page }) => {
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
      ['menu_\uC7AC\uACE0\uAD00\uB9AC']: true,
      ['inventory_\uD604\uD669']: true,
      ['inventory_\uB4F1\uB85D']: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [inventoryUser],
    companies: [{ id: 'company-park', name: 'ParkHospital', type: 'HOSPITAL', is_active: true }],
    inventoryItems: [],
    suppliers: [],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: INVENTORY_MENU_ID,
      erp_last_subview: INVENTORY_REGISTRATION_SUBMENU_ID,
      erp_inventory_view: INVENTORY_REGISTRATION_SUBMENU_ID,
      erp_permission_prompt_shown: '1',
    },
  });

  await openInventoryRegistration(page);
  await page.getByLabel('\uC5D1\uC140 \uC5C5\uB85C\uB4DC').click();
  await page.getByTestId('excel-bulk-mode-inventory-ecount').click();
  await expect(page.getByTestId('inventory-ecount-company-select')).toHaveValue('ParkHospital');
  await page.getByTestId('inventory-ecount-department-select').selectOption('Ops');

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['itemcode', 'itemname', 'unit', 'purchaseprice', 'saleprice', 'suppliername', 'useyn'],
    ['ITEM-001', 'Test Gauze', 'EA', 1200, 1500, 'Supplier A', 'YES'],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'inventory');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  await page.getByTestId('excel-bulk-upload-input').setInputFiles({
    name: 'inventory-upload.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });

  await page.getByTestId(buildSubMenuTestId(INVENTORY_MENU_ID, INVENTORY_STATUS_SUBMENU_ID)).click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();
  await expect(page.getByRole('table').getByText('Test Gauze')).toBeVisible();
  await expect(page.getByRole('table').getByText('ParkHospital')).toBeVisible();
});

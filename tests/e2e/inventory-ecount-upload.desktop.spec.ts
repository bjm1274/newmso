import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('ecount inventory excel upload maps the template into inventory payloads', async ({ page }) => {
  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-ecount-user',
    employee_no: 'INV-ECOUNT-001',
    name: '이카운트 업로드 관리자',
    company: '수연메디칼',
    company_id: 'company-suyeon',
    department: '경영지원팀',
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
    companies: [
      { id: 'company-suyeon', name: '수연메디칼', type: 'HOSPITAL', is_active: true },
    ],
    inventoryItems: [],
    suppliers: [
      { id: 'supplier-interlife', name: '(주)인터라이프' },
    ],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: '재고관리',
      erp_last_subview: '등록',
      erp_inventory_view: '등록',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({
      open_menu: '재고관리',
      open_subview: '등록',
    }).toString()}`,
  );

  await expect(page.getByTestId('inventory-view')).toBeVisible();
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.getByTestId('inventory-registration-view')).toBeVisible();

  await page.getByRole('button', { name: '엑셀 업로드' }).click();
  await expect(page.getByTestId('excel-bulk-upload-trigger')).toBeVisible();

  await page.getByTestId('excel-bulk-mode-inventory-ecount').click();
  await page.getByTestId('inventory-ecount-department-select').selectOption('경영지원팀');

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['회사명 : 수연메디칼'],
    [
      '품목코드',
      '자사품목코드',
      '품목명',
      '규격정보',
      '단위',
      '포장단위',
      '등급명',
      '입고단가',
      '출고단가',
      '요양급여코드',
      '공급처명',
      '제조사명',
      '대표 UDI DI 코드',
      '식약처 모델명',
      '요양급여대상 여부',
      '품목허가번호',
      '사용',
    ],
    [
      '00001',
      'EB붕대 2"',
      '탄력붕대-S (급) /K7204123',
      '2"',
      'EA',
      '12EA',
      '',
      1500,
      1800,
      'K7204123',
      '(주)인터라이프',
      '인터라이프',
      '08801234567890',
      'BANDAGE-2',
      'YES',
      '허가-001',
      'YES',
    ],
    ['2026/04/01 오전 11:30:20'],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, '품목등록');
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
    item_name: '탄력붕대-S (급) /K7204123',
    name: '탄력붕대-S (급) /K7204123',
    company: '수연메디칼',
    department: '경영지원팀',
    category: '의료기기',
    quantity: 0,
    stock: 0,
    min_quantity: 0,
    min_stock: 0,
    unit: 'EA',
    spec: '2"',
    unit_price: 1500,
    price: 1800,
    supplier_name: '(주)인터라이프',
    supplier_id: 'supplier-interlife',
    insurance_code: 'K7204123',
    udi_code: '08801234567890',
    is_udi: true,
    item_code: '00001',
    internal_code: 'EB붕대 2"',
    product_code: 'EB붕대 2"',
    manufacturer_name: '인터라이프',
    manufacturer: '인터라이프',
    model_name: 'BANDAGE-2',
    permit_number: '허가-001',
    permit_no: '허가-001',
    pack_unit: '12EA',
    usage_yn: 'YES',
    reimbursement_yn: 'YES',
  });
});

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

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('inventory walkthrough opens each submenu in order without runtime errors', async ({ page }) => {
  test.setTimeout(150_000);

  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-manager-1',
    employee_no: 'INV-001',
    name: '재고 점검 관리자',
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
      inventory_납품확인서: true,
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
        division: '경영지원부',
      },
      {
        id: 'team-ward',
        company_id: 'hospital-1',
        company: '박철홍정형외과',
        name: '병동팀',
        division: '간호부',
      },
    ],
    inventoryItems: [
      {
        id: 'inventory-item-1',
        item_name: '멸균거즈',
        quantity: 12,
        stock: 12,
        min_quantity: 4,
        category: '소모품',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        department: '외래팀',
        barcode: '880100100001',
        udi_code: '(01)880100100001(17)270101',
        unit_price: 1500,
        created_at: '2026-03-16T09:00:00.000Z',
      },
      {
        id: 'inventory-item-2',
        item_name: '수술장갑',
        quantity: 3,
        stock: 3,
        min_quantity: 5,
        category: '소모품',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        department: '수술팀',
        barcode: '880100100002',
        udi_code: '(01)880100100002(17)270201',
        unit_price: 2500,
        created_at: '2026-03-16T09:10:00.000Z',
      },
      {
        id: 'inventory-item-3',
        item_name: '초음파 프로브',
        quantity: 1,
        stock: 1,
        min_quantity: 1,
        category: '자산',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        department: '검사팀',
        barcode: '880100100003',
        udi_code: '(01)880100100003(17)270301',
        unit_price: 450000,
        created_at: '2026-03-16T09:20:00.000Z',
      },
    ],
    inventoryLogs: [
      {
        id: 'inventory-log-1',
        item_name: '멸균거즈',
        quantity: 5,
        prev_quantity: 7,
        next_quantity: 12,
        change_type: '입고',
        actor_name: '재고 점검 관리자',
        company: '박철홍정형외과',
        created_at: '2026-03-16T10:00:00.000Z',
      },
      {
        id: 'inventory-log-2',
        item_name: '수술장갑',
        quantity: 2,
        prev_quantity: 5,
        next_quantity: 3,
        change_type: '출고',
        actor_name: '재고 점검 관리자',
        company: '박철홍정형외과',
        created_at: '2026-03-16T11:00:00.000Z',
      },
    ],
    inventoryTransfers: [
      {
        id: 'inventory-transfer-1',
        item_id: 'inventory-item-1',
        item_name: '멸균거즈',
        quantity: 2,
        from_company: '박철홍정형외과',
        from_department: '외래팀',
        to_company: '박철홍정형외과',
        to_department: '병동팀',
        actor_name: '재고 점검 관리자',
        reason: '병동 보충',
        created_at: '2026-03-15T09:00:00.000Z',
      },
    ],
    approvals: [],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: '재고관리',
      erp_last_subview: '현황',
      erp_permission_prompt_shown: '1',
    },
  });

  await page.goto('/main?open_menu=재고관리&open_subview=현황');
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  await openInventorySubMenu(page, '현황');
  await expect(page.getByRole('heading', { name: '재고 현황', exact: true })).toBeVisible();
  await expect(page.getByText('멸균거즈')).toBeVisible();

  await openInventorySubMenu(page, '이력');
  await expect(page.getByRole('heading', { name: '입출고 이력', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '최근 입출고 이력' })).toBeVisible();

  await openInventorySubMenu(page, '수요예측');
  await expect(page.getByRole('heading', { name: '수요 예측', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '재고 수요 예측' })).toBeVisible();

  await openInventorySubMenu(page, '등록');
  await expect(page.getByRole('heading', { name: '품목 등록', exact: true })).toBeVisible();
  await expect(page.getByTestId('inventory-registration-view')).toBeVisible();
  await expect(page.getByTestId('inventory-registration-submit')).toBeVisible();

  await openInventorySubMenu(page, '스캔');
  await expect(page.getByRole('heading', { name: '스캔 처리', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '의료기기 QR·바코드 스캔 입고' })).toBeVisible();

  await openInventorySubMenu(page, '재고실사');
  await expect(page.getByRole('heading', { name: '재고 실사' }).first()).toBeVisible();
  await expect(page.getByText('현재 등록된 모든 재고 품목에 대해 실물 수량을 입력하고')).toBeVisible();

  await openInventorySubMenu(page, '이관');
  await expect(page.getByRole('heading', { name: '재고 이관', exact: true })).toBeVisible();
  await expect(page.getByTestId('inventory-transfer-view')).toBeVisible();
  await page.getByLabel('이력 탭').click();
  await expect(page.getByTestId('inventory-transfer-history')).toBeVisible();

  await openInventorySubMenu(page, '발주');
  await expect(page.getByTestId('purchase-order-management-view')).toBeVisible();

  await openInventorySubMenu(page, '납품확인서');
  await expect(page.getByRole('heading', { name: '납품 확인서', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '납품 확인서 자동 생성' })).toBeVisible();

  await openInventorySubMenu(page, 'UDI');
  await expect(page.getByRole('heading', { name: 'UDI 관리', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '의료기기 공급내역 보고 (UDI)' })).toBeVisible();

  await openInventorySubMenu(page, '자산');
  await expect(page.getByRole('heading', { name: '자산 QR', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'QR 스마트 자산 관리' })).toBeVisible();

  await openInventorySubMenu(page, '거래처');
  await expect(page.getByRole('heading', { name: '거래처 · 명세서', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ 거래처 등록' })).toBeVisible();
  await page.getByRole('button', { name: '거래명세서', exact: true }).click();
  await expect(page.getByRole('heading', { name: '거래처 및 명세서 관리' })).toBeVisible();
  await expect(page.getByRole('button', { name: '명세서 작성' })).toBeVisible();

  await openInventorySubMenu(page, '카테고리');
  await expect(page.getByRole('heading', { name: '카테고리 관리', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '재고 카테고리 트리 관리' })).toBeVisible();

  await openInventorySubMenu(page, 'AS반품');
  await expect(page.getByRole('heading', { name: 'AS / 반품', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AS 접수' })).toBeVisible();
  await expect(page.getByText('등록된 AS 접수 내역이 없습니다.')).toBeVisible();

  await openInventorySubMenu(page, '소모품통계');
  await expect(page.getByRole('heading', { name: '소모품 통계', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '소모품 사용 통계 대시보드' })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

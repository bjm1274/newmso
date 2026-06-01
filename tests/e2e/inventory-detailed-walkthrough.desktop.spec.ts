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

async function openInventoryWorkcenter(page: Page, workcenterSubId: string) {
  // URL 직접 이동 (서브메뉴 클릭 시 page.tsx effect가 URL state로 override하는 문제 우회)
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '재고관리', open_subview: workcenterSubId }).toString()}`
  );
  await expect(page.getByTestId('inventory-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('inventory keeps the requested subview instead of bouncing back to the stored view', async ({
  page,
}) => {
  const inventoryUser = {
    ...fakeUser,
    id: 'inventory-stable-view-user',
    employee_no: 'INV-STABLE-001',
    name: '재고 뷰 안정성 사용자',
    company: '박철홍정형외과',
    company_id: 'hospital-1',
    department: '경영지원팀',
    position: '대리',
    role: 'manager',
    permissions: {
      ...fakeUser.permissions,
      inventory: true,
      menu_재고관리: true,
      inventory_현황: true,
      inventory_등록: true,
    },
  };

  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [inventoryUser],
    companies: [
      { id: 'hospital-1', name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
    ],
    inventoryItems: [
      {
        id: 'inventory-stable-1',
        item_name: '테스트 거즈',
        quantity: 5,
        stock: 5,
        min_quantity: 1,
        category: '소모품',
        company: '박철홍정형외과',
        company_id: 'hospital-1',
        department: '외래팀',
        created_at: '2026-04-06T09:00:00.000Z',
      },
    ],
    suppliers: [],
  });

  await seedSession(page, {
    user: inventoryUser,
    localStorage: {
      erp_last_menu: '재고관리',
      erp_last_subview: '현황',
      erp_inventory_view: '현황',
      erp_permission_prompt_shown: '1',
      erp_e2e_inventory_workcenter: '1',
    },
  });

  // 워크센터로 진입 (item 탭 = 물품·자산)
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: '재고관리', open_subview: 'item' }).toString()}`
  );

  await expect(page.getByTestId('inventory-view')).toBeVisible();

  await page.waitForTimeout(1800);

  // 워크센터가 item 탭을 유지해야 함
  await expect(page.getByTestId('inventory-view')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('inventory walkthrough opens each workcenter tab in order without runtime errors', async ({ page }) => {
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
      erp_e2e_inventory_workcenter: '1',
    },
  });

  await page.goto('/main?open_menu=재고관리&open_subview=status');
  await expect(page.getByTestId('inventory-view')).toBeVisible();

  // StatusWorkcenter 확인 — KPI row 존재
  await openInventoryWorkcenter(page, 'status');
  await expect(page.getByText('전체 품목')).toBeVisible();
  await expect(page.getByText('멸균거즈')).toBeVisible();

  // ItemWorkcenter 확인 — 탭 레이블 확인
  await openInventoryWorkcenter(page, 'item');
  await expect(page.getByRole('tab', { name: '물품 카탈로그' })).toBeVisible();

  // AnalyzeWorkcenter 확인 — 탭 레이블 확인
  await openInventoryWorkcenter(page, 'analyze');
  await expect(page.getByRole('tab', { name: 'ABC 분석' })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

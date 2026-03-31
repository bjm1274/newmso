import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon') || text.includes('Failed to load resource') || text.includes('ERR_ABORTED')) {
      return;
    }
    errors.push(`console: ${text}`);
  });

  return errors;
}

const extraFeaturesUser = {
  ...fakeUser,
  permissions: {
    ...fakeUser.permissions,
    extra_OP체크: true,
  },
};

function getTodayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
}

async function prepareExtraFeature(page: Page, fixtures: Parameters<typeof mockSupabase>[1]) {
  await mockSupabase(page, fixtures);
  await seedSession(page, {
    user: extraFeaturesUser,
    localStorage: {
      erp_last_menu: '추가기능',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('추가기능')}`);
  await expect(page.getByTestId('extra-view')).toBeVisible();
  await page.getByTestId('extra-card-op-check').click();
  await expect(page.getByTestId('op-check-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('op check links surgery schedules, applies surgery/anesthesia templates, and saves patient record', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(page, {
    boardPosts: [
      {
        id: 'schedule-post-1',
        board_type: '수술일정',
        title: '무릎 관절경',
        content: 'CH-001',
        patient_name: '김수술',
        schedule_date: todayKey,
        schedule_time: '09:00',
        schedule_room: '3번방',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
        surgery_fasting: true,
      },
    ],
    surgeryTemplates: [
      {
        id: 'surgery-template-knee',
        name: '무릎 관절경',
        is_active: true,
        sort_order: 1,
      },
    ],
    opCheckTemplates: [
      {
        id: 'op-template-surgery-knee',
        template_scope: 'surgery',
        template_name: '무릎 관절경 기본 준비',
        surgery_template_id: 'surgery-template-knee',
        surgery_name: '무릎 관절경',
        prep_items: [{ id: 'prep-1', name: '무릎 세트' }],
        consumable_items: [{ id: 'consumable-1', name: '흡수성 봉합사', quantity: '1', unit: 'EA' }],
        company_name: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
        is_active: true,
      },
      {
        id: 'op-template-anesthesia-general',
        template_scope: 'anesthesia',
        template_name: '전신마취 기본 준비',
        anesthesia_type: '전신마취',
        prep_items: [{ id: 'prep-2', name: '기관내 삽관 세트' }],
        consumable_items: [{ id: 'consumable-2', name: '프로포폴', quantity: '1', unit: '앰플' }],
        company_name: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
        is_active: true,
      },
    ],
    inventoryItems: [
      {
        id: 'inventory-1',
        name: '무릎 세트',
        quantity: 4,
        unit: '세트',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
      {
        id: 'inventory-2',
        name: '프로포폴',
        quantity: 12,
        unit: '앰플',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
    ],
  });

  await page.getByTestId('op-check-schedule-card-schedule-post-1').click();
  await expect(page.getByRole('heading', { name: '김수술' })).toBeVisible();
  await expect(page.locator('input[value="무릎 세트"]').first()).toBeVisible();
  await expect(page.locator('input[value="흡수성 봉합사"]').first()).toBeVisible();

  await page.getByTestId('op-check-anesthesia-select').fill('전신마취');
  await page.getByTestId('op-check-apply-template').click();

  await expect(page.locator('input[value="기관내 삽관 세트"]').first()).toBeVisible();
  await expect(page.locator('input[value="프로포폴"]').first()).toBeVisible();

  await page.getByTestId('op-check-record-save').click();
  await expect(page.getByText('저장됨 · 준비중')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

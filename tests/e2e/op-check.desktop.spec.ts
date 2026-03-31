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
    extra_OP泥댄겕: true,
  },
};

const msoExtraFeaturesUser = {
  ...fakeUser,
  company: 'SY INC.',
  company_id: 'mso-company-id',
  permissions: {
    ...fakeUser.permissions,
    mso: true,
    extra_OP泥댄겕: true,
  },
};

function getTodayKey() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
}

async function prepareExtraFeature(
  page: Page,
  fixtures: Parameters<typeof mockSupabase>[1],
  options?: {
    user?: typeof extraFeaturesUser;
    localStorage?: Record<string, string>;
  }
) {
  await mockSupabase(page, fixtures);
  await seedSession(page, {
    user: options?.user ?? extraFeaturesUser,
    localStorage: {
      ...(options?.localStorage || {}),
    },
  });

  await page.goto('/main');
  await expect(page.getByTestId('main-shell')).toBeVisible();
  await page.getByTestId('sidebar-menu-extra').click();
  await expect(page.getByTestId('extra-view')).toBeVisible();
  await page.getByTestId('extra-card-op-check').click();
  await expect(page.getByTestId('op-check-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('op check links schedules, applies templates, and saves a patient record', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(page, {
    boardPosts: [
      {
        id: 'schedule-post-1',
        board_type: '수술일정',
        title: 'Knee Scope',
        content: 'CH-001',
        patient_name: 'Patient Alpha',
        schedule_date: todayKey,
        schedule_time: '09:00',
        schedule_room: 'Room 3',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
        surgery_fasting: true,
      },
    ],
    surgeryTemplates: [
      {
        id: 'surgery-template-knee',
        name: 'Knee Scope',
        is_active: true,
        sort_order: 1,
      },
    ],
    opCheckTemplates: [
      {
        id: 'op-template-surgery-knee',
        template_scope: 'surgery',
        template_name: 'Knee Prep',
        surgery_template_id: 'surgery-template-knee',
        surgery_name: 'Knee Scope',
        prep_items: [{ id: 'prep-1', name: 'Knee set' }],
        consumable_items: [{ id: 'consumable-1', name: 'Screw set', quantity: '1', unit: 'EA' }],
        company_name: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
        is_active: true,
      },
      {
        id: 'op-template-anesthesia-general',
        template_scope: 'anesthesia',
        template_name: 'General Prep',
        anesthesia_type: 'General',
        prep_items: [{ id: 'prep-2', name: 'Airway kit' }],
        consumable_items: [{ id: 'consumable-2', name: 'Propofol', quantity: '1', unit: 'amp' }],
        company_name: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
        is_active: true,
      },
    ],
    inventoryItems: [
      {
        id: 'inventory-1',
        name: 'Knee set',
        quantity: 4,
        unit: 'set',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
      {
        id: 'inventory-2',
        name: 'Propofol',
        quantity: 12,
        unit: 'amp',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
    ],
  });

  await page.getByTestId('op-check-schedule-card-schedule-post-1').click();
  await expect(page.getByRole('heading', { name: 'Patient Alpha' })).toBeVisible();
  await expect(page.locator('input[value="Knee set"]').first()).toBeVisible();
  await expect(page.locator('input[value="Screw set"]').first()).toBeVisible();

  await page.getByTestId('op-check-anesthesia-select').fill('General');
  await page.getByTestId('op-check-apply-template').click();

  await expect(page.locator('input[value="Airway kit"]').first()).toBeVisible();
  await expect(page.locator('input[value="Propofol"]').first()).toBeVisible();

  await page.getByTestId('op-check-record-save').click();
  await expect(page.getByTestId('op-check-schedule-card-schedule-post-1')).toContainText('저장됨 · 준비중');

  expect(runtimeErrors).toEqual([]);
});

test('op check stays available when optional surgery template and inventory sources are missing', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(page, {
    boardPosts: [
      {
        id: 'schedule-post-optional-fallback',
        board_type: '수술일정',
        title: 'Fallback Surgery',
        content: 'CH-404',
        patient_name: 'Fallback Patient',
        schedule_date: todayKey,
        schedule_time: '10:30',
        schedule_room: 'Room 1',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
    ],
    missingSurgeryTemplatesSchema: true,
    missingInventoryItemsSchema: true,
  });

  await expect(page.getByTestId('op-check-calendar-day-' + todayKey)).toContainText('Fallback Patient');
  await expect(page.getByTestId('op-check-schedule-card-schedule-post-optional-fallback')).toBeVisible();
  await page.getByTestId('op-check-schedule-card-schedule-post-optional-fallback').click();
  await expect(page.getByRole('heading', { name: 'Fallback Patient' })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('op check follows the selected company scope for MSO users', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();
  const targetCompanyId = 'target-hospital-company-id';
  const targetCompanyName = 'Linked Hospital';

  await prepareExtraFeature(
    page,
    {
      boardPosts: [
        {
          id: 'schedule-post-selected-company',
          board_type: '수술일정',
          title: 'Scoped Surgery',
          content: 'CH-777',
          patient_name: 'Scoped Patient',
          schedule_date: todayKey,
          schedule_time: '08:30',
          schedule_room: 'Room 2',
          company: targetCompanyName,
          company_id: targetCompanyId,
        },
      ],
      companies: [
        {
          id: msoExtraFeaturesUser.company_id,
          name: msoExtraFeaturesUser.company,
          type: 'mso',
          is_active: true,
        },
        {
          id: targetCompanyId,
          name: targetCompanyName,
          type: 'hospital',
          is_active: true,
        },
      ],
    },
    {
      user: msoExtraFeaturesUser,
      localStorage: {
        erp_last_co: targetCompanyName,
        erp_selected_company_id: targetCompanyId,
      },
    }
  );

  await expect(page.getByTestId('op-check-calendar-day-' + todayKey)).toContainText('Scoped Patient');
  await expect(page.getByTestId('op-check-schedule-card-schedule-post-selected-company')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scoped Patient' })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

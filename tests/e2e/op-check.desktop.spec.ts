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
    'extra_OP\uCCB4\uD06C': true,
  },
};

const msoExtraFeaturesUser = {
  ...fakeUser,
  company: 'SY INC.',
  company_id: 'mso-company-id',
  permissions: {
    ...fakeUser.permissions,
    mso: true,
    'extra_OP\uCCB4\uD06C': true,
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
  const allTab = page.getByRole('button', { name: '전체' }).first();
  if (await allTab.isVisible().catch(() => false)) {
    await allTab.click();
  }
  await expect(page.getByTestId('extra-card-op-check')).toBeVisible();
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
    staffMembers: [extraFeaturesUser],
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

  await page.setViewportSize({ width: 1440, height: 1200 });
  await expect(page.getByTestId('op-check-patient-search-card')).toBeVisible();
  await expect(page.getByTestId('op-check-patient-calendar-card')).toBeVisible();
  await expect(page.getByTestId('op-check-patient-summary-card')).toBeVisible();
  const patientTopGridColumnCount = await page.getByTestId('op-check-patient-top-grid').evaluate((node) => {
    return window
      .getComputedStyle(node)
      .gridTemplateColumns.split(' ')
      .filter((value) => value.trim().length > 0).length;
  });
  expect(patientTopGridColumnCount).toBeGreaterThanOrEqual(3);

  await page.getByTestId('op-check-calendar-toggle').click();
  await page.getByTestId('op-check-calendar-day-' + todayKey).click();
  await expect(page.getByTestId('op-check-workspace-modal')).toBeVisible();
  await expect(page.getByTestId('op-check-workspace-header-summary')).toBeVisible();
  await expect(page.getByTestId('op-check-workspace-patient-strip')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patient Alpha' }).first()).toBeVisible();
  await page.getByTestId('op-check-workspace-status-filter-ready').click();
  await expect(page.getByTestId('op-check-workspace-detail-meta')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patient Alpha' }).first()).toBeVisible();
  await expect(page.locator('input[value="Knee set"]').first()).toBeVisible();
  await expect(page.locator('input[value="Screw set"]').first()).toBeVisible();

  await page.getByTestId('op-check-anesthesia-select').fill('General');
  await page.getByTestId('op-check-apply-template').click();

  await expect(page.locator('input[value="Airway kit"]').first()).toBeVisible();
  await expect(page.locator('input[value="Propofol"]').first()).toBeVisible();

  await page.getByTestId('op-check-record-save').click();
  await expect(page.getByText('환자별 OP체크를 저장했습니다.')).toBeVisible();
  await expect(page.getByTestId('op-check-schedule-card-schedule-post-1')).toContainText('준비중');

  expect(runtimeErrors).toEqual([]);
});

test('op check stays available when optional surgery template and inventory sources are missing', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(page, {
    staffMembers: [extraFeaturesUser],
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

  await page.getByTestId('op-check-calendar-toggle').click();
  await expect(page.getByTestId('op-check-calendar-day-' + todayKey)).toContainText('Fallback Patient');
  await expect(page.getByTestId('op-check-schedule-card-schedule-post-optional-fallback')).toBeVisible();
  await page.getByTestId('op-check-schedule-card-schedule-post-optional-fallback').click();
  await expect(page.getByRole('heading', { name: 'Fallback Patient' }).first()).toBeVisible();

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
      staffMembers: [msoExtraFeaturesUser],
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

  await page.getByTestId('op-check-calendar-toggle').click();
  await expect(page.getByTestId('op-check-calendar-day-' + todayKey)).toContainText('Scoped Patient');
  await expect(page.getByTestId('op-check-schedule-card-schedule-post-selected-company')).toBeVisible();
  await page.getByTestId('op-check-schedule-card-schedule-post-selected-company').click();
  await expect(page.getByRole('heading', { name: 'Scoped Patient' }).first()).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('op check ward messages use dropdown recipients, keep favorites, and send successfully', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();
  const noticeRoomId = '00000000-0000-0000-0000-000000000000';
  const favoriteStaffId = 'ward-staff-1';
  const favoriteStorageKey = `erp_op_check_ward_message_favorites:${extraFeaturesUser.id}:${extraFeaturesUser.company_id}`;
  const recentStorageKey = `erp_op_check_ward_message_recents:${extraFeaturesUser.id}:${extraFeaturesUser.company_id}`;

  await prepareExtraFeature(page, {
    boardPosts: [
      {
        id: 'schedule-post-ward-message',
        board_type: '수술일정',
        title: '수술명',
        content: 'CH-033\n[[BOARD_META]]{"status":"게시중"}[[/BOARD_META]]',
        patient_name: 'Ward Patient',
        schedule_date: todayKey,
        schedule_time: '11:00',
        schedule_room: 'Room 5',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
    ],
    staffMembers: [
      extraFeaturesUser,
      {
        id: favoriteStaffId,
        name: '김규빈',
        department: '병동팀',
        position: '사원',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
      {
        id: 'ward-staff-2',
        name: '김민정',
        department: '외래검사팀',
        position: '사원',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
    ],
    chatRooms: [
      {
        id: noticeRoomId,
        name: '공지메시지',
        type: 'notice',
        members: [extraFeaturesUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'direct-room-ward-1',
        name: '김규빈',
        type: 'direct',
        members: [extraFeaturesUser.id, favoriteStaffId],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
    ],
  });

  await page.getByTestId('op-check-schedule-card-schedule-post-ward-message').click();
  await page.getByRole('button', { name: '병동팀 메시지 보내기' }).first().click();

  await expect(page.getByTestId('op-check-ward-validation-text')).toContainText('받는 사람을 1명 이상 선택하세요');
  await expect(page.getByText('추천 받는 사람')).toHaveCount(0);
  await expect(page.getByTestId('op-check-ward-recipient-option-' + favoriteStaffId)).toHaveCount(0);
  await expect(page.getByTestId('op-check-ward-message-textarea')).toHaveValue(/CH-033/);
  await expect(page.getByTestId('op-check-ward-message-textarea')).not.toHaveValue(/BOARD_META/);
  await page.getByTestId('op-check-ward-template-move-request').click();
  await expect(page.getByTestId('op-check-ward-message-textarea')).toHaveValue(/\[수술실 이동 요청\]/);

  await page.getByTestId('op-check-ward-recipient-dropdown-button').click();
  await page.getByTestId('op-check-ward-recipient-search').fill('김규');
  await page.getByTestId('op-check-ward-recipient-option-' + favoriteStaffId).click();
  await expect(page.getByTestId('op-check-ward-selected-recipient-' + favoriteStaffId)).toBeVisible();

  await page
    .getByTestId('op-check-ward-selected-recipient-' + favoriteStaffId)
    .getByRole('button', { name: '즐겨찾기' })
    .click();

  await page.getByTestId('op-check-ward-message-close').click();
  await page.getByRole('button', { name: '병동팀 메시지 보내기' }).first().click();
  await expect(page.getByTestId('op-check-ward-favorite-chip-' + favoriteStaffId)).toBeVisible();

  await page.getByTestId('op-check-ward-favorite-chip-' + favoriteStaffId).click();
  await expect(page.getByTestId('op-check-ward-message-send')).toContainText('1명');
  await page.getByTestId('op-check-ward-message-send').click();
  await expect(page.getByTestId('op-check-ward-message-close')).toHaveCount(0);
  const persistedWardMessages = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/messages?room_id=eq.direct-room-ward-1&select=*');
    return response.json();
  });
  expect(
    Array.isArray(persistedWardMessages) &&
      persistedWardMessages.some((message: any) =>
        String(message?.content || '').includes('[[WARD_MESSAGE_META]]'),
      ),
  ).toBeTruthy();
  const favoriteIds = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  }, favoriteStorageKey);
  await page.getByRole('button', { name: '병동팀 메시지 보내기' }).first().click();
  await expect(page.getByTestId('op-check-ward-recent-chip-' + favoriteStaffId)).toBeVisible();
  const recentIds = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  }, recentStorageKey);
  expect(favoriteIds).toContain(favoriteStaffId);
  expect(recentIds).toContain(favoriteStaffId);
  expect(runtimeErrors).toEqual([]);
});

test('op check ward recipient dropdown falls back to the full staff list when company metadata does not match', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(page, {
    boardPosts: [
      {
        id: 'schedule-post-ward-fallback',
        board_type: '수술일정',
        title: 'Fallback Surgery',
        content: 'CH-044',
        patient_name: 'Fallback Ward Patient',
        schedule_date: todayKey,
        schedule_time: '14:00',
        schedule_room: 'Room 4',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
    ],
    staffMembers: [
      extraFeaturesUser,
      {
        id: 'ward-fallback-staff-1',
        name: '김병동',
        department: '병동팀1',
        position: '사원',
        company: '다른회사명',
        company_id: 'different-company-id',
      },
    ],
  });

  await page.getByTestId('op-check-schedule-card-schedule-post-ward-fallback').click();
  await page.getByRole('button', { name: '병동팀 메시지 보내기' }).first().click();
  await page.getByTestId('op-check-ward-recipient-dropdown-button').click();
  await page.getByTestId('op-check-ward-recipient-search').fill('병동팀');
  await expect(page.getByTestId('op-check-ward-recipient-option-ward-fallback-staff-1')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('op check workspace guards unsaved changes, supports quick navigation, and remembers the last patient for a day', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(tomorrow);

  await prepareExtraFeature(page, {
    staffMembers: [extraFeaturesUser],
    boardPosts: [
      {
        id: 'schedule-post-workspace-1',
        board_type: '수술일정',
        title: 'Alpha Surgery',
        content: 'CH-100',
        patient_name: 'Patient Alpha',
        schedule_date: todayKey,
        schedule_time: '09:00',
        schedule_room: 'Room 1',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
      {
        id: 'schedule-post-workspace-2',
        board_type: '수술일정',
        title: 'Beta Surgery',
        content: 'CH-200',
        patient_name: 'Patient Beta',
        schedule_date: todayKey,
        schedule_time: '11:00',
        schedule_room: 'Room 2',
        company: extraFeaturesUser.company,
        company_id: extraFeaturesUser.company_id,
      },
    ],
    opPatientChecks: [
      {
        id: 'op-patient-check-workspace-2',
        schedule_post_id: 'schedule-post-workspace-2',
        patient_name: 'Patient Beta',
        chart_no: 'CH-200',
        surgery_name: 'Beta Surgery',
        schedule_date: todayKey,
        schedule_time: '11:00',
        schedule_room: 'Room 2',
        prep_items: [],
        consumable_items: [],
        notes: '',
        status: '준비완료',
      },
    ],
  });

  await page.getByTestId('op-check-calendar-toggle').click();
  await page.getByTestId('op-check-calendar-day-' + todayKey).click();
  await expect(page.getByTestId('op-check-workspace-modal')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patient Alpha' }).first()).toBeVisible();
  await expect(page.getByTestId('op-check-workspace-header-summary')).toBeVisible();
  await expect(page.getByTestId('op-check-workspace-status-filter-prep-complete')).toContainText('1');
  const workspaceDetailHeaderPosition = await page
    .getByTestId('op-check-workspace-detail-header')
    .evaluate((node) => window.getComputedStyle(node).position);
  expect(workspaceDetailHeaderPosition).not.toBe('sticky');

  await page.getByTestId('op-check-workspace-status-filter-prep-complete').click();
  await expect(page.getByRole('heading', { name: 'Patient Beta' }).first()).toBeVisible();
  await expect(page.getByTestId('op-check-workspace-schedule-card-schedule-post-workspace-1')).toHaveCount(0);

  await page.getByTestId('op-check-workspace-status-filter-reset').click();
  await page.getByTestId('op-check-workspace-schedule-card-schedule-post-workspace-1').click();
  await expect(page.getByRole('heading', { name: 'Patient Alpha' }).first()).toBeVisible();

  await page.getByTestId('op-check-notes-textarea').fill('draft workspace note');
  await expect(page.getByTestId('op-check-workspace-dirty-indicator')).toBeVisible();

  await page.getByTestId('op-check-workspace-next').click();
  await expect(page.getByRole('heading', { name: 'Patient Alpha' }).first()).toBeVisible();

  await page.evaluate(() => {
    window.confirm = () => true;
  });

  await page.getByTestId('op-check-workspace-next').click();
  await expect(page.getByRole('heading', { name: 'Patient Beta' }).first()).toBeVisible();

  await page.getByTestId('op-check-section-toggle-prep').click();
  await expect(page.getByTestId('op-check-section-toggle-prep')).toContainText('펼치기');
  await expect(page.getByTestId('op-check-section-content-prep')).toHaveCount(0);
  await page.getByTestId('op-check-section-toggle-prep').click();
  await expect(page.getByTestId('op-check-section-toggle-prep')).toContainText('접기');
  await expect(page.getByTestId('op-check-section-content-prep')).toHaveCount(1);

  await page.getByTestId('op-check-workspace-close').click();
  await expect(page.getByTestId('op-check-workspace-modal')).toHaveCount(0);

  await page.getByTestId('op-check-calendar-day-' + tomorrowKey).click();
  await page.getByTestId('op-check-calendar-day-' + todayKey).click();
  await expect(page.getByTestId('op-check-workspace-modal')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patient Beta' }).first()).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

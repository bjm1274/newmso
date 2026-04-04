import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';
import { buildRoomConfigNoteContent, encodeHandoverContent } from '../../lib/handover-notes';

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

const extraFeaturesUser = {
  ...fakeUser,
  department: '병동팀',
  position: '수간호사',
  permissions: {
    ...fakeUser.permissions,
    'extra_\uC870\uC9C1\uB3C4': true,
    'extra_\uBD80\uC11C\uBCC4\uC7AC\uACE0': true,
    'extra_\uADFC\uBB34\uD604\uD669': true,
    'extra_\uC778\uACC4\uB178\uD2B8': true,
    'extra_\uD1F4\uC6D0\uC2EC\uC0AC': true,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': true,
    'extra_\uC9C1\uC6D0\uD3C9\uAC00': true,
    'extra_\uC785\uAE08\uC2E4\uC2DC\uAC04\uC870\uD68C': true,
  },
};

const targetNurse = {
  ...fakeUser,
  id: '66666666-6666-6666-6666-666666666666',
  employee_no: 'E2E-002',
  name: '테스트간호사',
  department: '병동팀',
  position: '간호사',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
};

const supportNurse = {
  ...fakeUser,
  id: '77777777-7777-7777-7777-777777777777',
  employee_no: 'E2E-003',
  name: '지원간호사',
  department: '병동팀',
  position: '간호사',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
};

const adminClerk = {
  ...fakeUser,
  id: '88888888-8888-8888-8888-888888888888',
  employee_no: 'E2E-004',
  name: '행정직원',
  department: '행정팀',
  position: '주임',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
};

const floorStaffUser = {
  ...fakeUser,
  id: '99999999-8888-7777-6666-555555555555',
  employee_no: 'E2E-005',
  name: '일반간호사',
  department: '병동팀',
  position: '간호사',
  role: 'staff',
  company: extraFeaturesUser.company,
  company_id: extraFeaturesUser.company_id,
  permissions: {
    ...fakeUser.permissions,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': true,
  },
};

const syIncDirectorUser = {
  ...fakeUser,
  id: '12345678-9999-8888-7777-666666666666',
  employee_no: 'E2E-006',
  name: 'SY이사',
  company: 'SY INC.',
  company_id: '44444444-4444-4444-4444-444444444444',
  department: '경영지원팀',
  position: '이사',
  role: 'staff',
  permissions: {
    ...fakeUser.permissions,
    mso: false,
    'extra_\uB9C8\uAC10\uBCF4\uACE0': true,
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
  cardTestId: string,
  options?: { user?: typeof extraFeaturesUser | typeof floorStaffUser }
) {
  await page.addInitScript(() => {
    window.alert = () => {};
    window.confirm = () => true;
  });

  await mockSupabase(page, fixtures);
  await seedSession(page, {
    user: options?.user ?? extraFeaturesUser,
    localStorage: {
      erp_last_menu: '추가기능',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('추가기능')}`);
  await expect(page.getByTestId('extra-view')).toBeVisible();
  await page.getByTestId(cardTestId).click();
  await expect(page.getByTestId('extra-subview')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('work status supports real month/day navigation flow', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, targetNurse, supportNurse, adminClerk],
      workShifts: [
        { id: 'shift-day', name: 'Day', start_time: '07:00:00', end_time: '15:00:00', is_active: true },
        { id: 'shift-evening', name: 'Evening', start_time: '15:00:00', end_time: '23:00:00', is_active: true },
        { id: 'shift-night', name: 'Night', start_time: '23:00:00', end_time: '07:00:00', is_active: true },
      ],
      shiftAssignments: [
        { id: 'assign-1', staff_id: extraFeaturesUser.id, shift_id: 'shift-day', work_date: todayKey },
        { id: 'assign-2', staff_id: targetNurse.id, shift_id: 'shift-evening', work_date: todayKey },
        { id: 'assign-3', staff_id: supportNurse.id, shift_id: 'shift-night', work_date: todayKey },
      ],
      attendance: [
        { id: 'attendance-1', staff_id: extraFeaturesUser.id, date: todayKey, check_in: `${todayKey}T07:01:00` },
      ],
    },
    'extra-card-work-status'
  );

  await expect(page.getByTestId('work-status-view')).toBeVisible();
  await expect(page.getByTestId('work-status-last-sync')).toBeVisible();
  await page.getByTestId('work-status-department-filter').selectOption('행정팀');
  await expect(page.getByText('행정팀 보기')).toBeVisible();
  await page.getByTestId('work-status-department-chip-all').click();
  await expect(page.getByText('전사 보기')).toBeVisible();
  await page.getByTestId('work-status-active-only-toggle').click();
  await page.getByTestId('work-status-next-month').click();
  await page.getByTestId('work-status-prev-month').click();
  await page.getByTestId('work-status-today').click();
  await page.getByTestId(`work-status-day-${todayKey}`).click();
  await expect(page.getByTestId('work-status-detail-modal')).toBeVisible();
  await page.getByTestId('work-status-detail-close').click();
  await expect(page.getByTestId('work-status-detail-modal')).toBeHidden();
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('handover template version history is visible and selectable', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, targetNurse],
      handoverNotes: [
        {
          id: 'handover-template-v2',
          content: '최신 템플릿 버전',
          author_id: extraFeaturesUser.id,
          author_name: extraFeaturesUser.name,
          shift: 'Day',
          priority: 'Normal',
          is_completed: false,
          created_at: '2026-03-20T08:00:00.000Z',
          handover_kind: 'template',
          note_scope: 'general',
          template_name: '병동 공통 인계',
          template_version: 2,
          handover_date: '2026-03-20',
        },
        {
          id: 'handover-template-v1',
          content: '이전 템플릿 버전',
          author_id: extraFeaturesUser.id,
          author_name: extraFeaturesUser.name,
          shift: 'Evening',
          priority: 'High',
          is_completed: false,
          created_at: '2026-03-18T08:00:00.000Z',
          handover_kind: 'template',
          note_scope: 'general',
          template_name: '병동 공통 인계',
          template_version: 1,
          handover_date: '2026-03-18',
        },
      ],
    },
    'extra-card-handover-note'
  );

  await expect(page.getByTestId('handover-notes-view')).toBeVisible();
  await expect(page.getByTestId('handover-template-version-history')).toBeVisible();
  await expect(page.locator('[data-testid^="handover-template-version-card-"]')).toHaveCount(2);
  await expect(
    page.getByTestId('handover-template-version-card-handover-template-v2').getByText('최신')
  ).toBeVisible();
  await page.getByTestId('handover-template-version-card-handover-template-v1').click();
  await expect(
    page.getByTestId('handover-template-version-card-handover-template-v1').getByText('선택됨')
  ).toBeVisible();
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('handover notes can save bed settings and patient handover entries', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, targetNurse],
      handoverNotes: [],
    },
    'extra-card-handover-note'
  );

  await expect(page.getByTestId('handover-notes-view')).toBeVisible();
  await page.getByTestId('handover-bed-settings-open').click();
  await expect(page.getByTestId('handover-bed-settings-modal')).toBeVisible();
  await page.getByTestId('handover-new-room-number').fill('101');
  await page.getByTestId('handover-add-room').click();
  await page.getByTestId('handover-room-0-patient-0').fill('김환자');
  await page.getByTestId('handover-bed-settings-save').click();
  await expect(page.getByText('저장됨')).toBeVisible();
  await page.getByTestId('handover-bed-settings-close').click();

  await page.getByTestId('handover-scope-patient').click();
  await page.getByTestId('handover-patient-select').selectOption({ index: 1 });
  await page.getByTestId('handover-note-content').fill('투약 시간과 활력징후를 다음 근무자에게 인계합니다.');
  await page.getByTestId('handover-note-add').click();

  await page.getByTestId('handover-scope-patient').click();
  await page.locator('[data-testid^="handover-patient-open-"]').first().click();
  const historyModal = page.getByTestId('handover-patient-history-modal');
  await expect(historyModal.getByText('투약 시간과 활력징후를 다음 근무자에게 인계합니다.')).toBeVisible();
  const actionSelect = historyModal.locator('[data-testid^="handover-note-action-"]').first();
  await actionSelect.selectOption('complete');
  await page.getByTestId('handover-patient-history-close').click();
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('handover notes keep unfinished common items and reset patient notes when room patient changes', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, targetNurse],
      handoverNotes: [
        {
          id: 'handover-general-1',
          content: '공통 준비사항 유지',
          author_id: extraFeaturesUser.id,
          author_name: extraFeaturesUser.name,
          shift: 'Day',
          priority: 'Normal',
          is_completed: false,
          created_at: '2026-03-01T08:00:00.000Z',
          note_scope: 'general',
          handover_date: '2026-03-01',
        },
        {
          id: 'handover-patient-1',
          content: '백정민 인계 메모',
          author_id: extraFeaturesUser.id,
          author_name: extraFeaturesUser.name,
          shift: 'Evening',
          priority: 'High',
          is_completed: false,
          created_at: '2026-03-18T11:00:00.000Z',
          note_scope: 'patient',
          handover_date: '2026-03-18',
          patient_name: '백정민',
          patient_key: '백정민',
          room_number: '101',
          room_capacity: 4,
          bed_number: 1,
          bed_key: '101-1',
        },
        {
          id: 'handover-room-config-1',
          content: buildRoomConfigNoteContent(
            [
              {
                id: 'room-101',
                roomNumber: '101',
                capacity: 4,
                beds: [
                  { bedNumber: 1, patientName: '백정민', admissionDate: '2026-03-01' },
                  { bedNumber: 2, patientName: '', admissionDate: null },
                  { bedNumber: 3, patientName: '', admissionDate: null },
                  { bedNumber: 4, patientName: '', admissionDate: null },
                ],
              },
            ],
            '2026-03-01',
          ),
          author_id: extraFeaturesUser.id,
          author_name: extraFeaturesUser.name,
          shift: 'System',
          priority: 'Normal',
          is_completed: false,
          created_at: '2026-03-01T07:00:00.000Z',
        },
        {
          id: 'handover-room-config-2',
          content: buildRoomConfigNoteContent(
            [
              {
                id: 'room-101',
                roomNumber: '101',
                capacity: 4,
                beds: [
                  { bedNumber: 1, patientName: '김새환', admissionDate: '2026-03-20' },
                  { bedNumber: 2, patientName: '', admissionDate: null },
                  { bedNumber: 3, patientName: '', admissionDate: null },
                  { bedNumber: 4, patientName: '', admissionDate: null },
                ],
              },
            ],
            '2026-03-30',
          ),
          author_id: extraFeaturesUser.id,
          author_name: extraFeaturesUser.name,
          shift: 'System',
          priority: 'Normal',
          is_completed: false,
          created_at: '2026-03-30T07:00:00.000Z',
        },
      ],
    },
    'extra-card-handover-note'
  );

  await expect(page.getByTestId('handover-notes-view')).toBeVisible();
  await page.getByTestId('handover-date-input').fill('2026-03-10');
  await expect(page.getByText('공통 준비사항 유지')).toBeVisible();
  await page.getByTestId('handover-scope-patient').click();
  await expect(page.getByTestId('handover-patient-open-101-1-2026-03-01')).toBeVisible();
  await expect(page.getByText('백정민 인계 메모')).toBeHidden();

  await page.getByTestId('handover-date-input').fill('2026-03-18');
  await page.getByTestId('handover-patient-open-101-1-2026-03-01').click();
  const historyModal = page.getByTestId('handover-patient-history-modal');
  await expect(historyModal).toBeVisible();
  await expect(historyModal.getByText('입원 2026. 3. 1.')).toBeVisible();
  await expect(historyModal.getByText('백정민 인계 메모')).toBeVisible();
  await page.getByTestId('handover-patient-history-close').click();

  await page.getByTestId('handover-date-input').fill('2026-03-20');
  await expect(page.getByTestId('handover-patient-open-101-1-2026-03-01')).toBeVisible();
  await expect(page.getByTestId('handover-patient-open-101-1-2026-03-20')).toBeVisible();

  await page.getByTestId('handover-date-input').fill('2026-03-30');
  await expect(page.getByTestId('handover-patient-open-101-1-2026-03-20')).toBeVisible();
  await expect(page.getByText('백정민 인계 메모')).toBeHidden();
  await page.getByTestId('handover-scope-general').click();
  await expect(page.getByText('공통 준비사항 유지')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('discharge review can save a template, create a review, and approve it', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser],
      dischargeTemplates: [],
      dischargeReviews: [],
      surgeryTemplates: [{ id: 'surgery-1', name: '슬관절 수술', is_active: true, sort_order: 1 }],
    },
    'extra-card-discharge-review'
  );

  await expect(page.getByTestId('discharge-review-view')).toBeVisible();
  await page.getByTestId('discharge-tab-template').click();
  await page.getByTestId('discharge-template-new').click();
  await page.getByTestId('discharge-template-title').fill('슬관절 퇴원기준');
  await page.getByTestId('discharge-template-data').fill('A001\t항목\t기본치료\t분류\t0\t0\t1000\t1000');
  await page.getByTestId('discharge-template-save').click();
  await expect(page.getByText('슬관절 퇴원기준')).toBeVisible();

  await page.getByTestId('discharge-tab-new').click();
  await page.getByTestId('discharge-patient-name').fill('홍길동');
  await page.getByTestId('discharge-department').fill('정형외과');
  await page.getByTestId('discharge-admission-date').fill('2026-03-15');
  await page.getByTestId('discharge-template-select').selectOption({ index: 1 });
  await page.getByTestId('discharge-chart-data').fill('A001\t항목\t기본치료\t분류\t0\t0\t1000\t1000');
  await page.getByTestId('discharge-create-review').click();

  await expect(page.getByTestId('discharge-review-detail')).toBeVisible();
  await expect(page.getByTestId('discharge-rule-analysis')).toBeVisible();
  await expect(page.getByTestId('discharge-rule-issue-0')).toBeVisible();
  await page.getByTestId('discharge-review-toggle-all').click();
  await page.getByTestId('discharge-review-approve').click();
  await expect(page.getByTestId('discharge-review-approve')).toBeHidden();
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('daily closure can save settlement items and return to the list', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser],
      dailyClosures: [],
      dailyClosureItems: [],
      dailyChecks: [],
    },
    'extra-card-closing-report'
  );

  await expect(page.getByTestId('daily-closure-view')).toBeVisible();
  await page.getByTestId('daily-closure-toggle-view').click();
  await page.getByTestId('daily-closure-date').fill(todayKey);
  await page.getByTestId('daily-closure-add-item').click();
  await page.getByTestId('daily-closure-item-patient-0').fill('홍길동');
  await page.getByTestId('daily-closure-item-amount-0').fill('32000');
  await page.getByTestId('daily-closure-add-check').click();
  await page.getByTestId('daily-closure-check-number-0').fill('CHK-001');
  await page.getByTestId('daily-closure-memo').fill('오후 외래 수납 마감 보고');
  await page.getByTestId('daily-closure-save').click();

  await expect(page.getByText(todayKey)).toBeVisible();
  await expect(page.getByText('32,000')).toBeVisible();
  await expect(page.getByRole('heading', { name: /마감보고/ })).toBeVisible();
  await expect(page.getByTestId(/daily-closure-author-/).first()).toContainText(extraFeaturesUser.name);
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('daily closure form stays writable for non-manager staff', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, floorStaffUser],
      dailyClosures: [],
      dailyClosureItems: [],
      dailyChecks: [],
    },
    'extra-card-closing-report',
    { user: floorStaffUser }
  );

  await expect(page.getByTestId('daily-closure-read-restricted-note')).toBeVisible();
  await expect(page.getByTestId('daily-closure-toggle-view')).toHaveCount(0);
  await expect(page.getByTestId('daily-closure-list')).toHaveCount(0);

  await page.getByTestId('daily-closure-date').fill(todayKey);
  await page.getByTestId('daily-closure-add-item').click();
  await page.getByTestId('daily-closure-item-patient-0').fill('일반직원 환자');
  await page.getByTestId('daily-closure-item-amount-0').fill('18000');
  await expect(page.getByTestId('daily-closure-save')).toBeEnabled();

  await page.getByTestId('daily-closure-save').click();
  await expect(page.getByTestId('daily-closure-date-status')).toContainText('수정 중');

  expect(runtimeErrors).toEqual([]);
});

test('daily closure blocks non-author staff from editing an existing report', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, floorStaffUser],
      dailyClosures: [
        {
          id: 'daily-closure-existing',
          company_id: floorStaffUser.company_id,
          date: todayKey,
          total_amount: 77000,
          petty_cash_start: 10000,
          petty_cash_end: 5000,
          status: 'completed',
          memo: '기존 마감보고',
          created_by: extraFeaturesUser.id,
        },
      ],
      dailyClosureItems: [],
      dailyChecks: [],
    },
    'extra-card-closing-report',
    { user: floorStaffUser }
  );

  await expect(page.getByTestId('daily-closure-read-restricted-note')).toBeVisible();
  await expect(page.getByTestId('daily-closure-date-status')).toContainText('작성자 본인만 수정');
  await expect(page.getByTestId('daily-closure-save')).toBeDisabled();

  expect(runtimeErrors).toEqual([]);
});

test('daily closure list stays visible for SY INC. directors without selecting a company', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const todayKey = getTodayKey();

  await prepareExtraFeature(
    page,
    {
      staffMembers: [syIncDirectorUser, extraFeaturesUser],
      dailyClosures: [
        {
          id: 'daily-closure-cross-company',
          company_id: extraFeaturesUser.company_id,
          date: todayKey,
          total_amount: 91000,
          petty_cash_start: 20000,
          petty_cash_end: 8000,
          status: 'completed',
          memo: '지점 마감보고',
          created_by: extraFeaturesUser.id,
        },
      ],
      dailyClosureItems: [],
      dailyChecks: [],
    },
    'extra-card-closing-report',
    { user: syIncDirectorUser }
  );

  await expect(page.getByTestId('daily-closure-all-company-note')).toBeVisible();
  await expect(page.getByTestId('daily-closure-list')).toBeVisible();
  await expect(page.getByText(todayKey)).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('staff evaluation can save a new review entry for a selected nurse', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await prepareExtraFeature(
    page,
    {
      staffMembers: [extraFeaturesUser, targetNurse],
      staffEvaluations: [],
    },
    'extra-card-staff-evaluation'
  );

  await expect(page.getByTestId('staff-evaluation-view')).toBeVisible();
  await page.getByTestId(`staff-evaluation-select-${targetNurse.id}`).click();
  await page.getByTestId('staff-evaluation-content').fill('야간 인계 정리가 꼼꼼하고 환자 대응이 안정적입니다.');
  await page.getByTestId('staff-evaluation-submit').click();

  await expect(page.getByText('야간 인계 정리가 꼼꼼하고 환자 대응이 안정적입니다.')).toBeVisible();
  await expect(page.locator('[data-testid^="staff-evaluation-item-"]')).toHaveCount(1);
  await page.getByTestId('extra-back-button').click();
  await expect(page.getByTestId('extra-features-list')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

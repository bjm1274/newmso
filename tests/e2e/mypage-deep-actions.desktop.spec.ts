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

async function openMyPage(page: Page) {
  await page.goto(`/main?open_menu=${encodeURIComponent('내정보')}`);
  await expect(page.getByTestId('mypage-view')).toBeVisible();
}

async function installMutableDateMock(page: Page, initialIso: string) {
  await page.addInitScript(({ iso }) => {
    const RealDate = Date;
    let currentTime = new RealDate(iso).getTime();

    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(currentTime);
          return;
        }
        // @ts-expect-error browser test shim
        super(...args);
      }

      static now() {
        return currentTime;
      }
    }

    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    // @ts-expect-error browser test shim
    window.__setMockNow = (nextIso: string) => {
      currentTime = new RealDate(nextIso).getTime();
    };
    // @ts-expect-error browser test shim
    window.Date = MockDate;
  }, { iso: initialIso });
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('mypage commute can check in and out with geolocation permission', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    attendance: [],
    attendances: [],
  });

  await page.context().grantPermissions(['geolocation'], {
    origin: 'http://127.0.0.1:3000',
  });
  await page.context().setGeolocation({
    latitude: 34.806074,
    longitude: 126.405525,
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '내정보',
      erp_mypage_tab: 'commute',
    },
  });

  await openMyPage(page);
  await page.getByRole('button', { name: /출퇴근/ }).click();

  await expect(page.getByTestId('commute-record-view')).toBeVisible();
  await expect(page.getByTestId('commute-check-in-button')).toBeVisible();
  await page.getByTestId('commute-check-in-button').click();
  await expect(page.getByTestId('commute-check-out-button')).toBeVisible();

  const workDate = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));

  let snapshot = await page.evaluate(async ({ staffId, workDate }) => {
    const [attendanceResponse, attendancesResponse] = await Promise.all([
      fetch(`/rest/v1/attendance?staff_id=eq.${staffId}&date=eq.${workDate}&select=*`),
      fetch(`/rest/v1/attendances?staff_id=eq.${staffId}&work_date=eq.${workDate}&select=*`),
    ]);
    return {
      attendance: await attendanceResponse.json(),
      attendances: await attendancesResponse.json(),
    };
  }, { staffId: fakeUser.id, workDate });

  expect(snapshot.attendance[0]?.check_in).toBeTruthy();
  expect(snapshot.attendances[0]?.check_in_time).toBeTruthy();

  await page.getByTestId('commute-check-out-button').click();
  await expect(page.getByTestId('commute-check-out-button')).toHaveCount(0);

  snapshot = await page.evaluate(async ({ staffId, workDate }) => {
    const [attendanceResponse, attendancesResponse] = await Promise.all([
      fetch(`/rest/v1/attendance?staff_id=eq.${staffId}&date=eq.${workDate}&select=*`),
      fetch(`/rest/v1/attendances?staff_id=eq.${staffId}&work_date=eq.${workDate}&select=*`),
    ]);
    return {
      attendance: await attendanceResponse.json(),
      attendances: await attendancesResponse.json(),
    };
  }, { staffId: fakeUser.id, workDate });

  expect(snapshot.attendance[0]?.check_out).toBeTruthy();
  expect(snapshot.attendances[0]?.check_out_time).toBeTruthy();
  expect(runtimeErrors).toEqual([]);
});

test('mypage commute enables today check-in after midnight even when yesterday checkout was missed', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await installMutableDateMock(page, '2026-03-30T23:58:00+09:00');

  await mockSupabase(page, {
    attendance: [
      {
        id: 'attendance-open-yesterday',
        staff_id: fakeUser.id,
        date: '2026-03-30',
        check_in: '2026-03-30T00:10:00.000Z',
        check_out: null,
        status: '정상',
      },
    ],
    attendances: [],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '내정보',
      erp_mypage_tab: 'commute',
    },
  });

  await openMyPage(page);
  await page.getByRole('button', { name: /출퇴근/ }).click();

  await expect(page.getByTestId('commute-record-view')).toBeVisible();
  await expect(page.getByTestId('commute-check-out-button')).toBeVisible();

  await page.evaluate(() => {
    // @ts-expect-error browser test shim
    window.__setMockNow('2026-03-31T08:20:00+09:00');
  });

  await expect
    .poll(async () => page.getByTestId('commute-check-in-button').count(), { timeout: 4000 })
    .toBe(1);
  await expect(page.getByText('전날 미퇴근 기록이 남아 있습니다.')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('mypage commute marks check-in as late when the assigned shift start time has passed', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const frozenIso = '2026-03-27T08:33:00+09:00';
  const workDate = '2026-03-27';
  const shiftUser = {
    ...fakeUser,
    shift_id: 'shift-day-0830',
  };

  await page.addInitScript(({ iso }) => {
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(iso);
          return;
        }
        if (args.length === 1) {
          super(args[0]);
          return;
        }
        if (args.length === 2) {
          super(args[0], args[1]);
          return;
        }
        if (args.length === 3) {
          super(args[0], args[1], args[2]);
          return;
        }
        if (args.length === 4) {
          super(args[0], args[1], args[2], args[3]);
          return;
        }
        if (args.length === 5) {
          super(args[0], args[1], args[2], args[3], args[4]);
          return;
        }
        if (args.length === 6) {
          super(args[0], args[1], args[2], args[3], args[4], args[5]);
          return;
        }
        super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
      }

      static now() {
        return new RealDate(iso).getTime();
      }
    }

    MockDate.parse = RealDate.parse;
    MockDate.UTC = RealDate.UTC;
    // @ts-expect-error test shim
    window.Date = MockDate;
  }, { iso: frozenIso });

  await mockSupabase(page, {
    staffMembers: [shiftUser],
    attendance: [],
    attendances: [],
    shiftAssignments: [
      {
        id: 'shift-assignment-1',
        staff_id: shiftUser.id,
        work_date: workDate,
        shift_id: 'shift-day-0830',
      },
    ],
    workShifts: [
      {
        id: 'shift-day-0830',
        name: '외래/검사 월-금',
        start_time: '08:30',
        end_time: '17:30',
        company_name: shiftUser.company,
      },
    ],
  });

  await page.context().grantPermissions(['geolocation'], {
    origin: 'http://127.0.0.1:3000',
  });
  await page.context().setGeolocation({
    latitude: 34.806074,
    longitude: 126.405525,
  });

  await seedSession(page, {
    user: shiftUser,
    localStorage: {
      erp_last_menu: '내정보',
      erp_mypage_tab: 'commute',
    },
  });

  await openMyPage(page);
  await page.getByRole('button', { name: /출퇴근/ }).click();
  await expect(page.getByTestId('commute-check-in-button')).toBeVisible();
  await page.getByTestId('commute-check-in-button').click();

  const snapshot = await expect
    .poll(
      async () =>
        page.evaluate(async ({ staffId, targetDate }) => {
          const [attendanceResponse, attendancesResponse] = await Promise.all([
            fetch(`/rest/v1/attendance?staff_id=eq.${staffId}&select=*`),
            fetch(`/rest/v1/attendances?staff_id=eq.${staffId}&select=*`),
          ]);
          const attendanceRows = await attendanceResponse.json();
          const attendancesRows = await attendancesResponse.json();
          return {
            attendance: attendanceRows.find((row: any) => String(row.date) === targetDate) ?? null,
            attendances:
              attendancesRows.find((row: any) => String(row.work_date || row.date) === targetDate) ?? null,
          };
        }, { staffId: shiftUser.id, targetDate: workDate }),
      { timeout: 5000 }
    )
    .toMatchObject({
      attendance: { status: '지각' },
      attendances: { status: 'late' },
    });
  expect(runtimeErrors).toEqual([]);
});

test('mypage commute shows an early checkout as 조퇴 and keeps correction request available', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const workDate = '2026-03-30';
  const shiftUser = {
    ...fakeUser,
    shift_id: 'shift-day-0830',
  };

  await mockSupabase(page, {
    staffMembers: [shiftUser],
    attendance: [
      {
        id: 'attendance-early-leave-1',
        staff_id: shiftUser.id,
        date: workDate,
        check_in: '2026-03-29T23:20:00.000Z',
        check_out: '2026-03-30T07:05:00.000Z',
        status: '정상',
      },
    ],
    attendances: [
      {
        id: 'attendances-early-leave-1',
        staff_id: shiftUser.id,
        work_date: workDate,
        check_in_time: '2026-03-29T23:20:00.000Z',
        check_out_time: '2026-03-30T07:05:00.000Z',
        status: 'present',
      },
    ],
    shiftAssignments: [
      {
        id: 'shift-assignment-early-leave-1',
        staff_id: shiftUser.id,
        work_date: workDate,
        shift_id: 'shift-day-0830',
      },
    ],
    workShifts: [
      {
        id: 'shift-day-0830',
        name: '외래/검사 월-금',
        start_time: '08:30',
        end_time: '17:30',
        company_name: shiftUser.company,
      },
    ],
    approvals: [],
    attendanceCorrections: [],
  });

  await seedSession(page, {
    user: shiftUser,
    localStorage: {
      erp_last_menu: '내정보',
      erp_mypage_tab: 'commute',
    },
  });

  await openMyPage(page);
  await page.getByRole('button', { name: /출퇴근/ }).click();

  const commuteView = page.getByTestId('commute-record-view');
  await expect(commuteView.getByText('조퇴').first()).toBeVisible();
  await expect(commuteView.getByRole('button', { name: '정정 요청' }).first()).toBeVisible();

  await expect
    .poll(
      async () =>
        page.evaluate(async ({ staffId, targetDate }) => {
          const [attendanceResponse, attendancesResponse] = await Promise.all([
            fetch(`/rest/v1/attendance?staff_id=eq.${staffId}&date=eq.${targetDate}&select=*`),
            fetch(`/rest/v1/attendances?staff_id=eq.${staffId}&work_date=eq.${targetDate}&select=*`),
          ]);
          const attendanceRows = await attendanceResponse.json();
          const attendancesRows = await attendancesResponse.json();
          return {
            attendanceStatus: attendanceRows[0]?.status ?? null,
            attendancesStatus: attendancesRows[0]?.status ?? null,
          };
        }, { staffId: shiftUser.id, targetDate: workDate }),
      { timeout: 5000 }
    )
    .toEqual({
      attendanceStatus: '조퇴',
      attendancesStatus: 'early_leave',
    });

  await commuteView.getByRole('button', { name: '정정 요청' }).first().click();
  await expect(page.getByTestId('approval-view')).toBeVisible();
  await expect(page.getByTestId('attendance-correction-view')).toBeVisible();
  await expect(page.getByText('선택한 날짜 1건 정정 신청')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('mypage documents can upload a file and save it to the repository', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    documentRepository: [],
  });

  await page.route('**/storage/v1/object/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'mock-upload' }),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '내정보',
      erp_mypage_tab: 'documents',
    },
  });

  await openMyPage(page);
  await page.getByRole('button', { name: /서류제출/ }).click();

  await expect(page.getByTestId('mypage-documents-panel')).toBeVisible();
  await page.getByTestId('document-upload-file-0').click();
  await page.getByTestId('document-file-input').setInputFiles({
    name: 'resident-registration.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
  });

  await expect(page.getByTestId('document-view-0')).toBeVisible();
  await expect(page.getByTestId('document-status-0')).not.toContainText('미제출');

  const savedDocs = await page.evaluate(async (staffId) => {
    const response = await fetch(`/rest/v1/document_repository?created_by=eq.${staffId}&select=*`);
    return response.json();
  }, fakeUser.id);

  expect(savedDocs).toHaveLength(1);
  expect(savedDocs[0]?.created_by).toBe(fakeUser.id);
  expect(runtimeErrors).toEqual([]);
});

test('mypage certificates can open a print popup and trigger a browser download', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    certificateIssuances: [
      {
        id: 'certificate-issue-1',
        staff_id: fakeUser.id,
        cert_type: '재직증명서',
        serial_no: 'CERT-001',
        purpose: '은행 제출',
        issued_at: '2026-03-17T09:00:00.000Z',
        staff_members: {
          name: fakeUser.name,
        },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '내정보',
      erp_mypage_tab: 'records',
    },
  });

  await openMyPage(page);
  await page.getByRole('button', { name: '급여·증명서' }).click();
  await page.getByRole('button', { name: '발급 문서 카드' }).click();

  await expect(page.getByTestId('mypage-certificates-panel')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('certificate-print-certificate-issue-1').click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('h1')).toContainText('재직증명서');
  await expect(popup.locator('body')).toContainText('발급번호: CERT-001');
  await popup.close();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('certificate-download-certificate-issue-1').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('재직증명서');
  expect(download.suggestedFilename()).toContain('.html');
  expect(runtimeErrors).toEqual([]);
});

test('mypage documents can complete pending contract signature and sync onboarding artifacts', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const contractId = 'employment-contract-1';

  await page.addInitScript(() => {
    window.open = () =>
      ({
        document: {
          write() {},
          close() {},
        },
        print() {},
        close() {},
        focus() {},
      } as Window);
  });

  await mockSupabase(page, {
    companies: [
      {
        id: fakeUser.company_id,
        name: fakeUser.company,
        ceo_name: '??? ??',
        business_no: '123-45-67890',
        address: '서울 강남구 1',
        phone: '02-1234-5678',
        is_active: true,
      },
    ],
    employmentContracts: [
      {
        id: contractId,
        staff_id: fakeUser.id,
        company_name: fakeUser.company,
        contract_type: '근로계약서',
        status: '서명대기',
        requested_at: '2026-03-29T09:00:00.000Z',
        created_at: '2026-03-29T09:00:00.000Z',
      },
    ],
    onboardingChecklists: [
      {
        id: 'onboarding-checklist-1',
        staff_id: fakeUser.id,
        checklist_type: '입사',
        target_date: '2026-04-12',
        items: [
          {
            key: 'contract_signature',
            label: '근로계약 서명 완료',
            done: false,
            doneAt: null,
          },
        ],
        completed_at: null,
      },
    ],
    documentRepository: [],
  });

  await page.route('**/rest/v1/contract_templates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'contract-template-1',
          company_name: fakeUser.company,
          template_content: '근로계약 내용 {{staff_name}} / {{company_name}}',
          seal_url: null,
        },
      ]),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '내정보',
      erp_mypage_tab: 'documents',
    },
  });

  await openMyPage(page);
  await expect(page.getByTestId('contract-signature-modal')).toBeVisible();

  await page.getByTestId('contract-signature-next-button').click();

  const agreementChecks = page.locator('[data-testid^="contract-agreement-"]');
  const agreementCount = await agreementChecks.count();
  for (let index = 0; index < agreementCount; index += 1) {
    await agreementChecks.nth(index).check();
  }
  await page.getByTestId('contract-signature-next-button').click();

  await page.getByTestId('contract-confidentiality-checkbox').check();
  await page.getByTestId('contract-signature-next-button').click();

  const signatureCanvas = page.getByTestId('contract-signature-canvas');
  const signatureBox = await signatureCanvas.boundingBox();
  if (!signatureBox) {
    throw new Error('signature canvas box missing');
  }

  await page.mouse.move(signatureBox.x + 40, signatureBox.y + 60);
  await page.mouse.down();
  await page.mouse.move(signatureBox.x + 120, signatureBox.y + 90, { steps: 12 });
  await page.mouse.move(signatureBox.x + 180, signatureBox.y + 70, { steps: 12 });
  await page.mouse.up();

  await page.getByTestId('contract-signature-submit-button').click();

  await expect(page.getByTestId('contract-signature-modal')).toHaveCount(0);

  const snapshot = await page.evaluate(async ({ staffId, currentContractId }) => {
    const [contractsResponse, checklistResponse, docsResponse] = await Promise.all([
      fetch(`/rest/v1/employment_contracts?id=eq.${currentContractId}&select=*`),
      fetch(`/rest/v1/onboarding_checklists?staff_id=eq.${staffId}&select=*`),
      fetch(`/rest/v1/document_repository?created_by=eq.${staffId}&select=*`),
    ]);

    return {
      contracts: await contractsResponse.json(),
      checklists: await checklistResponse.json(),
      documents: await docsResponse.json(),
    };
  }, { staffId: fakeUser.id, currentContractId: contractId });

    expect(snapshot.contracts[0]?.signed_at).toBeTruthy();
  expect(
    snapshot.checklists.some((row: any) =>
      row?.items?.some((item: any) => item.key === 'contract_signature' && item.done),
    ),
  ).toBe(true);
  expect(
    snapshot.documents.some(
      (document: any) => String(document.title || '').includes(String(fakeUser.name)),
    ),
  ).toBe(true);
  expect(runtimeErrors).toEqual([]);
});


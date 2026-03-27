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

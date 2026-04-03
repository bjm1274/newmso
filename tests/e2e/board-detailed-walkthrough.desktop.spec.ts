import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const BOARD_MENU = '\uAC8C\uC2DC\uD310';
const NOTICE_BOARD = '\uACF5\uC9C0\uC0AC\uD56D';
const FREE_BOARD = '\uC790\uC720\uAC8C\uC2DC\uD310';
const CONDOLENCE_BOARD = '\uACBD\uC870\uC0AC';
const SURGERY_BOARD = '\uC218\uC220\uC77C\uC815';
const MRI_BOARD = 'MRI\uC77C\uC815';
const GUIDE_BOARD = '\uC5C5\uBB34\uAC00\uC774\uB4DC';

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

async function openBoardMenu(page: Page, boardName: string) {
  await page.getByTestId(buildSubMenuTestId(BOARD_MENU, boardName)).click();
  await expect(page.getByRole('heading', { name: boardName })).toBeVisible();
}

function parseBoardMonthLabel(label: string) {
  const match = label.match(/^(\d{4})년 (\d{1,2})월$/);
  if (!match) {
    throw new Error(`Unexpected board month label: ${label}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  return year * 12 + month;
}

async function goToBoardCalendarMonth(page: Page, targetLabel: string) {
  const boardView = page.getByTestId('board-view');
  const monthHeading = boardView.getByText(/^\d{4}년 \d{1,2}월$/).first();
  const targetValue = parseBoardMonthLabel(targetLabel);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const currentLabel = ((await monthHeading.textContent()) || '').trim();
    if (currentLabel === targetLabel) {
      return;
    }

    const currentValue = parseBoardMonthLabel(currentLabel);
    await page
      .getByRole('button', { name: currentValue < targetValue ? '다음달' : '이전달' })
      .click();
  }

  throw new Error(`Failed to navigate board calendar to ${targetLabel}`);
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('board detailed walkthrough clicks through each board menu in practical order', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    boardPosts: [],
    boardPostComments: [],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: NOTICE_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();

  await openBoardMenu(page, NOTICE_BOARD);
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-new-post-title').fill('E2E notice post');
  await page.getByTestId('board-new-post-content').fill('Notice detail body');
  await page.getByTestId('board-new-post-submit').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await page.getByTestId('board-comment-input').fill('notice comment');
  await page.getByTestId('board-comment-submit').click();
  await expect(page.getByText('notice comment')).toBeVisible();
  await page.getByTestId('board-post-detail-close').click();
  await expect(page.getByTestId('board-post-board-post-1')).toBeVisible();

  await openBoardMenu(page, FREE_BOARD);
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-new-post-title').fill('E2E free post');
  await page.getByTestId('board-new-post-content').fill('Free board detail body');
  await page.getByTestId('board-new-post-submit').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await page.getByTestId('board-post-detail-close').click();

  await openBoardMenu(page, CONDOLENCE_BOARD);
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();

  await openBoardMenu(page, SURGERY_BOARD);
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();

  await openBoardMenu(page, MRI_BOARD);
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('board notice list survives a missing is_pinned column', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    missingBoardPostColumns: ['is_pinned'],
    boardPosts: [
      {
        id: 'board-post-legacy-pinless-1',
        board_type: NOTICE_BOARD,
        title: 'Legacy notice without is_pinned',
        content: 'Fallback select should still load this post.',
        author_name: 'E2E Tester',
        company: 'E2E Clinic',
        company_id: '22222222-2222-2222-2222-222222222222',
        created_at: '2026-03-31T09:00:00.000Z',
        views: 3,
      },
    ],
    boardPostComments: [],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: NOTICE_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, NOTICE_BOARD);
  await expect(page.getByTestId('board-post-board-post-legacy-pinless-1')).toBeVisible();
  await expect(page.getByText('Legacy notice without is_pinned')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('board switch ignores a slower previous board response', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  const surgeryRows = [
    {
      id: 'board-post-slow-surgery-1',
      board_type: SURGERY_BOARD,
      title: 'Slow surgery post',
      content: 'This row should not remain after switching boards.',
      author_name: 'E2E Tester',
      company: 'E2E Clinic',
      company_id: '22222222-2222-2222-2222-222222222222',
      created_at: '2026-03-31T09:00:00.000Z',
      views: 1,
    },
  ];
  const noticeRows = [
    {
      id: 'board-post-fast-notice-1',
      board_type: NOTICE_BOARD,
      title: 'Fast notice post',
      content: 'The notice board should win the race.',
      author_name: 'E2E Tester',
      company: 'E2E Clinic',
      company_id: '22222222-2222-2222-2222-222222222222',
      created_at: '2026-04-01T09:00:00.000Z',
      views: 2,
    },
  ];

  await mockSupabase(page, {
    boardPosts: [...surgeryRows, ...noticeRows],
    boardPostComments: [],
  });

  await page.route('**/rest/v1/board_posts**', async (route) => {
    const url = new URL(route.request().url());
    const rawBoardType = String(url.searchParams.get('board_type') || '');
    const boardType = rawBoardType.startsWith('eq.') ? decodeURIComponent(rawBoardType.slice(3)) : '';
    const rows =
      boardType === SURGERY_BOARD
        ? surgeryRows
        : boardType === NOTICE_BOARD
          ? noticeRows
          : [];

    if (boardType === SURGERY_BOARD) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    } else if (boardType === NOTICE_BOARD) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: SURGERY_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, NOTICE_BOARD);
  await expect(page.getByText('Fast notice post')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText('Fast notice post')).toBeVisible();
  await expect(page.getByText('Slow surgery post')).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

test('guide board uploads and displays onboarding materials for new staff', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    boardPosts: [],
    boardPostComments: [],
  });

  await page.route('**/api/board/upload', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        fileName: 'joint-guide.pdf',
        type: 'file',
        url: 'http://127.0.0.1:3000/mock/joint-guide.pdf',
      }),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: GUIDE_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, GUIDE_BOARD);
  await expect(page.getByTestId('guide-library-view')).toBeVisible();

  await page.getByRole('button', { name: /수술실/ }).click();
  await page.getByTestId('guide-open-compose').click();
  await expect(page.getByTestId('guide-form')).toBeVisible();
  await expect(page.getByTestId('guide-department-input')).toHaveValue('수술실');
  await page.getByTestId('guide-title-input').fill('인공관절 수술 준비 가이드');
  await page.getByTestId('guide-kind-select').selectOption('education');
  await page.getByTestId('guide-audience-select').selectOption('new_hire');
  await page.getByTestId('guide-keywords-input').fill('인공관절, 멸균, 신규교육');
  await page
    .getByTestId('guide-description-input')
    .fill('1. 수술 준비물 확인\n2. 마취 준비 체크\n3. 멸균 기구 확인\n4. 인계 포인트 정리');
  await page.getByTestId('guide-file-input').setInputFiles({
    name: 'joint-guide.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('guide-pdf'),
  });
  await page.getByTestId('guide-save').click();

  await expect(page.getByTestId('guide-card-board-post-1')).toBeVisible();
  await expect(page.getByTestId('guide-detail')).toContainText('인공관절 수술 준비 가이드');
  await expect(page.getByTestId('guide-detail')).toContainText('신규직원');
  await expect(page.getByTestId('guide-detail')).toContainText('수술실');
  await expect(page.getByTestId('guide-detail')).toContainText('joint-guide.pdf');
  await expect(page.getByRole('link', { name: /joint-guide\.pdf/i })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('schedule post appears on the calendar immediately after registration', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    boardPosts: [],
    boardPostComments: [],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: SURGERY_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, SURGERY_BOARD);

  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await expect(page.getByTestId('board-new-post-submit')).toBeDisabled();
  await page.getByTestId('board-schedule-title').fill('knee surgery');
  await page.getByTestId('board-schedule-date').fill('2026-04-15');
  await page.getByTestId('board-schedule-period').selectOption('\uC624\uC804');
  await page.getByTestId('board-schedule-hour').selectOption('09');
  await page.getByTestId('board-schedule-minute').selectOption('30');
  await expect(page.getByTestId('board-new-post-submit')).toBeEnabled();
  await page.getByTestId('board-new-post-submit').click();

  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await page.getByTestId('board-post-detail-close').click();
  await expect(page.getByText('2026\uB144 4\uC6D4')).toBeVisible();
  await expect(page.getByTestId('board-calendar-day-count-2026-04-15')).toHaveText('1\uAC74');

  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, SURGERY_BOARD);
  await goToBoardCalendarMonth(page, '2026년 4월');
  await expect(page.getByText('2026\uB144 4\uC6D4')).toBeVisible();
  await expect(page.getByTestId('board-calendar-day-count-2026-04-15')).toHaveText('1\uAC74');

  expect(runtimeErrors).toEqual([]);
});

test('mri schedule survives refresh and keeps contrast flag', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    boardPosts: [],
    boardPostComments: [],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: MRI_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, MRI_BOARD);

  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-schedule-title').fill('knee mri');
  await page.getByTestId('board-schedule-date').fill('2026-04-18');
  await page.getByTestId('board-schedule-period').selectOption('\uC624\uD6C4');
  await page.getByTestId('board-schedule-hour').selectOption('02');
  await page.getByTestId('board-schedule-minute').selectOption('00');
  await page.getByLabel('\uC870\uC601\uC81C \uD544\uC694').check();
  await page.getByTestId('board-new-post-submit').click();

  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await expect(page.getByText('\uC870\uC601\uC81C \uD544\uC694')).toBeVisible();
  await page.getByTestId('board-post-detail-close').click();

  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, MRI_BOARD);
  await goToBoardCalendarMonth(page, '2026년 4월');
  await expect(page.getByText('2026\uB144 4\uC6D4')).toBeVisible();
  await expect(page.getByTestId('board-calendar-day-count-2026-04-18')).toHaveText('1\uAC74');
  await page.getByTestId('board-calendar-day-count-2026-04-18').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await expect(page.getByText('\uC870\uC601\uC81C \uD544\uC694')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('legacy schedule posts without metadata are surfaced with a repair warning', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    boardPosts: [
      {
        id: 'legacy-surgery-1',
        board_type: SURGERY_BOARD,
        title: '\uC88C\uCE21 \uBB34\uB98E \uC804\uCE58\uD658\uC220',
        content: '33',
        author_name: '\uC9C0\uBBFC\uC218',
        company: 'SY INC.',
        company_id: '22222222-2222-2222-2222-222222222222',
        created_at: '2026-03-24T05:54:17.541+00:00',
      },
    ],
    boardPostComments: [],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: SURGERY_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, SURGERY_BOARD);
  await expect(page.getByTestId('board-legacy-schedule-warning')).toBeVisible();
  await page.getByTestId('board-legacy-schedule-item-legacy-surgery-1').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await expect(page.getByTestId('board-schedule-legacy-warning')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('board read status modal shows read and pending audience counts', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        employee_no: 'E2E-001',
        name: 'E2E Tester',
        company: 'E2E Clinic',
        company_id: '22222222-2222-2222-2222-222222222222',
        department: '간호부',
        position: '부서장',
        status: '재직',
        permissions: { ...fakeUser.permissions },
      },
      {
        id: 'reader-1',
        name: '읽음 직원',
        company: 'E2E Clinic',
        company_id: '22222222-2222-2222-2222-222222222222',
        department: '원무부',
        position: '사원',
        status: '재직',
      },
      {
        id: 'pending-1',
        name: '미확인 직원',
        company: 'E2E Clinic',
        company_id: '22222222-2222-2222-2222-222222222222',
        department: '행정부',
        position: '사원',
        status: '재직',
      },
    ],
    boardPosts: [
      {
        id: 'board-post-read-1',
        board_type: FREE_BOARD,
        title: '읽음 현황 테스트',
        content: '상세 본문',
        author_id: 'reader-1',
        author_name: '읽음 직원',
        company: 'E2E Clinic',
        company_id: '22222222-2222-2222-2222-222222222222',
        created_at: '2026-03-27T01:00:00.000Z',
      },
    ],
    boardPostComments: [],
    boardPostReads: [
      {
        id: 'board-read-1',
        post_id: 'board-post-read-1',
        user_id: 'reader-1',
        read_at: '2026-03-27T02:00:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: BOARD_MENU,
      erp_last_subview: FREE_BOARD,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(BOARD_MENU)}`);

  await expect(page.getByTestId('board-view')).toBeVisible();
  await openBoardMenu(page, FREE_BOARD);
  await page.getByTestId('board-post-board-post-read-1').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await page.getByRole('button', { name: '읽음 확인' }).click();
  await expect(page.getByText('읽음 2명 · 미확인 1명')).toBeVisible();
  await expect(page.getByText('E2E Tester')).toBeVisible();
  await expect(page.getByText(/^읽음 직원$/).last()).toBeVisible();
  await expect(page.getByText(/^미확인 직원$/).last()).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const BOARD_MENU = '\uAC8C\uC2DC\uD310';
const NOTICE_BOARD = '\uACF5\uC9C0\uC0AC\uD56D';
const FREE_BOARD = '\uC790\uC720\uAC8C\uC2DC\uD310';
const CONDOLENCE_BOARD = '\uACBD\uC870\uC0AC';
const SURGERY_BOARD = '\uC218\uC220\uC77C\uC815';
const MRI_BOARD = 'MRI\uC77C\uC815';

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
  await page.getByRole('button', { name: '\uB2E4\uC74C\uB2EC' }).click();
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
  await page.getByRole('button', { name: '\uB2E4\uC74C\uB2EC' }).click();
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

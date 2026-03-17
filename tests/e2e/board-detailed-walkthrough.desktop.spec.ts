import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

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
  await page.getByTestId(buildSubMenuTestId('게시판', boardName)).click();
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
      erp_last_menu: '게시판',
      erp_last_subview: '공지사항',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('게시판')}`);

  await expect(page.getByTestId('board-view')).toBeVisible();

  await openBoardMenu(page, '공지사항');
  await expect(page.getByText('게시물이 없습니다.')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-new-post-title').fill('E2E 공지사항 점검');
  await page.getByTestId('board-new-post-content').fill('공지사항 상세 점검 본문입니다.');
  await page.getByTestId('board-new-post-submit').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E2E 공지사항 점검' })).toBeVisible();
  await page.getByTestId('board-comment-input').fill('공지 댓글 확인');
  await page.getByTestId('board-comment-submit').click();
  await expect(page.getByText('공지 댓글 확인')).toBeVisible();
  await page.getByTestId('board-post-detail-close').click();
  await expect(page.getByTestId('board-post-board-post-1')).toBeVisible();

  await openBoardMenu(page, '자유게시판');
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-new-post-title').fill('E2E 자유게시판 점검');
  await page.getByTestId('board-new-post-content').fill('자유게시판 상세 점검 본문입니다.');
  await page.getByTestId('board-new-post-submit').click();
  await expect(page.getByTestId('board-post-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E2E 자유게시판 점검' })).toBeVisible();
  await page.getByTestId('board-post-detail-close').click();

  await openBoardMenu(page, '경조사');
  await expect(page.getByTestId('board-toggle-new-post')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();

  await openBoardMenu(page, '수술일정');
  await expect(page.getByText('등록된 일정이 없습니다.')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();

  await openBoardMenu(page, 'MRI일정');
  await expect(page.getByText('등록된 일정이 없습니다.')).toBeVisible();
  await page.getByTestId('board-toggle-new-post').click();
  await expect(page.getByTestId('board-new-post-form')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

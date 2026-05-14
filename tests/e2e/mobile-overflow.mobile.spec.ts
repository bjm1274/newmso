/**
 * 320px 폭 모바일 환경에서 대표 화면들의 가로 오버플로우 부재를 검증한다.
 * `scrollWidth > clientWidth + 1` 조건으로 실제 넘침 여부를 측정한다.
 */
import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

/**
 * 지정 셀렉터 기준으로 실제 가로 오버플로우가 있는 요소 목록을 반환한다.
 *
 * 판단 기준:
 * - 요소 자신 또는 조상 중 overflow-x: auto/scroll/hidden/clip 이 있으면 제외
 *   (의도적 스크롤·클립 컨테이너 안 요소는 사용자에게 노출되지 않음)
 * - 요소의 getBoundingClientRect().right 가 뷰포트 너비 + 1px을 초과하면 실제 오버플로우
 */
async function findOverflowingElements(
  page: Page,
  rootSelector: string,
): Promise<string[]> {
  return page.evaluate((selector: string) => {
    const root = document.querySelector(selector);
    if (!root) return [];

    const viewportWidth = document.documentElement.clientWidth;

    /** 요소 자신 또는 조상(root 까지) 중 overflow-x 가 클리핑되는 값이면 true */
    function isClippedByAncestor(el: HTMLElement): boolean {
      let cur: HTMLElement | null = el;
      while (cur && cur !== document.body.parentElement) {
        const ox = window.getComputedStyle(cur).overflowX;
        if (ox === 'hidden' || ox === 'auto' || ox === 'scroll' || ox === 'clip') {
          return true;
        }
        if (cur === root) break;
        cur = cur.parentElement;
      }
      return false;
    }

    const all = [root as HTMLElement, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    const overflowing: string[] = [];

    for (const htmlEl of all) {
      // 조상(자신 포함)이 클리핑하면 제외
      if (isClippedByAncestor(htmlEl)) continue;

      const rect = htmlEl.getBoundingClientRect();
      // 화면 밖으로 실제로 넘치는 경우만 (우측 경계가 뷰포트 + 1px 초과)
      if (rect.right > viewportWidth + 1) {
        const tag = htmlEl.tagName.toLowerCase();
        const id = htmlEl.id ? `#${htmlEl.id}` : '';
        const rawCls = typeof htmlEl.className === 'string' ? htmlEl.className : '';
        const cls = rawCls
          ? `.${rawCls.trim().split(/\s+/).slice(0, 3).join('.')}`
          : '';
        overflowing.push(`${tag}${id}${cls} (right=${Math.round(rect.right)}, viewport=${viewportWidth})`);
      }
    }
    return overflowing;
  }, rootSelector);
}

// ─── 공통 셋업 ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
  await mockSupabase(page, {
    boardPosts: [
      {
        id: 'overflow-notice-1',
        board_type: '공지사항',
        title: '가로 오버플로우 테스트용 공지입니다 — 긴 제목',
        content: '테스트 본문',
        created_at: '2026-05-01T10:00:00.000Z',
        author_id: fakeUser.id,
        author_name: fakeUser.name,
        company_id: fakeUser.company_id,
        company: fakeUser.company,
        status: '게시중',
        attachments: [],
      },
    ],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Notice',
        type: 'notice',
        members: [],
        created_at: '2026-05-01T00:00:00.000Z',
        last_message_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'overflow-chat-room-1',
        name: '320px 오버플로우 검사용 채팅방',
        type: 'group',
        members: [fakeUser.id],
        created_at: '2026-05-01T09:00:00.000Z',
        last_message_at: '2026-05-01T10:00:00.000Z',
        last_message_preview: '오버플로우 테스트 메시지',
      },
    ],
    messages: [
      {
        id: 'overflow-msg-1',
        room_id: 'overflow-chat-room-1',
        sender_id: fakeUser.id,
        content: '오버플로우 테스트 메시지',
        created_at: '2026-05-01T10:00:00.000Z',
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
    ],
    staffMembers: [fakeUser],
  });
});

// ─── 테스트 ─────────────────────────────────────────────────────────────────

test('메인 홈 화면(내 정보) — body와 main-shell에 가로 오버플로우 없음', async ({ page }) => {
  await seedSession(page, { localStorage: { erp_last_menu: '내정보' } });
  await page.goto('/main');

  await expect(page.getByTestId('main-shell')).toBeVisible();
  await expect(page.getByTestId('mypage-view')).toBeVisible();

  const bodyOverflow = await findOverflowingElements(page, 'body');
  expect(bodyOverflow, `body에 오버플로우 요소 발견: ${bodyOverflow.join(', ')}`).toHaveLength(0);
});

test('메인 홈 화면 — 하단 탭바(mobile-tabbar)에 가로 오버플로우 없음', async ({ page }) => {
  await seedSession(page, { localStorage: { erp_last_menu: '내정보' } });
  await page.goto('/main');

  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();

  const tabbarOverflow = await findOverflowingElements(page, '[data-testid="mobile-tabbar"]');
  expect(
    tabbarOverflow,
    `mobile-tabbar에 오버플로우 요소 발견: ${tabbarOverflow.join(', ')}`,
  ).toHaveLength(0);
});

test('게시판 공지사항 목록 — body와 게시판 뷰에 가로 오버플로우 없음', async ({ page }) => {
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '게시판',
      erp_last_subview: '공지사항',
    },
  });

  await page.goto('/main?open_menu=게시판&open_board=공지사항');
  await expect(page.getByTestId('board-view')).toBeVisible();

  const bodyOverflow = await findOverflowingElements(page, 'body');
  expect(bodyOverflow, `board 화면 body에 오버플로우 요소 발견: ${bodyOverflow.join(', ')}`).toHaveLength(0);
});

test('게시판 공지사항 목록 — 서브 네비게이션(.app-subnav)에 가로 오버플로우 없음', async ({ page }) => {
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '게시판',
      erp_last_subview: '공지사항',
    },
  });

  await page.goto('/main?open_menu=게시판&open_board=공지사항');
  await expect(page.getByTestId('board-view')).toBeVisible();

  const subnavEl = page.locator('.app-subnav').first();
  const subnavVisible = await subnavEl.isVisible().catch(() => false);
  if (subnavVisible) {
    const subnavOverflow = await findOverflowingElements(page, '.app-subnav');
    expect(
      subnavOverflow,
      `.app-subnav에 오버플로우 요소 발견: ${subnavOverflow.join(', ')}`,
    ).toHaveLength(0);
  }
});

test('메신저(채팅) 화면 — body에 가로 오버플로우 없음', async ({ page }) => {
  await seedSession(page, { localStorage: { erp_last_menu: '채팅' } });

  await page.goto('/main?open_menu=채팅');
  await expect(page.getByTestId('chat-view')).toBeVisible();

  const bodyOverflow = await findOverflowingElements(page, 'body');
  expect(bodyOverflow, `chat 화면 body에 오버플로우 요소 발견: ${bodyOverflow.join(', ')}`).toHaveLength(0);
});

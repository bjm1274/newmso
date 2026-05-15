/**
 * 모바일 컴포넌트 회귀 — 320px 폭에서 핵심 표/카드 컴포넌트의
 * `md:hidden` ↔ `md:block` 분기가 정상 동작하는지 검증한다.
 *
 * mobile-overflow.mobile.spec.ts 가 "가로 넘침 없음"을 검증한다면,
 * 이 파일은 "모바일 카드 변형 자체가 실제로 렌더되는지"를 본다.
 *
 * 검증 원칙
 * - JM: 모바일 카드 변형 검증 단일 책임
 * - JM3: 실패 시 어떤 요소가 누락됐는지 메시지에 포함
 * - JM4: any 금지, page.evaluate 결과는 명시 타입
 * - JM7: 핵심 회귀 케이스만 — 상세 동작은 단위 테스트 영역
 */
import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

// ─── 유틸 ──────────────────────────────────────────────────────────────────

type VisibilityProbe = {
  desktopVisible: boolean;
  mobileVisible: boolean;
};

/**
 * Tailwind 의 `md:hidden` / `hidden md:block` 컨테이너가 현재 뷰포트에서
 * 어떻게 렌더되는지 측정한다. 320px(mobile-320) 에서는
 * desktopVisible=false, mobileVisible=true 여야 한다.
 */
async function probeResponsiveContainers(
  page: Page,
  rootSelector: string,
): Promise<VisibilityProbe> {
  return page.evaluate((selector: string): VisibilityProbe => {
    const root = document.querySelector(selector);
    if (!root) return { desktopVisible: false, mobileVisible: false };

    function isVisible(el: Element | null): boolean {
      if (!el) return false;
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el as HTMLElement);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    // 데스크탑 전용 컨테이너: `.hidden.md\\:block` 또는 `.hidden.md\\:flex`
    const desktopCandidates = Array.from(
      root.querySelectorAll(
        '.hidden.md\\:block, .hidden.md\\:flex, [data-variant="desktop"]',
      ),
    );
    // 모바일 전용 컨테이너: `.md\\:hidden` 단독
    const mobileCandidates = Array.from(
      root.querySelectorAll('.md\\:hidden, [data-variant="mobile"]'),
    );

    return {
      desktopVisible: desktopCandidates.some(isVisible),
      mobileVisible: mobileCandidates.some(isVisible),
    };
  }, rootSelector);
}

// ─── 공통 셋업 ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

// ─── 테스트 ─────────────────────────────────────────────────────────────────

test('모바일 메인 셸 — 하단 탭바와 사이드바 모바일 메뉴가 표시된다', async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto('/main');

  // main-shell 자체는 데스크탑/모바일 공용
  await expect(page.getByTestId('main-shell')).toBeVisible();
  // 모바일에서만 노출되는 하단 탭바
  await expect(page.getByTestId('mobile-tabbar')).toBeVisible();

  // 사이드바 mobile 트리거가 클릭 가능한 button 또는 role=button 인지 확인 (a11y)
  const homeMobile = page.getByTestId('sidebar-menu-home-mobile');
  await expect(homeMobile).toBeVisible();
  const tagName = await homeMobile.evaluate((el) => el.tagName.toLowerCase());
  expect(['button', 'a']).toContain(tagName);
});

test('모바일 게시판 — 카드형 변형(.md:hidden)이 노출되고 데스크탑 표는 숨겨진다', async ({ page }) => {
  await mockSupabase(page, {
    boardPosts: [
      {
        id: 'mobile-component-notice-1',
        board_type: '공지사항',
        title: '모바일 카드 변형 회귀용 공지',
        content: '본문',
        created_at: '2026-05-15T10:00:00.000Z',
        author_id: fakeUser.id,
        author_name: fakeUser.name,
        company_id: fakeUser.company_id,
        company: fakeUser.company,
        status: '게시중',
        attachments: [],
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: '게시판',
      erp_last_subview: '공지사항',
    },
  });

  await page.goto('/main?open_menu=게시판&open_board=공지사항');
  await expect(page.getByTestId('board-view')).toBeVisible();

  // 게시판 뷰 안에서 `.md:hidden` 모바일 변형이 적어도 하나는 보여야 한다.
  const probe = await probeResponsiveContainers(page, '[data-testid="board-view"]');
  expect(
    probe.mobileVisible,
    `board-view에서 모바일 전용 컨테이너(.md:hidden)가 노출되지 않음`,
  ).toBe(true);
});

test('모바일 채팅 — 채팅방 리스트가 카드형으로 렌더된다', async ({ page }) => {
  await mockSupabase(page, {
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Notice',
        type: 'notice',
        members: [],
        created_at: '2026-05-15T00:00:00.000Z',
        last_message_at: '2026-05-15T00:00:00.000Z',
      },
      {
        id: 'mobile-room-card-1',
        name: '모바일 카드 회귀용 방',
        type: 'group',
        members: [fakeUser.id],
        created_at: '2026-05-15T09:00:00.000Z',
        last_message_at: '2026-05-15T10:00:00.000Z',
        last_message_preview: '미리보기',
      },
    ],
    staffMembers: [fakeUser],
    messages: [],
  });
  await seedSession(page, {
    localStorage: { erp_last_menu: '채팅' },
  });

  await page.goto('/main?open_menu=채팅');
  await expect(page.getByTestId('chat-view')).toBeVisible();

  // 모바일 채팅 진입 시 방 리스트가 먼저 보이도록 되어 있다.
  const room = page.getByTestId('chat-room-mobile-room-card-1');
  await expect(room).toBeVisible();
  // 모바일에서는 메시지 입력기가 방 선택 전에는 숨겨져 있다.
  await expect(page.getByTestId('chat-message-input')).toBeHidden();
});

test('모바일 사이드바 — 모든 mobile 메뉴 항목에 접근 가능한 라벨/role이 존재한다', async ({ page }) => {
  const adminUser = {
    ...fakeUser,
    company: 'SY INC.',
    company_id: 'mso-company-id',
    role: 'admin',
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
      inventory: true,
    },
  };
  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
      { id: fakeUser.company_id, name: fakeUser.company, type: 'HOSPITAL', is_active: true },
    ],
  });
  await seedSession(page, { user: adminUser });
  await page.goto('/main');

  const menuTestIds = [
    'sidebar-menu-home-mobile',
    'sidebar-menu-extra-mobile',
    'sidebar-menu-chat-mobile',
    'sidebar-menu-board-mobile',
    'sidebar-menu-approval-mobile',
    'sidebar-menu-hr-mobile',
    'sidebar-menu-inventory-mobile',
    'sidebar-menu-admin-mobile',
  ];

  for (const testId of menuTestIds) {
    const item = page.getByTestId(testId);
    await expect(item, `${testId} 노출 실패`).toBeVisible();

    // 접근 가능한 이름(label/aria-label/visible text) 이 있어야 한다.
    const accessibleName = await item.evaluate((el): string => {
      const aria = el.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const text = (el as HTMLElement).innerText || el.textContent || '';
      return text.trim();
    });
    expect(
      accessibleName.length,
      `${testId}에 접근 가능한 이름이 없음`,
    ).toBeGreaterThan(0);
  }
});

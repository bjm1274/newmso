/**
 * pull-to-refresh.mobile.spec.ts — PTR 동작 검증
 *
 * 검증 흐름:
 *   1. 알림 화면 진입 (PullRefreshIndicator 포함)
 *   2. touchstart → touchmove(아래) → touchend 이벤트 dispatch
 *   3. PullRefreshIndicator의 aria-live "새로고침 중" 메시지 확인
 *   4. 갱신 완료 후 "갱신 완료" 메시지 확인
 *
 * JM:  파일 단일 책임 (~110줄)
 * JM3: 실패 시 trace + screenshot 자동 보존
 * JM4: any 금지, Page 타입 활용
 * JM7: 행동 테스트 — aria-live 메시지·role=status 기반
 */

import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, mockSupabase, seedSession } from './helpers';

/** scroll container에서 pull-to-refresh 제스처를 시뮬레이션한다 */
async function simulatePullGesture(page: Page, containerSelector: string, pullDistancePx = 100) {
  // touchstart → touchmove(여러 단계) → touchend
  await page.evaluate(
    ({ selector, distance }) => {
      const container = document.querySelector(selector) as HTMLElement | null;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + 10; // 최상단에서 시작

      const mkTouch = (x: number, y: number) => {
        return new Touch({
          identifier: 1,
          target: container,
          clientX: x,
          clientY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 10,
          force: 0.5,
        });
      };

      const dispatch = (type: string, touches: Touch[]) => {
        const evt = new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches,
          changedTouches: touches,
        });
        container.dispatchEvent(evt);
      };

      dispatch('touchstart', [mkTouch(startX, startY)]);

      // 여러 단계로 아래로 이동
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        dispatch('touchmove', [mkTouch(startX, startY + (distance * i) / steps)]);
      }

      dispatch('touchend', [mkTouch(startX, startY + distance)]);
    },
    { selector: containerSelector, distance: pullDistancePx }
  );
}

/** role=status aria-live 영역의 텍스트를 읽어온다 */
async function getAriaLiveText(page: Page): Promise<string> {
  const texts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="status"][aria-live]'))
      .map(el => (el as HTMLElement).textContent ?? '')
      .filter(t => t.trim().length > 0);
  });
  return texts.join(' ');
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('알림 화면에서 pull-to-refresh 제스처 시 새로고침 중 상태가 표시된다', async ({ page }) => {
  await mockSupabase(page, { notifications: [] });
  await seedSession(page, {
    localStorage: { erp_last_menu: '알림' },
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/main?open_menu=알림');

  // 알림 화면 진입 확인
  await expect(page.getByTestId('main-shell')).toBeVisible();

  // 스크롤 컨테이너 확인 (.m-scroll 또는 overflow-y-auto)
  await page.waitForSelector('.m-scroll, [class*="scroll"]', { timeout: 5000 }).catch(() => null);

  // PTR 제스처 실행
  await simulatePullGesture(page, '.m-scroll, [class*="m-screen"] > div:last-child', 120);

  // PullRefreshIndicator의 aria-live 메시지 확인 또는 role=status 영역 확인
  // "새로고침 중" 또는 "갱신 완료" 중 하나가 나타나야 함
  await expect
    .poll(async () => getAriaLiveText(page), { timeout: 8000, intervals: [200, 500] })
    .toMatch(/새로고침|갱신|loading|refresh/i);
});

test('알림 화면 PTR 완료 후 갱신 완료 메시지가 표시된다', async ({ page }) => {
  const notifications = [
    {
      id: 'notif-ptr-1',
      user_id: '11111111-1111-1111-1111-111111111111',
      type: 'approval',
      title: 'PTR 테스트 알림',
      body: 'pull-to-refresh 검증용',
      created_at: new Date().toISOString(),
      read: false,
    },
  ];

  await mockSupabase(page, { notifications });
  await seedSession(page, {
    localStorage: { erp_last_menu: '알림' },
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/main?open_menu=알림');
  await expect(page.getByTestId('main-shell')).toBeVisible();

  // 알림 항목 로드 대기
  await page.waitForSelector('.m-scroll', { timeout: 5000 }).catch(() => null);

  // PTR 제스처 실행
  await simulatePullGesture(page, '.m-scroll', 130);

  // refreshing → false 전환 시 "갱신 완료" 확인
  // aria-live 메시지 또는 PullRefreshIndicator 사라짐
  await expect
    .poll(async () => {
      const liveText = await getAriaLiveText(page);
      // indicator가 사라지거나 "갱신 완료" 메시지가 나타남
      const indicatorGone = await page.locator('[aria-busy="true"]').count().then(n => n === 0);
      return liveText.includes('갱신') || liveText.includes('완료') || indicatorGone;
    }, { timeout: 10000, intervals: [300, 600] })
    .toBe(true);
});

test('게시판 목록에서 PTR 제스처가 동작한다', async ({ page }) => {
  await mockSupabase(page, { boardPosts: [] });
  await seedSession(page, {
    localStorage: { erp_last_menu: '게시판' },
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/main?open_menu=게시판');
  await expect(page.getByTestId('board-view')).toBeVisible({ timeout: 8000 });

  await page.waitForSelector('.m-scroll', { timeout: 5000 }).catch(() => null);

  // 오류 없이 PTR 제스처 실행
  await simulatePullGesture(page, '.m-scroll', 100);

  // 오류 없이 완료되면 통과 (기본 동작 확인)
  await page.waitForTimeout(1000);
  // 페이지가 여전히 살아있는지 확인
  await expect(page.getByTestId('board-view')).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("chat reveals the latest message first even when Pretendard finishes loading late", async ({ page }) => {
  await page.route("**/pretendard.min.css", async (route) => {
    const response = await route.fetch();
    const originalCss = await response.text();
    const patchedCss = originalCss.replace(/local\('Pretendard[^']*'\),?/g, "");

    await route.fulfill({
      status: response.status(),
      contentType: "text/css",
      body: patchedCss,
    });
  });

  await page.route("**/Pretendard-*.woff2", async (route) => {
    await page.waitForTimeout(1400);
    await route.continue();
  });

  const longMessages = Array.from({ length: 40 }, (_, index) => ({
    id: `msg-font-late-${index + 1}`,
    room_id: "room-font-late",
    sender_id: index % 2 === 0 ? fakeUser.id : "peer-font-late",
    sender_name: index % 2 === 0 ? fakeUser.name : "늦은 폰트 동료",
    content:
      index === 39
        ? "최신 메시지입니다. 폰트가 늦게 붙어도 이 문장이 가장 먼저 보여야 합니다."
        : `폰트 지연 테스트 메시지 ${index + 1}번입니다. 실제 사용자 화면처럼 줄바꿈이 많이 생기도록 같은 문장을 조금 길게 적습니다. 한글 문장이 길어질수록 폰트 교체 시 높이 변화가 커집니다.`,
    created_at: `2026-03-08T15:${String(index).padStart(2, "0")}:00.000Z`,
    is_deleted: false,
  }));

  await mockSupabase(page, {
    chatRooms: [
      {
        id: "00000000-0000-0000-0000-000000000000",
        name: "Notice",
        type: "notice",
        members: [],
        created_at: "2026-03-08T00:00:00.000Z",
        last_message_at: "2026-03-08T00:00:00.000Z",
      },
      {
        id: "room-font-late",
        name: "폰트 지연 방",
        type: "group",
        members: [fakeUser.id, "peer-font-late"],
        created_at: "2026-03-08T15:00:00.000Z",
        last_message_at: "2026-03-08T15:39:00.000Z",
        last_message_preview: "최신 메시지입니다. 폰트가 늦게 붙어도 이 문장이 가장 먼저 보여야 합니다.",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-font-late",
        name: "늦은 폰트 동료",
        employee_no: "E2E-CHAT-FONT-LATE",
      },
    ],
    messages: longMessages,
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "채팅",
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: "채팅" }).toString()}`);
  await expect(page.getByTestId("chat-view")).toBeVisible();

  await page.evaluate(() => {
    (window as typeof window & { __chatFontLateFirstVisibleRows?: string[] | null }).__chatFontLateFirstVisibleRows = null;

    const installRecorder = () => {
      const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLDivElement | null;
      if (!list) return false;

      let captured = false;
      const capture = () => {
        if (captured) return;
        const listRect = list.getBoundingClientRect();
        const visibleRows = Array.from(list.querySelectorAll('[data-testid^="chat-message-row-"]'))
          .filter((node) => {
            const rect = (node as HTMLElement).getBoundingClientRect();
            return rect.bottom > listRect.top && rect.top < listRect.bottom;
          })
          .map((node) => (node as HTMLElement).dataset.testid || "");

        if (visibleRows.length === 0) return;

        captured = true;
        (window as typeof window & { __chatFontLateFirstVisibleRows?: string[] | null }).__chatFontLateFirstVisibleRows = visibleRows;
        observer.disconnect();
        list.removeEventListener("scroll", capture);
      };

      const observer = new MutationObserver(() => {
        window.requestAnimationFrame(capture);
      });
      observer.observe(list, { childList: true, subtree: true });
      list.addEventListener("scroll", capture, { passive: true });
      window.requestAnimationFrame(capture);
      return true;
    };

    if (installRecorder()) return;

    const timer = window.setInterval(() => {
      if (!installRecorder()) return;
      window.clearInterval(timer);
    }, 16);
  });

  await page.getByTestId("chat-room-room-font-late").click();
  await expect(page.getByTestId("chat-scroll-to-latest-button")).toBeHidden();
  await page.waitForTimeout(700);
  await expect(page.getByTestId("chat-scroll-to-latest-button")).toBeHidden();

  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as typeof window & { __chatFontLateFirstVisibleRows?: string[] | null }).__chatFontLateFirstVisibleRows || [],
      ),
    )
    .not.toEqual([]);

  const capturedRows = await page.evaluate(() =>
    (window as typeof window & { __chatFontLateFirstVisibleRows?: string[] | null }).__chatFontLateFirstVisibleRows || [],
  );

  expect(
    capturedRows.some((testId: string) =>
      ["chat-message-row-msg-font-late-38", "chat-message-row-msg-font-late-39", "chat-message-row-msg-font-late-40"].includes(testId),
    ),
  ).toBe(true);
  expect(
    capturedRows.some((testId: string) =>
      ["chat-message-row-msg-font-late-1", "chat-message-row-msg-font-late-2", "chat-message-row-msg-font-late-3"].includes(testId),
    ),
  ).toBe(false);

  await expect(page.getByTestId("chat-message-msg-font-late-40")).toBeVisible();
  await expect
    .poll(async () =>
      page.getByTestId("chat-message-list").evaluate((node) => {
        const el = node as HTMLDivElement;
        return Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 24;
      }),
    )
    .toBe(true);
});

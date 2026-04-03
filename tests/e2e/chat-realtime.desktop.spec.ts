import { expect, test } from "@playwright/test";
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("chat renders incoming realtime messages immediately in the open conversation", async ({ page }) => {
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
        id: "room-1",
        name: "Realtime Room",
        type: "group",
        members: [fakeUser.id, "peer-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "hello chat",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-1",
        name: "Chat Peer Realtime",
        employee_no: "E2E-CHAT-099",
      },
    ],
    messages: [
      {
        id: "msg-1",
        room_id: "room-1",
        sender_id: fakeUser.id,
        content: "hello chat",
        created_at: "2026-03-08T10:00:00.000Z",
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
      erp_chat_last_room: "room-1",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await expect(page.getByTestId("chat-room-room-1")).toBeVisible();
  await page.getByTestId("chat-room-room-1").click();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("erp-mock-chat-message-insert", {
        detail: {
          row: {
            id: "msg-realtime-1",
            room_id: "room-1",
            sender_id: "peer-1",
            sender_name: "Chat Peer Realtime",
            content: "realtime message arrives now",
            created_at: "2026-03-08T10:01:00.000Z",
            is_deleted: false,
          },
        },
      }),
    );
  });

  await expect(
    page
      .locator("span.break-words.whitespace-pre-wrap")
      .filter({ hasText: "realtime message arrives now" }),
  ).toBeVisible();
});

test("chat shows unread counters only on messages I sent", async ({ page }) => {
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
        id: "room-1",
        name: "Direct Room",
        type: "direct",
        members: [fakeUser.id, "peer-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:01:00.000Z",
        last_message_preview: "peer message",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-1",
        name: "Chat Peer Realtime",
        employee_no: "E2E-CHAT-099",
      },
    ],
    messages: [
      {
        id: "msg-mine",
        room_id: "room-1",
        sender_id: fakeUser.id,
        content: "my message",
        created_at: "2026-03-08T10:00:00.000Z",
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
      {
        id: "msg-peer",
        room_id: "room-1",
        sender_id: "peer-1",
        content: "peer message",
        created_at: "2026-03-08T10:01:00.000Z",
        is_deleted: false,
        staff: { name: "Chat Peer Realtime", photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
      erp_chat_last_room: "room-1",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.getByTestId("chat-room-room-1").click();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  await expect(page.getByTestId("chat-message-read-status-msg-mine")).toHaveText("1");
  await expect(page.getByTestId("chat-message-read-status-msg-peer")).toHaveCount(0);
});

test("chat clears message unread counters when a peer reads from another direct room in the same conversation", async ({ page }) => {
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
        id: "room-direct-a",
        name: "Direct Room A",
        type: "direct",
        members: [fakeUser.id, "peer-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "my own older direct",
      },
      {
        id: "room-direct-b",
        name: "Direct Room B",
        type: "direct",
        members: ["peer-1", fakeUser.id],
        created_at: "2026-03-08T09:30:00.000Z",
        last_message_at: "2026-03-08T10:10:00.000Z",
        last_message_preview: "peer reply in sibling room",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-1",
        name: "Merged Direct Peer",
        employee_no: "E2E-CHAT-188",
      },
    ],
    messages: [
      {
        id: "msg-own-direct",
        room_id: "room-direct-a",
        sender_id: fakeUser.id,
        content: "my own older direct",
        created_at: "2026-03-08T10:00:00.000Z",
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
      {
        id: "msg-peer-direct",
        room_id: "room-direct-b",
        sender_id: "peer-1",
        content: "peer reply in sibling room",
        created_at: "2026-03-08T10:10:00.000Z",
        is_deleted: false,
        staff: { name: "Merged Direct Peer", photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
      erp_chat_last_room: "room-direct-b",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.getByTestId("chat-room-room-direct-b").click();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  await expect(page.getByTestId("chat-message-read-status-msg-own-direct")).toHaveText("1");

  await page.evaluate(async () => {
    await fetch("/rest/v1/room_read_cursors?on_conflict=user_id,room_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: "peer-1",
        room_id: "room-direct-a",
        last_read_at: "2026-03-08T10:12:00.000Z",
      }),
    });

    const channel = new BroadcastChannel("erp-chat-sync");
    channel.postMessage({
      action: "message-read",
      roomId: "room-direct-a",
      at: Date.now(),
    });
    channel.close();
  });

  await expect(page.getByTestId("chat-message-read-status-msg-own-direct")).toHaveCount(0);
});

test("chat updates room preview and unread count immediately for messages from another room", async ({ page }) => {
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
        id: "room-1",
        name: "Active Room",
        type: "group",
        members: [fakeUser.id, "peer-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "hello active room",
      },
      {
        id: "room-2",
        name: "Background Room",
        type: "group",
        members: [fakeUser.id, "peer-2"],
        created_at: "2026-03-08T09:30:00.000Z",
        last_message_at: "2026-03-08T10:10:00.000Z",
        last_message_preview: "hello background room",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-1",
        name: "Chat Peer One",
        employee_no: "E2E-CHAT-001",
      },
      {
        ...fakeUser,
        id: "peer-2",
        name: "Chat Peer Two",
        employee_no: "E2E-CHAT-002",
      },
    ],
    messages: [
      {
        id: "msg-1",
        room_id: "room-1",
        sender_id: fakeUser.id,
        content: "hello active room",
        created_at: "2026-03-08T10:00:00.000Z",
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
      {
        id: "msg-2",
        room_id: "room-2",
        sender_id: "peer-2",
        content: "hello background room",
        created_at: "2026-03-08T10:10:00.000Z",
        is_deleted: false,
        staff: { name: "Chat Peer Two", photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
      erp_chat_last_room: "room-1",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.getByTestId("chat-room-room-1").click();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("erp-mock-chat-message-insert", {
        detail: {
          row: {
            id: "msg-realtime-room-2",
            room_id: "room-2",
            sender_id: "peer-2",
            sender_name: "Chat Peer Two",
            content: "fresh preview room two",
            created_at: "2026-03-08T10:11:00.000Z",
            is_deleted: false,
          },
        },
      }),
    );
  });

  const backgroundRoom = page.getByTestId("chat-room-room-2");
  await expect(backgroundRoom).toContainText("fresh preview room two");
  await expect(backgroundRoom).toContainText("1");
});

test("chat clears unread badges across the whole 1:1 conversation when one direct room is opened", async ({ page }) => {
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
        id: "room-direct-a",
        name: "Direct Room A",
        type: "direct",
        members: [fakeUser.id, "peer-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "my own older direct",
      },
      {
        id: "room-direct-b",
        name: "Direct Room B",
        type: "direct",
        members: ["peer-1", fakeUser.id],
        created_at: "2026-03-08T09:30:00.000Z",
        last_message_at: "2026-03-08T10:10:00.000Z",
        last_message_preview: "latest direct preview",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-1",
        name: "Unread Peer",
        employee_no: "E2E-CHAT-777",
      },
    ],
    messages: [
      {
        id: "msg-own-direct",
        room_id: "room-direct-a",
        sender_id: fakeUser.id,
        content: "my own older direct",
        created_at: "2026-03-08T10:00:00.000Z",
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
      {
        id: "msg-peer-direct-old",
        room_id: "room-direct-b",
        sender_id: "peer-1",
        content: "older direct message",
        created_at: "2026-03-08T10:10:00.000Z",
        is_deleted: false,
        staff: { name: "Unread Peer", photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );

  const directRoom = page.getByTestId("chat-room-room-direct-b");

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("erp-mock-chat-message-insert", {
        detail: {
          row: {
            id: "msg-peer-direct-unread",
            room_id: "room-direct-b",
            sender_id: "peer-1",
            sender_name: "Unread Peer",
            content: "fresh direct unread",
            created_at: "2026-03-08T10:11:00.000Z",
            is_deleted: false,
          },
        },
      }),
    );
  });

  await directRoom.click();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  await expect
    .poll(async () => {
      const text = (await directRoom.textContent()) || "";
      return /\b1\b/.test(text);
    })
    .toBe(false);
});

test("chat opens a room and re-clicking the room list keeps the view aligned to the latest messages", async ({ page }) => {
  const longMessages = Array.from({ length: 40 }, (_, index) => ({
    id: `msg-long-${index + 1}`,
    room_id: "room-1",
    sender_id: index % 2 === 0 ? fakeUser.id : "peer-1",
    content: `long message ${index + 1}`,
    created_at: `2026-03-08T10:${String(index).padStart(2, "0")}:00.000Z`,
    is_deleted: false,
    staff: { name: index % 2 === 0 ? fakeUser.name : "Chat Peer Realtime", photo_url: null },
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
        id: "room-1",
        name: "Long Room",
        type: "group",
        members: [fakeUser.id, "peer-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:39:00.000Z",
        last_message_preview: "long message 40",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-1",
        name: "Chat Peer Realtime",
        employee_no: "E2E-CHAT-099",
      },
    ],
    messages: longMessages,
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { __chatFirstVisibleRows?: string[] | null }).__chatFirstVisibleRows = null;

    const installRecorder = () => {
      const list = document.querySelector('[data-testid="chat-message-list"]') as HTMLDivElement | null;
      if (!list) return false;

      let captured = false;
      const capture = () => {
        if (captured) return;
        const listRect = list.getBoundingClientRect();
        const visibleRows = Array.from(
          list.querySelectorAll('[data-testid^="chat-message-row-"]')
        )
          .filter((node) => {
            const rect = (node as HTMLElement).getBoundingClientRect();
            return rect.bottom > listRect.top && rect.top < listRect.bottom;
          })
          .map((node) => (node as HTMLElement).dataset.testid || "");

        if (visibleRows.length === 0) return;

        captured = true;
        (window as typeof window & { __chatFirstVisibleRows?: string[] | null }).__chatFirstVisibleRows = visibleRows;
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
  await page.getByTestId("chat-room-room-1").click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as typeof window & { __chatFirstVisibleRows?: string[] | null }).__chatFirstVisibleRows || []
      ),
    )
    .not.toEqual([]);
  const firstVisibleRows = await page.evaluate(() =>
    (window as typeof window & { __chatFirstVisibleRows?: string[] | null }).__chatFirstVisibleRows || []
  );
  expect(
    firstVisibleRows.some((testId: string) =>
      ["chat-message-row-msg-long-38", "chat-message-row-msg-long-39", "chat-message-row-msg-long-40"].includes(testId)
    )
  ).toBe(true);
  expect(
    firstVisibleRows.some((testId: string) =>
      ["chat-message-row-msg-long-1", "chat-message-row-msg-long-2", "chat-message-row-msg-long-3"].includes(testId)
    )
  ).toBe(false);
  await expect(page.getByTestId("chat-message-msg-long-40")).toBeVisible();

  await expect
    .poll(async () =>
      page.getByTestId("chat-message-list").evaluate((node) => {
        const el = node as HTMLDivElement;
        return Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 24;
      }),
    )
    .toBe(true);

  await page.getByTestId("chat-message-list").evaluate((node) => {
    const el = node as HTMLDivElement;
    el.scrollTop = 0;
  });

  await expect
    .poll(async () =>
      page.getByTestId("chat-message-list").evaluate((node) => {
        const el = node as HTMLDivElement;
        return el.scrollTop <= 4;
      }),
    )
    .toBe(true);

  await page.getByTestId("chat-room-room-1").click();

  await expect
    .poll(async () =>
      page.getByTestId("chat-message-list").evaluate((node) => {
        const el = node as HTMLDivElement;
        return Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 24;
      }),
    )
    .toBe(true);
});

test("chat keeps the latest message visible when delayed notice data shrinks the list", async ({ page }) => {
  const longMessages = Array.from({ length: 40 }, (_, index) => ({
    id: `msg-delay-${index + 1}`,
    room_id: "room-delay",
    sender_id: index % 2 === 0 ? fakeUser.id : "peer-delay",
    content: `delay message ${index + 1}`,
    created_at: `2026-03-08T11:${String(index).padStart(2, "0")}:00.000Z`,
    is_deleted: false,
    staff: { name: index % 2 === 0 ? fakeUser.name : "Delayed Peer", photo_url: null },
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
        id: "room-delay",
        name: "Delayed Notice Room",
        type: "group",
        members: [fakeUser.id, "peer-delay"],
        created_at: "2026-03-08T10:00:00.000Z",
        last_message_at: "2026-03-08T11:39:00.000Z",
        last_message_preview: "delay message 40",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-delay",
        name: "Delayed Peer",
        employee_no: "E2E-CHAT-100",
      },
    ],
    messages: longMessages,
    pinnedMessages: [
      {
        room_id: "room-delay",
        message_id: "msg-delay-40",
      },
    ],
  });

  await page.route("**/rest/v1/pinned_messages*", async (route) => {
    await page.waitForTimeout(180);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ message_id: "msg-delay-40" }]),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();

  await page.getByTestId("chat-room-room-delay").click();

  await expect(page.getByText("공지 메시지")).toBeVisible();
  await expect(page.getByTestId("chat-message-msg-delay-40")).toBeVisible();
  await expect(page.getByRole("button", { name: "최신 메시지" })).toBeHidden();
});

test("chat marks notifications as read when a message arrives in the already open room", async ({ page }) => {
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
        id: "room-open-read",
        name: "Open Read Room",
        type: "group",
        members: [fakeUser.id, "peer-open-read"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "already here",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-open-read",
        name: "Open Read Peer",
        employee_no: "E2E-CHAT-321",
      },
    ],
    messages: [
      {
        id: "msg-open-read-seed",
        room_id: "room-open-read",
        sender_id: fakeUser.id,
        content: "already here",
        created_at: "2026-03-08T10:00:00.000Z",
        is_deleted: false,
        staff: { name: fakeUser.name, photo_url: null },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
      erp_chat_last_room: "room-open-read",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.getByTestId("chat-room-room-open-read").click();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  await page.evaluate(async (userId) => {
    await fetch("/rest/v1/notifications", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "notification-chat-open-room-1",
        user_id: userId,
        type: "message",
        title: "Open room unread",
        body: "This should be marked read immediately",
        read_at: null,
        created_at: "2026-03-08T10:01:00.000Z",
        metadata: {
          room_id: "room-open-read",
          id: "msg-open-read-live",
          message_id: "msg-open-read-live",
          type: "message",
        },
      }),
    });
  }, fakeUser.id);

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("erp-mock-chat-message-insert", {
        detail: {
          row: {
            id: "msg-open-read-live",
            room_id: "room-open-read",
            sender_id: "peer-open-read",
            sender_name: "Open Read Peer",
            content: "arrived while room was already open",
            created_at: "2026-03-08T10:01:00.000Z",
            is_deleted: false,
          },
        },
      }),
    );
  });

  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const response = await fetch("/rest/v1/notifications?id=eq.notification-chat-open-room-1&select=*");
        const rows = await response.json();
        return Boolean(rows?.[0]?.read_at);
      });
    })
    .toBe(true);
});

test("chat global search jumps to the selected message and keeps the query highlighted", async ({ page }) => {
  const longMessages = Array.from({ length: 60 }, (_, index) => ({
    id: `msg-search-${index + 1}`,
    room_id: "room-1",
    sender_id: index % 2 === 0 ? fakeUser.id : "peer-1",
    content:
      index === 4
        ? "needle keyword jumps to this target message"
        : `filler message ${index + 1}`,
    created_at: `2026-03-08T10:${String(index).padStart(2, "0")}:00.000Z`,
    is_deleted: false,
    staff: { name: index % 2 === 0 ? fakeUser.name : "Chat Peer Realtime", photo_url: null },
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
        id: "room-1",
        name: "Search Room",
        type: "group",
        members: [fakeUser.id, "peer-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:59:00.000Z",
        last_message_preview: "filler message 60",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-1",
        name: "Chat Peer Realtime",
        employee_no: "E2E-CHAT-099",
      },
    ],
    messages: longMessages,
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "\uCC44\uD305",
      erp_chat_last_room: "room-1",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.getByTestId("chat-room-room-1").click();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  const targetMessage = page.getByTestId("chat-message-msg-search-5");

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-message-list"]');
        const target = document.querySelector('[data-testid="chat-message-msg-search-5"]');
        if (!list || !target) return null;
        const listRect = list.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        return targetRect.top >= listRect.top && targetRect.bottom <= listRect.bottom;
      }),
    )
    .toBe(false);

  await page.getByTestId("chat-open-global-search").click();
  await expect(page.getByTestId("chat-global-search-modal")).toBeVisible();
  await page.getByTestId("chat-global-search-input").fill("needle keyword");
  await page.getByTestId("chat-global-search-modal").getByRole("button", { name: "메시지" }).click();
  await expect(page.getByTestId("chat-global-search-result-msg-search-5")).toBeVisible();
  await page.getByTestId("chat-global-search-result-msg-search-5").click();

  await expect(page.getByTestId("chat-global-search-modal")).toHaveCount(0);
  await expect(targetMessage).toBeVisible();
  await expect(
    targetMessage.locator("mark").filter({ hasText: "needle keyword" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-message-list"]');
        const target = document.querySelector('[data-testid="chat-message-msg-search-5"]');
        if (!list || !target) return null;
        const listRect = list.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        return targetRect.top >= listRect.top && targetRect.bottom <= listRect.bottom;
      }),
    )
    .toBe(true);
});

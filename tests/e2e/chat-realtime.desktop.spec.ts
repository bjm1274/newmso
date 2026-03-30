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

test("chat opens a room already aligned to the latest messages", async ({ page }) => {
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
      erp_chat_last_room: "room-1",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "\uCC44\uD305" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.getByTestId("chat-room-room-1").click();
  await expect(page.getByTestId("chat-message-msg-long-40")).toBeVisible();

  await expect
    .poll(async () =>
      page.getByTestId("chat-message-list").evaluate((node) => {
        const el = node as HTMLDivElement;
        return Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 24;
      }),
    )
    .toBe(true);
});

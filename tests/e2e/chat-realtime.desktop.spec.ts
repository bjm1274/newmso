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

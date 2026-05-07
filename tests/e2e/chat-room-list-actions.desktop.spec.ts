import { expect, test } from "@playwright/test";
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("chat room list reveals room controls only after the selected room is pressed twice and shows last activity time", async ({
  page,
}) => {
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
        name: "First Room",
        type: "group",
        members: [fakeUser.id, "peer-room-1"],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-10T11:30:00.000Z",
        last_message_preview: "first room preview",
      },
      {
        id: "room-2",
        name: "Second Room",
        type: "group",
        members: [fakeUser.id, "peer-room-2"],
        created_at: "2026-03-07T09:00:00.000Z",
        last_message_at: "2026-03-09T08:15:00.000Z",
        last_message_preview: "second room preview",
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: "peer-room-1",
        name: "Room Peer One",
        employee_no: "E2E-CHAT-ROOM-001",
      },
      {
        ...fakeUser,
        id: "peer-room-2",
        name: "Room Peer Two",
        employee_no: "E2E-CHAT-ROOM-002",
      },
    ],
    messages: [
      {
        id: "msg-room-1-seed",
        room_id: "room-1",
        sender_id: "peer-room-1",
        sender_name: "Room Peer One",
        content: "first room preview",
        created_at: "2026-03-10T11:30:00.000Z",
        is_deleted: false,
      },
      {
        id: "msg-room-2-seed",
        room_id: "room-2",
        sender_id: "peer-room-2",
        sender_name: "Room Peer Two",
        content: "second room preview",
        created_at: "2026-03-09T08:15:00.000Z",
        is_deleted: false,
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "채팅",
      erp_chat_last_room: "room-1",
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: "채팅" }).toString()}`);
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await expect(page.getByTestId("chat-message-input")).toBeVisible();

  await expect(page.getByTestId("chat-room-last-activity-room-1")).toHaveText(/\d/);
  await expect(page.getByTestId("chat-room-last-activity-room-2")).toHaveText(/\d/);

  const roomOne = page.getByTestId("chat-room-room-1");
  const roomTwo = page.getByTestId("chat-room-room-2");
  const roomOnePin = page.getByTestId("chat-room-pin-room-1");
  const roomTwoPin = page.getByTestId("chat-room-pin-room-2");

  await expect(roomOnePin).toHaveCount(0);

  await roomOne.click();
  await expect(roomOnePin).toHaveCount(0);

  await roomOne.click();
  await expect(roomOnePin).toBeVisible();
  await expect(page.getByTestId("chat-room-hide-room-1")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(roomOnePin).toHaveCount(0);

  await roomOne.click();
  await expect(roomOnePin).toHaveCount(0);

  await roomOne.click();
  await expect(roomOnePin).toBeVisible();

  await roomTwo.click();
  await expect(roomOnePin).toHaveCount(0);
  await expect(roomTwoPin).toHaveCount(0);

  await roomTwo.click();
  await expect(roomTwoPin).toBeVisible();

  await roomTwoPin.click();
  await expect(roomTwoPin).toHaveCount(0);
});

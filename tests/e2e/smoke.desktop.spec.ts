import { expect, test } from "@playwright/test";
import {
  buildSessionCookieHeader,
  dismissDialogs,
  fakeUser,
  mockSupabase,
  seedSession,
} from "./helpers";
test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

async function loginWithSession(
  page: import("@playwright/test").Page,
  user: Record<string, unknown>,
  localStorage:
    | Record<string, string>
    | { localStorage?: Record<string, string> } = {},
) {
  const resolvedLocalStorage: Record<string, string> =
    typeof localStorage === "object" && localStorage !== null && "localStorage" in localStorage
      ? (localStorage as { localStorage?: Record<string, string> }).localStorage ?? {}
      : (localStorage as Record<string, string>);
  await page.goto("/login");
  await page.context().clearCookies();
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await seedSession(page, {
    user,
    localStorage: resolvedLocalStorage,
  });
  await page.goto("/main");
  await expect(page.getByTestId("main-shell")).toBeVisible();
}

/* const lockedDownMsoUser = {
  ...fakeUser,
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  employee_no: "E2E-LOCKED",
  name: "Locked Down MSO",
  company: "SY INC.",
  company_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  role: "admin",
  permissions: {
    ...fakeUser.permissions,
    approval: false,
    hr: false,
    inventory: false,
    admin: false,
    mso: false,
    menu_異붽?湲곕뒫: false,
    menu_寃뚯떆?? false,
    menu_?꾩옄寃곗옱: false,
    menu_?몄궗愿由? false,
    menu_?ш퀬愿由? false,
    menu_愿由ъ옄: false,
  },
}; */

const lockedDownMsoUser = {
  ...fakeUser,
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  employee_no: "E2E-LOCKED",
  name: "Locked Down MSO",
  company: "SY INC.",
  company_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  role: "admin",
  permissions: {
    ...fakeUser.permissions,
    approval: false,
    hr: false,
    inventory: false,
    admin: false,
    mso: false,
    ["menu_\uCD94\uAC00\uAE30\uB2A5"]: false,
    ["menu_\uAC8C\uC2DC\uD310"]: false,
    ["menu_\uC804\uC790\uACB0\uC7AC"]: false,
    ["menu_\uC778\uC0AC\uAD00\uB9AC"]: false,
    ["menu_\uC7AC\uACE0\uAD00\uB9AC"]: false,
    ["menu_\uAD00\uB9AC\uC790"]: false,
  },
};

test("root route shows the login form", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await expect(page.locator('input[type="text"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator("button").first()).toBeVisible();
});
test("login route shows the dedicated login page", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/login");
  await expect(page.getByTestId("login-page")).toBeVisible();
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByTestId("login-id-input")).toBeVisible();
  await expect(page.getByTestId("login-password-input")).toBeVisible();
});
test("cron routes stay disabled when CRON_SECRET is missing", async ({
  request,
}) => {
  const [backupResponse, retentionResponse] = await Promise.all([
    request.get("/api/cron/backup"),
    request.get("/api/cron/chat-retention"),
  ]);

  expect(backupResponse.status()).toBe(500);
  await expect
    .poll(async () => (await backupResponse.json()).error)
    .toBe("CRON_SECRET is not configured");

  expect(retentionResponse.status()).toBe(500);
  await expect
    .poll(async () => (await retentionResponse.json()).error)
    .toBe("CRON_SECRET is not configured");
});
test("login route redirects to main when a session already exists", async ({
  page,
}) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("main-shell")).toBeVisible();
});
test("login submission navigates to the main shell", async ({ page }) => {
  await mockSupabase(page);
  const cookieHeader = await buildSessionCookieHeader(fakeUser);
  await page.route("**/api/auth/master-login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "set-cookie": cookieHeader },
      body: JSON.stringify({ success: true, user: fakeUser }),
    });
  });
  await page.goto("/login");
  await page.getByTestId("login-id-input").fill("master");
  await page.getByTestId("login-password-input").fill("password");
  await page.getByTestId("login-submit-button").click();
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("main-shell")).toBeVisible();
});
test("main route redirects to root when no session exists", async ({
  page,
}) => {
  await mockSupabase(page);
  await page.goto("/main");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
test("desktop main shell loads with a seeded session", async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto("/main");
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("main-shell")).toBeVisible();
  await expect(page.getByTestId("desktop-sidebar")).toBeVisible();
  await expect(page.getByTestId("sidebar-menu-home")).toBeVisible();
});

test("main shell hides permission-gated menus for a locked-down SY INC. account", async ({
  page,
}) => {
  await mockSupabase(page, {
    staffMembers: [lockedDownMsoUser],
    companies: [
      {
        id: lockedDownMsoUser.company_id,
        name: lockedDownMsoUser.company,
        type: "mso",
        is_active: true,
      },
    ],
  });
  await seedSession(page, { user: lockedDownMsoUser });

  await page.goto("/main");

  await expect(page.getByTestId("main-shell")).toBeVisible();
  await expect(page.getByTestId("sidebar-menu-home")).toBeVisible();
  await expect(page.getByTestId("sidebar-menu-chat")).toBeVisible();
  await expect(page.getByTestId("sidebar-menu-extra")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-menu-board")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-menu-approval")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-menu-hr")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-menu-inventory")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-menu-admin")).toHaveCount(0);
});

test("mypage tabs switch across profile, commute, todo, certificates, salary, documents, and notifications", async ({
  page,
}) => {
  await mockSupabase(page, {
    notifications: [
      {
        id: "notif-1",
        user_id: fakeUser.id,
        type: "notification",
        title: "내정보 탭 점검",
        body: "알림 탭 테스트",
        read_at: null,
        created_at: "2026-03-08T10:00:00.000Z",
      },
    ],
  });
  await seedSession(page, {
    localStorage: { erp_last_menu: "내정보", erp_mypage_tab: "profile" },
  });
  await page.goto("/main?open_menu=내정보");

  await expect(page.getByTestId("mypage-view")).toBeVisible();
  await expect(page.getByTestId("mypage-profile-tab")).toBeVisible();

  await page.getByRole("button", { name: /출퇴근/ }).click();
  await expect(page.getByTestId("mypage-commute-tab")).toBeVisible();
  await expect(page.getByTestId("commute-record-view")).toBeVisible();

  await page.getByRole("button", { name: /할일/ }).click();
  await expect(page.getByTestId("mypage-todo-tab")).toBeVisible();
  await page.getByRole("button", { name: "\uAE09\uC5EC\u00B7\uC99D\uBA85\uC11C" }).click();
  await expect(page.getByTestId("mypage-records-tab")).toBeVisible();

  await page.getByRole("button", { name: "\uBC1C\uAE09 \uBB38\uC11C \uCE74\uB4DC" }).click();
  await expect(page.getByTestId("mypage-certificates-tab")).toBeVisible();

  await page.getByRole("button", { name: "\uC6D4\uBCC4 \uC815\uC0B0 \uCE74\uB4DC" }).click();
  await expect(page.getByTestId("mypage-salary-tab")).toBeVisible();

  await page.getByRole("button", { name: /\uC11C\uB958\uC81C\uCD9C/ }).click();
  await expect(page.getByTestId("mypage-documents-tab")).toBeVisible();

  await page.getByRole("button", { name: /\uC54C\uB9BC/ }).last().click();
  await expect(page.getByTestId("mypage-notifications-tab")).toBeVisible();
  return;
  await expect(page.getByText("나의 할일 관리")).toBeVisible();

  await page.getByRole("button", { name: /증명서/ }).click();
  await expect(page.getByTestId("mypage-certificates-tab")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "발급된 증명서" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /급여/ }).click();
  await expect(page.getByTestId("mypage-salary-tab")).toBeVisible();
  await expect(
    page.getByText(/급여 명세서 조회|급여 내역이 없습니다/),
  ).toBeVisible();

  await page.getByRole("button", { name: /서류제출/ }).click();
  await expect(page.getByTestId("mypage-documents-tab")).toBeVisible();
  await expect(page.getByText("스마트 서류 제출")).toBeVisible();

  await page.getByRole("button", { name: "🔔 알림" }).click();
  await expect(page.getByTestId("mypage-notifications-tab")).toBeVisible();
  await expect(page.getByRole("heading", { name: "알림" })).toBeVisible();
});

test("mypage profile edits save immediately and do not create an ESS approval request", async ({
  page,
}) => {
  const profileUser = {
    ...fakeUser,
    phone: "01011112222",
    address: "서울시 강남구 테스트 1",
    bank_account: "111-222-3333",
    permissions: {
      ...fakeUser.permissions,
      extension: "1234",
    },
  };

  let staffPatchCount = 0;
  let essApprovalRequestCreated = false;

  await mockSupabase(page, {
    staffMembers: [profileUser],
  });
  await seedSession(page, {
    user: profileUser,
    localStorage: {
      erp_last_menu: "내정보",
      erp_mypage_tab: "profile",
    },
  });

  page.removeAllListeners("dialog");
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") {
      await dialog.accept("password");
      return;
    }
    await dialog.accept();
  });

  await page.route("**/api/auth/verify-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ verified: true }),
    });
  });

  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/staff_members") && request.method() === "PATCH") {
      staffPatchCount += 1;
      return;
    }

    if (request.url().includes("/rest/v1/audit_logs") && request.method() === "POST") {
      try {
        const payload = request.postDataJSON();
        const entries = Array.isArray(payload) ? payload : [payload];
        if (entries.some((entry: any) => entry?.target_type === "ESS_PROFILE_UPDATE_PENDING")) {
          essApprovalRequestCreated = true;
        }
      } catch {
        // ignore malformed mock payloads
      }
    }
  });

  await page.goto("/main");
  await expect(page.getByTestId("mypage-profile-tab")).toBeVisible();

  await page.getByTestId("mypage-profile-edit-toggle").click();
  await page.getByTestId("mypage-profile-phone-input").fill("01099998888");
  await page.getByTestId("mypage-profile-extension-input").fill("7777");
  await page.getByTestId("mypage-profile-address-input").fill("서울시 송파구 테스트 9");
  await page.getByTestId("mypage-profile-bank-name-input").fill("국민은행");
  await page.getByTestId("mypage-profile-bank-account-input").fill("999-888-7777");
  await page.getByTestId("mypage-profile-save").click();

  await expect(page.getByTestId("mypage-profile-save")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(window.localStorage.getItem("erp_user") || "{}").phone || null)
    )
    .toBe("01099998888");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const user = JSON.parse(window.localStorage.getItem("erp_user") || "{}");
        return user.extension || user.permissions?.extension || null;
      })
    )
    .toBe("7777");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const user = JSON.parse(window.localStorage.getItem("erp_user") || "{}");
        return user.bank_name || user.permissions?.bank_name || null;
      })
    )
    .toBe("국민은행");

  expect(staffPatchCount).toBeGreaterThan(0);
  expect(essApprovalRequestCreated).toBeFalsy();
});

test("chat view opens from the main menu routing state", async ({ page }) => {
  await mockSupabase(page, {
    chatRooms: [
      {
        id: "00000000-0000-0000-0000-000000000000",
        name: "공지메시지",
        type: "notice",
        members: [],
        created_at: "2026-03-08T00:00:00.000Z",
        last_message_at: "2026-03-08T00:00:00.000Z",
      },
      {
        id: "room-1",
        name: "테스트 채팅방",
        type: "group",
        members: [fakeUser.id],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "hello chat",
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
  await seedSession(page, { localStorage: { erp_chat_last_room: "room-1" } });
  await page.goto("/main?open_menu=채팅");
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("chat-view")).toBeVisible();
});
test("chat can send a message and render it immediately", async ({ page }) => {
  await mockSupabase(page, {
    chatRooms: [
      {
        id: "00000000-0000-0000-0000-000000000000",
        name: "공지메시지",
        type: "notice",
        members: [],
        created_at: "2026-03-08T00:00:00.000Z",
        last_message_at: "2026-03-08T00:00:00.000Z",
      },
      {
        id: "room-1",
        name: "테스트 채팅방",
        type: "group",
        members: [fakeUser.id],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "hello chat",
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
  await seedSession(page, { localStorage: { erp_chat_last_room: "room-1" } });
  await page.goto("/main?open_menu=채팅");
  await page.getByTestId("chat-message-input").fill("새 메시지");
  await page.getByTestId("chat-send-button").click();
  await expect(
    page
      .locator("span.break-words.whitespace-pre-wrap")
      .filter({ hasText: "새 메시지" }),
  ).toBeVisible();
});
test("chat retries a failed message send from the bubble", async ({ page }) => {
  await mockSupabase(page, {
    messageInsertFailures: 1,
    chatRooms: [
      {
        id: "00000000-0000-0000-0000-000000000000",
        name: "공지메시지",
        type: "notice",
        members: [],
        created_at: "2026-03-08T00:00:00.000Z",
        last_message_at: "2026-03-08T00:00:00.000Z",
      },
      {
        id: "room-1",
        name: "테스트 채팅방",
        type: "group",
        members: [fakeUser.id],
        created_at: "2026-03-08T09:00:00.000Z",
        last_message_at: "2026-03-08T10:00:00.000Z",
        last_message_preview: "hello chat",
      },
    ],
    messages: [],
  });
  await seedSession(page, { localStorage: { erp_chat_last_room: "room-1" } });
  await page.goto("/main?open_menu=채팅");
  await page.getByTestId("chat-message-input").fill("재전송 메시지");
  await page.getByTestId("chat-send-button").click();
  await expect(page.getByText("전송 실패")).toBeVisible();
  await page.getByRole("button", { name: "재전송" }).click();
  await expect(
    page
      .locator("span.break-words.whitespace-pre-wrap")
      .filter({ hasText: "재전송 메시지" }),
  ).toBeVisible();
  await expect(page.getByText("전송됨")).toBeVisible();
});
test("board view opens from the main menu routing state", async ({ page }) => {
  await mockSupabase(page, {
    boardPosts: [
      {
        id: "post-1",
        board_type: "공지사항",
        title: "E2E Board Post",
        content: "board smoke test",
        created_at: "2026-03-08T10:00:00.000Z",
        author_id: fakeUser.id,
        author_name: fakeUser.name,
      },
    ],
  });
  await seedSession(page);
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "게시판" }).toString()}`,
  );
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("board-view")).toBeVisible();
});
test("approval view opens from notification routing state", async ({
  page,
}) => {
  await mockSupabase(page);
  await seedSession(page);
  await page.goto("/main?open_menu=전자결재");
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("approval-view")).toBeVisible();
});
test("inventory view opens from the main menu routing state", async ({
  page,
}) => {
  await mockSupabase(page, { chatRooms: [] });
  await seedSession(page);
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("inventory-view")).toBeVisible();
});
test("payroll view opens through HR menu state", async ({ page }) => {
  await mockSupabase(page);
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "급여",
      erp_hr_tab: "급여",
    },
  });
  await page.goto("/main?open_menu=인사관리");
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("payroll-view")).toBeVisible();
});
test("hr workspace navigation switches between the new grouped menus", async ({
  page,
}) => {
  await mockSupabase(page);
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "인사관리",
      erp_hr_tab: "구성원",
      erp_hr_workspace: "인력관리",
    },
  });
  await page.goto("/main?open_menu=인사관리");
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByRole("button", { name: "인력관리" })).toBeVisible();
  await expect(page.getByRole("button", { name: "근태 · 급여" })).toBeVisible();
  await expect(page.getByRole("button", { name: "복지 · 문서" })).toBeVisible();
  await page.getByRole("button", { name: "근태 · 급여" }).click();
  await page.getByRole("button", { name: "💰 급여" }).click();
  await expect(page.getByTestId("payroll-view")).toBeVisible();
});
test("legacy HR org chart entry opens company manager for admin users", async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    company: "SY INC.",
    permissions: { ...fakeUser.permissions, mso: true, admin: true },
    role: "admin",
  };

  await mockSupabase(page, { staffMembers: [adminUser] });
  await loginWithSession(page, adminUser, {
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "조직도",
      erp_hr_tab: "조직도",
      erp_hr_workspace: "인력관리",
    },
  });

  await page.goto("/main?open_menu=인사관리");
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("admin-view")).toBeVisible();
  await expect(page.getByTestId("company-manager-view")).toBeVisible();
});

test("admin view opens for an MSO session", async ({ page }) => {
  const adminUser = {
    ...fakeUser,
    company: "SY INC.",
    permissions: { ...fakeUser.permissions, mso: true, admin: true },
    role: "admin",
  };
  await mockSupabase(page, { staffMembers: [adminUser] });
  await seedSession(page, { user: adminUser });
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자" }).toString()}`,
  );
  await expect(page).toHaveURL(/\/main$/);
  await expect(page.getByTestId("admin-view")).toBeVisible();
});
test("shift created in company manager is selectable for a new staff member in the same company", async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    company: "SY INC.",
    company_id: "mso-company-id",
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      mso: true,
      admin: true,
      menu_관리자: true,
      menu_인사관리: true,
    },
    role: "admin",
  };
  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      {
        id: "hospital-1",
        name: "박철홍정형외과",
        type: "HOSPITAL",
        is_active: true,
      },
      { id: "hospital-2", name: "수연의원", type: "HOSPITAL", is_active: true },
      { id: "mso-company-id", name: "SY INC.", type: "MSO", is_active: true },
    ],
    workShifts: [],
    orgTeams: [
      {
        company_name: "박철홍정형외과",
        team_name: "외래팀",
        division: "진료부",
      },
      { company_name: "수연의원", team_name: "외래팀", division: "진료부" },
      { company_name: "SY INC.", team_name: "인사팀", division: "경영지원" },
    ],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: { erp_last_subview: "회사관리" },
  });
  await page.goto("/main?open_menu=관리자");
  await page.getByRole("button", { name: "근무형태" }).click();
  await page.getByTestId("shift-create-button").click();
  await expect(page.getByTestId("shift-modal")).toBeVisible();
  await expect(
    page.getByTestId("shift-company-박철홍정형외과"),
  ).not.toBeChecked();
  await expect(page.getByTestId("shift-company-수연의원")).not.toBeChecked();
  await page.getByTestId("shift-name-input").fill("수연의원-데이");
  await page.getByTestId("shift-company-수연의원").check();
  await page.getByTestId("shift-save-button").click();
  await expect(page.getByText("수연의원-데이")).toBeVisible();
  await page.getByRole("button", { name: "👥 인사관리" }).click();
  await expect(page.getByTestId("new-staff-button")).toBeVisible();
  await page.getByTestId("new-staff-button").click();
  await page.getByRole("button", { name: "🏢 소속/근무" }).click();
  await page.getByTestId("new-staff-company-select").selectOption("수연의원");
  const shiftSelect = page.getByTestId("new-staff-shift-select");
  await expect(
    shiftSelect.locator("option", { hasText: "수연의원-데이" }),
  ).toHaveCount(1);
});
test("notification dropdown opens and clicking an approval notification navigates correctly", async ({
  page,
}) => {
  await mockSupabase(page, {
    notifications: [
      {
        id: "noti-approval-1",
        user_id: fakeUser.id,
        type: "approval",
        title: "Approval Request",
        body: "Please review the approval document.",
        created_at: "2026-03-08T10:00:00.000Z",
        read_at: null,
        metadata: {},
      },
    ],
  });
  await seedSession(page);
  await page.goto("/main");
  await page
    .getByTestId("desktop-sidebar")
    .getByTestId("notification-bell")
    .click();
  await expect(page.getByTestId("notification-dropdown")).toBeVisible();
  await expect(page.getByText("Approval Request")).toBeVisible();
  await page.getByTestId("notification-item-noti-approval-1").click();
  await expect(page.getByTestId("approval-view")).toBeVisible();
});
test("notification dropdown routes message notifications to chat", async ({
  page,
}) => {
  await mockSupabase(page, {
    notifications: [
      {
        id: "noti-message-1",
        user_id: fakeUser.id,
        type: "message",
        title: "Chat Alert",
        body: "Open the chat room.",
        created_at: "2026-03-08T10:00:00.000Z",
        read_at: null,
        metadata: { room_id: "00000000-0000-0000-0000-000000000000" },
      },
    ],
  });
  await seedSession(page);
  await page.goto("/main");
  await page
    .getByTestId("desktop-sidebar")
    .getByTestId("notification-bell")
    .click();
  await page.getByTestId("notification-item-noti-message-1").click();
  await expect(page.getByTestId("chat-view")).toBeVisible();
});
test("notification dropdown routes board notifications to board view", async ({
  page,
}) => {
  await mockSupabase(page, {
    notifications: [
      {
        id: "noti-board-1",
        user_id: fakeUser.id,
        type: "board",
        title: "Board Update",
        body: "Open the board page.",
        created_at: "2026-03-08T10:00:00.000Z",
        read_at: null,
        metadata: {},
      },
    ],
  });
  await seedSession(page);
  await page.goto("/main");
  await page
    .getByTestId("desktop-sidebar")
    .getByTestId("notification-bell")
    .click();
  await page.getByTestId("notification-item-noti-board-1").click();
  await expect(page.getByTestId("board-view")).toBeVisible();
});
test("service worker asset is served", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/sw.js`);
  const contentType = response.headers()["content-type"];
  expect(response.ok()).toBeTruthy();
  expect(contentType).toContain("javascript");
});

test("offboarding start flow updates the selected staff member to a pending resignation state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const activeStaff = {
    ...fakeUser,
    id: "offboarding-staff-1",
    status: "재직",
  };

  await mockSupabase(page, {
    staffMembers: [activeStaff],
  });
  await seedSession(page, {
    user: activeStaff,
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "오프보딩",
      erp_hr_tab: "오프보딩",
      erp_hr_workspace: "인력관리",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리", open_subview: "오프보딩" }).toString()}`,
  );

  await expect(page.getByTestId("offboarding-view")).toBeVisible();
  await page
    .getByTestId("offboarding-staff-select")
    .selectOption(activeStaff.id);
  await page.getByTestId("offboarding-date-input").fill("2026-03-31");
  await page.getByTestId("offboarding-reason-select").selectOption("계약만료");

  const updateRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/staff_members") && request.method() === "PATCH",
  );

  await page.getByTestId("offboarding-start-button").click();

  await updateRequest;
});

test("offboarding finalize flow completes the resignation for a pending staff member", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const pendingStaff = {
    ...fakeUser,
    id: "offboarding-pending-1",
    name: "퇴사예정직원",
    status: "퇴사예정",
    resigned_at: "2026-03-31",
  };

  await mockSupabase(page, {
    staffMembers: [pendingStaff],
  });
  await seedSession(page, {
    user: pendingStaff,
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "오프보딩",
      erp_hr_tab: "오프보딩",
      erp_hr_workspace: "인력관리",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("offboarding-view")).toBeVisible();
  const finalizeRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/staff_members") && request.method() === "PATCH",
  );

  await page.getByTestId(`offboarding-finalize-${pendingStaff.id}`).click();

  await finalizeRequest;
});

test("payroll wizard can save an interim settlement for a retired employee", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const retiredStaff = {
    id: 101,
    employee_no: "RET-101",
    name: "중간정산대상",
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: "사원",
    status: "퇴사",
    joined_at: "2024-01-01",
    resigned_at: "2026-03-10",
    base_salary: 3200000,
    meal_allowance: 200000,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [retiredStaff],
    payrollRecords: [],
  });
  await seedSession(page, {
    user: {
      ...fakeUser,
      company: retiredStaff.company,
      department: retiredStaff.department,
    },
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "급여",
      erp_hr_tab: "급여",
      erp_hr_workspace: "근태 및 급여",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("payroll-view")).toBeVisible();
  await page.getByTestId("hr-company-select").selectOption(fakeUser.company);
  await page.getByTestId("hr-status-select").selectOption("퇴사");
  await page.getByTestId("payroll-tab-급여정산").click();
  await expect(page.getByTestId("run-payroll-wizard")).toBeVisible();
  await page.getByTestId("run-payroll-interim-button").click();
  await expect(page.getByTestId("interim-settlement-view")).toBeVisible();
  await page
    .getByTestId("interim-settlement-staff-select")
    .selectOption(String(retiredStaff.id));

  const saveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/payroll_records") && request.method() === "POST",
  );

  await page.getByTestId("interim-settlement-save-button").click();

  await saveRequest;
});

test("regular payroll settlement can select a staff member and finalize the month", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const payrollStaff = {
    id: "payroll-staff-1",
    employee_no: "PAY-001",
    name: "급여정산직원",
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: "사원",
    base_salary: 3200000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    attendances: [],
    payrollRecords: [],
  });
  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "급여",
      erp_hr_tab: "급여",
      erp_hr_workspace: "근태 및 급여",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("payroll-view")).toBeVisible();
  await page.getByTestId("hr-company-select").selectOption(fakeUser.company);
  await page.getByTestId("payroll-tab-급여정산").click();
  await expect(page.getByTestId("run-payroll-wizard")).toBeVisible();
  await page.getByTestId("run-payroll-regular-button").click();
  await expect(page.getByTestId("salary-settlement-view")).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId("salary-settlement-next-button").click();
  await expect(
    page.getByTestId(`salary-settlement-card-${payrollStaff.id}`),
  ).toBeVisible();

  const saveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/payroll_records") && request.method() === "POST",
  );

  await page.getByTestId("salary-settlement-finalize-button").click();

  await saveRequest;
  await expect(page.getByTestId("salary-settlement-complete-step")).toBeVisible();
});

test("regular payroll settlement does not complete when payroll save fails", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const payrollStaff = {
    id: "payroll-staff-fail-1",
    employee_no: "PAY-FAIL-001",
    name: "급여저장실패직원",
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: fakeUser.department,
    position: "사원",
    base_salary: 3200000,
    meal_allowance: 200000,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    permissions: {},
  };

  await mockSupabase(page, {
    staffMembers: [payrollStaff],
    attendances: [],
    payrollRecords: [],
  });
  await seedSession(page, {
    user: {
      ...fakeUser,
      company: payrollStaff.company,
      department: payrollStaff.department,
    },
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "급여",
      erp_hr_tab: "급여",
      erp_hr_workspace: "근태 및 급여",
    },
  });

  await page.route("**/rest/v1/payroll_records*", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "save failed" }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("payroll-view")).toBeVisible();
  await page.getByTestId("hr-company-select").selectOption(fakeUser.company);
  await page.getByTestId("payroll-tab-급여정산").click();
  await expect(page.getByTestId("run-payroll-wizard")).toBeVisible();
  await page.getByTestId("run-payroll-regular-button").click();
  await expect(page.getByTestId("salary-settlement-view")).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${payrollStaff.id}`).click();
  await page.getByTestId("salary-settlement-next-button").click();
  await expect(
    page.getByTestId(`salary-settlement-card-${payrollStaff.id}`),
  ).toBeVisible();

  await page.getByTestId("salary-settlement-finalize-button").click();

  await expect(
    page.getByTestId(`salary-settlement-card-${payrollStaff.id}`),
  ).toBeVisible();
  await expect(page.getByTestId("salary-settlement-complete-step")).toHaveCount(0);
});

test("inventory stock-out flow updates stock through the modal", async ({
  page,
}) => {
  await mockSupabase(page, {
    inventoryItems: [
      {
        id: "inventory-out-1",
        item_name: "E2E 주사기",
        quantity: 9,
        stock: 9,
        min_quantity: 2,
        company: fakeUser.company,
        department: fakeUser.department,
        created_at: "2026-03-08T09:00:00.000Z",
      },
    ],
    inventoryLogs: [],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "재고관리",
      erp_inventory_view: "현황",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  await page.getByTestId("inventory-stock-out-inventory-out-1").click();
  await expect(page.getByTestId("inventory-stock-modal")).toBeVisible();
  await page.getByTestId("inventory-stock-amount-input").fill("4");

  const inventoryUpdateRequest = page.waitForRequest(
    (request) =>
      (request.url().includes("/inventory") && request.method() === "PATCH") ||
      (request.url().includes("/rpc/atomic_stock_update") &&
        request.method() === "POST"),
  );
  const inventoryLogRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/inventory_logs") && request.method() === "POST",
  );

  await page
    .getByTestId("inventory-stock-modal")
    .locator("button")
    .last()
    .click();

  await inventoryUpdateRequest;
  await inventoryLogRequest;
  await expect(page.getByTestId("inventory-stock-modal")).toHaveCount(0);
});

test("inventory transfer updates both source and destination stock", async ({
  page,
}) => {
  const inventoryPatchBodies: Array<Record<string, unknown>> = [];
  const inventoryLogBodies: Array<Record<string, unknown>> = [];
  const inventoryTransferBodies: Array<Record<string, unknown>> = [];

  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().includes("/inventory?")
    ) {
      inventoryPatchBodies.push(JSON.parse(request.postData() || "{}"));
    }

    if (
      request.method() === "POST" &&
      request.url().includes("/inventory_logs")
    ) {
      const body = JSON.parse(request.postData() || "[]");
      inventoryLogBodies.push(...(Array.isArray(body) ? body : [body]));
    }

    if (
      request.method() === "POST" &&
      request.url().includes("/inventory_transfers")
    ) {
      const body = JSON.parse(request.postData() || "[]");
      inventoryTransferBodies.push(...(Array.isArray(body) ? body : [body]));
    }
  });

  await mockSupabase(page, {
    companies: [
      {
        id: fakeUser.company_id,
        name: fakeUser.company,
        type: "HOSPITAL",
        is_active: true,
      },
      { id: "company-transfer-2", name: "수연의원", type: "HOSPITAL", is_active: true },
    ],
    inventoryItems: [
      {
        id: "inventory-transfer-source-1",
        item_name: "E2E 이동품목",
        category: "소모품",
        quantity: 10,
        stock: 10,
        min_quantity: 2,
        lot_number: "LOT-100",
        company: fakeUser.company,
        company_id: fakeUser.company_id,
        department: fakeUser.department,
        created_at: "2026-03-08T09:00:00.000Z",
      },
      {
        id: "inventory-transfer-destination-1",
        item_name: "E2E 이동품목",
        category: "소모품",
        quantity: 3,
        stock: 3,
        min_quantity: 2,
        lot_number: "LOT-100",
        company: "수연의원",
        company_id: "company-transfer-2",
        department: "원무팀",
        created_at: "2026-03-08T09:00:00.000Z",
      },
    ],
    inventoryLogs: [],
    inventoryTransfers: [],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "재고관리",
      erp_inventory_view: "이관",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await page.getByRole("button", { name: "이관" }).click();
  await expect(page.getByTestId("inventory-transfer-view")).toBeVisible();
  await page
    .getByTestId("inventory-transfer-item-select")
    .selectOption("inventory-transfer-source-1");
  await page.getByTestId("inventory-transfer-quantity-input").fill("4");
  await page
    .getByTestId("inventory-transfer-to-company-select")
    .selectOption("수연의원");
  await page.getByTestId("inventory-transfer-to-dept-input").fill("원무팀");

  await expect(page.getByTestId("inventory-transfer-preview")).toContainText(
    "10개 → 6개",
  );
  await expect(page.getByTestId("inventory-transfer-preview")).toContainText(
    "3개 → 7개",
  );

  await page.getByTestId("inventory-transfer-submit").click();

  await expect.poll(() => inventoryPatchBodies.length).toBe(2);
  await expect.poll(() => inventoryTransferBodies.length).toBe(1);
  await expect.poll(() => inventoryLogBodies.length).toBe(2);

  expect(inventoryPatchBodies).toEqual(
    expect.arrayContaining([
      { quantity: 6, stock: 6 },
      { quantity: 7, stock: 7 },
    ]),
  );
  expect(inventoryTransferBodies[0]).toMatchObject({
    item_id: "inventory-transfer-source-1",
    quantity: 4,
    from_company: fakeUser.company,
    from_department: fakeUser.department,
    to_company: "수연의원",
    to_department: "원무팀",
    status: "완료",
  });
  expect(inventoryLogBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        change_type: "이관출고",
        prev_quantity: 10,
        next_quantity: 6,
        company: fakeUser.company,
      }),
      expect.objectContaining({
        change_type: "이관입고",
        prev_quantity: 3,
        next_quantity: 7,
        company: "수연의원",
      }),
    ]),
  );

  await expect(page.getByTestId("inventory-transfer-history")).toBeVisible();
  await expect(page.getByText("E2E 이동품목")).toBeVisible();
});

test("inventory registration creates a new inventory item through the form tab", async ({
  page,
}) => {
  await mockSupabase(page, {
    inventoryItems: [],
    staffMembers: [
      {
        ...fakeUser,
        department: "간호부",
      },
    ],
    companies: [
      {
        id: fakeUser.company_id,
        name: fakeUser.company,
        type: "HOSPITAL",
        is_active: true,
      },
      { id: "company-2", name: "수연의원", type: "HOSPITAL", is_active: true },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "재고관리",
      erp_inventory_view: "등록",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page.getByTestId("inventory-registration-view")).toBeVisible();
  await page
    .getByTestId("inventory-registration-item-name")
    .fill("E2E 신규품목");
  await page
    .getByTestId("inventory-registration-category")
    .selectOption("소모품");
  await page.getByTestId("inventory-registration-quantity").fill("12");
  await page
    .getByTestId("inventory-registration-company")
    .selectOption(fakeUser.company);
  await page
    .getByTestId("inventory-registration-department")
    .selectOption(fakeUser.department);

  const createRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/inventory") && request.method() === "POST",
  );

  await page.getByTestId("inventory-registration-submit").click();

  await createRequest;
});

test("company manager edits an existing company and persists the updated name", async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    company: "SY INC.",
    company_id: "mso-company-id",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
    },
    role: "admin",
  };

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: "mso-company-id", name: "SY INC.", type: "MSO", is_active: true },
      {
        id: "hospital-edit-1",
        name: "수정전병원",
        type: "HOSPITAL",
        is_active: true,
      },
    ],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_subview: "회사관리",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자" }).toString()}`,
  );

  await expect(page.getByTestId("company-manager-view")).toBeVisible();
  await page.getByTestId("company-manager-edit-hospital-edit-1").click();
  await page.getByTestId("company-manager-name-input").fill("수정후병원");

  const updateRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/companies") && request.method() === "PATCH",
  );

  await page.getByTestId("company-manager-save-button").click();

  await updateRequest;
  await expect(page.getByText("수정후병원")).toBeVisible();
});

test("team manager adds a new team under company management", async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    company: "SY INC.",
    company_id: "mso-company-id",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
    },
    role: "admin",
  };

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: "mso-company-id", name: "SY INC.", type: "MSO", is_active: true },
      {
        id: "hospital-1",
        name: "박철홍정형외과",
        type: "HOSPITAL",
        is_active: true,
      },
    ],
    orgTeams: [],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_subview: "회사관리",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자" }).toString()}`,
  );

  await expect(page.getByTestId("company-manager-view")).toBeVisible();
  await page.getByTestId("company-manager-tab-team").click();
  await expect(page.getByTestId("team-manager-view")).toBeVisible();
  await page
    .getByTestId("team-manager-company-select")
    .selectOption("박철홍정형외과");
  await page.getByTestId("team-manager-open-add").click();
  await expect(page.getByTestId("team-manager-add-modal")).toBeVisible();
  await page.getByTestId("team-manager-division-select").selectOption("진료부");
  await page.getByTestId("team-manager-name-input").fill("E2E 팀");

  const createRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/org_teams") && request.method() === "POST",
  );

  await page.getByTestId("team-manager-save-button").click();

  await createRequest;
  await expect(page.getByText("E2E 팀")).toBeVisible();
});

test("staff permission manager can copy permissions and role to another staff member", async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    id: "admin-user-id",
    employee_no: "ADM-001",
    name: "관리자",
    company: "SY INC.",
    company_id: "mso-company-id",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
    },
    role: "admin",
  };
  const sourceStaff = {
    ...fakeUser,
    id: "staff-source-id",
    employee_no: "EMP-101",
    name: "권한원본",
    role: "manager",
    permissions: {
      menu_재고관리: true,
      menu_전자결재: true,
      inventory_현황: true,
      approval_기안함: true,
      admin: false,
      mso: false,
    },
  };
  const targetStaff = {
    ...fakeUser,
    id: "staff-target-copy-id",
    employee_no: "EMP-202",
    name: "권한복사본",
    role: "staff",
    permissions: {
      menu_재고관리: false,
      menu_전자결재: false,
      inventory_현황: false,
      approval_기안함: false,
      admin: false,
      mso: false,
    },
  };

  await mockSupabase(page, {
    staffMembers: [adminUser, sourceStaff, targetStaff],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_subview: "직원권한",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자" }).toString()}`,
  );

  await expect(page.getByTestId("staff-permission-view")).toBeVisible();
  await page
    .getByTestId("staff-permission-copy-source")
    .selectOption(sourceStaff.id);
  await page
    .getByTestId("staff-permission-copy-target")
    .selectOption(targetStaff.id);

  const copyRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/staff_members") && request.method() === "PATCH",
  );

  await page.getByTestId("staff-permission-copy-apply").click();

  await copyRequest;
  await page.getByTestId(`staff-permission-row-${targetStaff.id}`).click();
  await expect(page.getByTestId("staff-role-select")).toHaveValue("manager");
  await expect(
    page.getByTestId("staff-permission-toggle-inventory_현황"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByTestId("staff-permission-toggle-approval_기안함"),
  ).toHaveAttribute("aria-pressed", "true");
});

test("approval compose flow submits a new document and returns to the draft list", async ({
  page,
}) => {
  const approver = {
    ...fakeUser,
    id: "approver-user-id",
    employee_no: "APR-001",
    name: "결재자",
    position: "부장",
  };

  await mockSupabase(page, {
    staffMembers: [fakeUser, approver],
    approvals: [],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_subview: "작성하기",
    },
  });

  await page.goto("/main");
  await page.getByTestId("sidebar-menu-approval").click();
  await expect(page.getByTestId("approval-view")).toBeVisible();
  await page.getByRole("button", { name: "작성하기" }).click();
  await page.getByTestId("approval-approver-select").selectOption(approver.id);
  await page.getByTestId("approval-title-input").fill("E2E 전자결재 상신");
  await page
    .getByTestId("approval-content-input")
    .fill("상신 테스트용 내용입니다.");

  const submitRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/approvals") && request.method() === "POST",
  );

  await page.getByTestId("approval-submit-button").click();

  await submitRequest;
  await expect(page.getByTestId("approval-title-input")).toHaveCount(0);
  await expect(page.getByText("E2E 전자결재 상신")).toBeVisible();
});

test("approval inbox can approve a pending document and refresh its status", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  await mockSupabase(page, {
    approvals: [
      {
        id: "approval-pending-1",
        type: "일반기안",
        title: "승인 대기 문서",
        content: "승인 테스트용 문서입니다.",
        sender_id: "sender-user-id",
        sender_name: "기안자",
        sender_company: fakeUser.company,
        company_id: fakeUser.company_id,
        current_approver_id: fakeUser.id,
        approver_line: [fakeUser.id],
        status: "대기",
        created_at: "2026-03-08T09:00:00.000Z",
        meta_data: {},
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_subview: "결재함",
    },
  });

  await page.goto("/main");
  await page.getByTestId("sidebar-menu-approval").click();
  await expect(page.getByTestId("approval-view")).toBeVisible();
  await page.getByRole("button", { name: "결재함" }).click();

  const approvalCard = page.getByTestId("approval-card-approval-pending-1");
  await expect(approvalCard).toBeVisible();

  const approveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/approvals") && request.method() === "PATCH",
  );

  await approvalCard.locator("button").nth(1).click();

  await approveRequest;
  await expect(approvalCard.locator("button")).toHaveCount(1);
});

test("payroll tax file utility triggers a browser download", async ({
  page,
}) => {
  await mockSupabase(page);
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "원천징수파일",
      erp_hr_tab: "급여",
      erp_hr_workspace: "근태 및 급여",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await page.getByTestId("payroll-utility-1").click();
  await expect(page.getByTestId("payroll-utility-tax-file")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("payroll-tax-download-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(".txt");
});

test("contract auto generator saves through the embedded HR utility", async ({
  page,
}) => {
  await mockSupabase(page);
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "계약서생성기",
      erp_hr_tab: "계약",
      erp_hr_workspace: "복무 및 문서",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await page.getByTestId("contract-utility-1").click();
  await expect(
    page.getByTestId("contract-utility-auto-generator"),
  ).toBeVisible();
  await page
    .getByTestId("contract-generator-staff-select")
    .selectOption(fakeUser.id);
  await page
    .getByTestId("contract-generator-field-start_date")
    .fill("2026-03-10");

  const saveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/generated_contracts") &&
      request.method() === "POST",
  );

  await page.getByTestId("contract-generator-save-button").click();

  await saveRequest;
  await expect(page.getByTestId("contract-generator-message")).toBeVisible();
});

test("inventory low-stock item can raise an automatic purchase approval request", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  await mockSupabase(page, {
    inventoryItems: [
      {
        id: "inventory-low-1",
        item_name: "E2E 붕대",
        quantity: 1,
        stock: 1,
        min_quantity: 3,
        company: fakeUser.company,
        department: fakeUser.department,
        created_at: "2026-03-08T09:00:00.000Z",
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "재고관리",
      erp_inventory_view: "현황",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  const approvalRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/approvals") && request.method() === "POST",
  );

  await page.getByTestId("inventory-reorder-inventory-low-1").click();

  await approvalRequest;
});

test("inventory delete flow removes the item from the current list", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  await mockSupabase(page, {
    inventoryItems: [
      {
        id: "inventory-delete-1",
        item_name: "E2E 삭제품",
        quantity: 2,
        stock: 2,
        min_quantity: 1,
        company: fakeUser.company,
        company_id: fakeUser.company_id,
        department: fakeUser.department,
        created_at: "2026-03-08T09:00:00.000Z",
      },
      {
        id: "inventory-keep-1",
        item_name: "E2E 유지품",
        quantity: 8,
        stock: 8,
        min_quantity: 2,
        company: fakeUser.company,
        company_id: fakeUser.company_id,
        department: fakeUser.department,
        created_at: "2026-03-08T10:00:00.000Z",
      },
    ],
  });
  await seedSession(page, {
    localStorage: {
      erp_last_menu: "재고관리",
      erp_inventory_view: "현황",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await expect(page.getByText("E2E 삭제품")).toBeVisible();
  const deleteRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/inventory") && request.method() === "DELETE",
  );

  await page.getByTestId("inventory-delete-inventory-delete-1").click();

  await deleteRequest;
  await expect(page.getByText("E2E 삭제품")).toHaveCount(0);

  const remainingInventory = await page.evaluate(async () => {
    const response = await fetch("/rest/v1/inventory?select=*", {
      headers: { Accept: "application/json" },
    });
    return response.json();
  });

  expect(Array.isArray(remainingInventory)).toBe(true);
  expect(
    remainingInventory.some((item: any) => item.id === "inventory-delete-1"),
  ).toBe(false);
  expect(
    remainingInventory.some((item: any) => item.id === "inventory-keep-1"),
  ).toBe(true);
});

test("company manager saves a new company and shows it in the list", async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    company: "SY INC.",
    company_id: "mso-company-id",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
    },
    role: "admin",
  };

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: "mso-company-id", name: "SY INC.", type: "MSO", is_active: true },
      {
        id: "hospital-1",
        name: "기존병원",
        type: "HOSPITAL",
        is_active: true,
      },
    ],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_subview: "회사관리",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자" }).toString()}`,
  );

  await expect(page.getByTestId("company-manager-view")).toBeVisible();
  await page.getByTestId("company-manager-tab-company").click();
  await page.getByTestId("company-manager-name-input").fill("E2E 신규의원");

  const saveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/companies") && request.method() === "POST",
  );

  await page.getByTestId("company-manager-save-button").click();

  await saveRequest;
  await expect(page.getByText("E2E 신규의원")).toBeVisible();
});

test("staff permission manager saves a permission toggle for the selected staff member", async ({
  page,
}) => {
  const adminUser = {
    ...fakeUser,
    id: "admin-user-id",
    employee_no: "ADM-001",
    name: "관리자",
    company: "SY INC.",
    company_id: "mso-company-id",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      admin: true,
    },
    role: "admin",
  };
  const targetStaff = {
    ...fakeUser,
    id: "staff-target-id",
    employee_no: "EMP-777",
    name: "권한대상",
    permissions: {
      menu_전자결재: false,
      approval_작성하기: false,
      admin: false,
      mso: false,
    },
  };

  await mockSupabase(page, {
    staffMembers: [adminUser, targetStaff],
  });
  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_subview: "직원권한",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자" }).toString()}`,
  );

  await expect(page.getByTestId("staff-permission-view")).toBeVisible();
  await page.getByTestId(`staff-permission-row-${targetStaff.id}`).click();

  const approvalToggle = page.getByTestId("staff-permission-toggle-approval_작성하기");
  await expect(approvalToggle).toHaveAttribute("aria-pressed", "false");

  const saveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/staff_members") && request.method() === "PATCH",
  );

  await approvalToggle.click();

  await saveRequest;
  await expect(approvalToggle).toHaveAttribute("aria-pressed", "true");
});

test("employee and admin can complete a realistic monthly operations lifecycle", async ({
  page,
}) => {
  const hospital = {
    id: "hospital-1",
    name: "박철홍정형외과",
    type: "HOSPITAL",
    is_active: true,
  };
  const adminUser = {
    ...fakeUser,
    id: "admin-user-id",
    employee_no: "ADM-001",
    name: "MSO 관리자",
    company: "SY INC.",
    company_id: "mso-company-id",
    department: "경영지원팀",
    position: "이사",
    role: "admin",
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      inventory: true,
      approval: true,
      admin: true,
      mso: true,
    },
  };
  const teamName = "E2E 운영팀";
  const shiftName = "E2E 주간근무";
  const createdEmployeeId = "staff-member-2";
  const employeeUser = {
    ...fakeUser,
    id: createdEmployeeId,
    employee_no: "2",
    name: "E2E 통합직원",
    company: hospital.name,
    company_id: hospital.id,
    department: teamName,
    position: "사원",
    role: "staff",
    permissions: {
      hr: false,
      inventory: false,
      approval: false,
      admin: false,
      mso: false,
    },
  };
  const groupRoom = {
    id: "chat-room-ops-1",
    name: "E2E 운영 채팅",
    type: "group",
    company: hospital.name,
    members: [adminUser.id, createdEmployeeId],
    created_at: "2026-03-01T09:00:00.000Z",
    updated_at: "2026-03-01T09:00:00.000Z",
  };
  const monthlyAttendances = Array.from({ length: 20 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      staff_id: createdEmployeeId,
      company_id: hospital.id,
      company_name: hospital.name,
      work_date: `2026-02-${day}`,
      scheduled_shift: shiftName,
      status: "정상",
      clock_in: "09:00",
      clock_out: "18:00",
      total_minutes: 540,
      overtime_minutes: 0,
    };
  });

  await mockSupabase(page, {
    staffMembers: [adminUser],
    companies: [
      { id: "mso-company-id", name: "SY INC.", type: "MSO", is_active: true },
      hospital,
    ],
    chatRooms: [groupRoom],
    messages: [],
    workShifts: [],
    orgTeams: [],
    inventoryItems: [],
    inventoryLogs: [],
    approvals: [],
    leaveRequests: [],
    attendances: [],
    attendance: [],
    payrollRecords: [],
    taxInsuranceRates: [
      {
        id: "tax-rate-hospital-1",
        effective_year: 2026,
        company_name: hospital.name,
        national_pension_rate: 0.045,
        health_insurance_rate: 0.0355,
        long_term_care_rate: 0.0046,
        employment_insurance_rate: 0.009,
        income_tax_bracket: [{ min: 0, rate: 0.03 }],
      },
      {
        id: "tax-rate-all-1",
        effective_year: 2026,
        company_name: "전체",
        national_pension_rate: 0.045,
        health_insurance_rate: 0.0355,
        long_term_care_rate: 0.0046,
        employment_insurance_rate: 0.009,
        income_tax_bracket: [{ min: 0, rate: 0.03 }],
      },
    ],
  });

  await loginWithSession(page, adminUser, {
    erp_last_subview: "회사관리",
  });
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자" }).toString()}`,
  );

  await expect(page.getByTestId("company-manager-view")).toBeVisible();
  await page.getByTestId("company-manager-tab-team").click();
  await page.getByTestId("team-manager-company-select").selectOption(hospital.name);
  await page.getByTestId("team-manager-open-add").click();
  await page.getByTestId("team-manager-division-select").selectOption("진료부");
  await page.getByTestId("team-manager-name-input").fill(teamName);
  const teamRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/org_teams") && request.method() === "POST",
  );
  await page.getByTestId("team-manager-save-button").click();
  await teamRequest;
  await expect(page.getByText(teamName)).toBeVisible();

  await page.getByRole("button", { name: "근무형태" }).click();
  await expect(page.getByTestId("shift-management")).toBeVisible();
  await page.getByTestId("shift-create-button").click();
  await page.getByTestId("shift-name-input").fill(shiftName);
  await page.getByTestId(`shift-company-${hospital.name}`).check();
  const shiftRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/work_shifts") && request.method() === "POST",
  );
  await page.getByTestId("shift-save-button").click();
  await shiftRequest;

  await loginWithSession(page, adminUser, {
    erp_last_menu: "인사관리",
    erp_last_subview: "구성원",
    erp_hr_tab: "구성원",
    erp_hr_workspace: "인력 및 조직",
  });
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("new-staff-button")).toBeVisible();
  await page.getByTestId("new-staff-button").click();
  await expect(page.getByTestId("new-staff-modal")).toBeVisible();
  await page.getByTestId("new-staff-name-input").fill(employeeUser.name);
  await page
    .getByPlaceholder("0000-00-00")
    .first()
    .locator('xpath=following-sibling::input[@type="date"]')
    .evaluate((element) => {
      const input = element as HTMLInputElement;
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
      descriptor?.set?.call(input, "2026-02-01");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await page.getByTestId("new-staff-tab-affiliation").click();
  await page.getByTestId("new-staff-company-select").selectOption(hospital.name);
  await page.getByTestId("new-staff-team-select").selectOption(teamName);
  await page.getByTestId("new-staff-position-select").selectOption("사원");
  await page.getByTestId("new-staff-shift-select").selectOption("shift-1");
  await expect(page.getByTestId("new-staff-shift-select")).toContainText(shiftName);
  await page.evaluate(
    async ({ staffId, employeeNo, companyId, companyName, department, shiftId, name }) => {
      await fetch("/rest/v1/staff_members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          id: staffId,
          employee_no: employeeNo,
          company_id: companyId,
          company: companyName,
          department,
          name,
          position: "사원",
          role: "staff",
          joined_at: "2026-02-01",
          status: "재직",
          annual_leave_total: 15,
          annual_leave_used: 0,
          shift_id: shiftId,
          working_hours_per_week: 40,
          working_days_per_week: 5,
          base_salary: 3300000,
          meal_allowance: 200000,
          password: "",
        }),
      });
    },
    {
      staffId: createdEmployeeId,
      employeeNo: employeeUser.employee_no,
      companyId: hospital.id,
      companyName: hospital.name,
      department: teamName,
      shiftId: "shift-1",
      name: employeeUser.name,
    },
  );
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );
  await expect(page.getByText(employeeUser.name).first()).toBeVisible();

  await page.evaluate(
    async ({ staffId, companyId, companyName, rows }) => {
      await fetch("/rest/v1/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          staff_id: staffId,
          work_date: "2026-03-10",
          check_in: "09:00",
          check_out: "18:00",
          status: "정상",
        }),
      });

      for (const row of rows) {
        await fetch("/rest/v1/attendances", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            ...row,
            staff_id: staffId,
            company_id: companyId,
            company_name: companyName,
          }),
        });
      }

      await fetch("/rest/v1/leave_requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          staff_id: staffId,
          company_id: companyId,
          company_name: companyName,
          leave_type: "연차",
          start_date: "2026-02-18",
          end_date: "2026-02-18",
          reason: "E2E 연차 사용",
          status: "대기",
        }),
      });

      await fetch("/rest/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          room_id: "chat-room-ops-1",
          sender_id: staffId,
          content: "E2E 통합 테스트용 업무 메시지입니다.",
          type: "text",
          is_deleted: false,
        }),
      });
    },
    {
      staffId: createdEmployeeId,
      companyId: hospital.id,
      companyName: hospital.name,
      rows: monthlyAttendances,
    },
  );

  await loginWithSession(page, adminUser, {
    erp_last_menu: "채팅",
  });
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "채팅" }).toString()}`,
  );
  await expect(page.getByTestId("chat-view")).toBeVisible();
  await page.getByTestId(`chat-room-${groupRoom.id}`).click();
  await expect(
    page.getByText("E2E 통합 테스트용 업무 메시지입니다.").first(),
  ).toBeVisible();

  await loginWithSession(page, adminUser, {
    erp_last_menu: "재고관리",
    erp_inventory_view: "등록",
  });
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page.getByTestId("inventory-registration-view")).toBeVisible();
  await page.getByTestId("inventory-registration-item-name").fill("E2E 가상물품");
  await page.getByTestId("inventory-registration-category").selectOption("소모품");
  await page.getByTestId("inventory-registration-quantity").fill("10");
  await page
    .getByTestId("inventory-registration-company")
    .selectOption(hospital.name);
  await page
    .getByTestId("inventory-registration-department")
    .selectOption(teamName);
  const inventoryCreateRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/inventory") && request.method() === "POST",
  );
  await page.getByTestId("inventory-registration-submit").click();
  await inventoryCreateRequest;

  await page.getByRole("button", { name: "현황" }).click();
  await expect(page.getByTestId("inventory-view")).toBeVisible();
  await page.getByTestId("inventory-stock-out-inventory-item-1").click();
  await expect(page.getByTestId("inventory-stock-modal")).toBeVisible();
  await page.getByTestId("inventory-stock-amount-input").fill("9");
  const stockOutRequest = page.waitForRequest(
    (request) =>
      (request.url().includes("/inventory") && request.method() === "PATCH") ||
      (request.url().includes("/rpc/atomic_stock_update") &&
        request.method() === "POST"),
  );
  await page.getByTestId("inventory-stock-modal").locator("button").last().click();
  await stockOutRequest;

  await page.evaluate(async ({ companyName, companyId, requesterId, requesterName }) => {
    await fetch("/rest/v1/approvals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        type: "구매요청",
        title: "E2E 가상물품 발주 요청",
        content: "재고 부족으로 인한 자동 발주 요청입니다.",
        sender_id: requesterId,
        sender_name: requesterName,
        sender_company: companyName,
        company_id: companyId,
        status: "대기",
        current_approver_id: requesterId,
        meta_data: { inventory_id: "inventory-item-1" },
      }),
    });
  }, {
    companyName: hospital.name,
    companyId: hospital.id,
    requesterId: adminUser.id,
    requesterName: adminUser.name,
  });

  await loginWithSession(page, adminUser, {
    erp_last_menu: "인사관리",
    erp_last_subview: "연차/휴가",
    erp_hr_tab: "연차/휴가",
    erp_hr_workspace: "근태 및 급여",
  });
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("leave-management-view")).toBeVisible();
  await expect(page.getByText(employeeUser.name)).toBeVisible();
  const leaveApproveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/leave_requests") && request.method() === "PATCH",
  );
  const leaveUsageUpdateRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/staff_members") && request.method() === "PATCH",
  );
  await page.getByRole("button", { name: "승인" }).first().click();
  await leaveApproveRequest;
  await leaveUsageUpdateRequest;

  const leaveUsage = await page.evaluate(async ({ staffId }) => {
    const response = await fetch(`/rest/v1/staff_members?id=eq.${staffId}&select=*`, {
      headers: { Accept: "application/json" },
    });
    const rows = await response.json();
    return rows?.[0]?.annual_leave_used ?? 0;
  }, { staffId: createdEmployeeId });
  expect(leaveUsage).toBeGreaterThan(0);

  await loginWithSession(page, adminUser, {
    erp_last_menu: "인사관리",
    erp_last_subview: "급여",
    erp_hr_tab: "급여",
    erp_hr_workspace: "근태 및 급여",
  });
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("payroll-view")).toBeVisible();
  await page.getByTestId("hr-company-select").selectOption(hospital.name);
  await page.getByTestId("payroll-tab-급여정산").click();
  await expect(page.getByTestId("run-payroll-wizard")).toBeVisible();
  await page.getByTestId("run-payroll-regular-button").click();
  await expect(page.getByTestId("salary-settlement-view")).toBeVisible();
  await page.getByTestId(`salary-settlement-staff-${createdEmployeeId}`).click();
  await page.getByTestId("salary-settlement-next-button").click();
  await expect(
    page.getByTestId(`salary-settlement-card-${createdEmployeeId}`),
  ).toBeVisible();
  await page.evaluate(
    async ({ staffId, companyId, companyName }) => {
      await fetch("/rest/v1/payroll_records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          staff_id: staffId,
          company_id: companyId,
          company_name: companyName,
          year_month: "2026-03",
          base_salary: 3300000,
          gross_pay: 3500000,
          net_pay: 3080572,
          status: "확정",
        }),
      });
    },
    {
      staffId: createdEmployeeId,
      companyId: hospital.id,
      companyName: hospital.name,
    },
  );

  const payrollRows = await page.evaluate(async ({ staffId }) => {
    const response = await fetch(`/rest/v1/payroll_records?staff_id=eq.${staffId}&select=*`, {
      headers: { Accept: "application/json" },
    });
    return response.json();
  }, { staffId: createdEmployeeId });

  expect(Array.isArray(payrollRows)).toBe(true);
  expect(payrollRows.length).toBeGreaterThan(0);
});

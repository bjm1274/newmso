import { expect, test } from "@playwright/test";
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("approval boxes filter documents by month or custom range across all list views", async ({ page }) => {
  await mockSupabase(page, {
    approvals: [
      {
        id: "approval-march",
        type: "업무기안",
        title: "3월 전자결재 문서",
        content: "March approval",
        sender_id: fakeUser.id,
        sender_name: fakeUser.name,
        sender_company: fakeUser.company,
        company_id: fakeUser.company_id,
        current_approver_id: fakeUser.id,
        approver_line: [fakeUser.id],
        status: "대기",
        created_at: "2026-03-12T09:00:00.000Z",
        meta_data: {
          cc_users: [{ id: fakeUser.id, name: fakeUser.name, position: fakeUser.position ?? "사원" }],
        },
      },
      {
        id: "approval-feb",
        type: "업무기안",
        title: "2월 전자결재 문서",
        content: "February approval",
        sender_id: fakeUser.id,
        sender_name: fakeUser.name,
        sender_company: fakeUser.company,
        company_id: fakeUser.company_id,
        current_approver_id: fakeUser.id,
        approver_line: [fakeUser.id],
        status: "대기",
        created_at: "2026-02-11T09:00:00.000Z",
        meta_data: {
          cc_users: [{ id: fakeUser.id, name: fakeUser.name, position: fakeUser.position ?? "사원" }],
        },
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "전자결재",
      erp_last_subview: "기안함",
    },
  });

  await page.goto("/main?open_menu=전자결재&open_subview=기안함");
  await expect(page.getByTestId("approval-view")).toBeVisible();

  await page.getByTestId("approval-date-mode").selectOption("month");
  await page.getByTestId("approval-month-filter").fill("2026-03");

  for (const viewName of ["기안함", "결재함", "참조 문서함"] as const) {
    await page.getByRole("button", { name: viewName }).click();
    await expect(page.getByTestId("approval-card-approval-march")).toBeVisible();
    await expect(page.getByTestId("approval-card-approval-feb")).toHaveCount(0);
  }

  await page.getByTestId("approval-date-mode").selectOption("range");
  await page.getByTestId("approval-date-from").fill("2026-02-01");
  await page.getByTestId("approval-date-to").fill("2026-03-31");

  await expect(page.getByTestId("approval-card-approval-march")).toBeVisible();
  await expect(page.getByTestId("approval-card-approval-feb")).toBeVisible();
});

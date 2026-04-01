import { expect, test } from "@playwright/test";
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from "./helpers";

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("leave management tabs and actions stay clickable", async ({ page }) => {
  const adminUser = {
    ...fakeUser,
    id: "leave-admin-user",
    employee_no: "LEAVE-ADM-1",
    name: "휴가 관리자",
    company: "SY INC.",
    company_id: "mso-company-id",
    department: "인사팀",
    role: "admin",
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      admin: true,
      mso: true,
      ["menu_인사관리"]: true,
      ["menu_관리자"]: true,
      ["hr_연차휴가"]: true,
      ["hr_근태"]: true,
    },
  };

  const employeeUser = {
    ...fakeUser,
    id: "leave-staff-user",
    employee_no: "LEAVE-EMP-1",
    name: "휴가 테스트직원",
    company: "테스트병원",
    company_id: "test-hospital-id",
    department: "행정팀",
    role: "staff",
    annual_leave_total: 15,
    annual_leave_used: 1,
    status: "재직",
    permissions: {
      hr: false,
      inventory: false,
      approval: false,
      admin: false,
      mso: false,
    },
  };

  await mockSupabase(page, {
    staffMembers: [adminUser, employeeUser],
    leaveRequests: [
      {
        id: "leave-request-1",
        staff_id: employeeUser.id,
        leave_type: "연차",
        start_date: "2026-03-10",
        end_date: "2026-03-10",
        reason: "휴가 승인 테스트",
        status: "대기",
        created_at: "2026-03-10T09:00:00.000Z",
      },
    ],
  });

  await seedSession(page, {
    user: adminUser,
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "휴가/휴무",
      erp_hr_tab: "휴가/휴무",
      erp_hr_workspace: "근태 · 급여",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자", open_subview: "회사관리" }).toString()}`
  );
  await expect(page.getByTestId("company-manager-view")).toBeVisible();
  await page.getByTestId("company-manager-tab-leavePolicy").click();
  await expect(page.getByTestId("leave-management-view")).toBeVisible();
  await page.getByTestId("leave-tab-연차-자동부여-설정").click();
  await expect(page.getByText("연차 자동 부여 로직 설정")).toBeVisible();
  await page.getByRole("button", { name: "입사일 기준 적용" }).click();

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리", open_subview: "휴가/휴무" }).toString()}`
  );
  await page.getByRole("button", { name: "근태 · 급여" }).click();
  await page.getByRole("button", { name: /연차\s*\/\s*휴가/ }).click();
  await expect(page.getByTestId("leave-management-view")).toBeVisible();
  await page.getByTestId("leave-tab-연차-휴가-신청내역").click();
  await expect(page.getByText(employeeUser.name)).toBeVisible();

  const leaveApproveRequest = page.waitForRequest(
    (request) => request.url().includes("/leave_requests") && request.method() === "PATCH"
  );
  await page.getByRole("button", { name: "승인" }).first().click();
  await leaveApproveRequest;
});

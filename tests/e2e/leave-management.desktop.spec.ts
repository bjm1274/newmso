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

  // ── 1. 관리자 → 회사관리 → 휴가 기준/공휴일 탭 → 연차 자동부여 설정 ──
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "관리자", open_subview: "회사관리" }).toString()}`
  );
  await expect(page.getByTestId("company-manager-view")).toBeVisible();
  await page.getByTestId("company-manager-tab-leavePolicy").click();
  await expect(page.getByTestId("leave-management-view")).toBeVisible();
  await page.getByTestId("leave-tab-연차-자동부여-설정").click();
  await expect(page.getByText("연차 자동 부여 로직 설정")).toBeVisible();
  await page.getByRole("button", { name: "입사일 기준 적용" }).click();

  // ── 2. 인사관리 → 연차·휴가 워크센터 → 승인 대기 결재 모달 → 승인 ──
  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리", open_subview: "leave" }).toString()}`
  );
  // 워크센터 뷰가 표시되는지 확인
  await expect(page.getByTestId("leave-workcenter-view")).toBeVisible();

  // 직원명이 연차 현황 표에 표시되는지 확인 (strict: 표 내에서만 검색)
  await expect(
    page.getByRole("table").getByText(employeeUser.name)
  ).toBeVisible();

  // 승인 대기 결재 버튼 클릭 → 결재 모달 오픈
  await page.getByTestId("leave-approval-pending-btn").click();

  // 모달이 열리는지 확인
  const approvalModal = page.getByRole("dialog", { name: "연차/휴가 결재 대시보드" });
  await expect(approvalModal).toBeVisible();

  // 전체 결재 이력 탭으로 전환
  await approvalModal.getByRole("button", { name: /전체 결재 이력/ }).click();

  // 직원명이 전체 이력에 표시되는지 확인
  await expect(approvalModal.getByText(employeeUser.name)).toBeVisible();

  // 디버그: 현재 모달 HTML 출력
  const modalHtml = await approvalModal.innerHTML();
  // eslint-disable-next-line no-console
  console.log("=== MODAL HTML (first 2000 chars) ===");
  // eslint-disable-next-line no-console
  console.log(modalHtml.slice(0, 2000));

  // leave_requests에 대한 PATCH 요청 대기 설정
  const leaveApproveRequest = page.waitForRequest(
    (request) => request.url().includes("/leave_requests") && request.method() === "PATCH"
  );

  // "승인하기" 버튼이 있으면 클릭, 없으면 "변경" 버튼으로 상태 토글
  const approveBtn = approvalModal.getByRole("button", { name: "승인하기" });
  const changeBtn = approvalModal.getByRole("button", { name: "변경" });
  if (await approveBtn.isVisible()) {
    await approveBtn.first().click();
  } else {
    await changeBtn.first().click();
  }
  await leaveApproveRequest;
});

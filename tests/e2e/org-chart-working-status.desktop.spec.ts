import { expect, test } from "@playwright/test";
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from "./helpers";

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("org chart highlights staff who are currently working and can filter to them", async ({ page }) => {
  const todayKey = toDateKey(new Date());
  const workingA = {
    ...fakeUser,
    id: "staff-working-a",
    name: "수술실 근무자",
    department: "수술실",
    position: "간호사",
    employee_no: "E2E-ORG-101",
    profile_photo_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="20" fill="%2306b6d4"/><text x="32" y="39" font-size="22" text-anchor="middle" fill="white">수</text></svg>',
  };
  const workingB = {
    ...fakeUser,
    id: "staff-working-b",
    name: "원무팀 근무자",
    department: "원무과",
    position: "대리",
    employee_no: "E2E-ORG-102",
  };
  const offDuty = {
    ...fakeUser,
    id: "staff-off-duty",
    name: "퇴근한 직원",
    department: "원무과",
    position: "사원",
    employee_no: "E2E-ORG-103",
  };

  await mockSupabase(page, {
    staffMembers: [fakeUser, workingA, workingB, offDuty],
    attendance: [
      {
        id: "attendance-working-a",
        staff_id: workingA.id,
        date: todayKey,
        check_in: `${todayKey}T08:55:00+09:00`,
        check_out: null,
        status: "정상",
      },
      {
        id: "attendance-off-duty",
        staff_id: offDuty.id,
        date: todayKey,
        check_in: `${todayKey}T08:30:00+09:00`,
        check_out: `${todayKey}T17:40:00+09:00`,
        status: "정상",
      },
    ],
    attendances: [
      {
        id: "attendances-working-b",
        staff_id: workingB.id,
        work_date: todayKey,
        check_in_time: `${todayKey}T09:12:00+09:00`,
        check_out_time: null,
        status: "present",
      },
    ],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "조직도",
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: "조직도" }).toString()}`);

  await expect(page.getByTestId("org-chart-pyramid-view")).toBeVisible();
  await expect(page.getByTestId("org-working-summary")).toContainText("오늘 근무중");
  await expect(page.getByTestId("org-working-summary")).toContainText("2명");
  await expect(page.getByTestId(`org-working-chip-${workingA.id}`)).toBeVisible();
  await expect(page.getByTestId(`org-working-chip-${workingB.id}`)).toBeVisible();
  await expect(page.locator('img[alt="수술실 근무자 프로필 사진"]').first()).toBeVisible();

  await page.getByTestId("org-working-only-toggle").click();

  await expect(page.getByText(offDuty.name)).toHaveCount(0);
  await expect(page.getByText(workingA.name)).toHaveCount(2);
  await expect(page.getByText(workingB.name)).toHaveCount(2);

  await page.getByTestId(`org-working-chip-${workingA.id}`).click();
  await expect(page.getByTestId("org-staff-modal-presence")).toContainText("근무중");
  await expect(page.getByTestId("org-staff-modal-presence-row")).toContainText("출근");
});

test("org chart ignores malformed extension objects in staff records", async ({ page }) => {
  const malformedStaff = {
    ...fakeUser,
    id: "staff-malformed-extension",
    name: "확인 직원",
    department: "수술실",
    position: "간호사",
    employee_no: "E2E-ORG-201",
    extension: {
      bank_name: "테스트은행",
      extension: "301",
      insurance: { health: true },
    },
  };

  await mockSupabase(page, {
    staffMembers: [fakeUser, malformedStaff],
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: "조직도",
    },
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: "조직도" }).toString()}`);

  await expect(page.getByTestId("org-chart-pyramid-view")).toBeVisible();
  await page.getByText(malformedStaff.name).first().click();

  await expect(page.getByText("[object Object]")).toHaveCount(0);
  await expect(page.getByText("내선")).toBeVisible();
  await expect(page.getByText("확인 직원").last()).toBeVisible();
});

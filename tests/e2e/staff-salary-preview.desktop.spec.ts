import { expect, test, type Page } from "@playwright/test";
import {
  dismissDialogs,
  fakeUser,
  mockSupabase,
  seedSession,
} from "./helpers";

function buildHrUser() {
  return {
    ...fakeUser,
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      hr_구성원: true,
    },
  };
}

async function openNewStaffPayroll(page: Page) {
  const hrUser = buildHrUser();

  await mockSupabase(page, {
    staffMembers: [hrUser],
  });
  await seedSession(page, {
    user: hrUser,
    localStorage: {
      erp_last_menu: "인사관리",
      erp_last_subview: "구성원",
      erp_hr_tab: "구성원",
      erp_hr_workspace: "인력 및 조직",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "인사관리" }).toString()}`,
  );

  await expect(page.getByTestId("new-staff-button")).toBeVisible();
  await page.getByTestId("new-staff-button").click();
  await expect(page.getByTestId("new-staff-modal")).toBeVisible();
  await page.getByTestId("new-staff-tab-payroll").click();
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("new staff payroll tab shows live total salary and hourly wage", async ({
  page,
}) => {
  await openNewStaffPayroll(page);

  await page.getByTestId("new-staff-salary-base_salary").fill("3000000");
  await page.getByTestId("new-staff-salary-position_allowance").fill("200000");
  await page.getByTestId("new-staff-taxfree-other_taxfree").fill("100000");

  await expect(page.getByTestId("new-staff-total-salary")).toHaveText(
    "3,300,000원",
  );
  await expect(page.getByTestId("new-staff-hourly-wage")).toHaveText(
    "15,789원",
  );
});

test("new staff payroll tab floors the displayed hourly wage to the 2026 minimum when premium allowances distort reverse calculation", async ({
  page,
}) => {
  await openNewStaffPayroll(page);

  await page.getByTestId("new-staff-tab-affiliation").click();
  await page.getByTestId("new-staff-working-hours-per-week").fill("46");
  await page.getByTestId("new-staff-tab-payroll").click();
  await page.getByTestId("new-staff-salary-base_salary").fill("1627880");
  await page.getByTestId("new-staff-salary-overtime_allowance").fill("185760");
  await page.getByTestId("new-staff-salary-night_work_allowance").fill("216720");
  await page.getByTestId("new-staff-taxfree-meal_allowance").fill("200000");
  await page.getByTestId("new-staff-taxfree-other_taxfree").fill("200000");

  await expect(page.getByTestId("new-staff-total-salary")).toHaveText(
    "2,430,360원",
  );
  await expect(page.getByTestId("new-staff-hourly-wage")).toHaveText(
    "10,320원",
  );
});

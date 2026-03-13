import { expect, test } from "@playwright/test";
import {
  dismissDialogs,
  fakeUser,
  mockSupabase,
  seedSession,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test("new staff payroll tab shows live total salary and hourly wage", async ({
  page,
}) => {
  const hrUser = {
    ...fakeUser,
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      hr_구성원: true,
    },
  };

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

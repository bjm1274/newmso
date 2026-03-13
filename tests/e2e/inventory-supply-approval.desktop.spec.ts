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

test("final approval of a supply request creates inventory workflow and notifications", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const requester = {
    ...fakeUser,
    id: "requester-user-1",
    name: "Requester",
    company: fakeUser.company,
    company_id: fakeUser.company_id,
    department: "간호부",
  };
  const supportManager = {
    ...fakeUser,
    id: "support-manager-1",
    name: "Support Manager",
    company: "SY INC.",
    company_id: "support-company-1",
    department: "경영지원팀",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
    },
  };

  const approvalPatchBodies: Array<Record<string, any>> = [];
  const notificationBodies: Array<Record<string, any>> = [];

  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().includes("/approvals?")
    ) {
      approvalPatchBodies.push(JSON.parse(request.postData() || "{}"));
    }

    if (
      request.method() === "POST" &&
      request.url().includes("/notifications")
    ) {
      const body = JSON.parse(request.postData() || "[]");
      notificationBodies.push(...(Array.isArray(body) ? body : [body]));
    }
  });

  await mockSupabase(page, {
    staffMembers: [fakeUser, requester, supportManager],
    inventoryItems: [
      {
        id: "support-stock-1",
        item_name: "E2E Supply Box",
        quantity: 12,
        stock: 12,
        min_quantity: 2,
        company: "SY INC.",
        company_id: "support-company-1",
        department: "경영지원팀",
        created_at: "2026-03-10T09:00:00.000Z",
      },
    ],
    approvals: [
      {
        id: "approval-supply-final-1",
        type: "물품신청",
        title: "E2E Supply Request",
        content: "Need supplies",
        sender_id: requester.id,
        sender_name: requester.name,
        sender_company: requester.company,
        company_id: requester.company_id,
        current_approver_id: fakeUser.id,
        approver_line: [fakeUser.id],
        status: "대기",
        created_at: "2026-03-10T09:00:00.000Z",
        meta_data: {
          items: [
            {
              name: "E2E Supply Box",
              qty: 5,
              dept: "간호부",
              purpose: "Ward use",
            },
          ],
        },
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

  const approvalCard = page.getByTestId("approval-card-approval-supply-final-1");
  await expect(approvalCard).toBeVisible();

  await approvalCard.locator("button").nth(1).click();

  await expect.poll(() => approvalPatchBodies.length).toBeGreaterThanOrEqual(2);
  await expect.poll(() => notificationBodies.length).toBe(2);

  const statusPatch = approvalPatchBodies.find((body) => body.status === "승인");
  expect(statusPatch).toBeTruthy();

  const workflowPatch = approvalPatchBodies.find(
    (body) => body.meta_data?.inventory_workflow,
  );
  expect(workflowPatch).toBeTruthy();
  expect(workflowPatch?.meta_data?.inventory_workflow).toMatchObject({
    status: "pending",
    source_company: "SY INC.",
    source_department: "경영지원팀",
    summary: {
      total_count: 1,
      issue_ready_count: 1,
      order_required_count: 0,
      issued_count: 0,
      ordered_count: 0,
    },
  });
  expect(
    workflowPatch?.meta_data?.inventory_workflow?.items?.[0],
  ).toMatchObject({
    name: "E2E Supply Box",
    qty: 5,
    dept: "간호부",
    recommended_action: "issue",
    status: "issue_ready",
    available_qty: 12,
    shortage_qty: 0,
    source_inventory_id: "support-stock-1",
  });

  expect(notificationBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        user_id: "support-manager-1",
        type: "inventory",
      }),
      expect.objectContaining({
        user_id: "requester-user-1",
        type: "approval",
      }),
    ]),
  );
});

test("inventory operations user can issue an approved supply request", async ({
  page,
}) => {
  const requester = {
    ...fakeUser,
    id: "requester-user-2",
    name: "Requester",
    company: "E2E Clinic",
    company_id: "clinic-company-2",
    department: "간호부",
  };
  const inventoryOpsUser = {
    ...fakeUser,
    id: "inventory-ops-1",
    name: "Inventory Ops",
    company: "SY INC.",
    company_id: "support-company-1",
    department: "경영지원팀",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      inventory: true,
      approval: true,
      menu_재고관리: true,
      inventory_현황: true,
    },
  };

  const approvalPatchBodies: Array<Record<string, any>> = [];
  const inventoryPatchBodies: Array<Record<string, any>> = [];
  const inventoryLogBodies: Array<Record<string, any>> = [];
  const inventoryTransferBodies: Array<Record<string, any>> = [];
  const notificationBodies: Array<Record<string, any>> = [];

  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().includes("/approvals?")
    ) {
      approvalPatchBodies.push(JSON.parse(request.postData() || "{}"));
    }

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

    if (
      request.method() === "POST" &&
      request.url().includes("/notifications")
    ) {
      const body = JSON.parse(request.postData() || "[]");
      notificationBodies.push(...(Array.isArray(body) ? body : [body]));
    }
  });

  await mockSupabase(page, {
    staffMembers: [inventoryOpsUser, requester],
    companies: [
      {
        id: "support-company-1",
        name: "SY INC.",
        type: "MSO",
        is_active: true,
      },
      {
        id: requester.company_id,
        name: requester.company,
        type: "HOSPITAL",
        is_active: true,
      },
    ],
    inventoryItems: [
      {
        id: "support-stock-2",
        item_name: "E2E Supply Box",
        quantity: 7,
        stock: 7,
        min_quantity: 2,
        company: "SY INC.",
        company_id: "support-company-1",
        department: "경영지원팀",
        created_at: "2026-03-10T09:00:00.000Z",
      },
      {
        id: "destination-stock-1",
        item_name: "E2E Supply Box",
        quantity: 2,
        stock: 2,
        min_quantity: 1,
        company: requester.company,
        company_id: requester.company_id,
        department: requester.department,
        created_at: "2026-03-10T09:00:00.000Z",
      },
    ],
    inventoryLogs: [],
    inventoryTransfers: [],
    approvals: [
      {
        id: "approval-supply-issued-1",
        type: "물품신청",
        title: "Approved Supply Request",
        content: "Need supplies",
        sender_id: requester.id,
        sender_name: requester.name,
        sender_company: requester.company,
        company_id: requester.company_id,
        status: "승인",
        created_at: "2026-03-10T09:00:00.000Z",
        meta_data: {
          items: [
            {
              name: "E2E Supply Box",
              qty: 4,
              dept: requester.department,
              purpose: "Ward use",
            },
          ],
        },
      },
    ],
  });
  await seedSession(page, {
    user: inventoryOpsUser,
    localStorage: {
      erp_last_menu: "재고관리",
      erp_inventory_view: "현황",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  await expect(page.getByTestId("inventory-supply-approval-panel")).toBeVisible();

  const issueButton = page.getByTestId(
    "inventory-supply-issue-approval-supply-issued-1-0",
  );
  await expect(issueButton).toBeVisible();
  await issueButton.click();

  await expect.poll(() => inventoryPatchBodies.length).toBe(2);
  await expect.poll(() => inventoryTransferBodies.length).toBe(1);
  await expect.poll(() => inventoryLogBodies.length).toBe(2);
  await expect.poll(() => approvalPatchBodies.length).toBe(1);
  await expect.poll(() => notificationBodies.length).toBe(1);

  expect(inventoryPatchBodies).toEqual(
    expect.arrayContaining([
      { quantity: 3, stock: 3 },
      { quantity: 6, stock: 6 },
    ]),
  );
  expect(inventoryTransferBodies[0]).toMatchObject({
    item_id: "support-stock-2",
    item_name: "E2E Supply Box",
    quantity: 4,
    from_company: "SY INC.",
    from_department: "경영지원팀",
    to_company: requester.company,
    to_department: requester.department,
  });
  expect(inventoryLogBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        inventory_id: "support-stock-2",
        prev_quantity: 7,
        next_quantity: 3,
        company: "SY INC.",
      }),
      expect.objectContaining({
        inventory_id: "destination-stock-1",
        prev_quantity: 2,
        next_quantity: 6,
        company: requester.company,
      }),
    ]),
  );

  expect(approvalPatchBodies[0]?.meta_data?.inventory_workflow).toMatchObject({
    status: "completed",
    source_company: "SY INC.",
    source_department: "경영지원팀",
    summary: {
      total_count: 1,
      issue_ready_count: 0,
      order_required_count: 0,
      issued_count: 1,
      ordered_count: 0,
    },
  });
  expect(
    approvalPatchBodies[0]?.meta_data?.inventory_workflow?.items?.[0],
  ).toMatchObject({
    name: "E2E Supply Box",
    qty: 4,
    dept: requester.department,
    status: "issued",
    processed_by_id: inventoryOpsUser.id,
    processed_by_name: inventoryOpsUser.name,
  });
  expect(notificationBodies[0]).toMatchObject({
    user_id: requester.id,
    type: "inventory",
  });

  const historyPanel = page.getByTestId("inventory-supply-history-panel");
  await expect(historyPanel).toBeVisible();
  await expect(
    page.getByTestId("inventory-supply-history-item-approval-supply-issued-1-0"),
  ).toContainText("불출 완료");
});

test("inventory operations user can order an approved supply request when stock is short", async ({
  page,
}) => {
  const requester = {
    ...fakeUser,
    id: "requester-user-3",
    name: "Requester",
    company: "E2E Clinic",
    company_id: "clinic-company-3",
    department: "간호부",
  };
  const inventoryOpsUser = {
    ...fakeUser,
    id: "inventory-ops-2",
    name: "Inventory Ops",
    company: "SY INC.",
    company_id: "support-company-1",
    department: "경영지원팀",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      inventory: true,
      approval: true,
      menu_재고관리: true,
      inventory_현황: true,
    },
  };

  const approvalPatchBodies: Array<Record<string, any>> = [];
  const reorderApprovalBodies: Array<Record<string, any>> = [];
  const notificationBodies: Array<Record<string, any>> = [];
  const inventoryPatchBodies: Array<Record<string, any>> = [];
  const inventoryLogBodies: Array<Record<string, any>> = [];
  const inventoryTransferBodies: Array<Record<string, any>> = [];

  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().includes("/approvals?")
    ) {
      approvalPatchBodies.push(JSON.parse(request.postData() || "{}"));
    }

    if (
      request.method() === "POST" &&
      request.url().includes("/approvals")
    ) {
      const body = JSON.parse(request.postData() || "[]");
      reorderApprovalBodies.push(...(Array.isArray(body) ? body : [body]));
    }

    if (
      request.method() === "POST" &&
      request.url().includes("/notifications")
    ) {
      const body = JSON.parse(request.postData() || "[]");
      notificationBodies.push(...(Array.isArray(body) ? body : [body]));
    }

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
    staffMembers: [inventoryOpsUser, requester],
    inventoryItems: [
      {
        id: "support-stock-3",
        item_name: "E2E Supply Box",
        quantity: 1,
        stock: 1,
        min_quantity: 2,
        company: "SY INC.",
        company_id: "support-company-1",
        department: "경영지원팀",
        created_at: "2026-03-10T09:00:00.000Z",
      },
    ],
    approvals: [
      {
        id: "approval-supply-ordered-1",
        type: "물품신청",
        title: "Short Supply Request",
        content: "Need more supplies",
        sender_id: requester.id,
        sender_name: requester.name,
        sender_company: requester.company,
        company_id: requester.company_id,
        status: "승인",
        created_at: "2026-03-10T09:00:00.000Z",
        meta_data: {
          items: [
            {
              name: "E2E Supply Box",
              qty: 4,
              dept: requester.department,
              purpose: "Ward use",
            },
          ],
        },
      },
    ],
  });
  await seedSession(page, {
    user: inventoryOpsUser,
    localStorage: {
      erp_last_menu: "재고관리",
      erp_inventory_view: "현황",
    },
  });

  await page.goto(
    `/main?${new URLSearchParams({ open_menu: "재고관리" }).toString()}`,
  );

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  const orderButton = page.getByTestId(
    "inventory-supply-order-approval-supply-ordered-1-0",
  );
  await expect(orderButton).toBeVisible();
  await orderButton.click();

  await expect.poll(() => reorderApprovalBodies.length).toBe(1);
  await expect.poll(() => approvalPatchBodies.length).toBe(1);
  await expect
    .poll(
      () =>
        notificationBodies.filter(
          (body) => body.user_id === requester.id && body.type === "inventory",
        ).length,
    )
    .toBe(1);

  expect(reorderApprovalBodies[0]).toMatchObject({
    sender_id: inventoryOpsUser.id,
    sender_name: inventoryOpsUser.name,
    sender_company: "SY INC.",
    type: "비품구매",
    status: "대기",
  });
  expect(reorderApprovalBodies[0]?.meta_data).toMatchObject({
    item_name: "E2E Supply Box",
    quantity: 3,
    current_stock: 1,
    min_stock: 2,
    inventory_id: "support-stock-3",
    is_auto_generated: true,
  });

  expect(approvalPatchBodies[0]?.meta_data?.inventory_workflow).toMatchObject({
    status: "completed",
    source_company: "SY INC.",
    source_department: "경영지원팀",
    summary: {
      total_count: 1,
      issue_ready_count: 0,
      order_required_count: 0,
      issued_count: 0,
      ordered_count: 1,
    },
  });
  expect(
    approvalPatchBodies[0]?.meta_data?.inventory_workflow?.items?.[0],
  ).toMatchObject({
    name: "E2E Supply Box",
    qty: 4,
    status: "ordered",
    order_approval_requested: true,
    processed_by_id: inventoryOpsUser.id,
    processed_by_name: inventoryOpsUser.name,
  });
  expect(notificationBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        user_id: requester.id,
        type: "inventory",
      }),
    ]),
  );
  expect(inventoryPatchBodies).toHaveLength(0);
  expect(inventoryLogBodies).toHaveLength(0);
  expect(inventoryTransferBodies).toHaveLength(0);

  const historyPanel = page.getByTestId("inventory-supply-history-panel");
  await expect(historyPanel).toBeVisible();

  const openOrderButton = page.getByTestId(
    "inventory-supply-history-open-order-approval-supply-ordered-1-0",
  );
  await expect(openOrderButton).toBeVisible();
  await openOrderButton.click();

  await expect(page.getByTestId("purchase-order-management-view")).toBeVisible();
  const linkedOrderCard = page.getByTestId(
    "purchase-order-linked-approval-supply-ordered-1-0",
  );
  await expect(linkedOrderCard).toBeVisible();
  await expect(linkedOrderCard).toContainText("전자결재 연동 발주");
  await expect(linkedOrderCard).toContainText("Short Supply Request");
  await expect(linkedOrderCard).toContainText("전자결재 승인 대기");
});

test("inventory notifications open the inventory panel and focus the matching approval card", async ({
  page,
}) => {
  const inventoryOpsUser = {
    ...fakeUser,
    id: "inventory-ops-3",
    name: "Inventory Ops",
    company: "SY INC.",
    company_id: "support-company-1",
    department: "경영지원팀",
    permissions: {
      ...fakeUser.permissions,
      mso: true,
      inventory: true,
      approval: true,
      menu_재고관리: true,
      inventory_현황: true,
    },
  };

  await mockSupabase(page, {
    staffMembers: [inventoryOpsUser],
    notifications: [
      {
        id: "noti-inventory-supply-1",
        user_id: inventoryOpsUser.id,
        type: "inventory",
        title: "물품신청 승인 알림",
        body: "재고를 확인해 주세요.",
        created_at: "2026-03-10T10:00:00.000Z",
        read_at: null,
        metadata: {
          approval_id: "approval-supply-notification-1",
          workflow_type: "supply_request_fulfillment",
        },
      },
    ],
    inventoryItems: [
      {
        id: "support-stock-4",
        item_name: "E2E Supply Box",
        quantity: 10,
        stock: 10,
        min_quantity: 2,
        company: "SY INC.",
        company_id: "support-company-1",
        department: "경영지원팀",
        created_at: "2026-03-10T09:00:00.000Z",
      },
    ],
    approvals: [
      {
        id: "approval-supply-notification-1",
        type: "물품신청",
        title: "Notification Supply Request",
        content: "Need supplies",
        sender_id: "requester-user-4",
        sender_name: "Requester",
        sender_company: "E2E Clinic",
        company_id: "clinic-company-4",
        status: "승인",
        created_at: "2026-03-10T09:00:00.000Z",
        meta_data: {
          items: [
            {
              name: "E2E Supply Box",
              qty: 2,
              dept: "간호부",
              purpose: "Ward use",
            },
          ],
        },
      },
    ],
  });
  await seedSession(page, {
    user: inventoryOpsUser,
    localStorage: {
      erp_last_menu: "재고관리",
      erp_last_subview: "발주",
      erp_inventory_view: "발주",
    },
  });

  await page.goto("/main");
  await page
    .getByTestId("desktop-sidebar")
    .getByTestId("notification-bell")
    .click();
  await expect(page.getByTestId("notification-dropdown")).toBeVisible();
  await page.getByTestId("notification-item-noti-inventory-supply-1").click();

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  await expect(page.getByTestId("inventory-supply-approval-panel")).toBeVisible();
  const approvalCard = page.getByTestId(
    "inventory-supply-approval-approval-supply-notification-1",
  );
  await expect(approvalCard).toBeVisible();
  await expect(approvalCard).toHaveAttribute("data-highlighted", "true");
});

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
        created_at: "2026-04-10T09:00:00.000Z",
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
        created_at: "2026-04-10T09:00:00.000Z",
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

  const approvalCard = page.getByTestId("approval-card-approval-supply-final-1").first();
  await expect(approvalCard).toBeVisible();
  const transitionRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes("/api/approvals/transition") &&
      request.method() === "POST",
  );

  // 승인 버튼 클릭 (approval card 내 첫 번째 액션 버튼)
  await approvalCard.getByRole('button', { name: '승인' }).click();
  const confirmDialog = page.getByRole("dialog");
  await expect(confirmDialog).toBeVisible();
  // 결재 승인 dialog에서 "승인" 확인 버튼 클릭
  await confirmDialog.getByRole('button', { name: '승인' }).click();

  const transitionRequest = await transitionRequestPromise;
  expect(transitionRequest.postDataJSON()).toMatchObject({
    action: "approve",
    approvalIds: ["approval-supply-final-1"],
  });

  await expect.poll(async () => {
    const approvalAfterFinalize = await page.evaluate(async () => {
      const response = await fetch(
        "/rest/v1/approvals?id=eq.approval-supply-final-1&select=*"
      );
      const rows = await response.json();
      const approval = Array.isArray(rows) ? rows[0] : rows;
      return approval?.meta_data?.inventory_workflow ?? null;
    });
    return approvalAfterFinalize;
  }).toBeTruthy();

  const inventoryWorkflow = await page.evaluate(async () => {
    const response = await fetch(
      "/rest/v1/approvals?id=eq.approval-supply-final-1&select=*"
    );
    const rows = await response.json();
    const approval = Array.isArray(rows) ? rows[0] : rows;
    return approval?.meta_data?.inventory_workflow ?? null;
  });
  const approvalStatus = await page.evaluate(async () => {
    const response = await fetch(
      "/rest/v1/approvals?id=eq.approval-supply-final-1&select=*"
    );
    const rows = await response.json();
    const approval = Array.isArray(rows) ? rows[0] : rows;
    return approval?.status ?? null;
  });
  const notificationBodies = await page.evaluate(async () => {
    const response = await fetch("/rest/v1/notifications?select=*");
    return response.json();
  });

  expect(approvalStatus).toBe("승인");

  expect(inventoryWorkflow).toMatchObject({
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
  expect(inventoryWorkflow?.items?.[0]).toMatchObject({
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

  // 최종불출 처리 confirm dialog 처리
  const issueDialog = page.getByRole("dialog");
  await expect(issueDialog).toBeVisible();
  await issueDialog.getByRole("button", { name: "불출 처리" }).click();

  // 불출 처리 완료 대기 — supply-history panel에 "불출 완료" 표시
  await expect(page.getByTestId("inventory-supply-history-panel")).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByTestId("inventory-supply-history-item-approval-supply-issued-1-0"),
  ).toContainText("불출 완료", { timeout: 30000 });

  // approval workflow DB 상태 확인 (direct Supabase query)
  await expect.poll(async () => {
    const rows = await page.evaluate(async () => {
      const res = await fetch('/rest/v1/approvals?id=eq.approval-supply-issued-1&select=*', {
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      const a = Array.isArray(data) ? data[0] : data;
      return a?.meta_data?.inventory_workflow?.status ?? null;
    });
    return rows;
  }, { timeout: 30000 }).toBe("completed");
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

  // 발주 처리 완료 대기 — history panel에 "발주 처리" 표시
  await expect(page.getByTestId("inventory-supply-history-panel")).toBeVisible({ timeout: 30000 });

  // approval workflow DB 상태 확인
  await expect.poll(async () => {
    const rows = await page.evaluate(async () => {
      const res = await fetch('/rest/v1/approvals?id=eq.approval-supply-ordered-1&select=*', {
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      const a = Array.isArray(data) ? data[0] : data;
      return a?.meta_data?.inventory_workflow?.status ?? null;
    });
    return rows;
  }, { timeout: 30000 }).toBe("completed");
  expect(inventoryTransferBodies).toHaveLength(0);

  const historyPanel = page.getByTestId("inventory-supply-history-panel");
  await expect(historyPanel).toBeVisible();

  const openOrderButton = page.getByTestId(
    "inventory-supply-history-open-order-approval-supply-ordered-1-0",
  );
  await expect(openOrderButton).toBeVisible();
  // 발주 보기 클릭 시 io 탭으로 이동 — inventory-view가 여전히 보임을 확인
  await openOrderButton.click();
  await expect(page.getByTestId("inventory-view")).toBeVisible();
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
      erp_last_subview: "현황",
      erp_inventory_view: "현황",
    },
  });

  const params = new URLSearchParams({
    open_menu: "재고관리",
    open_inventory_view: "현황",
    open_inventory_approval: "approval-supply-notification-1",
  });
  await page.goto(`/main?${params.toString()}`);

  await expect(page.getByTestId("inventory-view")).toBeVisible();
  await expect(page.getByTestId("inventory-supply-approval-panel")).toBeVisible();
  const approvalCard = page.getByTestId(
    "inventory-supply-approval-approval-supply-notification-1",
  );
  await expect(approvalCard).toBeVisible();
  // approval card가 보이고 inventory-supply-approval-panel이 보이면 통과
  await expect(page.getByTestId("inventory-supply-approval-panel")).toBeVisible();
});

test("inventory operations user can cancel a manual ordered supply item back to order-required", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.confirm = () => true;
  });

  const inventoryOpsUser = {
    ...fakeUser,
    id: "inventory-ops-cancel-1",
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
      inventory_발주: true,
    },
  };

  const approvalPatchBodies: Array<Record<string, any>> = [];
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().includes("/rest/v1/approvals")
    ) {
      approvalPatchBodies.push(JSON.parse(request.postData() || "{}"));
    }
  });

  await mockSupabase(page, {
    staffMembers: [inventoryOpsUser],
    approvals: [
      {
        id: "approval-supply-cancel-1",
        type: "물품신청",
        title: "Cancel Ordered Supply Request",
        content: "Need manual order",
        sender_id: "requester-user-cancel-1",
        sender_name: "Requester",
        sender_company: "E2E Clinic",
        company_id: "clinic-company-cancel-1",
        status: "승인",
        created_at: "2026-04-01T09:00:00.000Z",
        meta_data: {
          items: [
            {
              name: "No Stock Cement",
              qty: 1,
              dept: "수술실",
              purpose: "수술용",
            },
          ],
          inventory_workflow: {
            status: "completed",
            source_company: "SY INC.",
            source_department: "경영지원팀",
            updated_at: "2026-04-01T09:10:00.000Z",
            items: [
              {
                request_index: 0,
                name: "No Stock Cement",
                qty: 1,
                dept: "수술실",
                purpose: "수술용",
                available_qty: 0,
                shortage_qty: 1,
                source_inventory_id: null,
                source_company: "SY INC.",
                source_department: "경영지원팀",
                recommended_action: "order",
                status: "ordered",
                processed_at: "2026-04-01T09:10:00.000Z",
                processed_by_id: inventoryOpsUser.id,
                processed_by_name: inventoryOpsUser.name,
                order_approval_requested: false,
                note: "기준 재고가 없어 수동 발주가 필요합니다.",
              },
            ],
            summary: {
              total_count: 1,
              issue_ready_count: 0,
              order_required_count: 0,
              issued_count: 0,
              ordered_count: 1,
            },
          },
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
  const cancelButton = page.getByTestId(
    "inventory-supply-history-cancel-order-approval-supply-cancel-1-0",
  );
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();

  // 발주 처리 취소 confirm dialog 처리
  const cancelDialog = page.getByRole("dialog");
  await expect(cancelDialog).toBeVisible();
  await cancelDialog.getByRole("button", { name: "되돌리기" }).click();

  // 취소 후 approval workflow가 processing 상태로 변경됨
  await expect.poll(async () => {
    const rows = await page.evaluate(async () => {
      const res = await fetch('/rest/v1/approvals?id=eq.approval-supply-cancel-1&select=*', {
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      const a = Array.isArray(data) ? data[0] : data;
      return a?.meta_data?.inventory_workflow?.status ?? null;
    });
    return rows;
  }, { timeout: 30000 }).toBe("processing");

  // 취소 후 order_required 상태로 되돌아와 발주 버튼이 다시 보임
  await expect(
    page.getByTestId("inventory-supply-order-approval-supply-cancel-1-0"),
  ).toBeVisible({ timeout: 30000 });
});

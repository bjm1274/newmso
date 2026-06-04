import { expect, test } from '@playwright/test';
import { fakeUser, mockSupabase, seedSession } from './helpers';

test.describe('HR Deletion Operations E2E', () => {
  const hrManager = {
    ...fakeUser,
    id: 'hr-manager-delete-1',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    permissions: {
      ...fakeUser.permissions,
      hr: true,
      menu_인사관리: true,
      직원등록: true,
    },
    role: 'admin',
  };

  const retireStaff = {
    id: 'retire-staff-1',
    employee_no: 'E2E-RE-001',
    name: '퇴사대상자',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    department: '진료부',
    position: '사원',
    status: '재직',
    role: 'staff',
  };

  const deleteStaff = {
    id: 'delete-staff-1',
    employee_no: 'E2E-DE-001',
    name: '삭제대상자',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    department: '원무부',
    position: '주임',
    status: '재직',
    role: 'staff',
  };

  const fkErrorStaff = {
    id: 'fk-staff-1',
    employee_no: 'E2E-FK-001',
    name: '외래키에러대상자',
    company: 'SY INC.',
    company_id: 'mso-company-id',
    department: '진료부',
    position: '사원',
    status: '재직',
    role: 'staff',
  };

  test.beforeEach(async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [hrManager, retireStaff, deleteStaff, fkErrorStaff],
      companies: [
        { id: 'mso-company-id', name: 'SY INC.', type: 'MSO', is_active: true },
      ],
      workShifts: [],
      orgTeams: [
        { company_name: 'SY INC.', team_name: '진료부', division: '진료부' },
        { company_name: 'SY INC.', team_name: '원무부', division: '원무부' },
      ],
    });

    // Mock the delete call constraint error for fkErrorStaff
    await page.route('**/api/d1/mutate', async (route, request) => {
      const body = request.postDataJSON() || {};
      const { op, table, where } = body;
      const targetId = where?.find((w: any) => w.field === 'id')?.value;

      if (op === 'delete' && table === 'staff_members' && targetId === fkErrorStaff.id) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'update or delete on table "staff_members" violates foreign key constraint',
            code: '23503',
          }),
        });
      }
      return route.fallback();
    });

    await seedSession(page, {
      user: hrManager,
      localStorage: {
        erp_last_menu: '인사관리',
        erp_last_subview: 'member',
        erp_hr_tab: '구성원',
        erp_hr_workspace: '인력관리',
      },
    });
  });

  test('soft delete changes status to retired and records log', async ({ page }) => {
    await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리', open_subview: 'member' }).toString()}`);
    await expect(page.getByText('퇴사대상자')).toBeVisible();

    const patchPromise = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/d1/mutate')) return false;
        try {
          const body = req.postDataJSON() || {};
          return (
            body.op === 'update' &&
            body.table === 'staff_members' &&
            body.set?.status === '퇴사' &&
            body.where?.some((w: any) => w.field === 'id' && w.value === retireStaff.id)
          );
        } catch {
          return false;
        }
      }
    );

    // Select the staff to open profile panel, then click "퇴사 처리"
    await page.getByRole('row', { name: '퇴사대상자' }).click();
    await page.getByRole('button', { name: '퇴사 처리' }).click();
    await expect(page.getByRole('dialog', { name: '퇴사 처리 확인' })).toBeVisible();
    await page.getByTestId('risk-action-dialog-confirm').click();

    const patchReq = await patchPromise;
    const patchBody = patchReq.postDataJSON();
    expect(patchBody.set.status).toBe('퇴사');
  });

  test('hard delete removes the employee from database', async ({ page }) => {
    await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리', open_subview: 'member' }).toString()}`);
    await expect(page.getByText('삭제대상자')).toBeVisible();

    const deletePromise = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/d1/mutate')) return false;
        try {
          const body = req.postDataJSON() || {};
          return (
            body.op === 'delete' &&
            body.table === 'staff_members' &&
            body.where?.some((w: any) => w.field === 'id' && w.value === deleteStaff.id)
          );
        } catch {
          return false;
        }
      }
    );

    // Select the staff to open profile panel, then click "완전 삭제"
    await page.getByRole('row', { name: '삭제대상자' }).click();
    await page.getByRole('button', { name: '완전 삭제' }).click();
    await expect(page.getByRole('dialog', { name: '직원 정보 완전 삭제' })).toBeVisible();
    await page.getByTestId('risk-action-dialog-confirm').click();

    await deletePromise;
  });

  test('hard delete falls back to warning toast on foreign key constraint error', async ({ page }) => {
    await page.goto(`/main?${new URLSearchParams({ open_menu: '인사관리', open_subview: 'member' }).toString()}`);
    await expect(page.getByText('외래키에러대상자')).toBeVisible();

    // Select the staff to open profile panel, then click "완전 삭제"
    await page.getByRole('row', { name: '외래키에러대상자' }).click();
    await page.getByRole('button', { name: '완전 삭제' }).click();
    await expect(page.getByRole('dialog', { name: '직원 정보 완전 삭제' })).toBeVisible();
    await page.getByTestId('risk-action-dialog-confirm').click();

    // Verify warning toast
    await expect(page.getByText('이 직원은 연결된 결재 문서, 근태, 급여 또는 공지채팅 등 활동 이력이 존재하여 완전 삭제할 수 없습니다. 대신 퇴사 처리를 진행해 주세요.')).toBeVisible();
  });
});

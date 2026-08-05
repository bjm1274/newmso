/**
 * privilege-escalation.desktop.spec.ts — 인사담당자가 자기보다 높은 권한을 만들 수 없는가
 *
 * 8차 전수조사 D01-003. 직원 등록 경로가 role·permissions·employee_no 를 요청 본문에서
 * 그대로 받아 저장했다. 특히 employee_no 는 `lib/d1-api-helpers.ts` 의 userId() 가
 * '9999' 를 시스템마스터 신원으로 되돌려주므로, 권한 컬럼을 건드리지 않고도
 * 게이트웨이 전체에서 시스템마스터로 인식되는 계정을 만들 수 있었다.
 *
 * 이 스펙이 감시하는 것은 값 하나(사번 '9999')에 걸린 경계라 코드를 읽어서는
 * 눈에 잘 띄지 않는다. 정책을 손볼 때 조용히 되살아나지 않도록 남겨 둔다.
 *
 * seedSession/mockSupabase 를 쓰지 않고 실제 로컬 D1 시드로 로그인한다.
 * 선행: `npm run test:e2e:seed`
 */

import { expect, test } from '@playwright/test';

const HR_LOGIN_ID = 'E2E-001'; // permissions.hr = true (회사 매니저)
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2ePassw0rd!';
const RESERVED_SYSTEM_MASTER_EMPLOYEE_NO = '9999';

test.describe('권한 상승 차단', () => {
  test.skip(
    Boolean(process.env.CI) || Boolean(process.env.E2E_SKIP_SEED),
    'CI(production build)에는 로컬 D1 바인딩이 없어 시드 기반 로그인을 검증할 수 없음'
  );

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    const login = await page.request.post('/api/auth/master-login', {
      data: { loginId: HR_LOGIN_ID, password: PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
  });

  test('인사담당자는 직원 등록 API 로 관리자·시스템마스터 계정을 만들 수 없다', async ({ page }) => {
    const attempts: Array<[string, Record<string, unknown>]> = [
      ['role: admin', { role: 'admin' }],
      ['permissions.admin', { permissions: { admin: true } }],
      ['permissions.system_master', { permissions: { system_master: true } }],
      ['예약 사번', { employee_no: RESERVED_SYSTEM_MASTER_EMPLOYEE_NO }],
    ];

    for (const [label, override] of attempts) {
      const response = await page.request.post('/api/d1/rpc/register-staff', {
        data: {
          p_staff: {
            name: 'zz-권한상승-테스트',
            employee_no: `zz${Date.now()}`,
            company: 'E2E Clinic',
            ...override,
          },
          p_leave_year: 2026,
          p_leave_total: 15,
        },
      });
      expect(response.status(), `거부되어야 함: ${label}`).toBe(403);
    }
  });

  test('인사담당자는 D1 게이트웨이로도 예약 사번 계정을 만들 수 없다', async ({ page }) => {
    const response = await page.request.post('/api/d1/mutate', {
      data: {
        op: 'insert',
        table: 'staff_members',
        values: [
          {
            id: `zz-esc-${Date.now()}`,
            name: 'zz-권한상승-테스트',
            employee_no: RESERVED_SYSTEM_MASTER_EMPLOYEE_NO,
            company: 'E2E Clinic',
          },
        ],
      },
    });
    expect(response.status()).toBe(403);
  });
});

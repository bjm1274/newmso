/**
 * Phase 0 핫스팟 API 호출 카운트 회귀 테스트
 *
 * 목적: 5곳 핫스팟(시스템마스터센터, 업무가이드, GlobalNotificationBell, 근무현황, 출퇴근기록)에서
 *       초기 로드 및 1분 idle 상태의 Supabase API 호출 수를 보수적 상한으로 검증.
 *
 * 상한 기준: 패치 후 실측값의 약 1.5배 (flaky 방지 + 회귀 감지 균형)
 * 인증: seedSession + mockSupabase (기존 spec 패턴 동일)
 */

import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from '../helpers';

// ─── 공통 유저 픽스처 ────────────────────────────────────────────────────────

const adminUser = {
  ...fakeUser,
  id: 'phase0-regression-admin',
  employee_no: 'P0-ADMIN',
  name: 'Phase0 Admin',
  company: 'SY INC.',
  company_id: 'mso-company-id',
  role: 'admin',
  permissions: {
    ...(fakeUser.permissions ?? {}),
    mso: true,
    system_master: true,
    menu_관리자: true,
    admin_시스템마스터센터: true,
    menu_게시판: true,
    menu_인사관리: true,
    hr_근태: true,
    extra_근무현황: true,
  },
};

const regularUser = {
  ...fakeUser,
  id: 'phase0-regression-user',
  employee_no: 'P0-USER',
  name: 'Phase0 User',
  company: 'SY INC.',
  company_id: 'mso-company-id',
  role: 'manager',
  permissions: {
    ...(fakeUser.permissions ?? {}),
    menu_게시판: true,
    menu_인사관리: true,
    extra_근무현황: true,
  },
};

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/**
 * Supabase REST / Auth / Realtime 호출 여부를 판단한다.
 * url이 문자열임을 보장하기 위해 Request 타입을 활용한다.
 */
function isSupabaseApiCall(req: Request): boolean {
  const url = req.url();
  return (
    url.includes('/rest/v1/') ||
    url.includes('/auth/v1/') ||
    url.includes('/realtime/v1/')
  );
}

// ─── Describe ─────────────────────────────────────────────────────────────────

test.describe('API 호출 카운트 회귀 — Phase 0 핫스팟 5곳', () => {
  // 부하 절제: 병렬 실행 금지
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await dismissDialogs(page);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // #1 시스템마스터센터
  // ────────────────────────────────────────────────────────────────────────────
  test('#1 시스템마스터센터 — 초기 로드 API 호출 ≤ 15건', async ({ page }) => {
    await mockSupabase(page, { staffMembers: [adminUser], notifications: [] });
    await seedSession(page, { user: adminUser });

    // system-master API 엔드포인트는 내부 Next.js route — 별도 mock
    await page.route('**/api/admin/system-master**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: { staffCount: 1, auditCount: 0, payrollCount: 0, roomCount: 0, messageCount: 0 },
          recentAudits: [],
          recentPayrolls: [],
          sensitiveStaffs: [],
        }),
      });
    });

    let apiCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        apiCallCount++;
      }
    });

    await page.goto('/main?open_menu=관리자&open_subview=시스템마스터센터');
    await page.waitForLoadState('networkidle');

    expect(apiCallCount, `시스템마스터센터 초기 로드 호출 수: ${apiCallCount}`).toBeLessThanOrEqual(15);
  });

  test('#1 시스템마스터센터 — 1분 idle API 호출 ≤ 2건', async ({ page }) => {
    await mockSupabase(page, { staffMembers: [adminUser], notifications: [] });
    await seedSession(page, { user: adminUser });

    await page.route('**/api/admin/system-master**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: { staffCount: 1, auditCount: 0, payrollCount: 0, roomCount: 0, messageCount: 0 },
          recentAudits: [],
          recentPayrolls: [],
          sensitiveStaffs: [],
        }),
      });
    });

    await page.goto('/main?open_menu=관리자&open_subview=시스템마스터센터');
    await page.waitForLoadState('networkidle');

    // idle 기준선 리셋
    let idleCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        idleCallCount++;
      }
    });

    // 60초 idle 대기 — 주기적 폴링/구독 여부 검증
    await page.waitForTimeout(60_000);

    expect(idleCallCount, `시스템마스터센터 1분 idle 호출 수: ${idleCallCount}`).toBeLessThanOrEqual(2);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // #2 업무가이드
  // ────────────────────────────────────────────────────────────────────────────
  test('#2 업무가이드 — 초기 로드 API 호출 ≤ 15건', async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [regularUser],
      notifications: [],
      boardPosts: [],
    });
    await seedSession(page, { user: regularUser });

    let apiCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        apiCallCount++;
      }
    });

    await page.goto('/main?open_menu=게시판&open_subview=업무가이드');
    await page.waitForLoadState('networkidle');

    expect(apiCallCount, `업무가이드 초기 로드 호출 수: ${apiCallCount}`).toBeLessThanOrEqual(15);
  });

  test('#2 업무가이드 — 1분 idle API 호출 ≤ 1건', async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [regularUser],
      notifications: [],
      boardPosts: [],
    });
    await seedSession(page, { user: regularUser });

    await page.goto('/main?open_menu=게시판&open_subview=업무가이드');
    await page.waitForLoadState('networkidle');

    let idleCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        idleCallCount++;
      }
    });

    await page.waitForTimeout(60_000);

    expect(idleCallCount, `업무가이드 1분 idle 호출 수: ${idleCallCount}`).toBeLessThanOrEqual(1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // #3 GlobalNotificationBell (layout 컴포넌트)
  // ────────────────────────────────────────────────────────────────────────────
  test('#3 GlobalNotificationBell — 1분 idle API 호출 ≤ 1건', async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [regularUser],
      notifications: [],
    });
    await seedSession(page, { user: regularUser });

    // /main 진입 시 layout 컴포넌트(NotificationBell)가 자동 마운트
    await page.goto('/main');
    await page.waitForLoadState('networkidle');

    let idleCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        idleCallCount++;
      }
    });

    await page.waitForTimeout(60_000);

    // NotificationBell은 layout 전체 기준 — 알림 폴링 포함
    expect(idleCallCount, `GlobalNotificationBell 1분 idle 호출 수: ${idleCallCount}`).toBeLessThanOrEqual(1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // #4 근무현황 (추가기능 서브뷰)
  // ────────────────────────────────────────────────────────────────────────────
  test('#4 근무현황 — 초기 로드 API 호출 ≤ 15건', async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [regularUser],
      notifications: [],
      workSchedules: [],
      workShifts: [],
      attendances: [],
    });
    await seedSession(page, { user: regularUser });

    let apiCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        apiCallCount++;
      }
    });

    await page.goto('/main?open_menu=추가기능&open_subview=근무현황');
    await page.waitForLoadState('networkidle');

    expect(apiCallCount, `근무현황 초기 로드 호출 수: ${apiCallCount}`).toBeLessThanOrEqual(15);
  });

  test('#4 근무현황 — 1분 idle API 호출 ≤ 1건', async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [regularUser],
      notifications: [],
      workSchedules: [],
      workShifts: [],
      attendances: [],
    });
    await seedSession(page, { user: regularUser });

    await page.goto('/main?open_menu=추가기능&open_subview=근무현황');
    await page.waitForLoadState('networkidle');

    let idleCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        idleCallCount++;
      }
    });

    await page.waitForTimeout(60_000);

    expect(idleCallCount, `근무현황 1분 idle 호출 수: ${idleCallCount}`).toBeLessThanOrEqual(1);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // #5 출퇴근기록 (마이페이지 commute 탭)
  // ────────────────────────────────────────────────────────────────────────────
  test('#5 출퇴근기록 — 초기 로드 API 호출 ≤ 10건', async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [regularUser],
      notifications: [],
      attendanceRecords: [],
    });
    await seedSession(page, { user: regularUser });

    let apiCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        apiCallCount++;
      }
    });

    // open_mypage_tab=commute 으로 출퇴근기록 탭 직접 진입
    await page.goto('/main?open_menu=내정보&open_mypage_tab=commute');
    await page.waitForLoadState('networkidle');

    expect(apiCallCount, `출퇴근기록 초기 로드 호출 수: ${apiCallCount}`).toBeLessThanOrEqual(10);
  });

  test('#5 출퇴근기록 — 1분 idle API 호출 ≤ 1건', async ({ page }) => {
    await mockSupabase(page, {
      staffMembers: [regularUser],
      notifications: [],
      attendanceRecords: [],
    });
    await seedSession(page, { user: regularUser });

    await page.goto('/main?open_menu=내정보&open_mypage_tab=commute');
    await page.waitForLoadState('networkidle');

    let idleCallCount = 0;
    page.on('request', (req: Request) => {
      if (isSupabaseApiCall(req)) {
        idleCallCount++;
      }
    });

    await page.waitForTimeout(60_000);

    expect(idleCallCount, `출퇴근기록 1분 idle 호출 수: ${idleCallCount}`).toBeLessThanOrEqual(1);
  });
});

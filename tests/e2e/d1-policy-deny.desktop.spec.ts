import { test, expect } from '@playwright/test';

/**
 * D1 API Default Deny 회귀 테스트.
 *
 * 이 스위트는 원래 tests/security.spec.ts 와 tests/security/d1-policies.spec.ts
 * 두 파일에 나뉘어 있었는데, 둘 다 playwright.config.ts 의 testDir(./tests/e2e, ./tests/a11y)
 * 밖이라 **어떤 프로젝트에도 매칭되지 않아 한 번도 실행된 적이 없었다.**
 * 내용도 한쪽이 다른 쪽의 상위집합이었으므로 여기 하나로 합쳤다.
 *
 * 검증 대상: 세션 없이 호출했을 때 서버가 거부하는가.
 * (로그인한 사용자의 권한 경계 우회는 security-authorization.desktop.spec.ts 담당)
 */
test.describe('D1 API Security & Policy Enforcement', () => {
  test('비인증 사용자 /api/d1/mutate 호출 시 401/403 거부', async ({ request }) => {
    const res = await request.post('/api/d1/mutate', {
      data: {
        table: 'leave_requests',
        action: 'insert',
        data: { staff_id: 'test', status: '승인', days: 10 },
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('비인증 사용자 /api/d1/mutate approvals.update 시도 시 401/403 거부', async ({ request }) => {
    const res = await request.post('/api/d1/mutate', {
      data: {
        table: 'approvals',
        action: 'update',
        id: 'test-approval-id',
        data: { status: '승인', current_approver_id: 'attacker-id' },
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('비인증 사용자 /api/d1/query payroll_records 요청 시 401/403 거부', async ({ request }) => {
    const res = await request.post('/api/d1/query', {
      data: {
        table: 'payroll_records',
        action: 'select',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('비인증 사용자 공지방 quick-reply 메시지 발송 시 401/403 거부', async ({ request }) => {
    const res = await request.post('/api/chat/quick-reply', {
      data: {
        room_id: '00000000-0000-0000-0000-000000000000',
        content: '무단 공지 테스트 메시지',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('비인증 사용자 notice-broadcast 전사 푸시 요청 시 401/403 거부', async ({ request }) => {
    const res = await request.post('/api/board/notice-broadcast', {
      data: {
        post_id: 'test-post-id',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('비인증 사용자 /api/chat-rooms fixed-id 공지방 upsert 시 401/403 거부', async ({ request }) => {
    const res = await request.post('/api/chat-rooms', {
      data: {
        id: '00000000-0000-0000-0000-000000000000',
        name: '해킹된 공지방',
        type: 'notice',
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});

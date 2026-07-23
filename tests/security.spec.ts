import { test, expect } from '@playwright/test';

/**
 * 보안 및 D1 정책 Default Deny / 403 권한 회귀 테스트 스위트
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

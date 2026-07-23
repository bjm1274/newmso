import { expect, test } from '@playwright/test';

test.describe('security authorization regression', () => {
  test('rejects unauthenticated generic D1 mutations', async ({ request }) => {
    const response = await request.post('/api/d1/mutate', {
      data: {
        table: 'leave_requests',
        action: 'insert',
        data: { staff_id: 'attacker', status: 'approved', days: 999 },
      },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('rejects unauthenticated approval state changes', async ({ request }) => {
    const response = await request.post('/api/d1/mutate', {
      data: {
        table: 'approvals',
        action: 'update',
        id: 'approval-id',
        data: { status: 'approved', current_approver_id: 'attacker' },
      },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('rejects unauthenticated notice room creation and posting', async ({ request }) => {
    const [roomResponse, messageResponse] = await Promise.all([
      request.post('/api/chat-rooms', {
        data: {
          id: '00000000-0000-0000-0000-000000000000',
          name: 'forbidden notice',
          type: 'notice',
        },
      }),
      request.post('/api/chat/quick-reply', {
        data: {
          room_id: '00000000-0000-0000-0000-000000000000',
          content: 'forbidden notice message',
        },
      }),
    ]);
    expect([401, 403]).toContain(roomResponse.status());
    expect([401, 403]).toContain(messageResponse.status());
  });
});

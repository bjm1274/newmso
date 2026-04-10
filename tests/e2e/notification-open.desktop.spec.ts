import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('notification center all notifications opens notifications view directly', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [fakeUser],
    notifications: [
      {
        id: 'notification-open-1',
        user_id: fakeUser.id,
        type: 'attendance',
        title: '출퇴근 알림',
        body: '알림 메뉴 이동 확인',
        read_at: null,
        created_at: '2026-03-21T09:00:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: fakeUser,
  });

  await page.goto('/main');
  const desktopSidebar = page.getByTestId('desktop-sidebar');
  const notificationBell = desktopSidebar.getByTestId('notification-bell');
  await expect(notificationBell).toBeVisible();

  await notificationBell.click();
  await expect(page.getByTestId('notification-dropdown')).toBeVisible();

  await page.getByRole('button', { name: '전체 알림 보기' }).click();
  await page.goto(`/main?${new URLSearchParams({ open_menu: '알림' }).toString()}`);
  await expect(page.getByTestId('notifications-view')).toBeVisible();
  await expect(page.getByText('출퇴근 알림')).toBeVisible();
});

test('approval notifications in the inbox open the linked approval detail', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [fakeUser],
    approvals: [
      {
        id: 'approval-from-notification-1',
        type: '일반기안',
        title: '알림에서 연 결재 문서',
        content: '알림에서 바로 상세 문서를 열 수 있어야 합니다.',
        sender_id: 'approval-sender-1',
        sender_name: '기안자',
        sender_company: fakeUser.company,
        company_id: fakeUser.company_id,
        current_approver_id: fakeUser.id,
        approver_line: [fakeUser.id],
        status: '대기',
        created_at: '2026-03-21T09:10:00.000Z',
        meta_data: {},
      },
    ],
    notifications: [
      {
        id: 'notification-approval-open-1',
        user_id: fakeUser.id,
        type: 'approval',
        title: '결재 차례가 되었습니다.',
        body: '해당 문서를 바로 열어주세요.',
        read_at: null,
        created_at: '2026-03-21T09:20:00.000Z',
        metadata: {
          approval_id: 'approval-from-notification-1',
          approval_view: '결재함',
        },
      },
    ],
  });

  await seedSession(page, {
    user: fakeUser,
  });

  await page.goto('/main?open_menu=알림');
  await expect(page.getByTestId('notifications-view')).toBeVisible();

  await page.getByText('결재 차례가 되었습니다.').click();

  await expect(page.getByTestId('approval-view')).toBeVisible();
  const approvalDetailModal = page.getByTestId('approval-detail-modal');
  await expect(approvalDetailModal).toBeVisible();
  await expect(approvalDetailModal.getByRole('heading', { name: '알림에서 연 결재 문서' })).toBeVisible();
});

test('chat notifications in the inbox open the exact linked message', async ({ page }) => {
  const peerId = 'chat-notification-peer-1';
  const olderMessages = Array.from({ length: 18 }, (_, index) => ({
    id: `msg-chat-notification-${index + 1}`,
    room_id: 'room-chat-notification-1',
    sender_id: index % 2 === 0 ? peerId : fakeUser.id,
    content: `Chat notification message ${index + 1}`,
    created_at: `2026-03-21T09:${String(index).padStart(2, '0')}:00.000Z`,
    is_deleted: false,
    staff: {
      name: index % 2 === 0 ? 'Chat Notification Peer' : fakeUser.name,
      photo_url: null,
    },
  }));

  await mockSupabase(page, {
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: peerId,
        name: 'Chat Notification Peer',
        employee_no: 'E2E-CHAT-NOTI-001',
      },
    ],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Notice',
        type: 'notice',
        members: [],
        created_at: '2026-03-21T08:00:00.000Z',
        last_message_at: '2026-03-21T08:00:00.000Z',
      },
      {
        id: 'room-chat-notification-1',
        name: 'Chat Notification Room',
        type: 'group',
        members: [fakeUser.id, peerId],
        created_at: '2026-03-21T09:00:00.000Z',
        last_message_at: '2026-03-21T09:17:00.000Z',
        last_message_preview: 'Chat notification message 18',
      },
    ],
    messages: olderMessages,
    notifications: [
      {
        id: 'notification-chat-open-1',
        user_id: fakeUser.id,
        type: 'message',
        title: 'Chat exact message alert',
        body: 'Open the linked chat message directly.',
        read_at: null,
        created_at: '2026-03-21T09:30:00.000Z',
        metadata: {
          room_id: 'room-chat-notification-1',
          message_id: 'msg-chat-notification-4',
          type: 'message',
        },
      },
    ],
  });

  await seedSession(page, {
    user: fakeUser,
  });

  await page.goto('/main?open_menu=?뚮┝');
  await page.goto(`/main?${new URLSearchParams({ open_menu: '알림' }).toString()}`);
  await expect(page.getByTestId('notifications-view')).toBeVisible();

  await page.getByText('Chat exact message alert').click();

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-message-msg-chat-notification-4')).toBeVisible();
  await expect(page.getByText('Chat notification message 4')).toBeVisible();
});

test('approving an item clears legacy approval notifications that only store metadata.id', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [fakeUser],
    approvals: [
      {
        id: 'approval-notification-read-1',
        type: '일반기안',
        title: '결재 후 알림 읽음 처리',
        content: 'metadata.id만 있는 예전 알림도 읽음 처리되어야 합니다.',
        sender_id: 'approval-sender-legacy-1',
        sender_name: 'Legacy Sender',
        sender_company: fakeUser.company,
        company_id: fakeUser.company_id,
        current_approver_id: fakeUser.id,
        approver_line: [fakeUser.id],
        status: '대기',
        created_at: '2026-04-21T10:00:00.000Z',
        meta_data: {},
      },
    ],
    notifications: [
      {
        id: 'notification-approval-legacy-1',
        user_id: fakeUser.id,
        type: 'approval',
        title: '결재 차례가 되었습니다.',
        body: 'metadata.id만 있는 기존 알림 읽음 처리 테스트',
        read_at: null,
        created_at: '2026-04-21T10:05:00.000Z',
        metadata: {
          id: 'approval-notification-read-1',
          type: 'approval',
          approval_view: '결재함',
        },
      },
    ],
  });

  await seedSession(page, {
    user: fakeUser,
    localStorage: {
      erp_last_menu: '전자결재',
      erp_last_subview: '결재함',
    },
  });

  await page.goto('/main?open_menu=전자결재');
  await expect(page.getByTestId('approval-view')).toBeVisible();
  await page.getByRole('button', { name: '결재함' }).click();

  const approvalCard = page.getByTestId('approval-card-approval-notification-read-1');
  await expect(approvalCard).toBeVisible();

  await approvalCard.locator('button').nth(1).click();
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.locator('button').last().click();

  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const response = await fetch('/rest/v1/notifications?id=eq.notification-approval-legacy-1&select=*');
        const rows = await response.json();
        return Boolean(rows?.[0]?.read_at);
      });
    })
    .toBe(true);
});

test('notification inbox supports search and bulk delete', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [fakeUser],
    notifications: [
      {
        id: 'notification-inbox-filter-1',
        user_id: fakeUser.id,
        type: 'notification',
        title: 'Alpha alert',
        body: 'First inbox row',
        read_at: '2026-04-01T09:00:00.000Z',
        created_at: '2026-04-01T09:00:00.000Z',
      },
      {
        id: 'notification-inbox-filter-2',
        user_id: fakeUser.id,
        type: 'notification',
        title: 'Beta alert',
        body: 'Second inbox row',
        read_at: '2026-04-01T09:05:00.000Z',
        created_at: '2026-04-01T09:05:00.000Z',
      },
      {
        id: 'notification-inbox-filter-3',
        user_id: fakeUser.id,
        type: 'approval',
        title: 'Gamma approval',
        body: 'Third inbox row',
        read_at: '2026-04-01T09:10:00.000Z',
        created_at: '2026-04-01T09:10:00.000Z',
      },
    ],
  });

  await seedSession(page, {
    user: fakeUser,
  });

  await page.goto(`/main?${new URLSearchParams({ open_menu: '알림' }).toString()}`);
  await expect(page.getByTestId('notifications-view')).toBeVisible();

  await page.getByTestId('notification-search-input').fill('Beta');
  await expect(page.getByTestId('notification-inbox-item-notification-inbox-filter-2')).toBeVisible();
  await expect(page.getByTestId('notification-inbox-item-notification-inbox-filter-1')).toHaveCount(0);

  await page.getByTestId('notification-search-input').fill('');
  await page.getByTestId('notification-selection-toggle').click();
  await page.getByTestId('notification-inbox-item-notification-inbox-filter-1').click();
  await page.getByTestId('notification-inbox-item-notification-inbox-filter-2').click();
  await page.getByRole('button', { name: '선택 삭제' }).click();

  await expect(page.getByTestId('notification-inbox-item-notification-inbox-filter-1')).toHaveCount(0);
  await expect(page.getByTestId('notification-inbox-item-notification-inbox-filter-2')).toHaveCount(0);
  await expect(page.getByTestId('notification-inbox-item-notification-inbox-filter-3')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const systemMasterUser = {
  ...fakeUser,
  id: '9999',
  employee_no: 'MASTER-9999',
  name: 'System Master',
  company: 'SY INC.',
  role: 'admin',
  permissions: {
    ...(fakeUser.permissions || {}),
    mso: true,
    system_master: true,
    menu_관리자: true,
    admin_시스템마스터센터: true,
  },
};

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('system master chat center filters empty rooms and deletes the selected empty room', async ({ page }) => {
  await mockSupabase(page, {
    staffMembers: [systemMasterUser],
    notifications: [],
  });
  let emptyRoomDeleted = false;

  await page.route('**/api/admin/system-master?*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const scope = url.searchParams.get('scope') || 'overview';
    const roomId = url.searchParams.get('roomId');

    if (request.method() === 'DELETE' && scope === 'chats' && roomId === 'room-empty') {
      emptyRoomDeleted = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          deletedRoomId: 'room-empty',
          deletedMessageCount: 0,
          deletedPollCount: 0,
        }),
      });
    }

    if (scope === 'overview') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            staffCount: 1,
            auditCount: 0,
            payrollCount: 0,
            roomCount: 2,
            messageCount: 1,
          },
          recentAudits: [],
          recentPayrolls: [],
          sensitiveStaffs: [],
        }),
      });
    }

    if (scope === 'chats') {
      const rooms = [
        {
          id: 'room-active',
          room_label: '활성 채팅방',
          member_labels: ['System Master', 'Chat Peer'],
          last_message_at: '2026-04-13T10:00:00.000Z',
          last_activity_at: '2026-04-13T10:00:00.000Z',
          has_message_history: true,
        },
        ...(!emptyRoomDeleted
          ? [{
              id: 'room-empty',
              room_label: '빈 채팅방',
              member_labels: ['System Master'],
              last_message_at: null,
              last_activity_at: '2026-04-13T09:00:00.000Z',
              has_message_history: false,
            }]
          : []),
      ];

      const messages = roomId === 'room-empty'
        ? []
        : [
            {
              id: 'msg-active-1',
              room_id: 'room-active',
              room_label: '활성 채팅방',
              sender_name: 'Chat Peer',
              sender_company: 'SY INC.',
              content: '최근 대화가 있는 메시지입니다.',
              file_url: null,
              created_at: '2026-04-13T10:00:00.000Z',
              edited_at: null,
              is_deleted: false,
            },
          ];

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rooms, messages }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await seedSession(page, {
    user: systemMasterUser,
  });

  await page.goto('/main?open_menu=관리자&open_subview=시스템마스터센터');
  await expect(page.getByTestId('system-master-center')).toBeVisible();
  await page.evaluate(() => {
    window.confirm = () => true;
  });

  await page.getByRole('button', { name: '전체채팅' }).click();
  await expect(page.getByRole('heading', { name: '채팅방 목록' })).toBeVisible();

  await page.getByTestId('system-master-empty-room-filter').click();
  await expect(page.getByTestId('system-master-chat-room-room-empty')).toBeVisible();
  await expect(page.getByTestId('system-master-chat-room-room-active')).toHaveCount(0);

  await page.getByTestId('system-master-chat-room-room-empty').click();
  await expect(page.getByTestId('system-master-chat-room-delete')).toHaveText('대화 없는 방 삭제');
  await expect(page.getByText('조회된 메시지가 없습니다.')).toBeVisible();

  await page.getByTestId('system-master-chat-room-delete').click();

  await expect(page.getByTestId('system-master-chat-room-room-empty')).toHaveCount(0);
  await expect(page.getByText('대화내역이 없는 채팅방이 없습니다.')).toBeVisible();
});

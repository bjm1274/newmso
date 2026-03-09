import type { Page, Route } from '@playwright/test';
import { SUPABASE_ACCESS_TOKEN_STORAGE_KEY } from '../../lib/supabase-bridge';
import { createSupabaseAccessToken } from '../../lib/server-supabase-bridge';
import {
  createSessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../../lib/server-session';

const defaultYearMonth = new Date().toISOString().slice(0, 7);
const noticeRoomId = '00000000-0000-0000-0000-000000000000';

export const fakeUser = {
  id: '11111111-1111-1111-1111-111111111111',
  employee_no: 'E2E-001',
  name: 'E2E Tester',
  company: 'E2E Clinic',
  company_id: '22222222-2222-2222-2222-222222222222',
  department: '간호부',
  position: '부서장',
  role: 'manager',
  permissions: {
    hr: true,
    inventory: true,
    approval: true,
    admin: false,
    mso: false,
  },
};

export type MockFixtures = {
  staffMembers?: any[];
  notifications?: any[];
  chatRooms?: any[];
  messages?: any[];
  messageInsertFailures?: number;
  approvals?: any[];
  payrollRecords?: any[];
  boardPosts?: any[];
  companies?: any[];
  workShifts?: any[];
  orgTeams?: any[];
  approvalFormTypes?: any[];
  systemConfigs?: any[];
};

type SeedOptions = {
  user?: Record<string, unknown>;
  localStorage?: Record<string, string>;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

function buildFixtures(overrides: MockFixtures = {}) {
  return {
    staffMembers: overrides.staffMembers ?? [fakeUser],
    notifications: overrides.notifications ?? [],
    chatRooms:
      overrides.chatRooms ??
      [
        {
          id: noticeRoomId,
          name: '공지메시지',
          type: 'notice',
          members: [fakeUser.id],
          created_at: '2026-03-08T00:00:00.000Z',
          last_message_at: '2026-03-08T00:00:00.000Z',
        },
      ],
    messages: overrides.messages ?? [],
    messageInsertFailures: overrides.messageInsertFailures ?? 0,
    approvals:
      overrides.approvals ??
      [
        {
          id: '33333333-3333-3333-3333-333333333333',
          type: '일반기안',
          title: 'E2E 결재 문서',
          content: '테스트용 결재 문서입니다.',
          sender_id: fakeUser.id,
          sender_name: fakeUser.name,
          sender_company: fakeUser.company,
          company_id: fakeUser.company_id,
          current_approver_id: fakeUser.id,
          approver_line: [fakeUser.id],
          status: '대기',
          created_at: '2026-03-08T09:00:00.000Z',
          meta_data: {},
        },
      ],
    payrollRecords:
      overrides.payrollRecords ??
      [
        {
          id: '44444444-4444-4444-4444-444444444444',
          staff_id: fakeUser.id,
          year_month: defaultYearMonth,
          record_type: 'regular',
          net_pay: 2800000,
          gross_pay: 3200000,
          created_at: '2026-03-08T09:00:00.000Z',
        },
      ],
    boardPosts: overrides.boardPosts ?? [],
    companies:
      overrides.companies ?? [
        {
          id: fakeUser.company_id,
          name: fakeUser.company,
          type: 'hospital',
          is_active: true,
        },
      ],
    workShifts: overrides.workShifts ?? [],
    orgTeams: overrides.orgTeams ?? [],
    approvalFormTypes: overrides.approvalFormTypes ?? [],
    systemConfigs:
      overrides.systemConfigs ?? [
        {
          key: 'min_auth_time',
          value: '1970-01-01T00:00:00.000Z',
        },
      ],
  };
}

function firstOrList(rows: any[], wantsObject: boolean) {
  return wantsObject ? rows[0] ?? null : rows;
}

function markNotificationsRead(rows: any[], id?: string | null) {
  const now = new Date().toISOString();
  return rows.map((row) => {
    if (!id || row.id === id) {
      return {
        ...row,
        read_at: row.read_at ?? now,
      };
    }
    return row;
  });
}

export async function seedSession(page: Page, options: SeedOptions = {}) {
  const user = {
    ...fakeUser,
    ...(options.user || {}),
  };
  const extraStorage: Record<string, string> = {
    erp_permission_prompt_shown: '1',
    ...(options.localStorage || {}),
  };
  const token = await createSessionToken(user);
  const supabaseAccessToken = await createSupabaseAccessToken(user as any);
  const cookieOptions = getSessionCookieOptions();

  if (supabaseAccessToken) {
    extraStorage[SUPABASE_ACCESS_TOKEN_STORAGE_KEY] = supabaseAccessToken;
  }

  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      url: 'http://127.0.0.1:3000',
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + (cookieOptions.maxAge || 0),
    },
  ]);

  await page.addInitScript(
    ({ seededUser, seededStorage }) => {
      window.localStorage.setItem('erp_user', JSON.stringify(seededUser));
      window.localStorage.setItem('erp_login_at', new Date().toISOString());
      Object.entries(seededStorage).forEach(([key, value]) => {
        window.localStorage.setItem(key, value);
      });
    },
    { seededUser: user, seededStorage: extraStorage }
  );
}

export async function buildSessionCookieHeader(user: Record<string, unknown>) {
  const token = await createSessionToken(user);
  const cookieOptions = getSessionCookieOptions();
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Path=${cookieOptions.path}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (cookieOptions.maxAge) {
    parts.push(`Max-Age=${cookieOptions.maxAge}`);
  }
  if (cookieOptions.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export async function dismissDialogs(page: Page) {
  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });
}

export async function mockSupabase(page: Page, overrides: MockFixtures = {}) {
  const fixtures = buildFixtures(overrides);
  let notifications = [...fixtures.notifications];
  const approvals = [...fixtures.approvals];
  let messages = [...fixtures.messages];
  let chatRooms = [...fixtures.chatRooms];
  let workShifts = [...fixtures.workShifts];
  let messageInsertFailures = fixtures.messageInsertFailures;

  const updateChatRoomMeta = (roomId?: string, content?: string | null, createdAt?: string) => {
    if (!roomId) return;
    chatRooms = chatRooms.map((room: any) =>
      room.id === roomId
        ? {
            ...room,
            last_message_at: createdAt || new Date().toISOString(),
            last_message_preview: (content || '📎 파일').slice(0, 80),
          }
        : room
    );
  };

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const accept = request.headers().accept || '';
    const wantsObject = accept.includes('application/vnd.pgrst.object+json');

    if (method === 'HEAD' && path.includes('/notifications')) {
      const unreadCount = notifications.filter((item) => !item.read_at).length;
      return route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-0/${unreadCount}`,
        },
      });
    }

    if (path.includes('/staff_members')) {
      if (method === 'GET') {
        return json(route, firstOrList(fixtures.staffMembers, wantsObject));
      }
      return json(route, []);
    }

    if (path.includes('/board_posts')) {
      return json(route, fixtures.boardPosts);
    }

    if (path.includes('/notifications')) {
      if (method === 'GET') {
        return json(route, notifications);
      }

      if (method === 'PATCH') {
        const targetId = url.searchParams.get('id')?.replace('eq.', '') || null;
        notifications = markNotificationsRead(notifications, targetId);
        return json(route, notifications);
      }

      if (method === 'POST') {
        return json(route, notifications);
      }

      return json(route, notifications);
    }

    if (path.includes('/system_configs')) {
      return json(route, firstOrList(fixtures.systemConfigs, wantsObject));
    }

    if (path.includes('/companies')) {
      return json(route, fixtures.companies);
    }

    if (path.includes('/org_teams')) {
      return json(route, fixtures.orgTeams);
    }

    if (path.includes('/approval_form_types')) {
      return json(route, fixtures.approvalFormTypes);
    }

    if (path.includes('/chat_rooms')) {
      if (method === 'GET') {
        return json(route, chatRooms);
      }
      return json(route, chatRooms);
    }

    if (path.includes('/messages')) {
      if (method === 'GET') {
        return json(route, messages);
      }
      if (method === 'POST') {
        if (messageInsertFailures > 0) {
          messageInsertFailures -= 1;
          return json(route, { message: 'insert failed' }, 500);
        }
        const body = request.postDataJSON();
        const payload = Array.isArray(body) ? body[0] : body;
        const inserted = {
          id: `msg-${messages.length + 1}`,
          created_at: new Date().toISOString(),
          is_deleted: false,
          ...payload,
          staff: {
            name: fixtures.staffMembers[0]?.name || 'E2E Tester',
            photo_url: null,
          },
        };
        messages = [...messages, inserted];
        updateChatRoomMeta(inserted.room_id, inserted.content, inserted.created_at);
        return json(route, firstOrList([inserted], wantsObject));
      }
      return json(route, messages);
    }

    if (path.includes('/approvals')) {
      if (method === 'GET') {
        return json(route, approvals);
      }
      if (method === 'PATCH') {
        return json(route, approvals);
      }
      return json(route, approvals);
    }

    if (path.includes('/work_shifts')) {
      if (method === 'GET') {
        return json(route, workShifts);
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `shift-${workShifts.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          is_active: payload.is_active ?? true,
          ...payload,
        }));
        workShifts = [...workShifts, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const targetId = url.searchParams.get('id')?.replace('eq.', '') || null;
        const body = request.postDataJSON();
        workShifts = workShifts.map((shift: any) =>
          !targetId || shift.id === targetId ? { ...shift, ...body } : shift
        );
        const updated = targetId ? workShifts.find((shift: any) => shift.id === targetId) ?? null : workShifts;
        return json(route, wantsObject ? updated : Array.isArray(updated) ? updated : [updated]);
      }

      if (method === 'DELETE') {
        const targetId = url.searchParams.get('id')?.replace('eq.', '') || null;
        workShifts = workShifts.filter((shift: any) => shift.id !== targetId);
        return json(route, []);
      }

      return json(route, workShifts);
    }

    if (path.includes('/payroll_records')) {
      return json(route, fixtures.payrollRecords);
    }

    if (
      path.includes('/push_subscriptions') ||
      path.includes('/inventory') ||
      path.includes('/education_records') ||
      path.includes('/message_reads') ||
      path.includes('/room_read_cursors') ||
      path.includes('/pinned_messages') ||
      path.includes('/message_reactions') ||
      path.includes('/polls') ||
      path.includes('/poll_votes') ||
      path.includes('/room_notification_settings') ||
      path.includes('/messenger_drive_links') ||
      path.includes('/leave_requests')
    ) {
      return json(route, []);
    }

    return json(route, []);
  });
}

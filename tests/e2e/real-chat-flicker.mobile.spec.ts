import { expect, test } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { dismissDialogs, seedSession } from './helpers';

test.skip(true, 'Skip flaky real chat flicker tests');

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const adminClient =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

function makeMessages(roomId: string, senderIds: string[], label: string, count: number) {
  const start = Date.UTC(2026, 3, 16, 9, 0, 0);
  return Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    room_id: roomId,
    sender_id: senderIds[index % senderIds.length],
    sender_name: index % senderIds.length === 0 ? 'Live Flicker User' : 'Live Flicker Peer',
    content:
      index >= count - 3
        ? `${label} live tail ${index + 1} ${'tail '.repeat(18)}`
        : index % 37 === 0
          ? `${label} tall live message ${index + 1} ${'long line '.repeat(24)}`
          : `${label} live message ${index + 1}`,
    created_at: new Date(start + index * 60_000).toISOString(),
    is_deleted: false,
  }));
}

test.describe('@real-db live chat room switching', () => {
  test.beforeEach(async ({ page }) => {
    await dismissDialogs(page);
  });

  test('mobile room entry does not refetch the same live room after summary sync', async ({ page }) => {
    test.skip(!adminClient, 'Supabase service role env is required for live chat setup');

    const suffix = Date.now().toString(36);
    const userId = crypto.randomUUID();
    const peerId = crypto.randomUUID();
    const roomAId = crypto.randomUUID();
    const roomBId = crypto.randomUUID();
    const { data: company } = await adminClient!
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    test.skip(!company, 'An active company row is required for live chat setup');
    if (!company) return;

    const roomAMessages = makeMessages(roomAId, [userId, peerId], 'room A', 420);
    const roomBMessages = makeMessages(roomBId, [peerId, userId], 'room B', 420);
    const tailAId = roomAMessages[roomAMessages.length - 1].id;
    const tailBId = roomBMessages[roomBMessages.length - 1].id;

    try {
      await adminClient!.from('staff_members').insert([
        {
          id: userId,
          employee_no: `LIVE-${suffix}-U`,
          name: 'Live Flicker User',
          company: company.name,
          company_id: company.id,
          department: 'E2E',
          position: 'Tester',
          role: 'staff',
          status: '\uC7AC\uC9C1',
        },
        {
          id: peerId,
          employee_no: `LIVE-${suffix}-P`,
          name: 'Live Flicker Peer',
          company: company.name,
          company_id: company.id,
          department: 'E2E',
          position: 'Tester',
          role: 'staff',
          status: '\uC7AC\uC9C1',
        },
      ]);

      await adminClient!.from('chat_rooms').insert([
        {
          id: roomAId,
          name: `Live Flicker A ${suffix}`,
          type: 'group',
          members: [userId, peerId],
          created_by: userId,
          created_at: '2026-04-16T09:00:00.000Z',
          last_message_at: roomAMessages[roomAMessages.length - 1].created_at,
          last_message_preview: 'stale preview A',
        },
        {
          id: roomBId,
          name: `Live Flicker B ${suffix}`,
          type: 'group',
          members: [userId, peerId],
          created_by: userId,
          created_at: '2026-04-16T10:00:00.000Z',
          last_message_at: roomBMessages[roomBMessages.length - 1].created_at,
          last_message_preview: 'stale preview B',
        },
      ]);

      for (const chunk of [roomAMessages.slice(0, 210), roomAMessages.slice(210), roomBMessages.slice(0, 210), roomBMessages.slice(210)]) {
        const { error } = await adminClient!.from('messages').insert(chunk);
        expect(error).toBeNull();
      }

      await seedSession(page, {
        user: {
          id: userId,
          employee_no: `LIVE-${suffix}-U`,
          name: 'Live Flicker User',
          company: company.name,
          company_id: company.id,
          department: 'E2E',
          position: 'Tester',
          role: 'staff',
          permissions: {
            menu_\uCC44\uD305: true,
          },
        },
        localStorage: {
          erp_last_menu: '\uCC44\uD305',
        },
      });

      await page.goto(`/main?${new URLSearchParams({ open_menu: '\uCC44\uD305' }).toString()}`);
      await expect(page.getByTestId('chat-view')).toBeVisible({ timeout: 30_000 });

      const backToRoomListButton = page.getByRole('button', { name: '\uB4A4\uB85C' });
      if (await backToRoomListButton.isVisible().catch(() => false)) {
        await backToRoomListButton.click();
      }

      await expect(page.getByTestId(`chat-room-${roomAId}`)).toBeVisible({ timeout: 30_000 });
      await page.getByTestId(`chat-room-${roomAId}`).click();
      await expect(page.getByTestId(`chat-message-${tailAId}`)).toBeVisible({ timeout: 30_000 });

      await backToRoomListButton.click();
      await expect(page.getByTestId(`chat-room-${roomBId}`)).toBeVisible({ timeout: 30_000 });

      let roomBMessageFetches = 0;
      page.on('request', (request) => {
        const decodedUrl = decodeURIComponent(request.url());
        if (
          request.method() === 'GET' &&
          decodedUrl.includes('/rest/v1/messages') &&
          decodedUrl.includes(roomBId)
        ) {
          roomBMessageFetches += 1;
        }
      });

      await page.evaluate(() => {
        const globalWindow = window as typeof window & {
          __liveChatMutationCount?: number;
          __liveChatDisconnect?: () => void;
        };
        globalWindow.__liveChatMutationCount = 0;
        const list = document.querySelector('[data-testid="chat-message-list"]');
        if (!list) return;
        const observer = new MutationObserver((mutations) => {
          globalWindow.__liveChatMutationCount =
            (globalWindow.__liveChatMutationCount || 0) + mutations.length;
        });
        observer.observe(list, { childList: true, subtree: true });
        globalWindow.__liveChatDisconnect = () => observer.disconnect();
      });

      await page.getByTestId(`chat-room-${roomBId}`).click();
      await expect(page.getByTestId(`chat-message-${tailBId}`)).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(2500);

      const mutationCount = await page.evaluate(() => {
        const globalWindow = window as typeof window & {
          __liveChatMutationCount?: number;
          __liveChatDisconnect?: () => void;
        };
        globalWindow.__liveChatDisconnect?.();
        return globalWindow.__liveChatMutationCount || 0;
      });

      console.log(`live room B message fetches: ${roomBMessageFetches}; mutations: ${mutationCount}`);
      expect(roomBMessageFetches).toBe(1);
      await expect(page.getByTestId(`chat-message-${tailBId}`)).toBeVisible();
    } finally {
      await adminClient!.from('messages').delete().in('room_id', [roomAId, roomBId]);
      await adminClient!.from('room_read_cursors').delete().eq('user_id', userId);
      await adminClient!.from('chat_rooms').delete().contains('members', [userId]);
      await adminClient!.from('staff_members').delete().in('id', [userId, peerId]);
    }
  });
});

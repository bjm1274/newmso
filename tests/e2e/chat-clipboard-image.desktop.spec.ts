import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon') || text.includes('Failed to load resource') || text.includes('ERR_ABORTED')) {
      return;
    }
    errors.push(`console: ${text}`);
  });

  return errors;
}

const peerUser = {
  ...fakeUser,
  id: 'chat-clipboard-peer',
  employee_no: 'E2E-CHAT-CLIP-002',
  name: 'Clipboard Peer',
  department: '병동팀',
  position: '사원',
};

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

async function pasteClipboardImage(page: Page) {
  await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="chat-message-input"]');
    if (!(composer instanceof HTMLTextAreaElement)) {
      throw new Error('chat composer not found');
    }

    const clipboard = new DataTransfer();
    const blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    const file = new File([blob], '', { type: 'image/png' });
    clipboard.items.add(file);

    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      configurable: true,
      value: clipboard,
    });

    composer.dispatchEvent(event);
  });
}

async function dropAttachmentFile(page: Page) {
  await page.evaluate(() => {
    const dropzone = document.querySelector('[data-testid="chat-upload-dropzone"]');
    if (!(dropzone instanceof HTMLDivElement)) {
      throw new Error('chat upload dropzone not found');
    }

    const transfer = new DataTransfer();
    const blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    const file = new File([blob], 'drop-image.png', { type: 'image/png' });
    transfer.items.add(file);

    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      configurable: true,
      value: transfer,
    });

    dropzone.dispatchEvent(event);
  });
}

async function countSavedClipboardImages(page: Page) {
  const savedMessages = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/messages?room_id=eq.room-clipboard&select=*');
    return response.json();
  });
  return Array.isArray(savedMessages)
    ? savedMessages.filter((message) => {
        const fileUrl = String(message?.file_url || '');
        return (
          message?.file_kind === 'image' &&
          fileUrl.includes('/storage/v1/object/public/pchos-files/chat/') &&
          fileUrl.endsWith('.png')
        );
      }).length
    : 0;
}

async function getSavedClipboardImageMessages(page: Page) {
  const savedMessages = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/messages?room_id=eq.room-clipboard&select=*');
    return response.json();
  });

  return Array.isArray(savedMessages)
    ? savedMessages.filter((message) => {
        const fileUrl = String(message?.file_url || '');
        return (
          message?.file_kind === 'image' &&
          fileUrl.includes('/storage/v1/object/public/pchos-files/chat/') &&
          fileUrl.endsWith('.png')
        );
      })
    : [];
}

async function getSavedClipboardAttachmentMessages(page: Page) {
  const savedMessages = await page.evaluate(async () => {
    const response = await fetch('/rest/v1/messages?room_id=eq.room-clipboard&select=*');
    return response.json();
  });

  return Array.isArray(savedMessages)
    ? savedMessages.filter((message) => String(message?.file_url || '').includes('/storage/v1/object/public/'))
    : [];
}

test('chat composer asks for confirmation before sending a pasted clipboard image', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-clipboard',
        name: '클립보드 테스트방',
        type: 'group',
        members: [fakeUser.id, peerUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T09:00:00.000Z',
        created_by: fakeUser.id,
      },
    ],
    messages: [],
  });

  await page.route('**/storage/v1/object/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'mock-chat-upload' }),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-clipboard',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-room-room-clipboard')).toBeVisible();
  await page.getByTestId('chat-room-room-clipboard').click();
  await page.getByTestId('chat-message-input').click();

  await pasteClipboardImage(page);

  await expect(page.getByTestId('chat-pending-upload-panel')).toBeVisible();
  await expect.poll(async () => countSavedClipboardImages(page)).toBe(0);

  await page.getByTestId('chat-pending-upload-send-button').click();
  await expect(page.getByTestId('chat-pending-upload-panel')).toBeHidden();
  await expect.poll(async () => countSavedClipboardImages(page)).toBe(1);

  expect(runtimeErrors).toEqual([]);
});

test('chat composer can cancel a pasted clipboard image before upload', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-clipboard',
        name: '클립보드 테스트방',
        type: 'group',
        members: [fakeUser.id, peerUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T09:00:00.000Z',
        created_by: fakeUser.id,
      },
    ],
    messages: [],
  });

  await page.route('**/storage/v1/object/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'mock-chat-upload' }),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-clipboard',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await page.getByTestId('chat-room-room-clipboard').click();
  await page.getByTestId('chat-message-input').click();

  await pasteClipboardImage(page);

  await expect(page.getByTestId('chat-pending-upload-panel')).toBeVisible();
  await page.getByTestId('chat-pending-upload-cancel-button').click();
  await expect(page.getByTestId('chat-pending-upload-panel')).toBeHidden();
  await expect.poll(async () => countSavedClipboardImages(page)).toBe(0);

  expect(runtimeErrors).toEqual([]);
});

test('chat composer asks for confirmation before sending a dropped attachment', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-clipboard',
        name: '클립보드 테스트방',
        type: 'group',
        members: [fakeUser.id, peerUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T09:00:00.000Z',
        created_by: fakeUser.id,
      },
    ],
    messages: [],
  });

  await page.route('**/storage/v1/object/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'mock-chat-upload' }),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-clipboard',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await page.getByTestId('chat-room-room-clipboard').click();

  await dropAttachmentFile(page);

  await expect(page.getByTestId('chat-pending-upload-panel')).toBeVisible();
  await expect(page.getByTestId('chat-pending-upload-panel')).toContainText('drop-image.png');
  await expect.poll(async () => countSavedClipboardImages(page)).toBe(0);

  await page.getByTestId('chat-pending-upload-send-button').click();
  await expect(page.getByTestId('chat-pending-upload-panel')).toBeHidden();
  await expect.poll(async () => countSavedClipboardImages(page)).toBe(1);
  await expect(page.getByText('drop-image.png').last()).toBeVisible();
  await expect
    .poll(async () => {
      const messages = await getSavedClipboardImageMessages(page);
      return messages[0]?.file_name ?? null;
    })
    .toBe('drop-image.png');

  expect(runtimeErrors).toEqual([]);
});

test('chat file picker can queue and send both photo and document attachments', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [
      {
        id: '00000000-0000-0000-0000-000000000000',
        name: '공지메시지',
        type: 'notice',
        members: [fakeUser.id],
        created_at: '2026-03-08T00:00:00.000Z',
        last_message_at: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'room-clipboard',
        name: '파일선택 테스트방',
        type: 'group',
        members: [fakeUser.id, peerUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T09:00:00.000Z',
        created_by: fakeUser.id,
      },
    ],
    messages: [],
  });

  await page.route('**/storage/v1/object/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'mock-chat-upload' }),
    });
  });

  await seedSession(page, {
    localStorage: {
      erp_last_menu: '채팅',
      erp_chat_last_room: 'room-clipboard',
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('채팅')}`);

  await expect(page.getByTestId('chat-view')).toBeVisible();
  await page.getByTestId('chat-room-room-clipboard').click();

  await page.locator('input[type="file"]').first().setInputFiles([
    {
      name: 'iphone-photo.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from([0, 1, 2, 3]),
    },
    {
      name: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    },
  ]);

  await expect(page.getByTestId('chat-pending-upload-panel')).toBeVisible();
  await expect(page.getByTestId('chat-pending-upload-panel')).toContainText('iphone-photo.heic');
  await expect(page.getByTestId('chat-pending-upload-panel')).toContainText('report.pdf');

  await page.getByTestId('chat-pending-upload-send-button').click();
  await expect(page.getByTestId('chat-pending-upload-panel')).toBeHidden();

  await expect
    .poll(async () => {
      const messages = await getSavedClipboardAttachmentMessages(page);
      return messages.map((message) => message.file_name).sort();
    })
    .toEqual(['iphone-photo.heic', 'report.pdf']);

  expect(runtimeErrors).toEqual([]);
});

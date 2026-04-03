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

const CHAT_MENU = '\uCC44\uD305';
const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const CLIPBOARD_ROOM_ID = 'room-clipboard';
const ALBUM_PANEL_LABEL = '\uC0AC\uC9C4 3\uC7A5 \uBB36\uC5B4 \uBCF4\uB0B4\uAE30';

const peerUser = {
  ...fakeUser,
  id: 'chat-clipboard-peer',
  employee_no: 'E2E-CHAT-CLIP-002',
  name: 'Clipboard Peer',
  department: 'Ward',
  position: 'Staff',
};

function buildNoticeRoom() {
  return {
    id: NOTICE_ROOM_ID,
    name: '공지',
    type: 'notice',
    members: [fakeUser.id],
    created_at: '2026-03-08T00:00:00.000Z',
    last_message_at: '2026-03-08T00:00:00.000Z',
  };
}

function buildClipboardRoom() {
  return {
    id: CLIPBOARD_ROOM_ID,
    name: 'Clipboard Test Room',
    type: 'group',
    members: [fakeUser.id, peerUser.id],
    created_at: '2026-03-08T09:00:00.000Z',
    last_message_at: '2026-03-08T09:00:00.000Z',
    created_by: fakeUser.id,
  };
}

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

async function openClipboardChat(page: Page) {
  await seedSession(page, {
    localStorage: {
      erp_last_menu: CHAT_MENU,
      erp_chat_last_room: CLIPBOARD_ROOM_ID,
    },
  });

  await page.goto(`/main?open_menu=${encodeURIComponent(CHAT_MENU)}`);
  await expect(page.getByTestId('chat-view')).toBeVisible();
  await page.getByTestId(`chat-room-${CLIPBOARD_ROOM_ID}`).click();
}

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

async function getSavedClipboardMessages(page: Page) {
  const savedMessages = await page.evaluate(async (roomId) => {
    const response = await fetch(`/rest/v1/messages?room_id=eq.${roomId}&select=*`);
    return response.json();
  }, CLIPBOARD_ROOM_ID);

  return Array.isArray(savedMessages) ? savedMessages : [];
}

async function countSavedClipboardImages(page: Page) {
  const savedMessages = await getSavedClipboardMessages(page);
  return savedMessages.filter((message) => {
    const fileUrl = String(message?.file_url || '');
    return (
      message?.file_kind === 'image' &&
      fileUrl.includes('/storage/v1/object/public/pchos-files/chat/') &&
      fileUrl.endsWith('.png')
    );
  }).length;
}

async function getSavedClipboardImageMessages(page: Page) {
  const savedMessages = await getSavedClipboardMessages(page);
  return savedMessages.filter((message) => {
    const fileUrl = String(message?.file_url || '');
    return (
      message?.file_kind === 'image' &&
      fileUrl.includes('/storage/v1/object/public/pchos-files/chat/') &&
      fileUrl.endsWith('.png')
    );
  });
}

async function getSavedClipboardAttachmentMessages(page: Page) {
  const savedMessages = await getSavedClipboardMessages(page);
  return savedMessages.filter((message) => String(message?.file_url || '').includes('/storage/v1/object/public/'));
}

test('chat composer asks for confirmation before sending a pasted clipboard image', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [buildNoticeRoom(), buildClipboardRoom()],
    messages: [],
  });

  await openClipboardChat(page);
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
    chatRooms: [buildNoticeRoom(), buildClipboardRoom()],
    messages: [],
  });

  await openClipboardChat(page);
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
    chatRooms: [buildNoticeRoom(), buildClipboardRoom()],
    messages: [],
  });

  await openClipboardChat(page);

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
    chatRooms: [buildNoticeRoom(), buildClipboardRoom()],
    messages: [],
  });

  await openClipboardChat(page);

  await page.getByTestId('chat-file-input').setInputFiles([
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

test('chat album picker sends multiple photos as one bundle and preview can move left and right', async ({
  page,
}) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [buildNoticeRoom(), buildClipboardRoom()],
    messages: [],
  });

  await openClipboardChat(page);

  await page.getByTestId('chat-album-file-input').setInputFiles([
    {
      name: 'album-photo-1.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]),
    },
    {
      name: 'album-photo-2.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 2]),
    },
    {
      name: 'album-photo-3.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 3]),
    },
  ]);

  await expect(page.getByTestId('chat-pending-album-panel')).toBeVisible();
  await expect(page.getByTestId('chat-pending-album-panel')).toContainText(ALBUM_PANEL_LABEL);

  await page.getByTestId('chat-pending-album-send-button').click();
  await expect(page.getByTestId('chat-pending-album-panel')).toBeHidden();

  await expect
    .poll(async () => {
      const savedMessages = await getSavedClipboardMessages(page);
      return savedMessages.filter((message) => String(message?.album_id || '').trim()).length;
    })
    .toBe(3);

  const savedAlbumMessages = (await getSavedClipboardMessages(page))
    .filter((message) => String(message?.album_id || '').trim())
    .sort((a, b) => Number(a?.album_index ?? 999) - Number(b?.album_index ?? 999));

  expect(new Set(savedAlbumMessages.map((message) => String(message?.album_id || ''))).size).toBe(1);
  expect(String(savedAlbumMessages[0]?.album_id || '')).not.toBe('');
  expect(savedAlbumMessages.map((message) => message?.album_index ?? null)).toEqual([0, 1, 2]);
  expect(savedAlbumMessages.map((message) => message?.album_total ?? null)).toEqual([3, 3, 3]);

  const album = page.locator('[data-testid^="chat-album-"]').first();
  await expect(album).toBeVisible();
  await album.locator('button').first().click();

  await expect(page.getByTestId('chat-attachment-preview-modal')).toBeVisible();
  await expect(page.getByTestId('chat-attachment-preview-counter')).toHaveText('1 / 3');

  const previewImage = page.getByTestId('chat-attachment-preview-image');
  const firstSrc = await previewImage.getAttribute('src');

  await page.getByTestId('chat-attachment-preview-next-button').click();
  await expect(page.getByTestId('chat-attachment-preview-counter')).toHaveText('2 / 3');
  await expect
    .poll(async () => page.getByTestId('chat-attachment-preview-image').getAttribute('src'))
    .not.toBe(firstSrc);

  await page.getByTestId('chat-attachment-preview-prev-button').click();
  await expect(page.getByTestId('chat-attachment-preview-counter')).toHaveText('1 / 3');

  await page.getByTestId('chat-attachment-preview-modal').getByLabel('\uB2EB\uAE30').click();
  await expect(page.getByTestId('chat-attachment-preview-modal')).toBeHidden();

  expect(runtimeErrors).toEqual([]);
});

test('chat can start replies from photo, file, and link cards', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [buildNoticeRoom(), buildClipboardRoom()],
    messages: [
      {
        id: 'msg-image-1',
        room_id: CLIPBOARD_ROOM_ID,
        sender_id: peerUser.id,
        content: 'Please review this photo.',
        file_url: 'http://127.0.0.1:3000/storage/v1/object/public/pchos-files/chat/reply-photo-1.png',
        file_name: 'reply-photo-1.png',
        file_kind: 'image',
        created_at: '2026-03-08T10:00:00.000Z',
        is_deleted: false,
        staff: { name: peerUser.name, photo_url: null, position: peerUser.position },
      },
      {
        id: 'msg-file-1',
        room_id: CLIPBOARD_ROOM_ID,
        sender_id: peerUser.id,
        content: 'Please review this file.',
        file_url: 'http://127.0.0.1:3000/storage/v1/object/public/pchos-files/chat/manual.pdf',
        file_name: 'manual.pdf',
        file_kind: 'file',
        created_at: '2026-03-08T10:10:00.000Z',
        is_deleted: false,
        staff: { name: peerUser.name, photo_url: null, position: peerUser.position },
      },
      {
        id: 'msg-link-1',
        room_id: CLIPBOARD_ROOM_ID,
        sender_id: peerUser.id,
        content: 'Please review this link: https://example.com/report',
        created_at: '2026-03-08T10:20:00.000Z',
        is_deleted: false,
        staff: { name: peerUser.name, photo_url: null, position: peerUser.position },
      },
    ],
  });

  await openClipboardChat(page);

  await page.getByTestId('chat-open-drawer').click();
  await page.getByTestId('chat-open-media-archive-media').click();
  await expect(page.getByTestId('chat-media-panel')).toBeVisible();
  await page.getByTestId('chat-media-reply-msg-image-1').click();
  await expect(page.getByTestId('chat-reply-banner')).toBeVisible();
  await page.getByTestId('chat-media-panel-close').click();
  await page.getByTestId('chat-message-input').fill('reply photo');
  await page.getByTestId('chat-send-button').click();
  await expect
    .poll(async () => {
      const savedMessages = await getSavedClipboardMessages(page);
      return savedMessages.some(
        (message) =>
          String(message?.content || '') === 'reply photo' &&
          String(message?.reply_to_id || '') === 'msg-image-1'
      );
    })
    .toBeTruthy();

  await page.getByTestId('chat-open-drawer').click();
  await page.getByTestId('chat-file-reply-msg-file-1').click();
  await expect(page.getByTestId('chat-reply-banner')).toBeVisible();
  await page.getByTestId('chat-room-drawer').locator('button').first().click();
  await page.getByTestId('chat-message-input').fill('reply file');
  await page.getByTestId('chat-send-button').click();
  await expect
    .poll(async () => {
      const savedMessages = await getSavedClipboardMessages(page);
      return savedMessages.some(
        (message) =>
          String(message?.content || '') === 'reply file' &&
          String(message?.reply_to_id || '') === 'msg-file-1'
      );
    })
    .toBeTruthy();

  await page.getByTestId('chat-open-drawer').click();
  await page.getByTestId('chat-shared-link-reply-msg-link-1').click();
  await expect(page.getByTestId('chat-reply-banner')).toBeVisible();
  await page.getByTestId('chat-room-drawer').locator('button').first().click();
  await page.getByTestId('chat-message-input').fill('reply link');
  await page.getByTestId('chat-send-button').click();
  await expect
    .poll(async () => {
      const savedMessages = await getSavedClipboardMessages(page);
      return savedMessages.some(
        (message) =>
          String(message?.content || '') === 'reply link' &&
          String(message?.reply_to_id || '') === 'msg-link-1'
      );
    })
    .toBeTruthy();

  expect(runtimeErrors).toEqual([]);
});

test('chat falls back to app-server upload when direct storage upload fails', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  let uploadPlanCalls = 0;
  let fallbackUploadCalls = 0;

  await mockSupabase(page, {
    staffMembers: [fakeUser, peerUser],
    chatRooms: [
      {
        id: CLIPBOARD_ROOM_ID,
        name: '',
        type: 'direct',
        members: [fakeUser.id, peerUser.id],
        created_at: '2026-03-08T09:00:00.000Z',
        last_message_at: '2026-03-08T09:00:00.000Z',
      },
    ],
    messages: [],
  });

  await page.unroute('**/api/chat/upload');
  await page.route('**/api/chat/upload', async (route) => {
    const contentType = (await route.request().headerValue('content-type')) || '';
    if (contentType.includes('application/json')) {
      uploadPlanCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          provider: 'r2',
          bucket: 'pchos-files',
          path: 'chat/mock-r2-fallback.png',
          signedUrl: 'https://example-r2.invalid/upload/mock-r2-fallback.png',
          headers: {
            'content-type': 'image/png',
          },
          url: '/api/storage/object?provider=r2&bucket=pchos-files&key=chat%2Fmock-r2-fallback.png',
        }),
      });
    }

    fallbackUploadCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        provider: 'r2',
        bucket: 'pchos-files',
        path: 'chat/mock-r2-fallback.png',
        fileName: 'fallback-image.png',
        url: '/api/storage/object?provider=r2&bucket=pchos-files&key=chat%2Fmock-r2-fallback.png',
      }),
    });
  });

  await page.route('**://example-r2.invalid/**', async (route) => {
    await route.abort('failed');
  });

  await openClipboardChat(page);

  await page.getByTestId('chat-file-input').setInputFiles({
    name: 'fallback-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });

  await expect(page.getByTestId('chat-pending-upload-panel')).toBeVisible();
  await page.getByTestId('chat-pending-upload-send-button').click();
  await expect(page.getByTestId('chat-pending-upload-panel')).toBeHidden();

  await expect
    .poll(async () => {
      const savedMessages = await getSavedClipboardMessages(page);
      return savedMessages.some(
        (message) =>
          String(message?.file_name || '') === 'fallback-image.png' &&
          String(message?.file_url || '').includes('/api/storage/object?provider=r2'),
      );
    })
    .toBeTruthy();

  expect(uploadPlanCalls).toBe(1);
  expect(fallbackUploadCalls).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

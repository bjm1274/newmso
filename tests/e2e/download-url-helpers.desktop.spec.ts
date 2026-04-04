import { expect, test } from '@playwright/test';
import { buildPublicStorageDownloadUrl, buildStorageDownloadUrl } from '../../lib/object-storage-url';

test('buildStorageDownloadUrl keeps internal storage downloads on the object proxy', async () => {
  const href = buildStorageDownloadUrl(
    '/api/storage/object?provider=r2&bucket=pchos-files&key=chat%2Fmanual.pdf',
    '업무 매뉴얼.pdf',
  );

  const parsed = new URL(`https://local-storage-proxy.test${href}`);
  expect(parsed.pathname).toBe('/api/storage/object');
  expect(parsed.searchParams.get('provider')).toBe('r2');
  expect(parsed.searchParams.get('bucket')).toBe('pchos-files');
  expect(parsed.searchParams.get('key')).toBe('chat/manual.pdf');
  expect(parsed.searchParams.get('download')).toBe('1');
  expect(parsed.searchParams.get('name')).toBe('업무 매뉴얼.pdf');
});

test('buildStorageDownloadUrl wraps public urls through the download api without mangling them', async () => {
  const sourceUrl =
    'https://rtleqrtcqucntnygzudv.supabase.co/storage/v1/object/public/board-attachments/guide/file%20name.pdf?download=0&token=abc%2F123%3D';
  const href = buildStorageDownloadUrl(sourceUrl, '가이드 문서.pdf');
  const parsed = new URL(`https://local-storage-proxy.test${href}`);

  expect(parsed.pathname).toBe('/api/download');
  expect(parsed.searchParams.get('url')).toBe(sourceUrl);
  expect(parsed.searchParams.get('name')).toBe('가이드 문서.pdf');
});

test('buildPublicStorageDownloadUrl appends a mobile-friendly download query without losing the original token', async () => {
  const sourceUrl =
    'https://rtleqrtcqucntnygzudv.supabase.co/storage/v1/object/public/board-attachments/guide/file%20name.pdf?token=abc%2F123%3D';
  const href = buildPublicStorageDownloadUrl(sourceUrl, '가이드 문서.pdf');
  const parsed = new URL(href);

  expect(parsed.origin).toBe('https://rtleqrtcqucntnygzudv.supabase.co');
  expect(parsed.pathname).toBe('/storage/v1/object/public/board-attachments/guide/file%20name.pdf');
  expect(parsed.searchParams.get('token')).toBe('abc/123=');
  expect(parsed.searchParams.get('download')).toBe('가이드 문서.pdf');
});

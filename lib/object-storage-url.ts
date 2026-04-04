const INTERNAL_OBJECT_PROXY_PATH = '/api/storage/object';

export function isInternalStorageObjectUrl(url: string): boolean {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl, 'https://local-storage-proxy.test');
    return parsed.pathname === INTERNAL_OBJECT_PROXY_PATH;
  } catch {
    return rawUrl.startsWith(`${INTERNAL_OBJECT_PROXY_PATH}?`) || rawUrl === INTERNAL_OBJECT_PROXY_PATH;
  }
}

export function buildInternalStorageDownloadUrl(url: string, fileName: string): string {
  const parsed = new URL(url, 'https://local-storage-proxy.test');
  parsed.searchParams.set('download', '1');
  if (fileName.trim()) {
    parsed.searchParams.set('name', fileName);
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function buildStorageDownloadUrl(url: string, fileName: string): string {
  const normalizedUrl = String(url || '').trim();
  const normalizedFileName = String(fileName || '').trim() || 'download';
  if (!normalizedUrl) return '';

  if (isInternalStorageObjectUrl(normalizedUrl)) {
    return buildInternalStorageDownloadUrl(normalizedUrl, normalizedFileName);
  }

  return `/api/download?url=${encodeURIComponent(normalizedUrl)}&name=${encodeURIComponent(normalizedFileName)}`;
}

export function buildPublicStorageDownloadUrl(url: string, fileName: string): string {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return '';

  const parsed = new URL(normalizedUrl);
  parsed.searchParams.set('download', String(fileName || '').trim() || '1');
  return parsed.toString();
}

export function extractStorageUrlExtension(url: string): string {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return '';

  try {
    const parsed = new URL(rawUrl, 'https://local-storage-proxy.test');
    const key = parsed.searchParams.get('key');
    const source = decodeURIComponent(key || parsed.pathname || '');
    return source.split('.').pop()?.toLowerCase() || '';
  } catch {
    const withoutQuery = rawUrl.split('?')[0] || '';
    return withoutQuery.split('.').pop()?.toLowerCase() || '';
  }
}

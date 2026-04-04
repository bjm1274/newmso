const INTERNAL_OBJECT_PROXY_PATH = '/api/storage/object';
const MANAGED_DOWNLOAD_MEDIA_QUERY = '(hover: none) and (pointer: coarse), (max-width: 767px)';

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

export function shouldUseManagedBrowserDownload(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = String(window.navigator?.userAgent || '');
  if (/SamsungBrowser/i.test(userAgent)) return true;
  try {
    return window.matchMedia(MANAGED_DOWNLOAD_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export async function triggerManagedBrowserDownload(downloadUrl: string, fileName: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Browser environment is required.');
  }

  const response = await fetch(downloadUrl, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    const bodyText = await response.clone().text().catch(() => '');
    if (/<html[\s>]|<!doctype html/i.test(bodyText) || bodyText.includes('"error"')) {
      throw new Error('Download response was not a file.');
    }
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = String(fileName || '').trim() || 'download';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  window.document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  }, 1_000);
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

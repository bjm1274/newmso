const INTERNAL_OBJECT_PROXY_PATH = '/api/storage/object';
const MANAGED_DOWNLOAD_MEDIA_QUERY = '(hover: none) and (pointer: coarse), (max-width: 767px)';

const R2_PUBLIC_BASE = String(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const R2_PUBLIC_HOST = (() => {
  if (!R2_PUBLIC_BASE) return '';
  try {
    return new URL(R2_PUBLIC_BASE).hostname;
  } catch {
    return '';
  }
})();

function encodeObjectKey(objectKey: string): string {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function rewriteInternalR2UrlToPublic(rawUrl: string): string | null {
  if (!R2_PUBLIC_BASE) return null;
  try {
    const parsed = new URL(rawUrl, 'https://local-storage-proxy.test');
    if (parsed.pathname !== INTERNAL_OBJECT_PROXY_PATH) return null;
    if (parsed.searchParams.get('provider') !== 'r2') return null;
    const objectKey = parsed.searchParams.get('key');
    if (!objectKey) return null;
    return `${R2_PUBLIC_BASE}/${encodeObjectKey(objectKey)}`;
  } catch {
    return null;
  }
}

function isPublicR2StorageUrl(url: string): boolean {
  if (!R2_PUBLIC_HOST) return false;
  try {
    return new URL(url).hostname === R2_PUBLIC_HOST;
  } catch {
    return false;
  }
}

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

export function buildStorageInlineUrl(url: string, fileName: string): string {
  const normalizedUrl = String(url || '').trim();
  const normalizedFileName = String(fileName || '').trim() || 'preview';
  if (!normalizedUrl) return '';
  if (/^(blob|data):/i.test(normalizedUrl)) return normalizedUrl;

  if (isInternalStorageObjectUrl(normalizedUrl)) {
    // R2 public 도메인이 설정돼 있으면 내부 프록시 URL을 직접 R2 CDN으로 rewrite
    // → Cloudflare Workers를 완전히 우회 (대용량/다중 이미지 로드 안정성 ↑)
    const directR2Url = rewriteInternalR2UrlToPublic(normalizedUrl);
    return directR2Url || normalizedUrl;
  }

  if (normalizedUrl.startsWith('/')) {
    return normalizedUrl;
  }

  // 공개 R2 CDN URL은 인증 없이 직접 접근 가능하므로 Cloudflare Workers 프록시를 거치지 않는다.
  // 프록시 경유 시 큰 이미지에서 1102(Worker 리소스 초과) 오류 발생.
  if (isPublicR2StorageUrl(normalizedUrl)) {
    return normalizedUrl;
  }

  return `/api/download?url=${encodeURIComponent(normalizedUrl)}&name=${encodeURIComponent(normalizedFileName)}&inline=1`;
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

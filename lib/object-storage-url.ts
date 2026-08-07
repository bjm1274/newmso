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

export function rewritePublicR2UrlToInternal(url: string): string | null {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return null;

  if (normalizedUrl.includes('r2.pchos.kr') || (R2_PUBLIC_HOST && normalizedUrl.includes(R2_PUBLIC_HOST))) {
    try {
      const parsed = new URL(normalizedUrl, typeof window !== 'undefined' ? window.location.origin : 'https://local-storage-proxy.test');
      const objectKey = decodeURIComponent(parsed.pathname.substring(1));
      if (!objectKey) return null;
      return `${INTERNAL_OBJECT_PROXY_PATH}?provider=r2&bucket=pchos-files&key=${encodeURIComponent(objectKey)}`;
    } catch {
      return null;
    }
  }

  return null;
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

  // 공개 R2 도메인(https://r2.pchos.kr/...)도 내부 프록시로 바꿔서 내려받는다.
  //
  // 이 변환이 인라인(buildStorageInlineUrl)에만 있고 여기에는 없었다. 그래서
  // 같은 첨부인데 **미리보기 이미지는 뜨는데 다운로드만 실패**했다 — 원인을
  // 짐작하기 어려운 조합이었다. 다운로드는 /api/download 로 내려가 공개 URL 을
  // 그대로 fetch 하는데, 버킷이 공개로 열려 있지 않아 401 이 오고 그것이
  // "파일 다운로드에 실패했습니다" 로 표시됐다.
  //
  // messages.file_url 에 저장되는 값이 바로 이 공개 도메인 형태라 실운영의
  // 첨부 대부분이 이 경로를 탄다.
  const internalFromPublic = rewritePublicR2UrlToInternal(normalizedUrl);
  if (internalFromPublic) {
    return buildInternalStorageDownloadUrl(internalFromPublic, normalizedFileName);
  }

  if (isInternalStorageObjectUrl(normalizedUrl)) {
    // 내부 프록시 URL 은 그대로 내부 프록시로 내려받는다.
    // 내부 프록시는 R2 바인딩으로 직접 읽으므로 버킷 공개 여부와 무관하고,
    // 세션·멤버십 검사도 거친다(의료·인사 파일이라 공개 버킷은 애초에 부적절).
    return buildInternalStorageDownloadUrl(normalizedUrl, normalizedFileName);
  }

  return `/api/download?url=${encodeURIComponent(normalizedUrl)}&name=${encodeURIComponent(normalizedFileName)}`;
}

export function buildStorageInlineUrl(url: string, fileName: string): string {
  const normalizedUrl = String(url || '').trim();
  const normalizedFileName = String(fileName || '').trim() || 'preview';
  if (!normalizedUrl) return '';
  if (/^(blob|data):/i.test(normalizedUrl)) return normalizedUrl;

  const rewritten = rewritePublicR2UrlToInternal(normalizedUrl);
  if (rewritten) {
    return rewritten;
  }

  if (isInternalStorageObjectUrl(normalizedUrl)) {
    return normalizedUrl;
  }

  if (normalizedUrl.startsWith('/')) {
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
    cache: 'no-store' });

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

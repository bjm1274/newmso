import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const INTERNAL_OBJECT_PROXY_PATH = '/api/storage/object';
const DEFAULT_R2_CHAT_BUCKET = 'pchos-files';
const DEFAULT_CACHE_CONTROL = 'public, max-age=3600';
const DEFAULT_UPLOAD_EXPIRATION_SECONDS = 60 * 15;
const DEFAULT_DOWNLOAD_EXPIRATION_SECONDS = 60 * 5;
const encoder = new TextEncoder();

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  chatBucket: string;
  publicBaseUrl: string | null;
};

export type R2UploadPlan = {
  provider: 'r2';
  bucket: string;
  path: string;
  signedUrl: string;
  headers: Record<string, string>;
  url: string;
};

function normalizeOptionalUrl(value: string | undefined): string | null {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized || null;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? encoder.encode(value) : value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(key: string | Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toBytes(key) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
  return new Uint8Array(signature);
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8) };
}

function buildCanonicalQueryString(params: Array<[string, string]>): string {
  return [...params]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) return leftValue.localeCompare(rightValue);
      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join('&');
}

async function createR2PresignedUrl({
  method,
  bucket,
  objectKey,
  expiresIn,
  headers = {},
  query = [] }: {
  method: 'GET' | 'PUT';
  bucket: string;
  objectKey: string;
  expiresIn: number;
  headers?: Record<string, string>;
  query?: Array<[string, string]>;
}): Promise<string> {
  const config = getR2Config();
  if (!config) {
    throw new Error('Cloudflare R2 configuration is missing.');
  }

  const now = new Date();
  const { amzDate, dateStamp } = formatAmzDate(now);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${awsEncode(bucket)}/${encodeObjectKey(objectKey)}`;
  const normalizedHeaders = Object.fromEntries(
    Object.entries({ ...headers, host })
      .map(([key, value]) => [key.toLowerCase(), String(value).trim()])
      .sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, string>;
  const signedHeaders = Object.keys(normalizedHeaders).join(';');
  const canonicalHeaders = Object.entries(normalizedHeaders)
    .map(([key, value]) => `${key}:${value.replace(/\s+/g, ' ')}`)
    .join('\n');
  const canonicalQuery = buildCanonicalQueryString([
    ...query,
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ]);
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const dateKey = await hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, 'auto');
  const serviceKey = await hmacSha256(regionKey, 's3');
  const signingKey = await hmacSha256(serviceKey, 'aws4_request');
  const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function buildResponseContentDisposition(rawName: string): string {
  const normalizedName = String(rawName || 'download');
  const ascii = normalizedName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(normalizedName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function getR2Config(): R2Config | null {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const publicBaseUrl =
    normalizeOptionalUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) ||
    normalizeOptionalUrl(process.env.R2_PUBLIC_BASE_URL);

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    chatBucket: String(process.env.R2_CHAT_BUCKET || DEFAULT_R2_CHAT_BUCKET).trim() || DEFAULT_R2_CHAT_BUCKET,
    publicBaseUrl };
}

export function isR2ChatStorageEnabled(): boolean {
  return true; // Direct Worker Binding 또는 S3 Presigned URL 항상 지원
}

export function buildChatAttachmentObjectKey(fileName: string, mimeType: string): string {
  const normalizedFileName = String(fileName || '').trim();
  const extFromName = normalizedFileName.includes('.')
    ? normalizedFileName.split('.').pop()?.toLowerCase()
    : '';
  const extFromMimeType = mimeType.startsWith('image/') || mimeType.startsWith('video/')
    ? mimeType.split('/')[1]?.toLowerCase()
    : mimeType === 'application/pdf'
      ? 'pdf'
      : mimeType === 'text/plain'
        ? 'txt'
        : 'bin';
  const ext = /^[a-z0-9]+$/i.test(extFromName || '') ? String(extFromName) : String(extFromMimeType || 'bin');
  return `chat/${Date.now()}_${globalThis.crypto.randomUUID()}.${ext || 'bin'}`;
}

export function buildR2AccessUrl(bucket: string, objectKey: string): string {
  const publicBaseUrl =
    normalizeOptionalUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) ||
    normalizeOptionalUrl(process.env.R2_PUBLIC_BASE_URL);

  if (publicBaseUrl) {
    return `${publicBaseUrl}/${encodeObjectKey(objectKey)}`;
  }

  const params = new URLSearchParams({
    provider: 'r2',
    bucket,
    key: objectKey });
  return `${INTERNAL_OBJECT_PROXY_PATH}?${params.toString()}`;
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

export function isAllowedPublicStorageUrl(url: string): boolean {
  const publicBaseUrl =
    normalizeOptionalUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) ||
    normalizeOptionalUrl(process.env.R2_PUBLIC_BASE_URL);

  if (!publicBaseUrl) {
    return false;
  }

  try {
    const candidate = new URL(url);
    const allowed = new URL(publicBaseUrl);
    if (candidate.hostname !== allowed.hostname) {
      return false;
    }

    const allowedPath = allowed.pathname.replace(/\/+$/, '');
    if (!allowedPath || allowedPath === '/') {
      return true;
    }

    return candidate.pathname.startsWith(`${allowedPath}/`) || candidate.pathname === allowedPath;
  } catch {
    return false;
  }
}

export function getConfiguredR2ChatBucket(): string | null {
  return getR2Config()?.chatBucket ?? null;
}

export async function createChatAttachmentUploadPlan(
  objectKey: string,
  mimeType: string,
): Promise<R2UploadPlan | null> {
  const config = getR2Config();
  if (!config) {
    return null;
  }

  const headers = {
    'content-type': mimeType,
    'cache-control': DEFAULT_CACHE_CONTROL };
  const signedUrl = await createR2PresignedUrl({
    method: 'PUT',
    bucket: config.chatBucket,
    objectKey,
    expiresIn: DEFAULT_UPLOAD_EXPIRATION_SECONDS,
    headers });

  return {
    provider: 'r2',
    bucket: config.chatBucket,
    path: objectKey,
    signedUrl,
    headers,
    url: buildR2AccessUrl(config.chatBucket, objectKey) };
}

/**
 * R2 Worker binding 이 있으면 op 를 실행하고, 없거나 실패하면 S3 presign 폴백으로 넘긴다.
 *
 * 8차 D12-014: 이 "binding 시도 → 실패하면 조용히 폴백" 골격이 업로드 2곳·삭제 1곳에
 * 글자 단위로 반복돼 있었다. 캐시 헤더나 재시도 정책을 손볼 때 세 곳을 동시에
 * 고쳐야 하는 구조라 예방적으로 뽑아낸다. `null` 은 "binding 경로를 못 썼다"는 뜻이고
 * op 가 정상적으로 `null` 을 돌려줄 일이 없도록 호출부에서 sentinel 을 쓴다.
 */
async function withR2Binding<T>(
  op: (binding: { put: (...args: unknown[]) => Promise<unknown>; delete: (key: string) => Promise<unknown> }) => Promise<T>,
  requiredMethod: 'put' | 'delete',
): Promise<{ used: true; value: T } | { used: false }> {
  try {
    // `{ async: true }` 가 필요하다. 인자 없이 부르는 동기 형태는 요청 처리 중
    // env 를 내주지 못하고 던지며, 그러면 아래 catch 로 빠져 바인딩이 멀쩡한데도
    // 없는 것처럼 취급된다. 동작하는 D1 헬퍼(lib/db/get-binding.ts)와 같은 형태다.
    const cfCtx = await getCloudflareContext({ async: true });
    const r2Binding = (cfCtx?.env as any)?.R2;
    if (r2Binding && typeof r2Binding[requiredMethod] === 'function') {
      return { used: true, value: await op(r2Binding) };
    }
  } catch {
    // binding 자체가 없거나 put/delete 가 실패했다 — 아래 S3 presign 경로로 폴백한다.
  }
  return { used: false };
}

/**
 * 채팅 첨부 R2 업로드.
 *
 * 8차 D12-014: binding 시도 → presign 폴백 골격 ~50줄이 uploadToR2 와 통째로 중복돼 있었다.
 * 실제 차이는 **버킷을 어떻게 정하는가** 하나뿐이었다 — chat 계열만
 * config.chatBucket 폴백(없으면 DEFAULT_R2_CHAT_BUCKET)을 쓰고 uploadToR2 는 인자를 그대로 쓴다.
 * 그래서 버킷 결정만 여기 남기고 나머지는 위임한다(업로드 경로·헤더·에러 문구 모두 동일).
 */
export async function uploadChatAttachmentToR2(
  objectKey: string,
  body: R2UploadBody,
  mimeType: string,
): Promise<Pick<R2UploadPlan, 'bucket' | 'path' | 'provider' | 'url'>> {
  const config = getR2Config();
  return uploadToR2(config?.chatBucket || DEFAULT_R2_CHAT_BUCKET, objectKey, body, mimeType);
}

/**
 * 업로드 본문으로 받을 수 있는 형태.
 *
 * 예전에는 `Buffer` 만 받았다. 그래서 호출부가 큰 파일을 넘기려면
 * `Buffer.from(await file.arrayBuffer())` 로 전체를 메모리에 두 벌 더 만들어야
 * 했고, 워커 메모리 한도(128MB)를 넘겨 요청이 통째로 죽었다. Blob·스트림을
 * 그대로 받으면 R2 바인딩과 fetch 양쪽 모두 복사 없이 흘려보낼 수 있다.
 */
export type R2UploadBody = Buffer | Blob | ArrayBuffer | ReadableStream<Uint8Array>;

/**
 * 범용 R2 업로드 — 버킷과 objectKey를 직접 지정.
 * 직인·팝업·프로필·백업 등 chat 외 용도에 사용.
 */
export async function uploadToR2(
  bucket: string,
  objectKey: string,
  body: R2UploadBody,
  mimeType: string,
): Promise<Pick<R2UploadPlan, 'bucket' | 'path' | 'provider' | 'url'>> {
  // 1. Direct Cloudflare R2 Worker Binding Attempt (0.00초 직통 업로드 — S3 credentials 의존 제로)
  const viaBinding = await withR2Binding(async (binding) => {
    await binding.put(objectKey, body, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: DEFAULT_CACHE_CONTROL } });
  }, 'put');
  if (viaBinding.used) {
    return {
      provider: 'r2',
      bucket,
      path: objectKey,
      url: buildR2AccessUrl(bucket, objectKey) };
  }

  const config = getR2Config();
  if (!config) {
    throw new Error('Cloudflare R2 configuration is missing.');
  }

  const signedUrl = await createR2PresignedUrl({
    method: 'PUT',
    bucket,
    objectKey,
    expiresIn: DEFAULT_UPLOAD_EXPIRATION_SECONDS,
    headers: {
      'content-type': mimeType,
      'cache-control': DEFAULT_CACHE_CONTROL } });
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'content-type': mimeType,
      'cache-control': DEFAULT_CACHE_CONTROL },
    body: body as BodyInit });
  if (!response.ok) {
    throw new Error(`Cloudflare R2 upload failed with status ${response.status}.`);
  }

  return {
    provider: 'r2',
    bucket,
    path: objectKey,
    url: buildR2AccessUrl(bucket, objectKey) };
}

/**
 * 범용 R2 객체 삭제 — AWS S3 API DELETE 사용.
 */
export async function deleteFromR2(bucket: string, objectKey: string): Promise<void> {
  // 1. Direct Cloudflare R2 Worker Binding Attempt
  const viaBinding = await withR2Binding(async (binding) => {
    await binding.delete(objectKey);
  }, 'delete');
  if (viaBinding.used) return;

  const config = getR2Config();
  if (!config) {
    throw new Error('Cloudflare R2 configuration is missing.');
  }

  const now = new Date();
  const { amzDate, dateStamp } = formatAmzDate(now);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${awsEncode(bucket)}/${encodeObjectKey(objectKey)}`;
  
  const headers = { host };
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [key.toLowerCase(), String(value).trim()])
  ) as Record<string, string>;
  const signedHeaders = Object.keys(normalizedHeaders).join(';');
  const canonicalHeaders = Object.entries(normalizedHeaders)
    .map(([key, value]) => `${key}:${value.replace(/\s+/g, ' ')}`)
    .join('\n');

  const canonicalQuery = buildCanonicalQueryString([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', '60'],
    ['X-Amz-SignedHeaders', signedHeaders],
  ]);
  const canonicalRequest = [
    'DELETE',
    canonicalUri,
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const dateKey = await hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, 'auto');
  const serviceKey = await hmacSha256(regionKey, 's3');
  const signingKey = await hmacSha256(serviceKey, 'aws4_request');
  const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

  const deleteUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const response = await fetch(deleteUrl, { method: 'DELETE' });
  // R2 returns 204 on success, 404 is acceptable (already gone)
  if (!response.ok && response.status !== 404) {
    throw new Error(`Cloudflare R2 delete failed with status ${response.status}.`);
  }
}

export async function createR2DownloadUrl(
  bucket: string,
  objectKey: string,
  options?: { downloadFileName?: string | null },
): Promise<string | null> {
  const config = getR2Config();
  if (!config) {
    return null;
  }

  return createR2PresignedUrl({
    method: 'GET',
    bucket,
    objectKey,
    expiresIn: DEFAULT_DOWNLOAD_EXPIRATION_SECONDS,
    query: options?.downloadFileName
      ? [['response-content-disposition', buildResponseContentDisposition(options.downloadFileName)]]
      : [] });
}

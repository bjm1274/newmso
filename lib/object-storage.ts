import 'server-only';

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
    dateStamp: iso.slice(0, 8),
  };
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
  query = [],
}: {
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

  // 클라이언트와 동일 값을 공유해야 하므로 NEXT_PUBLIC_* 우선
  const publicBaseUrl =
    normalizeOptionalUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) ||
    normalizeOptionalUrl(process.env.R2_PUBLIC_BASE_URL);

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    chatBucket: String(process.env.R2_CHAT_BUCKET || DEFAULT_R2_CHAT_BUCKET).trim() || DEFAULT_R2_CHAT_BUCKET,
    publicBaseUrl,
  };
}

export function isR2ChatStorageEnabled(): boolean {
  return !!getR2Config();
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
  const config = getR2Config();
  if (!config) {
    throw new Error('Cloudflare R2 configuration is missing.');
  }

  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${encodeObjectKey(objectKey)}`;
  }

  const params = new URLSearchParams({
    provider: 'r2',
    bucket,
    key: objectKey,
  });
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
  const config = getR2Config();
  if (!config?.publicBaseUrl) {
    return false;
  }

  try {
    const candidate = new URL(url);
    const allowed = new URL(config.publicBaseUrl);
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
    'cache-control': DEFAULT_CACHE_CONTROL,
  };
  const signedUrl = await createR2PresignedUrl({
    method: 'PUT',
    bucket: config.chatBucket,
    objectKey,
    expiresIn: DEFAULT_UPLOAD_EXPIRATION_SECONDS,
    headers,
  });

  return {
    provider: 'r2',
    bucket: config.chatBucket,
    path: objectKey,
    signedUrl,
    headers,
    url: buildR2AccessUrl(config.chatBucket, objectKey),
  };
}

export async function uploadChatAttachmentToR2(
  objectKey: string,
  body: Buffer,
  mimeType: string,
): Promise<Pick<R2UploadPlan, 'bucket' | 'path' | 'provider' | 'url'>> {
  const config = getR2Config();
  if (!config) {
    throw new Error('Cloudflare R2 configuration is missing.');
  }

  const signedUrl = await createR2PresignedUrl({
    method: 'PUT',
    bucket: config.chatBucket,
    objectKey,
    expiresIn: DEFAULT_UPLOAD_EXPIRATION_SECONDS,
    headers: {
      'content-type': mimeType,
      'cache-control': DEFAULT_CACHE_CONTROL,
    },
  });
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'content-type': mimeType,
      'cache-control': DEFAULT_CACHE_CONTROL,
    },
    body: body as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`Cloudflare R2 upload failed with status ${response.status}.`);
  }

  return {
    provider: 'r2',
    bucket: config.chatBucket,
    path: objectKey,
    url: buildR2AccessUrl(config.chatBucket, objectKey),
  };
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
      : [],
  });
}

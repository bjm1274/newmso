import 'server-only';
import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const INTERNAL_OBJECT_PROXY_PATH = '/api/storage/object';
const DEFAULT_R2_CHAT_BUCKET = 'pchos-files';
const DEFAULT_CACHE_CONTROL = 'public, max-age=3600';
const DEFAULT_UPLOAD_EXPIRATION_SECONDS = 60 * 15;
const DEFAULT_DOWNLOAD_EXPIRATION_SECONDS = 60 * 5;

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

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    chatBucket: String(process.env.R2_CHAT_BUCKET || DEFAULT_R2_CHAT_BUCKET).trim() || DEFAULT_R2_CHAT_BUCKET,
    publicBaseUrl: normalizeOptionalUrl(process.env.R2_PUBLIC_BASE_URL),
  };
}

function getR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
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
  return `chat/${Date.now()}_${randomUUID()}.${ext || 'bin'}`;
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

  const client = getR2Client(config);
  const signedUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.chatBucket,
      Key: objectKey,
      ContentType: mimeType,
      CacheControl: DEFAULT_CACHE_CONTROL,
    }),
    { expiresIn: DEFAULT_UPLOAD_EXPIRATION_SECONDS },
  );

  return {
    provider: 'r2',
    bucket: config.chatBucket,
    path: objectKey,
    signedUrl,
    headers: {
      'content-type': mimeType,
      'cache-control': DEFAULT_CACHE_CONTROL,
    },
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

  const client = getR2Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.chatBucket,
      Key: objectKey,
      Body: body,
      ContentType: mimeType,
      CacheControl: DEFAULT_CACHE_CONTROL,
    }),
  );

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

  const client = getR2Client(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ...(options?.downloadFileName
        ? {
            ResponseContentDisposition: buildResponseContentDisposition(options.downloadFileName),
          }
        : {}),
    }),
    { expiresIn: DEFAULT_DOWNLOAD_EXPIRATION_SECONDS },
  );
}

import 'server-only';
import fs from 'fs';
import path from 'path';
import {
  getS3Config,
  getS3Client,
  uploadToS3,
  deleteFromS3,
  createS3PresignedDownloadUrl,
  createS3PresignedUploadPlan,
  buildObjectAccessUrl,
  getS3ObjectStream,
  type S3UploadPlan,
} from './s3-storage';

const INTERNAL_OBJECT_PROXY_PATH = '/api/storage/object';
const DEFAULT_STORAGE_BUCKET = 'pchos-files';
const DEFAULT_UPLOAD_EXPIRATION_SECONDS = 60 * 15;
const DEFAULT_DOWNLOAD_EXPIRATION_SECONDS = 60 * 5;

export type R2UploadPlan = S3UploadPlan;
export type R2UploadBody = Buffer | Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>;

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

export function isR2ChatStorageEnabled(): boolean {
  return true;
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
  return buildObjectAccessUrl(bucket, objectKey);
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
  const config = getS3Config();
  const publicBaseUrl = config?.publicBaseUrl;
  if (!publicBaseUrl) return false;

  try {
    const candidate = new URL(url);
    const allowed = new URL(publicBaseUrl);
    if (candidate.hostname !== allowed.hostname) return false;

    const allowedPath = allowed.pathname.replace(/\/+$/, '');
    if (!allowedPath || allowedPath === '/') return true;

    return candidate.pathname.startsWith(`${allowedPath}/`) || candidate.pathname === allowedPath;
  } catch {
    return false;
  }
}

export function getLocalUploadsDir(): string {
  return path.join(process.cwd(), 'data', 'uploads');
}

export async function saveToLocalDisk(
  objectKey: string,
  body: R2UploadBody,
  _mimeType: string,
): Promise<{ bucket: string; path: string; url: string }> {
  const uploadsDir = getLocalUploadsDir();
  const safePath = path.normalize(objectKey).replace(/^(\.\.[\/\\])+/, '');
  const targetPath = path.join(uploadsDir, safePath);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

  let bufferBody: Buffer;
  const rawBody: any = body;
  if (rawBody instanceof ArrayBuffer) {
    bufferBody = Buffer.from(rawBody);
  } else if (rawBody instanceof Uint8Array) {
    bufferBody = Buffer.from(rawBody);
  } else if (rawBody instanceof Blob) {
    bufferBody = Buffer.from(await rawBody.arrayBuffer());
  } else if (Buffer.isBuffer(rawBody)) {
    bufferBody = rawBody;
  } else if (rawBody && typeof rawBody.getReader === 'function') {
    const reader = (rawBody as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    bufferBody = Buffer.concat(chunks);
  } else {
    bufferBody = Buffer.from(String(rawBody || ''));
  }

  await fs.promises.writeFile(targetPath, bufferBody);
  return {
    bucket: DEFAULT_STORAGE_BUCKET,
    path: objectKey,
    url: buildObjectAccessUrl(DEFAULT_STORAGE_BUCKET, objectKey),
  };
}

export function getLocalDiskStream(objectKey: string): { stream: NodeJS.ReadableStream; contentLength: number; filePath: string } | null {
  const uploadsDir = getLocalUploadsDir();
  const safePath = path.normalize(objectKey).replace(/^(\.\.[\/\\])+/, '');
  const targetPath = path.join(uploadsDir, safePath);
  if (!fs.existsSync(targetPath)) return null;
  const stat = fs.statSync(targetPath);
  return {
    stream: fs.createReadStream(targetPath),
    contentLength: stat.size,
    filePath: targetPath,
  };
}

export function getConfiguredR2ChatBucket(): string | null {
  return getS3Config()?.bucket ?? DEFAULT_STORAGE_BUCKET;
}

export async function createChatAttachmentUploadPlan(
  objectKey: string,
  mimeType: string,
): Promise<R2UploadPlan | null> {
  const config = getS3Config();
  if (config) {
    const bucket = config.bucket || DEFAULT_STORAGE_BUCKET;
    return createS3PresignedUploadPlan(objectKey, mimeType, bucket);
  }

  // S3 미설정 시 로컬 서버 릴레이 업로드 플랜 반환
  return {
    provider: 'r2',
    bucket: DEFAULT_STORAGE_BUCKET,
    path: objectKey,
    signedUrl: '/api/chat/upload',
    headers: { 'content-type': mimeType },
    url: buildObjectAccessUrl(DEFAULT_STORAGE_BUCKET, objectKey),
  };
}

export async function uploadChatAttachmentToR2(
  objectKey: string,
  body: R2UploadBody,
  mimeType: string,
): Promise<Pick<R2UploadPlan, 'bucket' | 'path' | 'provider' | 'url'>> {
  const config = getS3Config();
  const bucket = config?.bucket || DEFAULT_STORAGE_BUCKET;
  return uploadToR2(bucket, objectKey, body, mimeType);
}

export async function uploadToR2(
  bucket: string,
  objectKey: string,
  body: R2UploadBody,
  mimeType: string,
): Promise<Pick<R2UploadPlan, 'bucket' | 'path' | 'provider' | 'url'>> {
  // 1. 표준 S3 SDK 가 설정되어 있으면 S3 로 업로드
  const s3Config = getS3Config();
  if (s3Config) {
    let bufferBody: any = body;
    if (body instanceof ArrayBuffer) {
      bufferBody = Buffer.from(body);
    } else if (body instanceof Uint8Array) {
      bufferBody = Buffer.from(body);
    } else if (body instanceof Blob) {
      bufferBody = Buffer.from(await body.arrayBuffer());
    }

    const res = await uploadToS3(bucket, objectKey, bufferBody, mimeType);
    return {
      provider: 'r2',
      bucket: res.bucket,
      path: res.path,
      url: res.url,
    };
  }

  // 2. Standalone / Docker 환경 로컬 영구 디스크 스토리지 폴백 (기본값)
  const localRes = await saveToLocalDisk(objectKey, body, mimeType);
  return {
    provider: 'r2',
    bucket: localRes.bucket,
    path: localRes.path,
    url: localRes.url,
  };
}

export async function deleteFromR2(bucket: string, objectKey: string): Promise<void> {
  // 1. 표준 S3 SDK 삭제
  const s3Config = getS3Config();
  if (s3Config) {
    await deleteFromS3(bucket, objectKey);
    return;
  }

  // 2. 로컬 디스크 파일 삭제
  try {
    const uploadsDir = getLocalUploadsDir();
    const safePath = path.normalize(objectKey).replace(/^(\.\.[\/\\])+/, '');
    const targetPath = path.join(uploadsDir, safePath);
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
    }
  } catch {}
}

export async function createR2DownloadUrl(
  bucket: string,
  objectKey: string,
  options?: { downloadFileName?: string | null },
): Promise<string | null> {
  return createS3PresignedDownloadUrl(bucket, objectKey, options);
}

export { getS3ObjectStream };

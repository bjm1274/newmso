// ============================================================
// lib/s3-storage.ts
// AWS S3 호환 Object Storage 클라이언트 모듈 (@aws-sdk/client-s3 기반).
//
// Oracle Cloud Infrastructure (OCI) Object Storage, Cloudflare R2,
// AWS S3, MinIO 등 모든 S3 호환 오브젝트 스토리지를 완벽하게 지원합니다.
// ============================================================

import 'server-only';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_BUCKET = 'pchos-files';
const DEFAULT_EXPIRATION_SECONDS = 60 * 15; // 15분
const DEFAULT_DOWNLOAD_EXPIRATION_SECONDS = 60 * 5; // 5분
const DEFAULT_CACHE_CONTROL = 'public, max-age=3600';

export type S3Config = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
  publicBaseUrl: string | null;
};

export type S3UploadPlan = {
  provider: 's3' | 'r2';
  bucket: string;
  path: string;
  signedUrl: string;
  headers: Record<string, string>;
  url: string;
};

export function getS3Config(): S3Config | null {
  // 1. 표준 S3 환경변수 우선 탐색, 없으면 기존 R2 환경변수 폴백
  const accessKeyId = String(
    process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '',
  ).trim();
  const secretAccessKey = String(
    process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '',
  ).trim();

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  let endpoint = String(process.env.S3_ENDPOINT || '').trim();
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  if (!endpoint && accountId) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  let region = String(process.env.S3_REGION || '').trim();
  if (!region || region === 'auto') {
    if (endpoint.includes('oraclecloud.com')) {
      const match = /compat\.objectstorage\.([a-z0-9-]+)\.oraclecloud\.com/i.exec(endpoint);
      region = match ? match[1] : 'ap-chuncheon-1';
    } else {
      region = 'auto';
    }
  }
  const bucket =
    String(
      process.env.S3_BUCKET ||
        process.env.R2_CHAT_BUCKET ||
        DEFAULT_BUCKET,
    ).trim() || DEFAULT_BUCKET;

  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE === 'true' ||
    Boolean(endpoint && !endpoint.includes('r2.cloudflarestorage.com') && !endpoint.includes('amazonaws.com'));

  const publicBaseUrl = String(
    process.env.STORAGE_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_STORAGE_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
      process.env.R2_PUBLIC_BASE_URL ||
      '',
  )
    .trim()
    .replace(/\/+$/, '') || null;

  return {
    endpoint: endpoint || undefined,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle,
    publicBaseUrl,
  };
}

let globalS3Client: S3Client | null = null;

export function getS3Client(): S3Client | null {
  const config = getS3Config();
  if (!config) return null;

  if (globalS3Client) return globalS3Client;

  globalS3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });

  return globalS3Client;
}

export function buildObjectAccessUrl(bucket: string, objectKey: string): string {
  const config = getS3Config();
  if (config?.publicBaseUrl) {
    const encodedKey = objectKey
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    return `${config.publicBaseUrl}/${encodedKey}`;
  }

  const params = new URLSearchParams({
    provider: 'r2',
    bucket,
    key: objectKey,
  });
  return `/api/storage/object?${params.toString()}`;
}

export async function uploadToS3(
  bucket: string,
  objectKey: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string,
): Promise<{ bucket: string; path: string; url: string }> {
  const client = getS3Client();
  if (!client) {
    throw new Error('S3/R2 storage client is not configured.');
  }

  let uploadBody: any = body;
  if (body instanceof Blob) {
    uploadBody = Buffer.from(await body.arrayBuffer());
  }

  const input: PutObjectCommandInput = {
    Bucket: bucket,
    Key: objectKey,
    Body: uploadBody,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: DEFAULT_CACHE_CONTROL,
  };

  const command = new PutObjectCommand(input);
  await client.send(command);

  return {
    bucket,
    path: objectKey,
    url: buildObjectAccessUrl(bucket, objectKey),
  };
}

export async function deleteFromS3(bucket: string, objectKey: string): Promise<void> {
  const client = getS3Client();
  if (!client) {
    throw new Error('S3/R2 storage client is not configured.');
  }

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  await client.send(command);
}

export async function createS3PresignedDownloadUrl(
  bucket: string,
  objectKey: string,
  options?: { downloadFileName?: string | null; expiresIn?: number },
): Promise<string | null> {
  const client = getS3Client();
  if (!client) return null;

  const contentDisposition = options?.downloadFileName
    ? `attachment; filename="${encodeURIComponent(options.downloadFileName)}"`
    : undefined;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentDisposition: contentDisposition,
  });

  return getSignedUrl(client, command, {
    expiresIn: options?.expiresIn || DEFAULT_DOWNLOAD_EXPIRATION_SECONDS,
  });
}

export async function createS3PresignedUploadPlan(
  objectKey: string,
  mimeType: string,
  customBucket?: string,
): Promise<S3UploadPlan | null> {
  const config = getS3Config();
  const client = getS3Client();
  if (!config || !client) return null;

  const bucket = customBucket || config.bucket;
  const headers = {
    'content-type': mimeType,
    'cache-control': DEFAULT_CACHE_CONTROL,
  };

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimeType,
    CacheControl: DEFAULT_CACHE_CONTROL,
  });

  const signedUrl = await getSignedUrl(client, command, {
    expiresIn: DEFAULT_EXPIRATION_SECONDS,
  });

  return {
    provider: 's3',
    bucket,
    path: objectKey,
    signedUrl,
    headers,
    url: buildObjectAccessUrl(bucket, objectKey),
  };
}

export async function getS3ObjectStream(
  bucket: string,
  objectKey: string,
): Promise<{
  stream: ReadableStream | null;
  contentType: string;
  contentLength: string | null;
} | null> {
  const client = getS3Client();
  if (!client) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });

    const response = await client.send(command);
    if (!response.Body) return null;

    const stream = (response.Body as any).transformToWebStream
      ? (response.Body as any).transformToWebStream()
      : (response.Body as unknown as ReadableStream);

    return {
      stream,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength ? String(response.ContentLength) : null,
    };
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.error('[getS3ObjectStream] S3 GetObject failed:', err);
    throw err;
  }
}

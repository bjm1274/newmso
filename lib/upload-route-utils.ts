import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import {
  createChatAttachmentUploadPlan,
  isR2ChatStorageEnabled,
  uploadChatAttachmentToR2,
} from '@/lib/object-storage';
import {
  assertUploadTargetIsValid,
  type UploadTargetValidationOptions,
} from '@/lib/upload-file-validation';
import type { UploadPlanResponse } from '@/types';

type UploadStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUploadUrl: (path: string) => Promise<{
        data?: { token?: string | null; signedUrl?: string | null } | null;
        error?: { message?: string } | null;
      }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      upload: (
        path: string,
        body: ArrayBuffer,
        options: { contentType: string; upsert: boolean; cacheControl: string },
      ) => Promise<{ error?: { message?: string } | null }>;
    };
  };
};

type UploadPlanPayload = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

type CreateSignedUploadPlanOptions = {
  supabase: UploadStorageClient;
  payload: UploadPlanPayload;
  validation: UploadTargetValidationOptions;
  bucketCandidates: readonly string[];
  buildFilePath: (fileName: string, mimeType: string) => string;
  createErrorMessage: string;
  missingBucketsErrorMessage: string;
};

type UploadObjectBufferOptions = {
  supabase: UploadStorageClient;
  bucketCandidates: readonly string[];
  filePath: string;
  arrayBuffer: ArrayBuffer;
  mimeType: string;
  uploadErrorMessage: string;
  missingBucketsErrorMessage: string;
};

export type UploadedObjectResult = {
  success: true;
  provider: string;
  bucket: string;
  path: string;
  url: string;
};

export function guessUploadFileExtension(fileName: string, mimeType: string) {
  const rawName = String(fileName || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    const ext = rawName.slice(lastDotIndex + 1).toLowerCase();
    if (/^[a-z0-9]+$/i.test(ext)) return ext;
  }

  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  if (normalizedMimeType.startsWith('image/')) return normalizedMimeType.split('/')[1] || 'png';
  if (normalizedMimeType.startsWith('video/')) return normalizedMimeType.split('/')[1] || 'mp4';
  if (normalizedMimeType === 'application/pdf') return 'pdf';
  if (normalizedMimeType === 'text/plain') return 'txt';
  if (normalizedMimeType.includes('/')) return normalizedMimeType.split('/')[1] || 'bin';
  return 'bin';
}

export function buildUploadFallbackFileName(mimeType: string, ext: string) {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  if (normalizedMimeType.startsWith('image/')) return `image.${ext}`;
  if (normalizedMimeType.startsWith('video/')) return `video.${ext}`;
  if (normalizedMimeType === 'application/pdf') return `document.${ext}`;
  return `attachment.${ext}`;
}

export function normalizeUploadFileName(fileName: string, mimeType: string) {
  const ext = guessUploadFileExtension(fileName, mimeType);
  const rawName = String(fileName || '').trim() || buildUploadFallbackFileName(mimeType, ext);
  const withoutPath = rawName.split(/[/\\]/).pop() || rawName;
  const sanitized = withoutPath
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || buildUploadFallbackFileName(mimeType, ext);
}

export function buildDatedUploadPath(prefix: string, fileName: string, mimeType: string) {
  const ext = guessUploadFileExtension(fileName, mimeType);
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';
  return `${prefix}/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
}

export function isMissingStorageBucketError(error: unknown, bucketName: string) {
  const message = String(
    (error as { message?: string; details?: string })?.message ||
      (error as { message?: string; details?: string })?.details ||
      '',
  ).toLowerCase();

  return (
    (message.includes('bucket') && message.includes('not found')) ||
    message.includes(`bucket ${bucketName.toLowerCase()}`) ||
    message.includes(`bucket_id = '${bucketName.toLowerCase()}'`)
  );
}

export async function createSignedUploadPlanResponse({
  supabase,
  payload,
  validation,
  bucketCandidates,
  buildFilePath,
  createErrorMessage,
  missingBucketsErrorMessage,
}: CreateSignedUploadPlanOptions) {
  const requestedMimeType =
    String(payload.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const normalizedFileName = normalizeUploadFileName(
    String(payload.fileName || '').trim(),
    requestedMimeType,
  );
  const uploadTarget = assertUploadTargetIsValid(
    {
      fileName: normalizedFileName,
      mimeType: requestedMimeType,
      fileSize: payload.fileSize,
    },
    validation,
  );

  const filePath = buildFilePath(uploadTarget.fileName, uploadTarget.mimeType);
  if (isR2ChatStorageEnabled()) {
    const r2Plan = await createChatAttachmentUploadPlan(filePath, uploadTarget.mimeType);
    if (r2Plan) {
      const response: UploadPlanResponse = {
        success: true,
        provider: 'r2',
        bucket: r2Plan.bucket,
        path: r2Plan.path,
        signedUrl: r2Plan.signedUrl,
        fileName: uploadTarget.fileName,
        url: r2Plan.url,
        headers: r2Plan.headers,
      };
      return NextResponse.json(response);
    }
  }

  let lastError: unknown = null;

  for (const bucket of bucketCandidates) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(filePath);

    if (!error && data?.token) {
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const response: UploadPlanResponse = {
        success: true,
        provider: 'supabase',
        bucket,
        path: filePath,
        token: data.token,
        signedUrl: data.signedUrl || '',
        fileName: uploadTarget.fileName,
        url: publicUrlData.publicUrl,
      };
      return NextResponse.json(response);
    }

    lastError = error;
    if (!isMissingStorageBucketError(error, bucket)) {
      return NextResponse.json(
        { error: error?.message || createErrorMessage },
        { status: 500 },
      );
    }
  }

  const message =
    (lastError as { message?: string })?.message ||
    missingBucketsErrorMessage;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function uploadObjectBuffer({
  supabase,
  bucketCandidates,
  filePath,
  arrayBuffer,
  mimeType,
  uploadErrorMessage,
  missingBucketsErrorMessage,
}: UploadObjectBufferOptions): Promise<UploadedObjectResult> {
  if (isR2ChatStorageEnabled()) {
    const uploaded = await uploadChatAttachmentToR2(
      filePath,
      Buffer.from(arrayBuffer),
      mimeType,
    );
    return {
      success: true,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      path: uploaded.path,
      url: uploaded.url,
    };
  }

  let lastError: unknown = null;

  for (const bucket of bucketCandidates) {
    const { error } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    });

    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      return {
        success: true,
        provider: 'supabase',
        bucket,
        path: filePath,
        url: data.publicUrl,
      };
    }

    lastError = error;
    if (!isMissingStorageBucketError(error, bucket)) {
      throw new Error(error.message || uploadErrorMessage);
    }
  }

  const message =
    (lastError as { message?: string })?.message ||
    missingBucketsErrorMessage;
  throw new Error(message);
}

'use client';
import { logger } from '@/lib/logger';

import { supabase } from '@/lib/supabase';
import { inferAttachmentType } from './게시판공통';

const BOARD_UPLOAD_ENDPOINT = '/api/board/upload';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const CACHE_CONTROL = '3600';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

type UploadProvider = 'supabase' | 'r2';

type UploadResponsePayload = {
  provider?: UploadProvider;
  bucket?: string;
  path?: string;
  token?: string;
  signedUrl?: string;
  fileName?: string;
  url?: string;
  headers?: Record<string, string>;
  type?: string;
  error?: string;
};

export type UploadedBoardAttachment = {
  url: string;
  name: string;
  type: 'image' | 'video' | 'file';
};

function getUploadFileName(file: File) {
  return String(file.name || '').trim() || 'attachment';
}

function getFileExtension(file: File) {
  const rawName = String(file.name || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }
  return '';
}

function getUploadContentType(file: File) {
  const rawMimeType = String(file.type || '').trim().toLowerCase();
  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType && rawMimeType !== DEFAULT_CONTENT_TYPE) return rawMimeType;

  return MIME_BY_EXTENSION[getFileExtension(file)] || rawMimeType || DEFAULT_CONTENT_TYPE;
}

function getFallbackAttachmentType(file: File) {
  const mimeType = getUploadContentType(file);
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function normalizeUploadedAttachment(file: File, payload: UploadResponsePayload): UploadedBoardAttachment {
  const name = String(payload.fileName || getUploadFileName(file)).trim() || 'attachment';
  const url = String(payload.url || '').trim();
  const type = inferAttachmentType(name, payload.type || getFallbackAttachmentType(file));
  return { url, name, type };
}

async function uploadViaAppServer(file: File, boardType: string) {
  const formData = new FormData();
  const uploadFileName = getUploadFileName(file);
  formData.append('file', file, uploadFileName);
  formData.append('boardType', boardType);

  const response = await fetch(BOARD_UPLOAD_ENDPOINT, {
    method: 'POST',
    body: formData,
  });
  const payload = (await response.json().catch(() => null)) as UploadResponsePayload | null;

  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error || `파일 업로드에 실패했습니다. (HTTP ${response.status})`);
  }

  return normalizeUploadedAttachment(file, payload);
}

export async function uploadBoardAttachmentFile(file: File, boardType: string): Promise<UploadedBoardAttachment> {
  const uploadFileName = getUploadFileName(file);
  const response = await fetch(BOARD_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boardType,
      fileName: uploadFileName,
      mimeType: getUploadContentType(file),
      fileSize: file.size,
    }),
  });
  const payload = (await response.json().catch(() => null)) as UploadResponsePayload | null;

  if (!response.ok || !payload?.path || !payload?.signedUrl || !payload?.provider) {
    throw new Error(payload?.error || `파일 업로드 준비에 실패했습니다. (HTTP ${response.status})`);
  }

  const publicUrl =
    payload.url ||
    (payload.provider === 'supabase' && payload.bucket
      ? supabase.storage.from(payload.bucket).getPublicUrl(payload.path).data.publicUrl
      : '');

  try {
    let uploadErrorMessage = '';
    if (payload.provider === 'supabase' && payload.bucket && payload.token) {
      const uploadClient = supabase.storage.from(payload.bucket) as typeof supabase.storage extends {
        from: (...args: unknown[]) => infer TStorageClient;
      }
        ? TStorageClient & {
            uploadToSignedUrl?: (
              path: string,
              token: string,
              fileBody: File,
              options?: Record<string, unknown>,
            ) => Promise<{ error: { message?: string } | null }>;
          }
        : {
            uploadToSignedUrl?: (
              path: string,
              token: string,
              fileBody: File,
              options?: Record<string, unknown>,
            ) => Promise<{ error: { message?: string } | null }>;
          };

      if (typeof uploadClient.uploadToSignedUrl === 'function') {
        const uploadResult = await uploadClient.uploadToSignedUrl(payload.path, payload.token, file, {
          contentType: getUploadContentType(file),
          upsert: false,
          cacheControl: CACHE_CONTROL,
        });
        uploadErrorMessage = uploadResult.error?.message || '';
      }
    }

    if (payload.provider !== 'supabase' || uploadErrorMessage) {
      const directUploadResponse = await fetch(payload.signedUrl, {
        method: 'PUT',
        headers:
          payload.provider === 'r2'
            ? payload.headers || { 'content-type': getUploadContentType(file) }
            : {
                'content-type': getUploadContentType(file),
                'x-upsert': 'false',
                'cache-control': CACHE_CONTROL,
              },
        body: file,
      });

      if (!directUploadResponse.ok) {
        throw new Error(
          uploadErrorMessage || `Storage 직접 업로드에 실패했습니다. (HTTP ${directUploadResponse.status})`,
        );
      }
    }
  } catch (directUploadError) {
    logger.warn('직접 업로드 실패, 서버 업로드로 다시 시도합니다.', directUploadError);
    return await uploadViaAppServer(file, boardType);
  }

  if (!publicUrl) {
    throw new Error('업로드한 파일 URL을 확인하지 못했습니다.');
  }

  return normalizeUploadedAttachment(file, { ...payload, url: publicUrl });
}

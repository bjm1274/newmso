'use client';
import { logger } from '@/lib/logger';

import { inferAttachmentType } from './게시판공통';

import { getFileExtension, getUploadContentType } from '@/lib/upload-mime';

const BOARD_UPLOAD_ENDPOINT = '/api/board/upload';
const CACHE_CONTROL = '3600';

type UploadProvider = 'r2' | 'supabase';

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

  const publicUrl = payload.url || '';

  try {
    const directUploadResponse = await fetch(payload.signedUrl, {
      method: 'PUT',
      headers: payload.headers || { 'content-type': getUploadContentType(file) },
      body: file,
    });

    if (!directUploadResponse.ok) {
      throw new Error(`Storage 직접 업로드에 실패했습니다. (HTTP ${directUploadResponse.status})`);
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

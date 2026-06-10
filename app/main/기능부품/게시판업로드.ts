'use client';
import { logger } from '@/lib/logger';

import { inferAttachmentType } from './게시판공통';

import { getUploadContentType } from '@/lib/upload-mime';

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

export async function uploadBoardAttachmentFile(
  file: File,
  boardType: string,
  options?: { onProgress?: (progress: number) => void }
): Promise<UploadedBoardAttachment> {
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
    const directUploadResponse = await new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', payload.signedUrl!);
      
      const headers = payload.headers || { 'content-type': getUploadContentType(file) };
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }

      if (options?.onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            options.onProgress!(Math.round((e.loaded / e.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        resolve(new Response(xhr.response, { status: xhr.status, statusText: xhr.statusText }));
      };
      xhr.onerror = () => {
        reject(new TypeError('Network request failed'));
      };
      xhr.onabort = () => {
        reject(new Error('Upload aborted'));
      };

      xhr.send(file);
    });

    if (!directUploadResponse.ok) {
      throw new Error(`Storage 직접 업로드에 실패했습니다. (HTTP ${directUploadResponse.status})`);
    }
  } catch (directUploadError) {
    logger.warn('직접 업로드 실패, 서버 업로드로 다시 시도합니다.', directUploadError);
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('파일 서버에 직접 업로드할 수 없으며, 서버 우회 한도(50MB)를 초과하여 업로드가 취소되었습니다.');
    }
    return await uploadViaAppServer(file, boardType);
  }

  if (!publicUrl) {
    throw new Error('업로드한 파일 URL을 확인하지 못했습니다.');
  }

  return normalizeUploadedAttachment(file, { ...payload, url: publicUrl });
}

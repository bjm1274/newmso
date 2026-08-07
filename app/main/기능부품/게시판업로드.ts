'use client';
import { logger } from '@/lib/logger';

import { inferAttachmentType } from './게시판공통';

import { getUploadContentType } from '@/lib/upload-mime';
import {
  MAX_FILE_SIZE_LABEL,
  MAX_SERVER_RELAY_SIZE_BYTES,
  MAX_SERVER_RELAY_SIZE_LABEL } from '@/lib/upload-constants';

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
    body: formData });
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
      fileSize: file.size }) });
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
    // 직접 업로드가 안 되면 앱 서버를 거쳐 올린다. 다만 본문이 Worker 를 통과하는
    // 경로라 Cloudflare 요청 본문 한도(요금제가 정한다)를 넘을 수 없다.
    //
    // 실패 사유를 함께 알려준다. 예전에는 "한도를 초과해 취소되었습니다" 만 떠서,
    // 파일이 큰 것이 문제인지 스토리지 설정이 문제인지 구분할 수 없었다.
    // 실제로는 직접 업로드가 막혀 있어 우회 경로로 밀린 것이 근본 원인이다.
    if (file.size > MAX_SERVER_RELAY_SIZE_BYTES) {
      const sizeMb = Math.round(file.size / (1024 * 1024));
      throw new Error(
        `R2 직접 업로드가 되지 않아 앱 서버를 거쳐 올리려 했으나, `
        + `이 경로의 한도(${MAX_SERVER_RELAY_SIZE_LABEL})보다 파일이 큽니다(${sizeMb}MB). `
        + `${MAX_FILE_SIZE_LABEL} 까지 올리려면 R2 직접 업로드가 동작해야 합니다.`,
      );
    }
    return await uploadViaAppServer(file, boardType);
  }

  if (!publicUrl) {
    throw new Error('업로드한 파일 URL을 확인하지 못했습니다.');
  }

  return normalizeUploadedAttachment(file, { ...payload, url: publicUrl });
}

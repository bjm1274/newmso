import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canAccessBoard } from '@/lib/access-control';
import {
  createChatAttachmentUploadPlan,
  isR2ChatStorageEnabled,
  uploadChatAttachmentToR2,
} from '@/lib/object-storage';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser,
} from '@/lib/server-session';


export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
const BOARD_BUCKET_CANDIDATES = ['board-attachments', 'pchos-files'] as const;
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
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

type UploadPlanRequest = {
  boardType?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

type UploadPlanResponse =
  | {
      success: true;
      provider: 'supabase';
      bucket: string;
      path: string;
      token: string;
      signedUrl: string;
      fileName: string;
      url: string;
    }
  | {
      success: true;
      provider: 'r2';
      bucket: string;
      path: string;
      signedUrl: string;
      fileName: string;
      url: string;
      headers: Record<string, string>;
    };

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function guessFileExtension(fileName: string, mimeType: string) {
  const rawName = String(fileName || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }

  if (mimeType.includes('/')) {
    const guessed = mimeType.split('/')[1]?.toLowerCase();
    if (guessed) return guessed;
  }

  return 'bin';
}

function normalizeUploadMimeType(fileName: string, mimeType: string) {
  const rawMimeType = String(mimeType || '').trim().toLowerCase();
  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType && rawMimeType !== DEFAULT_CONTENT_TYPE) return rawMimeType;

  const ext = guessFileExtension(fileName, '');
  return MIME_BY_EXTENSION[ext] || rawMimeType || DEFAULT_CONTENT_TYPE;
}

function buildFallbackFileName(mimeType: string, ext: string) {
  if (mimeType.startsWith('image/')) return `image.${ext}`;
  if (mimeType.startsWith('video/')) return `video.${ext}`;
  if (mimeType === 'application/pdf') return `document.${ext}`;
  return `attachment.${ext}`;
}

function normalizeUploadFileName(fileName: string, mimeType: string) {
  const ext = guessFileExtension(fileName, mimeType);
  const rawName = String(fileName || '').trim() || buildFallbackFileName(mimeType, ext);
  const withoutPath = rawName.split(/[/\\]/).pop() || rawName;
  const sanitized = withoutPath
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || buildFallbackFileName(mimeType, ext);
}

function buildSafeFilePath(fileName: string, mimeType: string) {
  const ext = guessFileExtension(fileName, mimeType);
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';
  return `board/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
}

function detectAttachmentType(fileName: string, mimeType: string) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';

  const ext = guessFileExtension(fileName, mimeType);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

function isMissingBucketError(error: unknown, bucketName: string) {
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

function validateUploadTarget(fileName: string, mimeType: string, fileSize: number) {
  if (!fileName.trim()) {
    throw new Error('업로드할 파일 이름이 없습니다.');
  }

  if (mimeType.startsWith('image/')) {
    return;
  }

  if (mimeType.startsWith('video/')) {
    if (fileSize > MAX_VIDEO_SIZE_BYTES) {
      throw new Error('동영상 크기는 200MB 이하여야 합니다.');
    }
    return;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('파일 크기는 50MB 이하여야 합니다.');
  }
}

const MAGIC_BYTE_VERIFIED_MIME_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]);

function detectBoardUploadMimeType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return 'image/webp';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'video/mp4';
  }
  return null;
}

function validateKnownFileContentType(mimeType: string, buffer: ArrayBuffer) {
  if (!MAGIC_BYTE_VERIFIED_MIME_TYPES.has(mimeType)) return;
  if (detectBoardUploadMimeType(buffer) !== mimeType) {
    throw new Error('파일 형식이 올바르지 않습니다.');
  }
}

async function createSignedUploadPlan(
  supabase: ReturnType<typeof getAdminClient>,
  payload: UploadPlanRequest,
) {
  const rawFileName = String(payload.fileName || '').trim();
  const mimeType = normalizeUploadMimeType(rawFileName, payload.mimeType || DEFAULT_CONTENT_TYPE);
  const fileName = normalizeUploadFileName(rawFileName, mimeType);
  const fileSize = Number(payload.fileSize || 0);

  validateUploadTarget(fileName, mimeType, fileSize);

  const filePath = buildSafeFilePath(fileName, mimeType);
  if (isR2ChatStorageEnabled()) {
    const r2Plan = await createChatAttachmentUploadPlan(filePath, mimeType);
    if (r2Plan) {
      const response: UploadPlanResponse = {
        success: true,
        provider: 'r2',
        bucket: r2Plan.bucket,
        path: r2Plan.path,
        signedUrl: r2Plan.signedUrl,
        fileName,
        url: r2Plan.url,
        headers: r2Plan.headers,
      };
      return NextResponse.json(response);
    }
  }

  for (const bucket of BOARD_BUCKET_CANDIDATES) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(filePath);

    if (!error && data?.token) {
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const response: UploadPlanResponse = {
        success: true,
        provider: 'supabase',
        bucket,
        path: filePath,
        token: data.token,
        signedUrl: data.signedUrl,
        fileName,
        url: publicUrlData.publicUrl,
      };
      return NextResponse.json(response);
    }

    if (!isMissingBucketError(error, bucket)) {
      return NextResponse.json(
        { error: '파일 업로드 준비에 실패했습니다.' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: '게시판 첨부 업로드용 Storage 버킷을 찾지 못했습니다.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const latestUser = await resolveLatestSessionUser(normalizeSessionUser(session.user));
    const supabase = getAdminClient();
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = (await request.json().catch(() => ({}))) as UploadPlanRequest;
      const boardType = String(payload.boardType || '').trim();

      if (!boardType) {
        return NextResponse.json({ error: 'boardType is required.' }, { status: 400 });
      }

      if (!canAccessBoard(latestUser, boardType, 'write')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      return await createSignedUploadPlan(supabase, payload);
    }

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > 52_428_800) {
      return NextResponse.json({ error: '파일 크기가 50MB를 초과합니다.' }, { status: 413 });
    }

    const formData = await request.formData();
    const boardType = String(formData.get('boardType') || formData.get('boardId') || '').trim();
    const file = formData.get('file');

    if (!boardType) {
      return NextResponse.json({ error: 'boardType is required.' }, { status: 400 });
    }

    if (!canAccessBoard(latestUser, boardType, 'write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const rawFileName = String(file.name || '').trim();
    const mimeType = normalizeUploadMimeType(rawFileName, file.type || DEFAULT_CONTENT_TYPE);
    const normalizedFileName = normalizeUploadFileName(rawFileName, mimeType);
    validateUploadTarget(normalizedFileName, mimeType, file.size);

    const filePath = buildSafeFilePath(normalizedFileName, mimeType);
    const arrayBuffer = await file.arrayBuffer();
    validateKnownFileContentType(mimeType, arrayBuffer);

    if (isR2ChatStorageEnabled()) {
      const uploaded = await uploadChatAttachmentToR2(filePath, Buffer.from(arrayBuffer), mimeType);
      return NextResponse.json({
        success: true,
        provider: uploaded.provider,
        bucket: uploaded.bucket,
        path: uploaded.path,
        fileName: normalizedFileName,
        type: detectAttachmentType(normalizedFileName, mimeType),
        url: uploaded.url,
      });
    }

    for (const bucket of BOARD_BUCKET_CANDIDATES) {
      const { error } = await supabase.storage.from(bucket).upload(filePath, Buffer.from(arrayBuffer), {
        contentType: mimeType,
        upsert: false,
        cacheControl: '3600',
      });

      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return NextResponse.json({
          success: true,
          provider: 'supabase',
          bucket,
          path: filePath,
          fileName: normalizedFileName,
          type: detectAttachmentType(normalizedFileName, mimeType),
          url: data.publicUrl,
        });
      }

      if (!isMissingBucketError(error, bucket)) {
        return NextResponse.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: '게시판 첨부 업로드용 Storage 버킷을 찾지 못했습니다.' }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '게시판 첨부 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
